import {Command, flags} from '@oclif/command'
import {promises as fs} from 'fs'
import { listPart } from '../blobs/file_list'

import { ALL_PARTITIONS } from '../partitions'

export default class ListFiles extends Command {
  static description = 'list system files and symlinks important for blobs'

  static flags = {
    help: flags.help({char: 'h'}),
  }

  static args = [
    {name: 'systemRoot', description: 'path to root of mounted system images (./system_ext, ./product, etc.)', required: true},
    {name: 'out', description: 'directory to write partition file lists to', required: true},
  ]

  async run() {
    let {args: {systemRoot, out}} = this.parse(ListFiles)

    fs.mkdir(out, { recursive: true })

    for (let partition of ALL_PARTITIONS) {
      let files = await listPart(partition, systemRoot)
      if (files == null) {
        continue
      }

      // Save results
      let outPath = `${out}/${partition}.list`
      fs.writeFile(outPath, files.join('\n') + '\n')
    }
  }
}