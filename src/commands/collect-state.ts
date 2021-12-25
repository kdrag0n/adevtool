import { Command, flags } from '@oclif/command'
import { promises as fs } from 'fs'

import { collectSystemState, serializeSystemState } from '../config/system-state'
import { forEachDevice } from '../frontend/devices'

export default class CollectState extends Command {
  static description = 'collect built system state for use with other commands'

  static flags = {
    help: flags.help({ char: 'h' }),
    aapt2: flags.string({
      char: 'a',
      description: 'path to aapt2 executable',
      default: 'out/host/linux-x86/bin/aapt2',
    }),
    device: flags.string({ char: 'd', description: 'name of target device', required: true, multiple: true }),
    outRoot: flags.string({ char: 'r', description: 'path to AOSP build output directory (out/)', default: 'out' }),
    parallel: flags.boolean({
      char: 'p',
      description: 'generate devices in parallel (causes buggy progress spinners)',
      default: false,
    }),
  }

  static args = [{ name: 'output_path', description: 'output path for system state JSON file(s)', required: true }]

  async run() {
    let {
      flags: { aapt2: aapt2Path, device: devices, outRoot, parallel },
      args: { output_path: outPath },
    } = this.parse(CollectState)

    let isDir = (await fs.stat(outPath)).isDirectory()
    await forEachDevice(devices, parallel, async device => {
      let state = await collectSystemState(device, outRoot, aapt2Path)

      // Write
      let devicePath = isDir ? `${outPath}/${device}.json` : outPath
      await fs.writeFile(devicePath, serializeSystemState(state))
    })
  }
}
