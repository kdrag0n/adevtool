import { parseLines } from '../util/parse'
import { SoongModuleInfo, TargetModuleInfo } from './soong-info'

export interface OverrideModules {
  modules: Array<string>
  builtPaths: Array<string>
  missingPaths: Array<string>
}

export function parseOverrides(list: string) {
  let overrides = new Set<string>()

  for (let line of parseLines(list)) {
    // Accept Kati output or plain paths
    let path = line.replace(/^.*?warning: (?:overriding|ignoring old) commands for target `(.+)'$/, (_, path) => path)
    overrides.add(path)
  }

  return overrides
}

export function findOverrideModules(overridePaths: Iterable<string>, modulesMap: SoongModuleInfo) {
  // Build installed path->module index
  let pathMap = new Map<string, TargetModuleInfo>()
  for (let module of Object.values(modulesMap)) {
    for (let path of module.installed) {
      pathMap.set(path, module)
    }
  }

  // Resolve available modules and keep track of missing paths
  let buildModules = new Set<string>()
  let builtPaths = []
  let missingPaths = []
  for (let path of overridePaths) {
    let module = pathMap.get(path)
    if (module != null) {
      buildModules.add(module.module_name)
      builtPaths.push(path)
    } else {
      missingPaths.push(path)
    }
  }

  return {
    modules: Array.from(buildModules).sort((a, b) => a.localeCompare(b)),
    builtPaths: builtPaths,
    missingPaths: missingPaths,
  } as OverrideModules
}
