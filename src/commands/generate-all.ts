import { Command, flags } from '@oclif/command'
import { promises as fs } from 'fs'
import path from 'path'
import { flattenAllApexs } from '../blobs/apex'

import { createVendorDirs, generateBuild, writeBuildFiles } from '../blobs/build'
import { copyBlobs } from '../blobs/copy'
import { BlobEntry } from '../blobs/entry'
import { combinedPartPathToEntry, diffLists, listPart, serializeBlobList } from '../blobs/file_list'
import { diffPartOverlays, parsePartOverlayApks, serializePartOverlays } from '../blobs/overlays'
import { parsePresignedRecursive, updatePresignedBlobs } from '../blobs/presigned'
import { diffPartitionProps, filterPartPropKeys, loadPartitionProps } from '../blobs/props'
import { diffPartVintfManifests, loadPartVintfInfo, writePartVintfManifests } from '../blobs/vintf'
import { findOverrideModules } from '../build/overrides'
import { parseModuleInfo, removeSelfModules } from '../build/soong-info'
import { loadDeviceConfig } from '../config/device'
import { parseSystemState, SystemState } from '../config/system-state'
import { ANDROID_INFO, extractFactoryFirmware, generateAndroidInfo, writeFirmwareImages } from '../images/firmware'
import { diffPartContexts, parseContextsRecursive, parsePartContexts, resolvePartContextDiffs, SelinuxContexts } from '../selinux/contexts'
import { generateFileContexts } from '../selinux/labels'
import { startActionSpinner, stopActionSpinner } from '../util/cli'
import { readFile, withTempDir } from '../util/fs'
import { ALL_SYS_PARTITIONS } from '../util/partitions'

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
    let spinner = startActionSpinner('Enumerating files')
    for (let partition of ALL_SYS_PARTITIONS) {
      let filesRef = await listPart(partition, stockRoot)
      if (filesRef == null) continue
      let filesNew = customState != null ? customState.partitionFiles[partition] :
        await listPart(partition, customRoot)
      if (filesNew == null) continue

      let missingFiles = diffLists(filesNew, filesRef)

      for (let combinedPartPath of missingFiles) {
        let entry = combinedPartPathToEntry(partition, combinedPartPath)
        namedEntries.set(combinedPartPath, entry)
      }

      spinner.text = partition
    }
    stopActionSpinner(spinner)

    // 2. Overrides
    spinner = startActionSpinner('Replacing blobs with buildable modules')
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

    // After this point, we only need entry objects
    let entries = Array.from(namedEntries.values())
    stopActionSpinner(spinner)

    // 3. Presigned
    spinner = startActionSpinner('Finding presigned apps')
    let presignedPkgs = await parsePresignedRecursive(config.platform.sepolicy_dirs)
    await updatePresignedBlobs(aapt2Path, stockRoot, presignedPkgs, entries, entry => {
      spinner.text = entry.srcPath
    })
    stopActionSpinner(spinner)

    // Create tmp dir in case we extract APEXs
    await withTempDir(async (tmp) => {
      // 4. Flatten APEX modules
      if (config.generate.flat_apex) {
        spinner = startActionSpinner('Flattening APEX modules')
        let apex = await flattenAllApexs(entries, stockRoot, tmp, (progress) => {
          spinner.text = progress
        })
        entries = apex.entries

        // Write context labels
        let fileContexts = `${dirs.sepolicy}/file_contexts`
        await fs.writeFile(fileContexts, generateFileContexts(apex.labels))
        stopActionSpinner(spinner)
      }

      // 5. Extract
      // Copy blobs (this has its own spinner)
      if (!skipCopy) {
        await copyBlobs(entries, stockRoot, dirs.proprietary)
      }

      // 6. Props
      spinner = startActionSpinner('Extracting properties')
      let stockProps = await loadPartitionProps(stockRoot)
      let customProps = customState?.partitionProps ?? await loadPartitionProps(customRoot)
      // Filter props
      if (config.filters.props != null) {
        filterPartPropKeys(stockProps, config.filters.props)
        filterPartPropKeys(customProps, config.filters.props)
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
      // TODO: add proper filters
      let missingOtaParts = stockOtaParts.filter(p => !customOtaParts.has(p) && p != 'vbmeta_vendor')
      stopActionSpinner(spinner)

      // 7. SELinux policies
      spinner = startActionSpinner('Adding missing SELinux policies')
      // Built contexts
      let stockContexts = await parsePartContexts(stockRoot)
      let customContexts = customState?.partitionSecontexts ?? await parsePartContexts(customRoot)
      // Contexts from AOSP
      let sourceContexts: SelinuxContexts = new Map<string, string>()
      for (let dir of config.sepolicy_dirs) {
        // TODO: support alternate ROM root
        let contexts = await parseContextsRecursive(dir, '.')
        for (let [ctx, source] of contexts.entries()) {
          sourceContexts.set(ctx, source)
        }
      }
      // Diff; reversed custom->stock order to get *missing* contexts
      let ctxDiffs = diffPartContexts(customContexts, stockContexts)
      let ctxResolutions = resolvePartContextDiffs(ctxDiffs, sourceContexts)
      // Add APEX labels
      if (ctxResolutions.has('vendor')) {
        ctxResolutions.get('vendor')!.sepolicyDirs.push(dirs.sepolicy)
      }
      stopActionSpinner(spinner)

      // 8. Overlays
      spinner = startActionSpinner('Extracting overlays')
      let stockOverlays = await parsePartOverlayApks(aapt2Path, stockRoot, path => {
        spinner.text = path
      })
      let customOverlays = customState?.partitionOverlays ??
        await parsePartOverlayApks(aapt2Path, customRoot, path => {
          spinner.text = path
        })
      let missingOverlays = diffPartOverlays(stockOverlays, customOverlays)
      let overlayPkgs = await serializePartOverlays(missingOverlays, dirs.overlays)
      stopActionSpinner(spinner)

      // 9. vintf manifests
      spinner = startActionSpinner('Extracting vintf manifests')
      let customVintf = customState?.partitionVintfInfo ?? await loadPartVintfInfo(customRoot)
      let stockVintf = await loadPartVintfInfo(stockRoot)
      let missingHals = diffPartVintfManifests(customVintf, stockVintf)
      let vintfManifestPaths = await writePartVintfManifests(missingHals, dirs.vintf)
      stopActionSpinner(spinner)

      // 10. Firmware
      let fwPaths: Array<string> | null = null
      if (factoryZip != undefined) {
        spinner = startActionSpinner('Extracting firmware')
        let fwImages = await extractFactoryFirmware(factoryZip)
        fwPaths = await writeFirmwareImages(fwImages, dirs.firmware)

        // Generate android-info.txt from device and versions
        let androidInfo = generateAndroidInfo(
          config.device.name,
          stockProps.get('vendor')!.get('ro.build.expect.bootloader')!,
          stockProps.get('vendor')!.get('ro.build.expect.baseband')!,
        )
        await fs.writeFile(`${dirs.firmware}/${ANDROID_INFO}`, androidInfo)

        stopActionSpinner(spinner)
      }

      // 11. Build files
      spinner = startActionSpinner('Generating build files')
      let build = await generateBuild(entries, config.device.name, config.device.vendor, stockRoot, dirs)

      // Add rules to build overridden modules and overlays, then re-sort
      build.deviceMakefile!.packages!.push(...builtModules, ...overlayPkgs)
      build.deviceMakefile!.packages!.sort((a, b) => a.localeCompare(b))

      // Add device parts
      build.deviceMakefile = {
        props: missingProps,
        fingerprint: fingerprint,
        vintfManifestPaths: vintfManifestPaths,
        ...build.deviceMakefile,
      }

      // Add board parts
      build.boardMakefile = {
        secontextResolutions: ctxResolutions,
        ...(missingOtaParts.length > 0 && { abOtaPartitions: missingOtaParts }),
        ...(fwPaths != null && { boardInfo: `${dirs.firmware}/${ANDROID_INFO}` }),
      }

      // Add firmware
      if (fwPaths != null) {
        build.modulesMakefile!.radioFiles = fwPaths.map(p => path.relative(dirs.out, p))
      }

      // Create device
      let productProps = stockProps.get('product')!
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

      // Dump list
      let fileList = serializeBlobList(entries)
      await fs.writeFile(`${dirs.out}/proprietary-files.txt`, fileList)

      await writeBuildFiles(build, dirs)
      stopActionSpinner(spinner)
    })
  }
}
