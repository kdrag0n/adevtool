import { Command, flags } from '@oclif/command'

import { createVendorDirs } from '../blobs/build'
import { copyBlobs } from '../blobs/copy'
import { BlobEntry } from '../blobs/entry'
import { loadDeviceConfig } from '../config/device'
import { enumerateFiles, extractProps, generateBuildFiles, PropResults } from '../frontend/generate'
import { wrapSystemSrc } from '../frontend/source'
import { withSpinner } from '../util/cli'
import { withTempDir } from '../util/fs'

export default class GeneratePrep extends Command {
  static description = 'generate vendor parts to prepare for reference AOSP build (e.g. for collect-state)'

  static flags = {
    help: flags.help({char: 'h'}),
    buildId: flags.string({char: 'b', description: 'build ID of the stock images'}),
    stockSrc: flags.string({char: 's', description: 'path to root of mounted stock system images (./system_ext, ./product, etc.)', required: true}),
    skipCopy: flags.boolean({char: 'k', description: 'skip file copying and only generate build files'}),
  }

  static args = [
    {name: 'config', description: 'path to device-specific YAML config', required: true},
  ]

  async run() {
    let {flags: {buildId, stockSrc, skipCopy}, args: {config: configPath}} = this.parse(GeneratePrep)

    let config = await loadDeviceConfig(configPath)

    // tmp may be needed for mounting/extracting stock images
    await withTempDir(async (tmp) => {
      // Prepare stock system source
      let wrapBuildId = buildId == undefined ? null : buildId
      stockSrc = await withSpinner('Extracting stock system source', (spinner) =>
        wrapSystemSrc(stockSrc, config.device.name, wrapBuildId, tmp, spinner))

      // Each step will modify this. Key = combined part path
      let namedEntries = new Map<string, BlobEntry>()

      // Prepare output directories
      let dirs = await createVendorDirs(config.device.vendor, config.device.name)

      // 1. Diff files
      await withSpinner('Enumerating files', (spinner) =>
        enumerateFiles(spinner, config.filters.dep_files, null, namedEntries, null,
          stockSrc))

      // After this point, we only need entry objects
      let entries = Array.from(namedEntries.values())

      // 2. Extract
      // Copy blobs (this has its own spinner)
      if (config.generate.files && !skipCopy) {
        await copyBlobs(entries, stockSrc, dirs.proprietary)
      }

      // 3. Props
      let propResults: PropResults | null = null
      if (config.generate.props) {
        propResults = await withSpinner('Extracting properties', () =>
          extractProps(config, null, stockSrc))
        delete propResults.missingProps
        delete propResults.fingerprint
      }

      // 4. Build files
      await withSpinner('Generating build files', () =>
        generateBuildFiles(config, dirs, entries, [], propResults, null, null, null,
          stockSrc, false, true))
    })
  }
}
