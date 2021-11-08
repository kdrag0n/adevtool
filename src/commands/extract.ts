import {Command, flags} from '@oclif/command'
import {promises as fs} from 'fs'
import * as chalk from 'chalk'

import { serializeBlueprint } from '../build/soong'
import { parseFileList } from '../blobs/file_list'
import { copyBlobs } from '../blobs/copy'
import { serializeBoardMakefile, serializeProductMakefile } from '../build/make'
import { BuildFiles, generateBuild } from '../blobs/build'

async function writeBuild(build: BuildFiles, proprietaryDir: string) {
  // Serialize Soong blueprint
  let blueprint = serializeBlueprint(build.blueprint)
  fs.writeFile(`${proprietaryDir}/Android.bp`, blueprint)

  // Serialize product makefile
  let productMakefile = serializeProductMakefile(build.productMakefile)
  fs.writeFile(`${proprietaryDir}/device-vendor.mk`, productMakefile)

  // Serialize board makefile
  let boardMakefile = serializeBoardMakefile(build.boardMakefile)
  fs.writeFile(`${proprietaryDir}/BoardConfigVendor.mk`, boardMakefile)
}

export default class Extract extends Command {
  static description = 'extract proprietary blobs'

  static flags = {
    help: flags.help({char: 'h'}),
    vendor: flags.string({char: 'v', description: 'device vendor/OEM name', required: true}),
    device: flags.string({char: 'd', description: 'device codename', required: true}),
    source: flags.string({char: 's', description: 'path to mounted factory images', required: true}),
    skipCopy: flags.boolean({char: 'k', description: 'skip file copying and only generate build files'}),
  }

  static args = [
    {name: 'listPath', description: 'path to LineageOS-compatible proprietary-files.txt list', required: true},
  ]

  async run() {
    let {args: {listPath}, flags: {vendor, device, source, skipCopy}} = this.parse(Extract)

    // Parse list
    this.log(chalk.bold(chalk.greenBright('Parsing list')))
    let list = await fs.readFile(listPath, {encoding: 'utf8'})
    let entries = parseFileList(list)

    // Prepare output directories
    let outDir = `vendor/${vendor}/${device}`
    await fs.rm(outDir, {force: true, recursive: true})
    await fs.mkdir(outDir, {recursive: true})
    let proprietaryDir = `${outDir}/proprietary`
    await fs.mkdir(proprietaryDir, {recursive: true})

    // Copy blobs
    if (!skipCopy) {
      await copyBlobs(entries, source, proprietaryDir)
    }

    // Generate build files
    this.log(chalk.bold(chalk.greenBright('Generating build files')))
    let build = await generateBuild(entries, vendor, proprietaryDir)
    await writeBuild(build, proprietaryDir)
  }
}
