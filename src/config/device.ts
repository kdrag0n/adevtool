import * as YAML from 'yaml'
import { PropFilters } from '../blobs/props'

export interface DeviceInfo {
  name: string
  vendor: string
}

export interface DeviceConfig {
  device: DeviceInfo
  namespaces?: Array<string>
  sepolicy_dirs: Array<string>
  product_makefile: string
  flatten_apex?: boolean

  prop_filters?: PropFilters

  includes: Array<string>
  file_filters: { [name: string]: Array<string> }
}

export function parseDeviceConfig(config: string) {
  return YAML.parse(config) as DeviceConfig
}
