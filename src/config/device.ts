import _ from 'lodash'
import path from 'path'
import YAML from 'yaml'

import { readFile } from '../util/fs'
import { FilterMode, Filters, parseFilters, SerializedFilters } from './filters'

export interface DeviceInfo {
  name: string
  vendor: string
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
    overlays: Filters
    overlay_files: Filters,
    partitions: Filters
    presigned: Filters
    files: Filters
  }
}

// Untyped because this isn't a full config
const EMPTY_FILTERS = {
  mode: FilterMode.Exclude,
  match: [],
  prefix: [],
  suffix: [],
  regex: [],
} as SerializedFilters

const DEFAULT_CONFIG_BASE = {
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
    overlays: structuredClone(EMPTY_FILTERS),
    overlay_files: structuredClone(EMPTY_FILTERS),
    partitions: structuredClone(EMPTY_FILTERS),
    presigned: {
      ...structuredClone(EMPTY_FILTERS),
      mode: FilterMode.Include,
    },
    files: structuredClone(EMPTY_FILTERS),
  },
}

function mergeConfigs(base: any, overlay: any) {
  return _.mergeWith(base, overlay, (a, b) => {
    if (_.isArray(a)) {
      return a.concat(b)
    }
  }) as DeviceConfig
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
export async function loadDeviceConfig(configPath: string) {
  // TODO: type definition for structuredClone
  let base = structuredClone(DEFAULT_CONFIG_BASE) // deep copy to avoid mutating base

  let rootOverlay = YAML.parse(await readFile(configPath))
  let rootPath = path.dirname(configPath)
  let overlays: any[] = []
  await loadOverlaysRecursive(overlays, rootPath, rootOverlay)

  // Merge from base to final root
  let merged = overlays.reduce((base, overlay) => mergeConfigs(base, overlay), base)

  // Parse filters
  merged.filters = Object.fromEntries(Object.entries(merged.filters)
    .map(([group, filters]) => [group, parseFilters(filters as SerializedFilters)]))

  // Finally, cast it to the parsed config type
  delete merged.includes
  return merged as DeviceConfig
}
