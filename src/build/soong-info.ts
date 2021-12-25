export interface TargetModuleInfo {
  class: Array<string>
  path: Array<string>
  tags: Array<string>
  installed: Array<string>
  srcs: Array<string>
  module_name: string

  // Removed to reduce size in SystemState
  compatibility_suites?: Array<string>
  auto_test_config?: Array<string>
  test_config?: Array<string>
  dependencies?: Array<string>
  srcjars?: Array<string>
  classes_jar?: Array<string>
  test_mainline_modules?: Array<string>
  is_unit_test?: string
}

export type SoongModuleInfo = Map<string, TargetModuleInfo>

const EXCLUDE_MODULE_CLASSES = new Set(['NATIVE_TESTS', 'FAKE', 'ROBOLECTRIC'])

export function parseModuleInfo(info: string) {
  return new Map(Object.entries(JSON.parse(info))) as SoongModuleInfo
}

export function removeSelfModules(modulesMap: SoongModuleInfo, proprietaryDir: string) {
  // Remove modules provided by our generated vendor module, so we don't have to
  // save module-info.json in the system state
  for (let [moduleName, module] of modulesMap.entries()) {
    if (module.path.find(p => p === proprietaryDir) !== undefined) {
      modulesMap.delete(moduleName)
    }
  }
}

export function minimizeModules(info: SoongModuleInfo) {
  for (let [key, module] of info.entries()) {
    if (module.class.every(cl => EXCLUDE_MODULE_CLASSES.has(cl))) {
      info.delete(key)
      continue
    }

    delete module.compatibility_suites
    delete module.auto_test_config
    delete module.test_config
    delete module.dependencies
    delete module.srcjars
    delete module.classes_jar
    delete module.test_mainline_modules
    delete module.is_unit_test
  }
}
