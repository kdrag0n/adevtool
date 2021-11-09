import { Command, flags } from '@oclif/command'
import { promises as fs } from 'fs'

import { serializeProductMakefile } from '../build/make'
import { findOverrideModules } from '../build/overrides'
import { parseModuleInfo } from '../build/soong_info'

async function parseOverrides(listPath: string) {
  let list = await fs.readFile(listPath, { encoding: 'utf8' })
  let overrides = new Set<string>()

  for (let line of list.split('\n')) {
    // Ignore empty/blank lines
    if (line.length == 0  || line.match(/^\s*$/)) {
      continue
    }

    // Accept Kati output or plain paths
    let path = line.replace(/^.*?warning: (?:overriding|ignoring old) commands for target `(.+)'$/, (_, path) => path)
    overrides.add(path)
  }

  return overrides
}

export default class ResolveOverrides extends Command {
  static description = 'resolve packages to build from a list of overridden targets'

  static flags = {
    help: flags.help({char: 'h'}),
  }

  static args = [
    {name: 'overrideList', description: 'path to root of mounted system images (./system_ext, ./product, etc.)', required: true},
    {name: 'moduleInfo', description: 'directory to write partition file lists to', required: true},
  ]

  async run() {
    let {args: {overrideList, moduleInfo}} = this.parse(ResolveOverrides)

    let overrides = await parseOverrides(overrideList)
    let modulesMap = parseModuleInfo(await fs.readFile(moduleInfo, { encoding: 'utf8' }))

    let {modules, missingPaths} = findOverrideModules(overrides, modulesMap)
    let makefile = serializeProductMakefile({
      namespaces: [],
      copyFiles: [],
      packages: modules,
    })

    let missing = missingPaths.length == 0 ? '' : '\n\n# Missing paths:\n' +
      missingPaths.map(path => `# ${path}`).join('\n')

    this.log(makefile + missing)
  }
}
