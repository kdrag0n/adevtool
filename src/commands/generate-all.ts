import { Command, flags } from '@oclif/command'
import { promises as fs } from 'fs'
import ora from 'ora'
import path from 'path'
import { flattenAllApexs } from '../blobs/apex'

import { createVendorDirs, generateBuild, VendorDirectories, writeBuildFiles } from '../blobs/build'
import { copyBlobs } from '../blobs/copy'
import { BlobEntry } from '../blobs/entry'
import { combinedPartPathToEntry, diffLists, listPart, serializeBlobList } from '../blobs/file-list'
import { diffPartOverlays, parsePartOverlayApks, serializePartOverlays } from '../blobs/overlays'
import { parsePresignedRecursive, updatePresignedBlobs } from '../blobs/presigned'
import { diffPartitionProps, loadPartitionProps, PartitionProps } from '../blobs/props'
import { diffPartVintfManifests, loadPartVintfInfo, writePartVintfManifests } from '../blobs/vintf'
import { findOverrideModules } from '../build/overrides'
import { parseModuleInfo, removeSelfModules } from '../build/soong-info'
import { DeviceConfig, loadDeviceConfig } from '../config/device'
import { filterKeys, filterValue } from '../config/filters'
import { parseSystemState, SystemState } from '../config/system-state'
import { ANDROID_INFO, extractFactoryFirmware, generateAndroidInfo, writeFirmwareImages } from '../images/firmware'
import { diffPartContexts, parseContextsRecursive, parsePartContexts, resolvePartContextDiffs, SelinuxContexts, SelinuxPartResolutions } from '../selinux/contexts'
import { generateFileContexts } from '../selinux/labels'
import { withSpinner } from '../util/cli'
import { readFile, TempState, withTempDir } from '../util/fs'
import { ALL_SYS_PARTITIONS } from '../util/partitions'

interface PropResults {
  stockProps: PartitionProps
  missingProps: PartitionProps

  fingerprint: string
  missingOtaParts: Array<string>
}

async function enumerateFiles(
  spinner: ora.Ora,
  config: DeviceConfig,
  namedEntries: Map<string, BlobEntry>,
  customState: SystemState | null,
  stockRoot: string,
  customRoot: string,
) {
  for (let partition of ALL_SYS_PARTITIONS) {
    let filesRef = await listPart(partition, stockRoot, config.filters.files)
    if (filesRef == null) continue
    let filesNew = customState != null ? customState.partitionFiles[partition] :
      await listPart(partition, customRoot, config.filters.files)
    if (filesNew == null) continue

    let missingFiles = diffLists(filesNew, filesRef)

    for (let combinedPartPath of missingFiles) {
      let entry = combinedPartPathToEntry(partition, combinedPartPath)
      namedEntries.set(combinedPartPath, entry)
    }

    spinner.text = partition
  }
}

async function resolveOverrides(
  config: DeviceConfig,
  dirs: VendorDirectories,
  namedEntries: Map<string, BlobEntry>,
) {
  let targetPrefix = `out/target/product/${config.device.name}/`
  let targetPaths = Array.from(namedEntries.keys())
    .map(cPartPath => `${targetPrefix}${cPartPath}`)

  let moduleInfoPath = `${targetPrefix}module-info.json`
  let modulesMap = parseModuleInfo(await readFile(moduleInfoPath))
  removeSelfModules(modulesMap, dirs.proprietary)
  let {modules: builtModules, builtPaths} = findOverrideModules(targetPaths, modulesMap)

  // Remove new modules from entries
  for (let path of builtPaths) {
    namedEntries.delete(path.replace(targetPrefix, ''))
  }

  return builtModules
}

async function updatePresigned(
  spinner: ora.Ora,
  config: DeviceConfig,
  entries: BlobEntry[],
  aapt2Path: string,
  stockRoot: string,
) {
  let presignedPkgs = await parsePresignedRecursive(config.platform.sepolicy_dirs)
  await updatePresignedBlobs(aapt2Path, stockRoot, presignedPkgs, entries, entry => {
    spinner.text = entry.srcPath
  }, config.filters.presigned)
}

async function flattenApexs(
  spinner: ora.Ora,
  entries: BlobEntry[],
  dirs: VendorDirectories,
  tmp: TempState,
  stockRoot: string,
) {
  let apex = await flattenAllApexs(entries, stockRoot, tmp, (progress) => {
    spinner.text = progress
  })

  // Write context labels
  let fileContexts = `${dirs.sepolicy}/file_contexts`
  await fs.writeFile(fileContexts, generateFileContexts(apex.labels))

  return apex.entries
}

async function extractProps(
  config: DeviceConfig,
  customState: SystemState | null,
  stockRoot: string,
  customRoot: string,
) {
  let stockProps = await loadPartitionProps(stockRoot)
  let customProps = customState?.partitionProps ?? await loadPartitionProps(customRoot)

  // Filters
  for (let props of stockProps.values()) {
    filterKeys(config.filters.props, props)
  }
  for (let props of customProps.values()) {
    filterKeys(config.filters.props, props)
  }

  // Diff
  let propChanges = diffPartitionProps(stockProps, customProps)
  let missingProps = new Map(Array.from(propChanges.entries())
    .map(([part, props]) => [part, props.removed]))

  // Fingerprint for SafetyNet
  let fingerprint = stockProps.get('system')!.get('ro.system.build.fingerprint')!

  // A/B OTA partitions
  let stockOtaParts = stockProps.get('product')!.get('ro.product.ab_ota_partitions')!.split(',')
  let customOtaParts = new Set(customProps.get('product')!.get('ro.product.ab_ota_partitions')!.split(','))
  let missingOtaParts = stockOtaParts.filter(p => !customOtaParts.has(p) &&
    filterValue(config.filters.partitions, p))

  return {
    stockProps,
    missingProps,

    fingerprint,
    missingOtaParts,
  } as PropResults
}

async function resolveSepolicyDirs(
  config: DeviceConfig,
  customState: SystemState | null,
  dirs: VendorDirectories,
  stockRoot: string,
  customRoot: string,
) {
  // Built contexts
  let stockContexts = await parsePartContexts(stockRoot)
  let customContexts = customState?.partitionSecontexts ?? await parsePartContexts(customRoot)

  // Contexts from AOSP
  let sourceContexts: SelinuxContexts = new Map<string, string>()
  for (let dir of config.platform.sepolicy_dirs) {
    // TODO: support alternate ROM root
    let contexts = await parseContextsRecursive(dir, '.')
    for (let [ctx, source] of contexts.entries()) {
      sourceContexts.set(ctx, source)
    }
  }

  // Diff; reversed custom->stock order to get *missing* contexts
  let ctxDiffs = diffPartContexts(customContexts, stockContexts)
  let ctxResolutions = resolvePartContextDiffs(ctxDiffs, sourceContexts, config.filters.sepolicy_dirs)

  // Add APEX labels
  if (ctxResolutions.has('vendor')) {
    ctxResolutions.get('vendor')!.sepolicyDirs.push(dirs.sepolicy)
  }

  return ctxResolutions
}

async function extractOverlays(
  spinner: ora.Ora,
  config: DeviceConfig,
  customState: SystemState | null,
  dirs: VendorDirectories,
  aapt2Path: string,
  stockRoot: string,
  customRoot: string,
) {
  let stockOverlays = await parsePartOverlayApks(aapt2Path, stockRoot, path => {
    spinner.text = path
  }, config.filters.overlay_files)

  let customOverlays = customState?.partitionOverlays ??
    await parsePartOverlayApks(aapt2Path, customRoot, path => {
      spinner.text = path
    }, config.filters.overlay_files)

  let missingOverlays = diffPartOverlays(stockOverlays, customOverlays, config.filters.overlays)
  return await serializePartOverlays(missingOverlays, dirs.overlays)
}

async function extractVintfManifests(
  customState: SystemState | null,
  dirs: VendorDirectories,
  stockRoot: string,
  customRoot: string,
) {
  let customVintf = customState?.partitionVintfInfo ?? await loadPartVintfInfo(customRoot)
  let stockVintf = await loadPartVintfInfo(stockRoot)
  let missingHals = diffPartVintfManifests(customVintf, stockVintf)

  return await writePartVintfManifests(missingHals, dirs.vintf)
}

async function extractFirmware(
  config: DeviceConfig,
  dirs: VendorDirectories,
  stockProps: PartitionProps,
  factoryZip: string,
) {
  let fwImages = await extractFactoryFirmware(factoryZip)
  let fwPaths = await writeFirmwareImages(fwImages, dirs.firmware)

  // Generate android-info.txt from device and versions
  let androidInfo = generateAndroidInfo(
    config.device.name,
    stockProps.get('vendor')!.get('ro.build.expect.bootloader')!,
    stockProps.get('vendor')!.get('ro.build.expect.baseband')!,
  )
  await fs.writeFile(`${dirs.firmware}/${ANDROID_INFO}`, androidInfo)

  return fwPaths
}

async function generateBuildFiles(
  config: DeviceConfig,
  dirs: VendorDirectories,
  entries: BlobEntry[],
  buildPkgs: string[],
  propResults: PropResults | null,
  fwPaths: string[] | null,
  vintfManifestPaths: Map<string, string> | null,
  sepolicyResolutions: SelinuxPartResolutions | null,
  stockRoot: string,
) {
  let build = await generateBuild(entries, config.device.name, config.device.vendor, stockRoot, dirs)

  // Add rules to build overridden modules and overlays, then re-sort
  build.deviceMakefile!.packages!.push(...buildPkgs)
  build.deviceMakefile!.packages!.sort((a, b) => a.localeCompare(b))

  // Add device parts
  build.deviceMakefile = {
    props: propResults?.missingProps,
    fingerprint: propResults?.fingerprint,
    ...(vintfManifestPaths != null && { vintfManifestPaths: vintfManifestPaths }),
    ...build.deviceMakefile,
  }

  // Add board parts
  build.boardMakefile = {
    ...(sepolicyResolutions != null && { sepolicyResolutions: sepolicyResolutions }),
    ...(propResults != null && propResults.missingOtaParts.length > 0 &&
      { abOtaPartitions: propResults.missingOtaParts }),
    ...(fwPaths != null && { boardInfo: `${dirs.firmware}/${ANDROID_INFO}` }),
  }

  // Add firmware
  if (fwPaths != null) {
    build.modulesMakefile!.radioFiles = fwPaths.map(p => path.relative(dirs.out, p))
  }

  // Create device
  if (config.generate.products) {
    if (propResults == null) {
      throw new Error('Product generation depends on properties')
    }

    let productProps = propResults.stockProps.get('product')!
    let productName = productProps.get('ro.product.product.name')!

    build.productMakefile = {
      baseProductPath: config.platform.product_makefile,
      name: productName,
      model: productProps.get('ro.product.product.model')!,
      brand: productProps.get('ro.product.product.brand')!,
      manufacturer: productProps.get('ro.product.product.manufacturer')!,
    }
    build.productsMakefile = {
      products: [productName],
    }
  }

  // Dump list
  let fileList = serializeBlobList(entries)
  await fs.writeFile(`${dirs.out}/proprietary-files.txt`, fileList + '\n')

  await writeBuildFiles(build, dirs)
}

export default class GenerateFull extends Command {
  static description = 'generate all vendor parts automatically'

  static flags = {
    help: flags.help({char: 'h'}),
    aapt2: flags.string({char: 'a', description: 'path to aapt2 executable', default: 'out/host/linux-x86/bin/aapt2'}),
    stockRoot: flags.string({char: 's', description: 'path to root of mounted stock system images (./system_ext, ./product, etc.)', required: true}),
    customRoot: flags.string({char: 'c', description: 'path to root of custom compiled system (out/target/product/$device) or JSON state file', required: true}),
    factoryZip: flags.string({char: 'f', description: 'path to stock factory images zip (for extracting firmware)'}),
    skipCopy: flags.boolean({char: 'k', description: 'skip file copying and only generate build files'}),
  }

  static args = [
    {name: 'config', description: 'path to device-specific YAML config', required: true},
  ]

  async run() {
    let {flags: {aapt2: aapt2Path, stockRoot, customRoot, factoryZip, skipCopy}, args: {config: configPath}} = this.parse(GenerateFull)

    let config = await loadDeviceConfig(configPath)

    // customRoot might point to a system state JSON
    let customState: SystemState | null = null
    if ((await fs.stat(customRoot)).isFile()) {
      customState = parseSystemState(await readFile(customRoot))
    }

    // Each step will modify this. Key = combined part path
    let namedEntries = new Map<string, BlobEntry>()

    // Prepare output directories
    let dirs = await createVendorDirs(config.device.vendor, config.device.name)

    // 1. Diff files
    await withSpinner('Enumerating files', (spinner) =>
      enumerateFiles(spinner, config, namedEntries, customState, stockRoot, customRoot))

    // 2. Overrides
    let buildPkgs: string[] = []
    if (config.generate.overrides) {
      let builtModules = await withSpinner('Replacing blobs with buildable modules', () =>
        resolveOverrides(config, dirs, namedEntries))
      buildPkgs.push(...builtModules)
    }
    // After this point, we only need entry objects
    let entries = Array.from(namedEntries.values())

    // 3. Presigned
    if (config.generate.presigned) {
      await withSpinner('Marking apps as presigned', (spinner) =>
        updatePresigned(spinner, config, entries, aapt2Path, stockRoot))
    }

    // Create tmp dir in case we extract APEXs
    await withTempDir(async (tmp) => {
      // 4. Flatten APEX modules
      if (config.generate.flat_apex) {
        entries = await withSpinner('Flattening APEX modules', (spinner) =>
          flattenApexs(spinner, entries, dirs, tmp, stockRoot))
      }

      // 5. Extract
      // Copy blobs (this has its own spinner)
      if (config.generate.files && !skipCopy) {
        await copyBlobs(entries, stockRoot, dirs.proprietary)
      }

      // 6. Props
      let propResults: PropResults | null = null
      if (config.generate.props) {
        propResults = await withSpinner('Extracting properties', () =>
          extractProps(config, customState, stockRoot, customRoot))
      }

      // 7. SELinux policies
      let sepolicyResolutions: SelinuxPartResolutions | null = null
      if (config.generate.sepolicy_dirs) {
        sepolicyResolutions = await withSpinner('Adding missing SELinux policies', () =>
          resolveSepolicyDirs(config, customState, dirs, stockRoot, customRoot))
      }

      // 8. Overlays
      if (config.generate.overlays) {
        let overlayPkgs = await withSpinner('Extracting overlays', (spinner) =>
          extractOverlays(spinner, config, customState, dirs, aapt2Path, stockRoot, customRoot))
        buildPkgs.push(...overlayPkgs)
      }

      // 9. vintf manifests
      let vintfManifestPaths: Map<string, string> | null = null
      if (config.generate.vintf) {
        vintfManifestPaths = await withSpinner('Extracting vintf manifests', () =>
          extractVintfManifests(customState, dirs, stockRoot, customRoot))
      }

      // 10. Firmware
      let fwPaths: Array<string> | null = null
      if (config.generate.factory_firmware && factoryZip != undefined) {
        if (propResults == null) {
          throw new Error('Factory firmware extraction depends on properties')
        }

        fwPaths = await withSpinner('Extracting firmware', () =>
          extractFirmware(config, dirs, propResults!.stockProps, factoryZip!))
      }

      // 11. Build files
      await withSpinner('Generating build files', () =>
        generateBuildFiles(config, dirs, entries, buildPkgs, propResults, fwPaths,
          vintfManifestPaths, sepolicyResolutions, stockRoot))
    })
  }
}
