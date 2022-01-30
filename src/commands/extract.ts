import { Command, flags } from '@oclif/command'
import chalk from 'chalk'

import { parseFileList } from '../blobs/file-list'
import { copyBlobs } from '../blobs/copy'
import { createVendorDirs, generateBuild, writeBuildFiles } from '../blobs/build'
import { readFile, withTempDir } from '../util/fs'
import { withWrappedSrc, WRAPPED_SOURCE_FLAGS, wrapSystemSrc } from '../frontend/source'

export default class Extract extends Command {
  static description = 'extract proprietary files'

  static flags = {
    help: flags.help({ char: 'h' }),
    vendor: flags.string({ char: 'v', description: 'device vendor/OEM name', required: true }),
    device: flags.string({ char: 'd', description: 'device codename', required: true }),
    skipCopy: flags.boolean({ char: 'k', description: 'skip file copying and only generate build files' }),

    ...WRAPPED_SOURCE_FLAGS,
  }

  static args = [
    { name: 'listPath', description: 'path to LineageOS-compatible proprietary-files.txt list', required: true },
  ]

  async run() {
    let {
      args: { listPath },
      flags: { vendor, device, skipCopy, stockSrc, buildId, useTemp },
    } = this.parse(Extract)

    await withWrappedSrc(stockSrc, device, buildId, useTemp, async stockSrc => {
      // Parse list
      this.log(chalk.bold(chalk.greenBright('Parsing list')))
      let list = await readFile(listPath)
      let entries = parseFileList(list)

      // Prepare output directories
      let dirs = await createVendorDirs(vendor, device)

      // Copy blobs
      if (!skipCopy) {
        await copyBlobs(entries, stockSrc, dirs.proprietary)
      }

      // Generate build files
      this.log(chalk.bold(chalk.greenBright('Generating build files')))
      let build = await generateBuild(entries, device, vendor, stockSrc, dirs)
      await writeBuildFiles(build, dirs)
    })
  }
}
