// Android system partitions, excluding "system"
export const EXT_SYS_PARTITIONS = new Set([
  'system_ext',
  'product',
  'vendor',
  'odm',
])

// GKI DLKM partitions
export const DLKM_PARTITIONS = new Set([
  'vendor_dlkm',
  'odm_dlkm',
])

export const EXT_PARTITIONS = new Set([
  ...EXT_SYS_PARTITIONS,
  ...DLKM_PARTITIONS,
])

// All partitions
export const ALL_PARTITIONS = new Set(['system', ...EXT_PARTITIONS])
