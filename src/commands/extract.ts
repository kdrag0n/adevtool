import {Command, flags} from '@oclif/command'
import {promises as fs} from 'fs'
import * as path from 'path'
import * as chalk from 'chalk'

import { blobToSoongModule, serializeBlueprint, SoongModule } from '../build/soong'
import { BlobEntry } from '../blobs/entry'
import { parseFileList } from '../blobs/file_list'
import { copyBlobs } from '../blobs/copy'
import { blobToFileCopy, serializeProductMakefile } from '../build/make'

async function generateBuild(
  entries: Array<BlobEntry>,
  vendor: string,
  device: string,
  outDir: string,
  proprietaryDir: string,
) {
  // Fast lookup for other arch libs
  let entrySrcPaths = new Set(entries.map(e => e.srcPath))

  // Create Soong modules and Make rules
  let copyFiles = []
  let namedModules = new Map<string, SoongModule>()
  for (let entry of entries) {
    let ext = path.extname(entry.path)

    // On Android 12, Soong is required for ELF files (executables and libraries)
    if (entry.isNamedDependency || entry.path.startsWith('bin/') || ext == '.so') {
      // Named dependencies -> Soong blueprint

      // Module name = file name
      let name = path.basename(entry.path, ext)

      // Skip if already done (e.g. other lib arch)
      if (namedModules.has(name)) {
        continue
      }

      let module = blobToSoongModule(name, ext, vendor, entry, entrySrcPaths)
      namedModules.set(name, module)
    } else {
      // Other files -> Kati Makefile

      // Simple PRODUCT_COPY_FILES line
      copyFiles.push(blobToFileCopy(entry, proprietaryDir))
    }
  }

  // Serialize Soong blueprint
  let blueprint = serializeBlueprint(namedModules.values())
  fs.writeFile(`${outDir}/Android.bp`, blueprint)

  // Serialize product makefile
  let makefile = serializeProductMakefile({
    namespaces: [outDir],
    packages: Array.from(namedModules.keys()),
    copyFiles: copyFiles,
  })
  fs.writeFile(`${outDir}/${device}-vendor.mk`, makefile)
}

export default class Extract extends Command {
  static description = 'extract proprietary blobs'

  static flags = {
    help: flags.help({char: 'h'}),
    vendor: flags.string({char: 'v', description: 'device vendor/OEM name', required: true}),
    device: flags.string({char: 'd', description: 'device codename', required: true}),
    source: flags.string({char: 's', description: 'path to mounted factory images', required: true}),
  }

  static args = [{name: 'listPath'}]

  async run() {
    let {args: {listPath}, flags: {vendor, device, source}} = this.parse(Extract)

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
    await copyBlobs(entries, source, proprietaryDir)

    // Generate build files
    this.log(chalk.bold(chalk.greenBright('Generating build files')))
    await generateBuild(entries, vendor, device, outDir, proprietaryDir)
  }
}
