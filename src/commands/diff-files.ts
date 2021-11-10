import { Command, flags } from '@oclif/command'
import * as chalk from 'chalk'

import { diffLists, listPart } from '../blobs/file_list'
import { ALL_PARTITIONS } from '../util/partitions'

export default class DiffFiles extends Command {
  static description = 'find missing system files compared to a reference system'

  static flags = {
    help: flags.help({char: 'h'}),
    all: flags.boolean({char: 'a', description: 'show all differences, not only missing/removed files', default: false})
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

      let newAdded = diffLists(filesRef, filesNew)
      let newRemoved = diffLists(filesNew, filesRef)

      newRemoved.forEach(f => this.log(chalk.red(`    ${f}`)))
      if (all) {
        newAdded.forEach(f => this.log(chalk.green(`    ${f}`)))
      }

      this.log()
    }
  }
}
