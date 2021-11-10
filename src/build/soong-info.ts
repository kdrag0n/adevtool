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

export type SoongModuleInfo = { [moduleName: string]: TargetModuleInfo }

export function parseModuleInfo(info: string) {
  return JSON.parse(info) as SoongModuleInfo
}
