import { Command, flags } from '@oclif/command'
import { promises as fs } from 'fs'

import { listPart } from '../blobs/file-list'
import { parsePartOverlayApks } from '../blobs/overlays'
import { loadPartitionProps } from '../blobs/props'
import { loadPartVintfInfo } from '../blobs/vintf'
import { serializeSystemState, SystemState } from '../config/system-state'
import { parsePartContexts } from '../selinux/contexts'
import { startActionSpinner, stopActionSpinner } from '../util/cli'
import { ALL_SYS_PARTITIONS } from '../util/partitions'

export default class CollectState extends Command {
  static description = 'collect built system state for use with other commands'

  static flags = {
    help: flags.help({char: 'h'}),
    aapt2: flags.string({char: 'a', description: 'path to aapt2 executable', default: 'out/host/linux-x86/bin/aapt2'}),
    customRoot: flags.string({char: 'c', description: 'path to root of custom compiled system (out/target/product/$device)', required: true}),
  }

  static args = [
    {name: 'output_path', description: 'output path for system state JSON file', required: true},
  ]

  async run() {
    let {flags: {aapt2: aapt2Path, customRoot}, args: {output_path: outPath}} = this.parse(CollectState)

    let state = {
      partitionFiles: {},
    } as SystemState

    // Files
    let spinner = startActionSpinner('Enumerating files')
    for (let partition of ALL_SYS_PARTITIONS) {
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

    // Overlays
    spinner = startActionSpinner('Extracting overlays')
    state.partitionOverlays = await parsePartOverlayApks(aapt2Path, customRoot, path => {
      spinner.text = path
    })
    stopActionSpinner(spinner)

    // vintf info
    spinner = startActionSpinner('Extracting vintf manifests')
    state.partitionVintfInfo = await loadPartVintfInfo(customRoot)
    stopActionSpinner(spinner)

    // Write
    await fs.writeFile(outPath, serializeSystemState(state))
  }
}
