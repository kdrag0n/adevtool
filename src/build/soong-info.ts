export interface TargetModuleInfo {
  class: Array<string>
  path: Array<string>
  tags: Array<string>
  installed: Array<string>
  compatibility_suites: Array<string>
  auto_test_config: Array<string>
  module_name: string
  test_config: Array<string>
  dependencies: Array<string>
  srcs: Array<string>
  srcjars: Array<string>
  classes_jar: Array<string>
  test_mainline_modules: Array<string>
  is_unit_test: string
}

export type SoongModuleInfo = Map<string, TargetModuleInfo>

export function parseModuleInfo(info: string) {
  return new Map(Object.entries(JSON.parse(info))) as SoongModuleInfo
}

export function removeSelfModules(modulesMap: SoongModuleInfo, proprietaryDir: string) {
  // Remove modules provided by our generated vendor module, so we don't have to
  // save module-info.json in the system state
  for (let [moduleName, module] of modulesMap.entries()) {
    if (module.path.find(p => p == proprietaryDir) != undefined) {
      modulesMap.delete(moduleName)
    }
  }
}
