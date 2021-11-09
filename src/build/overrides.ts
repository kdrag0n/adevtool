import { SoongModuleInfo, TargetModuleInfo } from './soong_info'

export interface OverrideModules {
  modules: Array<string>
  missingPaths: Array<string>
}

export function findOverrideModules(overridePaths: Iterable<string>, modulesMap: SoongModuleInfo) {
  // Build installed path->module index
  let pathMap = new Map<string, TargetModuleInfo>()
  for (let moduleName in modulesMap) {
    if (!modulesMap.hasOwnProperty(moduleName)) {
      continue
    }

    let module = modulesMap[moduleName]
    for (let path of module.installed) {
      pathMap.set(path, module)
    }
  }

  // Resolve available modules and keep track of missing paths
  let buildModules = new Set<string>()
  let missingPaths = []
  for (let path of overridePaths) {
    let module = pathMap.get(path)
    if (module != null) {
      buildModules.add(module.module_name)
    } else {
      missingPaths.push(path)
    }
  }

  return {
    modules: Array.from(buildModules).sort((a, b) => a.localeCompare(b)),
    missingPaths: missingPaths,
  } as OverrideModules
}
