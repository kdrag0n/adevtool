import { Command, flags } from '@oclif/command'
import { promises as fs } from 'fs'

import { serializeDeviceMakefile } from '../build/make'
import { findOverrideModules, parseOverrides } from '../build/overrides'
import { parseModuleInfo } from '../build/soong-info'

export default class ResolveOverrides extends Command {
  static description = 'resolve packages to build from a list of overridden targets'

  static flags = {
    help: flags.help({char: 'h'}),
  }

  static args = [
    {name: 'overrideList', description: 'path to root of mounted system images (./system_ext, ./product, etc.)', required: true},
    {name: 'moduleInfo', description: 'path to Soong module-info.json (out/target/product/$device/module-info.json)', required: true},
  ]

  async run() {
    let {args: {overrideList: listPath, moduleInfo}} = this.parse(ResolveOverrides)

    let overridesList = await fs.readFile(listPath, { encoding: 'utf8' })
    let overrides = parseOverrides(overridesList)
    let modulesMap = parseModuleInfo(await fs.readFile(moduleInfo, { encoding: 'utf8' }))

    let {modules, missingPaths} = findOverrideModules(overrides, modulesMap)
    let makefile = serializeDeviceMakefile({
      packages: modules,
    })

    let missing = missingPaths.length == 0 ? '' : '\n\n# Missing paths:\n' +
      missingPaths.map(path => `# ${path}`).join('\n')

    this.log(makefile + missing)
  }
}
