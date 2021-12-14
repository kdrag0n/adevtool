import { Command, flags } from '@oclif/command'

import { createVendorDirs } from '../blobs/build'
import { copyBlobs } from '../blobs/copy'
import { BlobEntry } from '../blobs/entry'
import { EMPTY_INCLUDE_FILTERS, loadDeviceConfig } from '../config/device'
import { parseFilters } from '../config/filters'
import { enumerateFiles, extractProps, generateBuildFiles, PropResults } from '../frontend/generate'
import { withSpinner } from '../util/cli'

export default class GeneratePrep extends Command {
  static description = 'generate vendor parts to prepare for reference AOSP build (e.g. for collect-state)'

  static flags = {
    help: flags.help({char: 'h'}),
    stockSrc: flags.string({char: 's', description: 'path to root of mounted stock system images (./system_ext, ./product, etc.)', required: true}),
    skipCopy: flags.boolean({char: 'k', description: 'skip file copying and only generate build files'}),
  }

  static args = [
    {name: 'config', description: 'path to device-specific YAML config', required: true},
  ]

  async run() {
    let {flags: {stockSrc, skipCopy}, args: {config: configPath}} = this.parse(GeneratePrep)

    let config = await loadDeviceConfig(configPath)

    // Each step will modify this. Key = combined part path
    let namedEntries = new Map<string, BlobEntry>()

    // Prepare output directories
    let dirs = await createVendorDirs(config.device.vendor, config.device.name)

    // 1. Diff files
    await withSpinner('Enumerating files', (spinner) =>
      enumerateFiles(spinner, config.filters.dep_files, null, namedEntries, null,
        stockSrc, null))

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
        extractProps(config, null, stockSrc, null))
      delete propResults.missingProps
      delete propResults.fingerprint
    }

    // 4. Build files
    await withSpinner('Generating build files', () =>
      generateBuildFiles(config, dirs, entries, [], propResults, null, null, null,
        stockSrc, false, true))
  }
}
