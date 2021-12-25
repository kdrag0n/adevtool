import { setIntersection } from '../util/data'
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
  // Build index of multilib modules
  let multilibs = new Set<string>()
  for (let [name, module] of modulesMap.entries()) {
    if (name.endsWith('_32')) {
      multilibs.add(module.module_name)
    }
  }

  // Build installed path->module index
  let pathMap = new Map<string, [string, string]>()
  for (let [key, module] of modulesMap.entries()) {
    for (let path of module.installed) {
      pathMap.set(path, [key, module.module_name])
    }
  }

  // Resolve available modules and keep track of missing paths
  let buildModules = new Set<string>()
  let builtPaths = []
  let missingPaths = []
  // Defer multlib modules (these are module_names without _32 or :32/:64)
  let multilib32 = new Set<string>()
  let multilib64 = new Set<string>()
  for (let path of overridePaths) {
    let value = pathMap.get(path)
    if (value !== null) {
      let [key, module] = value

      if (multilibs.has(module)) {
        // If this module is multilib, add it to the respective arch set instead
        if (key.endsWith('_32')) {
          // 32-bit only
          multilib32.add(module)
        } else {
          // 64-bit only
          multilib64.add(module)
        }
      } else {
        // Otherwise, just build the module normally
        buildModules.add(module)
      }

      // Always add the path
      builtPaths.push(path)
    } else {
      missingPaths.push(path)
    }
  }

  // Now resolve the multilib modules. Example:
  // Both = libX
  let multilibBoth = setIntersection(multilib32, multilib64)
  // Then separate the remaining arch-specific modules (faster than new set difference)
  multilibBoth.forEach(m => {
    // 32 = libX:32
    multilib32.delete(m)
    // 64 = libX:64
    multilib64.delete(m)
  })

  // Add final multilib modules
  multilibBoth.forEach(m => buildModules.add(m))
  multilib32.forEach(m => buildModules.add(`${m}:32`))
  multilib64.forEach(m => buildModules.add(`${m}:64`))

  return {
    modules: Array.from(buildModules).sort((a, b) => a.localeCompare(b)),
    builtPaths,
    missingPaths,
  } as OverrideModules
}
