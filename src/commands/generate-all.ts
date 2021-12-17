import { Command, flags } from '@oclif/command'
import { promises as fs } from 'fs'

import { createVendorDirs } from '../blobs/build'
import { copyBlobs } from '../blobs/copy'
import { BlobEntry } from '../blobs/entry'
import { loadDeviceConfig } from '../config/device'
import { collectSystemState, parseSystemState, SystemState } from '../config/system-state'
import { enumerateFiles, extractFirmware, extractOverlays, extractProps, extractVintfManifests, flattenApexs, generateBuildFiles, PropResults, resolveOverrides, resolveSepolicyDirs, updatePresigned } from '../frontend/generate'
import { wrapSystemSrc } from '../frontend/source'
import { SelinuxPartResolutions } from '../selinux/contexts'
import { withSpinner } from '../util/cli'
import { readFile, withTempDir } from '../util/fs'

export default class GenerateFull extends Command {
  static description = 'generate all vendor parts automatically'

  static flags = {
    help: flags.help({char: 'h'}),
    aapt2: flags.string({char: 'a', description: 'path to aapt2 executable', default: 'out/host/linux-x86/bin/aapt2'}),
    buildId: flags.string({char: 'b', description: 'build ID of the stock images'}),
    stockSrc: flags.string({char: 's', description: 'path to (extracted) factory images, (mounted) images, (extracted) OTA package, OTA payload, or directory containing any such files (optionally under device and/or build ID directory)', required: true}),
    customSrc: flags.string({char: 'c', description: 'path to AOSP build output directory (out/) or JSON state file', default: 'out'}),
    factoryZip: flags.string({char: 'f', description: 'path to stock factory images zip (for extracting firmware if stockSrc is not factory images)'}),
    skipCopy: flags.boolean({char: 'k', description: 'skip file copying and only generate build files'}),
  }

  static args = [
    {name: 'config', description: 'path to device-specific YAML config', required: true},
  ]

  async run() {
    let {flags: {aapt2: aapt2Path, buildId, stockSrc, customSrc, factoryZip, skipCopy}, args: {config: configPath}} = this.parse(GenerateFull)

    let config = await loadDeviceConfig(configPath)

    // customSrc can point to a system state JSON or out/
    let customState: SystemState
    if ((await fs.stat(customSrc)).isFile()) {
      customState = parseSystemState(await readFile(customSrc))
    } else {
      customState = await collectSystemState(config.device.name, customSrc, aapt2Path)
    }

    // tmp may be needed for mounting/extracting stock images and/or APEX flattening
    await withTempDir(async (tmp) => {
      // Prepare stock system source
      let wrapBuildId = buildId == undefined ? null : buildId
      let wrapped = await withSpinner('Extracting stock system source', (spinner) =>
        wrapSystemSrc(stockSrc, config.device.name, wrapBuildId, tmp, spinner))
      stockSrc = wrapped.src!
      if (wrapped.factoryZip != null && factoryZip == undefined) {
        factoryZip = wrapped.factoryZip
      }

      // Each step will modify this. Key = combined part path
      let namedEntries = new Map<string, BlobEntry>()

      // Prepare output directories
      let dirs = await createVendorDirs(config.device.vendor, config.device.name)

      // 1. Diff files
      await withSpinner('Enumerating files', (spinner) =>
        enumerateFiles(spinner, config.filters.files, config.filters.dep_files,
          namedEntries, customState, stockSrc))

      // 2. Overrides
      let buildPkgs: string[] = []
      if (config.generate.overrides) {
        let builtModules = await withSpinner('Replacing blobs with buildable modules', () =>
          resolveOverrides(config, customState, dirs, namedEntries))
        buildPkgs.push(...builtModules)
      }
      // After this point, we only need entry objects
      let entries = Array.from(namedEntries.values())

      // 3. Presigned
      if (config.generate.presigned) {
        await withSpinner('Marking apps as presigned', (spinner) =>
          updatePresigned(spinner, config, entries, aapt2Path, stockSrc))
      }

      // 4. Flatten APEX modules
      if (config.generate.flat_apex) {
        entries = await withSpinner('Flattening APEX modules', (spinner) =>
          flattenApexs(spinner, entries, dirs, tmp, stockSrc))
      }

      // 5. Extract
      // Copy blobs (this has its own spinner)
      if (config.generate.files && !skipCopy) {
        await copyBlobs(entries, stockSrc, dirs.proprietary)
      }

      // 6. Props
      let propResults: PropResults | null = null
      if (config.generate.props) {
        propResults = await withSpinner('Extracting properties', () =>
          extractProps(config, customState, stockSrc))
      }

      // 7. SELinux policies
      let sepolicyResolutions: SelinuxPartResolutions | null = null
      if (config.generate.sepolicy_dirs) {
        sepolicyResolutions = await withSpinner('Adding missing SELinux policies', () =>
          resolveSepolicyDirs(config, customState, dirs, stockSrc))
      }

      // 8. Overlays
      if (config.generate.overlays) {
        let overlayPkgs = await withSpinner('Extracting overlays', (spinner) =>
          extractOverlays(spinner, config, customState, dirs, aapt2Path, stockSrc))
        buildPkgs.push(...overlayPkgs)
      }

      // 9. vintf manifests
      let vintfManifestPaths: Map<string, string> | null = null
      if (config.generate.vintf) {
        vintfManifestPaths = await withSpinner('Extracting vintf manifests', () =>
          extractVintfManifests(customState, dirs, stockSrc))
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
          vintfManifestPaths, sepolicyResolutions, stockSrc))
    })
  }
}
