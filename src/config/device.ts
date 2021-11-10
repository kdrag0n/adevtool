import * as YAML from 'yaml'

export interface DeviceInfo {
  name: string
  vendor: string
}

export interface DeviceConfig {
  device: DeviceInfo
  namespaces?: Array<string>
  sepolicy_dirs: Array<string>
  includes: Array<string>
  filters: { [name: string]: Array<string> }
}

export function parseDeviceConfig(config: string) {
  return YAML.parse(config) as DeviceConfig
}
