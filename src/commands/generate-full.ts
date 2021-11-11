import { Command, flags } from '@oclif/command'
import { promises as fs } from 'fs'

import { createVendorDirs, generateBuild, writeBuildFiles } from '../blobs/build'
import { copyBlobs } from '../blobs/copy'
import { BlobEntry } from '../blobs/entry'
import { combinedPartPathToEntry, diffLists, listPart, serializeBlobList } from '../blobs/file_list'
import { parsePresignedRecursive, updatePresignedBlobs } from '../blobs/presigned'
import { diffPartitionProps, filterPartPropKeys, filterPropKeys, loadPartitionProps } from '../blobs/props'
import { findOverrideModules } from '../build/overrides'
import { parseModuleInfo } from '../build/soong-info'
import { parseDeviceConfig } from '../config/device'
import { ANDROID_INFO, extractFirmware, FactoryFirmware, writeFirmware } from '../factory/firmware'
import { startActionSpinner, stopActionSpinner } from '../util/cli'
import { ALL_PARTITIONS } from '../util/partitions'

export default class GenerateFull extends Command {
  static description = 'generate all vendor parts automatically'

  static flags = {
    help: flags.help({char: 'h'}),
    aapt2: flags.string({char: 'a', description: 'path to aapt2 executable', default: 'out/host/linux-x86/bin/aapt2'}),
    stockRoot: flags.string({char: 's', description: 'path to root of mounted stock system images (./system_ext, ./product, etc.)', required: true}),
    customRoot: flags.string({char: 'c', description: 'path to root of custom compiled system (out/target/product/$device)', required: true}),
    factoryZip: flags.string({char: 'f', description: 'path to stock factory images zip (for extracting firmware)'}),
    skipCopy: flags.boolean({char: 'k', description: 'skip file copying and only generate build files'}),
  }

  static args = [
    {name: 'config', description: 'path to device-specific YAML config', required: true},
  ]

  async run() {
    let {flags: {aapt2: aapt2Path, stockRoot, customRoot, factoryZip, skipCopy}, args: {config: configPath}} = this.parse(GenerateFull)

    let config = parseDeviceConfig(await fs.readFile(configPath, { encoding: 'utf8' }))

    // Each step will modify this. Key = combined part path
    let namedEntries = new Map<string, BlobEntry>()

    // 1. Diff files
    let spinner = startActionSpinner('Enumerating files')
    for (let partition of ALL_PARTITIONS) {
      spinner.text = partition

      let filesRef = await listPart(partition, stockRoot)
      if (filesRef == null) continue
      let filesNew = await listPart(partition, customRoot)
      if (filesNew == null) continue

      let missingFiles = diffLists(filesNew, filesRef)

      for (let combinedPartPath of missingFiles) {
        let entry = combinedPartPathToEntry(partition, combinedPartPath)
        namedEntries.set(combinedPartPath, entry)
      }
    }
    stopActionSpinner(spinner)

    // 2. Overrides
    spinner = startActionSpinner('Replacing blobs with buildable modules')
    let targetPrefix = `out/target/product/${config.device.name}/`
    let targetPaths = Array.from(namedEntries.keys())
      .map(cPartPath => `${targetPrefix}${cPartPath}`)

    let moduleInfoPath = `${targetPrefix}module-info.json`
    let modulesMap = parseModuleInfo(await fs.readFile(moduleInfoPath, { encoding: 'utf8' }))
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
    let presignedPkgs = await parsePresignedRecursive(config.sepolicy_dirs)
    await updatePresignedBlobs(aapt2Path, stockRoot, presignedPkgs, entries, entry => {
      spinner.text = entry.srcPath
    })
    stopActionSpinner(spinner)

    // 4. Extract
    // Prepare output directories
    let {proprietaryDir} = await createVendorDirs(config.device.vendor, config.device.name)
    // Copy blobs (this has its own spinner)
    if (!skipCopy) {
      await copyBlobs(entries, stockRoot, proprietaryDir)
    }

    // 5. Props
    spinner = startActionSpinner('Extracting properties')
    let stockProps = await loadPartitionProps(stockRoot)
    let customProps = await loadPartitionProps(customRoot)
    // Filter props
    if (config.prop_filters != null) {
      filterPartPropKeys(stockProps, config.prop_filters)
      filterPartPropKeys(customProps, config.prop_filters)
    }
    // Diff
    let propChanges = diffPartitionProps(stockProps, customProps)
    let missingProps = new Map(Array.from(propChanges.entries())
      .map(([part, props]) => [part, props.removed]))
    // Fingerprint for SafetyNet
    let fingerprint = stockProps.get('system')!.get('ro.system.build.fingerprint')!
    // A/B OTA partitions
    let stockOtaParts = stockProps.get('product')!.get('ro.product.ab_ota_partitions')!.split(',')
    let customOtaParts = new Set(stockProps.get('product')!.get('ro.product.ab_ota_partitions')!.split(','))
    let missingOtaParts = stockOtaParts.filter(p => !customOtaParts.has(p))
    stopActionSpinner(spinner)

    // 6. Firmware
    let firmware: FactoryFirmware | null = null
    if (factoryZip != undefined) {
      spinner = startActionSpinner('Extracting firmware')
      firmware = await extractFirmware(factoryZip)
      await writeFirmware(firmware, proprietaryDir)
      stopActionSpinner(spinner)
    }

    // 7. Build files
    spinner = startActionSpinner('Generating build files')
    let build = await generateBuild(entries, config.device.name, config.device.vendor, stockRoot, proprietaryDir)

    // Add rules to build overridden modules and re-sort
    build.productMakefile.packages!.push(...builtModules)
    build.productMakefile.packages!.sort((a, b) => a.localeCompare(b))

    // Add props, fingerprint, and OTA partitions
    build.productMakefile.props = missingProps
    build.productMakefile.fingerprint = fingerprint
    if (missingOtaParts.length > 0) {
      build.boardMakefile.abOtaPartitions = missingOtaParts
    }

    // Add firmware
    if (firmware != null) {
      build.boardMakefile.boardInfo = `${proprietaryDir}/${ANDROID_INFO}`
      build.modulesMakefile.radioFiles = ['bootloader.img', 'radio.img']
    }

    // Dump list
    let fileList = serializeBlobList(entries)
    await fs.writeFile(`${proprietaryDir}/proprietary-files.txt`, fileList)

    await writeBuildFiles(build, proprietaryDir)
    stopActionSpinner(spinner)
  }
}
