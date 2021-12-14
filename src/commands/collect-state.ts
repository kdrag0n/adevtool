import { Command, flags } from '@oclif/command'
import { promises as fs } from 'fs'

import { collectSystemState, serializeSystemState } from '../config/system-state'

export default class CollectState extends Command {
  static description = 'collect built system state for use with other commands'

  static flags = {
    help: flags.help({char: 'h'}),
    aapt2: flags.string({char: 'a', description: 'path to aapt2 executable', default: 'out/host/linux-x86/bin/aapt2'}),
    device: flags.string({char: 'd', description: 'name of target device', required: true}),
    outRoot: flags.string({char: 'r', description: 'path to AOSP build output directory (out/)', default: 'out'}),
  }

  static args = [
    {name: 'output_path', description: 'output path for system state JSON file', required: true},
  ]

  async run() {
    let {flags: {aapt2: aapt2Path, device, outRoot}, args: {output_path: outPath}} = this.parse(CollectState)

    let state = await collectSystemState(device, outRoot, aapt2Path)

    // Write
    await fs.writeFile(outPath, serializeSystemState(state))
  }
}
