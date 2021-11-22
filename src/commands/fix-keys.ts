import { Command, flags } from '@oclif/command'

import { KeyInfo, MacSigner, readKeysConfRecursive, readMacPermissionsRecursive, readPartMacPermissions, resolveKeys, writeMappedKeys } from '../selinux/keys'

export default class FixKeys extends Command {
  static description = 'fix SELinux presigned app keys'

  static flags = {
    help: flags.help({char: 'h'}),
    sepolicy: flags.string({char: 'p', description: 'paths to device and vendor sepolicy dirs', required: true, multiple: true}),
  }

  static args = [
    {name: 'source', description: 'path to mounted factory images', required: true},
  ]

  async run() {
    let {flags: {sepolicy: sepolicyDirs}, args: {source}} = this.parse(FixKeys)

    let srcSigners: Array<MacSigner> = []
    let srcKeys: Array<KeyInfo> = []
    for (let dir of sepolicyDirs) {
      srcSigners.push(...(await readMacPermissionsRecursive(dir)))
      srcKeys.push(...(await readKeysConfRecursive(dir)))
    }

    let compiledSigners = await readPartMacPermissions(source)
    let keys = resolveKeys(srcKeys, srcSigners, compiledSigners)

    for (let paths of keys.values()) {
      for (let path of paths) {
        this.log(path)
      }
    }

    await writeMappedKeys(keys)
  }
}
