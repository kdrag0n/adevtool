// Breaks build with import, needed for structuredClone definition
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
///<reference path="../util/jstypes.d.ts" />

import _ from 'lodash'
import path from 'path'
import YAML from 'yaml'

import { readFile } from '../util/fs'
import { FilterMode, Filters, parseFilters, SerializedFilters } from './filters'

export enum ConfigType {
  Device = 'device',
  DeviceList = 'device-list',
}

export interface DeviceConfig {
  // Required
  device: {
    name: string
    vendor: string
  }

  platform: {
    namespaces: string[]
    sepolicy_dirs: string[]
    product_makefile: string // required
  }

  generate: {
    overrides: boolean
    presigned: boolean
    flat_apex: boolean
    files: boolean
    props: boolean
    sepolicy_dirs: boolean
    overlays: boolean
    vintf: boolean
    factory_firmware: boolean
    ota_firmware: boolean // not yet implemented
    products: boolean
  }

  // Not part of the final config
  // includes: string[]

  filters: {
    props: Filters
    overlay_keys: Filters
    overlay_values: Filters
    overlay_files: Filters
    partitions: Filters
    presigned: Filters
    sepolicy_dirs: Filters
    dep_files: Filters
    files: Filters
  }
}

interface DeviceListConfig {
  type: ConfigType.DeviceList
  devices: string[] // config paths

  // Not part of the final config
  // includes: string[]
}

// Untyped because this isn't a full config
export const EMPTY_FILTERS = {
  mode: FilterMode.Exclude,
  match: [],
  prefix: [],
  suffix: [],
  substring: [],
  regex: [],
} as SerializedFilters
// Same, but defaults to inclusion list
export const EMPTY_INCLUDE_FILTERS = {
  ...structuredClone(EMPTY_FILTERS),
  mode: FilterMode.Include,
} as SerializedFilters

const DEFAULT_CONFIG_BASE = {
  type: ConfigType.Device,
  platform: {
    namespaces: [],
    sepolicy_dirs: [],
  },
  generate: {
    overrides: true,
    presigned: true,
    flat_apex: false, // currently broken
    files: true,
    props: true,
    sepolicy_dirs: true,
    overlays: true,
    vintf: true,
    factory_firmware: true,
    ota_firmware: true,
    products: true,
  },
  filters: {
    props: structuredClone(EMPTY_FILTERS),
    overlay_keys: structuredClone(EMPTY_FILTERS),
    overlay_values: structuredClone(EMPTY_FILTERS),
    overlay_files: structuredClone(EMPTY_FILTERS),
    partitions: structuredClone(EMPTY_FILTERS),
    presigned: structuredClone(EMPTY_INCLUDE_FILTERS),
    sepolicy_dirs: structuredClone(EMPTY_FILTERS),
    dep_files: structuredClone(EMPTY_INCLUDE_FILTERS),
    files: structuredClone(EMPTY_FILTERS),
  },
}

function mergeConfigs(base: any, overlay: any) {
  return _.mergeWith(base, overlay, (a, b) => {
    if (_.isArray(a)) {
      return a.concat(b)
    }
  })
}

async function loadOverlaysRecursive(overlays: any[], rootDir: string, root: any) {
  if (_.isArray(root.includes)) {
    for (let relPath of root.includes) {
      let overlayPath = path.resolve(rootDir, relPath)
      let overlayDir = path.dirname(overlayPath)

      let overlay = YAML.parse(await readFile(overlayPath))
      await loadOverlaysRecursive(overlays, overlayDir, overlay)
    }
  }

  overlays.push(root)
}

// No dedicated parse function as this requires loading includes and overlaying
// them in the correct order
async function loadAndMergeConfig(configPath: string) {
  let base = structuredClone(DEFAULT_CONFIG_BASE) // deep copy to avoid mutating base

  let rootOverlay = YAML.parse(await readFile(configPath))
  let rootPath = path.dirname(configPath)
  let overlays: any[] = []
  await loadOverlaysRecursive(overlays, rootPath, rootOverlay)

  // Merge from base to final root
  let merged = overlays.reduce((base, overlay) => mergeConfigs(base, overlay), base)

  // Parse filters
  merged.filters = Object.fromEntries(
    Object.entries(merged.filters).map(([group, filters]) => [group, parseFilters(filters as SerializedFilters)]),
  )

  // Finally, cast it to the parsed config type
  delete merged.includes
  return merged
}

export async function loadDeviceConfigs(configPath: string) {
  let merged = await loadAndMergeConfig(configPath)
  let { type } = merged
  delete merged.type

  if (type == ConfigType.Device) {
    return [merged as DeviceConfig]
  }
  if (type == ConfigType.DeviceList) {
    // Load all the device configs
    let list = merged as DeviceListConfig
    let devices: DeviceConfig[] = []
    for (let devicePath of list.devices) {
      devicePath = path.resolve(path.dirname(configPath), devicePath)
      devices.push(await loadAndMergeConfig(devicePath))
    }

    return devices
  }
  throw new Error(`Unknown config type ${type}`)
}
