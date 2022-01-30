import { Command, flags } from '@oclif/command'

import { withWrappedSrc, WRAPPED_SOURCE_FLAGS } from '../frontend/source'
import {
  KeyInfo,
  MacSigner,
  readKeysConfRecursive,
  readMacPermissionsRecursive,
  readPartMacPermissions,
  resolveKeys,
  writeMappedKeys,
} from '../selinux/keys'

export default class FixCerts extends Command {
  static description = 'fix SELinux presigned app certificates'

  static flags = {
    help: flags.help({ char: 'h' }),
    sepolicy: flags.string({
      char: 'p',
      description: 'paths to device and vendor sepolicy dirs',
      required: true,
      multiple: true,
    }),
    device: flags.string({ char: 'd', description: 'device codename', required: true }),

    ...WRAPPED_SOURCE_FLAGS,
  }

  async run() {
    let {
      flags: { sepolicy: sepolicyDirs, device, buildId, stockSrc, useTemp },
    } = this.parse(FixCerts)

    await withWrappedSrc(stockSrc, device, buildId, useTemp, async stockSrc => {
      let srcSigners: Array<MacSigner> = []
      let srcKeys: Array<KeyInfo> = []
      for (let dir of sepolicyDirs) {
        srcSigners.push(...(await readMacPermissionsRecursive(dir)))
        srcKeys.push(...(await readKeysConfRecursive(dir)))
      }

      let compiledSigners = await readPartMacPermissions(stockSrc)
      let keys = resolveKeys(srcKeys, srcSigners, compiledSigners)

      for (let paths of keys.values()) {
        for (let path of paths) {
          this.log(path)
        }
      }

      await writeMappedKeys(keys)
    })
  }
}
