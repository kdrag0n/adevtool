// Excluding system
export const EXT_PARTITIONS = new Set([
  // Android system
  'system_ext',
  'product',
  'vendor',
  'odm',

  // GKI DLKMs
  'vendor_dlkm',
  'odm_dlkm',
])

// All partitions
export const ALL_PARTITIONS = new Set(['system', ...EXT_PARTITIONS])
