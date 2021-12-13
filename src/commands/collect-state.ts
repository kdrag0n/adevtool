import { Command, flags } from '@oclif/command'
import { promises as fs } from 'fs'

import { listPart } from '../blobs/file-list'
import { parsePartOverlayApks } from '../blobs/overlays'
import { loadPartitionProps } from '../blobs/props'
import { loadPartVintfInfo } from '../blobs/vintf'
import { parseModuleInfo } from '../build/soong-info'
import { serializeSystemState, SystemState } from '../config/system-state'
import { parsePartContexts } from '../selinux/contexts'
import { withSpinner } from '../util/cli'
import { readFile } from '../util/fs'
import { ALL_SYS_PARTITIONS } from '../util/partitions'

export default class CollectState extends Command {
  static description = 'collect built system state for use with other commands'

  static flags = {
    help: flags.help({char: 'h'}),
    aapt2: flags.string({char: 'a', description: 'path to aapt2 executable', default: 'out/host/linux-x86/bin/aapt2'}),
    device: flags.string({char: 'd', description: 'name of target device', required: true}),
    root: flags.string({char: 'r', description: 'path to AOSP build output directory (out/)', default: 'out'}),
  }

  static args = [
    {name: 'output_path', description: 'output path for system state JSON file', required: true},
  ]

  async run() {
    let {flags: {aapt2: aapt2Path, device, root}, args: {output_path: outPath}} = this.parse(CollectState)

    let systemRoot = `${root}/target/product/${device}`
    let moduleInfoPath = `${systemRoot}/module-info.json`
    let state = {
      partitionFiles: {},
    } as SystemState

    // Files
    await withSpinner('Enumerating files', async (spinner) => {
      for (let partition of ALL_SYS_PARTITIONS) {
        spinner.text = partition
  
        let files = await listPart(partition, systemRoot)
        if (files == null) continue
  
        state.partitionFiles[partition] = files
      }
    })

    // Props
    state.partitionProps = await withSpinner('Extracting properties', () =>
      loadPartitionProps(systemRoot))

    // SELinux contexts
    state.partitionSecontexts = await withSpinner('Extracting SELinux contexts', () =>
      parsePartContexts(systemRoot))

    // Overlays
    state.partitionOverlays = await withSpinner('Extracting overlays', (spinner) =>
      parsePartOverlayApks(aapt2Path, systemRoot, path => {
        spinner.text = path
      }))

    // vintf info
    state.partitionVintfInfo = await withSpinner('Extracting vintf manifests', () =>
      loadPartVintfInfo(systemRoot))

    // Module info
    state.moduleInfo = await withSpinner('Parsing module info', async () =>
      parseModuleInfo(await readFile(moduleInfoPath)))

    // Write
    await fs.writeFile(outPath, serializeSystemState(state))
  }
}
