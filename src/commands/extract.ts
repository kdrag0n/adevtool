import {Command, flags} from '@oclif/command'
import {promises as fs} from 'fs'
import * as path from 'path'
import * as chalk from 'chalk'

import { blobToSoongModule, serializeBlueprint, SharedLibraryModule, SoongModule } from '../build/soong'
import { BlobEntry, blobNeedsSoong } from '../blobs/entry'
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
  let conflictCounters = new Map<string, number>()
  for (let entry of entries) {
    let ext = path.extname(entry.path)

    if (blobNeedsSoong(entry, ext)) {
      // Named dependencies -> Soong blueprint

      // Module name = file name
      let name = path.basename(entry.path, ext)

      // If already exists: skip if it's the other arch variant of a library,
      // otherwise rename the module to avoid conflict
      if (namedModules.has(name)) {
        let conflictModule = namedModules.get(name)!
        if (conflictModule._type == 'cc_prebuilt_library_shared' &&
              (conflictModule as SharedLibraryModule).compile_multilib == 'both') {
          continue
        }

        // Increment conflict counter and append to name
        let conflictNum = (conflictCounters.get(name) ?? 1) + 1
        conflictCounters.set(name, conflictNum)
        name += `__${conflictNum}`
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
    skipCopy: flags.boolean({char: 'k', description: 'skip file copying and only generate build files'}),
  }

  static args = [{name: 'listPath'}]

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
    await generateBuild(entries, vendor, device, outDir, proprietaryDir)
  }
}
