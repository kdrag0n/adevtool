import { Command, flags } from '@oclif/command'
import { promises as fs } from 'fs'
import { listPart } from '../blobs/file-list'

import { ALL_SYS_PARTITIONS } from '../util/partitions'

export default class ListFiles extends Command {
  static description = 'list system files and symlinks important for blobs'

  static flags = {
    help: flags.help({ char: 'h' }),
  }

  static args = [
    {
      name: 'systemRoot',
      description: 'path to root of mounted system images (./system_ext, ./product, etc.)',
      required: true,
    },
    { name: 'out', description: 'directory to write partition file lists to', required: true },
  ]

  async run() {
    let {
      args: { systemRoot, out },
    } = this.parse(ListFiles)

    await fs.mkdir(out, { recursive: true })

    for (let partition of ALL_SYS_PARTITIONS) {
      let files = await listPart(partition, systemRoot, null, true)
      if (files === null) {
        continue
      }

      // Save results
      let outPath = `${out}/${partition}.list`
      await fs.writeFile(outPath, `${files.join('\n')}\n`)
    }
  }
}
