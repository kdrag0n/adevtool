import { Command, flags } from '@oclif/command'
import { wrapSystemSrc } from '../frontend/source'

import {
  KeyInfo,
  MacSigner,
  readKeysConfRecursive,
  readMacPermissionsRecursive,
  readPartMacPermissions,
  resolveKeys,
  writeMappedKeys,
} from '../selinux/keys'
import { withSpinner } from '../util/cli'
import { withTempDir } from '../util/fs'

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
    buildId: flags.string({
      char: 'b',
      description: 'build ID of the stock images (optional, only used for locating factory images)',
    }),
    stockSrc: flags.string({
      char: 's',
      description:
        'path to (extracted) factory images, (mounted) images, (extracted) OTA package, OTA payload, or directory containing any such files (optionally under device and/or build ID directory)',
      required: true,
    }),
    useTemp: flags.boolean({
      char: 't',
      description: 'use a temporary directory for all extraction (prevents reusing extracted files across runs)',
      default: false,
    }),
  }

  async run() {
    let {
      flags: { sepolicy: sepolicyDirs, device, buildId, stockSrc, useTemp },
    } = this.parse(FixCerts)

    await withTempDir(async tmp => {
      // Prepare stock system source
      let wrapBuildId = buildId === undefined ? null : buildId
      let wrapped = await withSpinner('Extracting stock system source', spinner =>
        wrapSystemSrc(stockSrc, device, wrapBuildId, useTemp, tmp, spinner),
      )
      stockSrc = wrapped.src!

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
