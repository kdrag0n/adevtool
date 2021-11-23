import { Command, flags } from '@oclif/command'
import { promises as fs } from 'fs'
import chalk from 'chalk'

import { parseFileList } from '../blobs/file_list'
import { copyBlobs } from '../blobs/copy'
import { createVendorDirs, generateBuild, writeBuildFiles } from '../blobs/build'

export default class Extract extends Command {
  static description = 'extract proprietary files'

  static flags = {
    help: flags.help({char: 'h'}),
    vendor: flags.string({char: 'v', description: 'device vendor/OEM name', required: true}),
    device: flags.string({char: 'd', description: 'device codename', required: true}),
    skipCopy: flags.boolean({char: 'k', description: 'skip file copying and only generate build files'}),
  }

  static args = [
    {name: 'source', description: 'path to mounted factory images', required: true},
    {name: 'listPath', description: 'path to LineageOS-compatible proprietary-files.txt list', required: true},
  ]

  async run() {
    let {args: {source, listPath}, flags: {vendor, device, skipCopy}} = this.parse(Extract)

    // Parse list
    this.log(chalk.bold(chalk.greenBright('Parsing list')))
    let list = await fs.readFile(listPath, {encoding: 'utf8'})
    let entries = parseFileList(list)

    // Prepare output directories
    let dirs = await createVendorDirs(vendor, device)

    // Copy blobs
    if (!skipCopy) {
      await copyBlobs(entries, source, dirs.proprietary)
    }

    // Generate build files
    this.log(chalk.bold(chalk.greenBright('Generating build files')))
    let build = await generateBuild(entries, device, vendor, source, dirs)
    await writeBuildFiles(build, dirs)
  }
}
