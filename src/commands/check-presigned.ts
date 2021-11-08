import { Command, flags } from '@oclif/command'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as chalk from 'chalk'
import { $ } from 'zx'

import { parseFileList } from '../blobs/file_list'
import { listFilesRecursive } from '../util/fs'
import { parseSeappContexts } from '../sepolicy/seapp'

export default class CheckPresigned extends Command {
  static description = 'check for APKs that should be presigned'

  static flags = {
    help: flags.help({char: 'h'}),
    aapt2: flags.string({char: 'a', description: 'path to aapt2 executable', default: 'out/host/linux-x86/bin/aapt2'}),
    sepolicy: flags.string({char: 's', description: 'paths to device and vendor sepolicy dirs', required: true, multiple: true}),
  }

  static args = [
    {name: 'source', description: 'path to mounted factory images', required: true},
    {name: 'listPath', description: 'path to LineageOS-compatible proprietary-files.txt list'},
  ]

  async run() {
    let {flags: {aapt2, sepolicy}, args: {source, listPath}} = this.parse(CheckPresigned)

    // Parse list
    this.log(chalk.bold(chalk.greenBright('Parsing list')))
    let list = listPath != null ? await fs.readFile(listPath, {encoding: 'utf8'}) : null
    let entries = list != null ? parseFileList(list) : null

    // Find and parse sepolicy seapp_contexts
    let contexts = []
    for (let dir of sepolicy) {
      for await (let file of listFilesRecursive(dir)) {
        if (path.basename(file) != 'seapp_contexts') {
          continue
        }

        let rawContexts = await fs.readFile(file, { encoding: 'utf8' })
        contexts.push(...parseSeappContexts(rawContexts))
      }
    }
    let presignedPkgs = new Set(contexts.filter(c => c.seinfo != 'platform')
      .map(c => c.name))

    if (entries != null) {
      // Get APKs from blob entries
      for (let entry of entries) {
        if (path.extname(entry.path) != '.apk') {
          continue
        }

        let procOut = await $`${aapt2} dump packagename ${source}/${entry.srcPath}`
        let pkgName = procOut.stdout.trim()
        if (presignedPkgs.has(pkgName)) {
          entry.isPresigned = true
          this.log(entry.srcPath)
        }
      }

      // TODO: write new list
    } else {
      // Find APKs
      for await (let file of listFilesRecursive(source)) {
        if (path.extname(file) != '.apk') {
          continue
        }

        let procOut = await $`${aapt2} dump packagename ${file}`
        let pkgName = procOut.stdout.trim()
        if (presignedPkgs.has(pkgName)) {
          this.log(file)
        }
      }
    }
  }
}
