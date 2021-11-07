// Excluding system
export const EXT_PARTITIONS = new Set(['system_ext', 'product', 'vendor', 'odm'])

// All partitions
export const ALL_PARTITIONS = new Set(['system', ...EXT_PARTITIONS])
