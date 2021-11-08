import { Command, flags } from '@oclif/command'
import * as chalk from 'chalk'

import { listPart } from '../blobs/file_list'
import { ALL_PARTITIONS } from '../partitions'

export default class DiffFiles extends Command {
  static description = 'find missing system files compared to a reference system'

  static flags = {
    help: flags.help({char: 'h'}),
    all: flags.boolean({char: 'a', description: 'show all differences, not only missing/removed files', defualt: false})
  }

  static args = [
    {name: 'sourceRef', description: 'path to root of reference system', required: true},
    {name: 'sourceNew', description: 'path to root of new system', required: true},
  ]

  async run() {
    let {flags: {all}, args: {sourceRef, sourceNew}} = this.parse(DiffFiles)

    for (let partition of ALL_PARTITIONS) {
      this.log(chalk.bold(chalk.blueBright(partition)))

      let filesRef = await listPart(partition, sourceRef)
      if (filesRef == null) {
        continue
      }

      let filesNew = await listPart(partition, sourceNew)
      if (filesNew == null) {
        continue
      }

      let setRef = new Set(filesRef)
      let setNew = new Set(filesNew)
      let newAdded = filesNew.filter(f => !setRef.has(f)).sort((a, b) => a.localeCompare(b))
      let newRemoved = filesRef.filter(f => !setNew.has(f)).sort((a, b) => a.localeCompare(b))

      newRemoved.forEach(f => this.log(chalk.red(`    ${f}`)))
      if (all) {
        newAdded.forEach(f => this.log(chalk.green(`    ${f}`)))
      }

      this.log()
    }
  }
}
