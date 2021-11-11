import { Command, flags } from '@oclif/command'
import { promises as fs } from 'fs'

import { listPart } from '../blobs/file_list'
import { loadPartitionProps } from '../blobs/props'
import { serializeSystemState, SystemState } from '../config/system-state'
import { parsePartContexts } from '../sepolicy/contexts'
import { startActionSpinner, stopActionSpinner } from '../util/cli'
import { ALL_PARTITIONS } from '../util/partitions'

export default class CollectState extends Command {
  static description = 'collect built system state for use with other commands'

  static flags = {
    help: flags.help({char: 'h'}),
    customRoot: flags.string({char: 'c', description: 'path to root of custom compiled system (out/target/product/$device)', required: true}),
  }

  static args = [
    {name: 'output_path', description: 'path to device-specific YAML config', required: true},
  ]

  async run() {
    let {flags: {customRoot}, args: {output_path: outPath}} = this.parse(CollectState)

    let state = {
      partitionFiles: {},
    } as SystemState

    // Files
    let spinner = startActionSpinner('Enumerating files')
    for (let partition of ALL_PARTITIONS) {
      spinner.text = partition

      let files = await listPart(partition, customRoot)
      if (files == null) continue

      state.partitionFiles[partition] = files
    }
    stopActionSpinner(spinner)

    // Props
    spinner = startActionSpinner('Extracting properties')
    state.partitionProps = await loadPartitionProps(customRoot)
    stopActionSpinner(spinner)

    // SELinux contexts
    spinner = startActionSpinner('Extracting SELinux contexts')
    state.partitionSecontexts = await parsePartContexts(customRoot)
    stopActionSpinner(spinner)

    // Write
    await fs.writeFile(outPath, serializeSystemState(state))
  }
}
