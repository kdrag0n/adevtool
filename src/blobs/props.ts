import { exists, readFile } from '../util/fs'
import { parseLines } from '../util/parse'
import { ALL_SYS_PARTITIONS } from '../util/partitions'

export type PartitionProps = Map<string, Map<string, string>>

export interface PropChanges {
  added: Map<string, string>
  modified: Map<string, Array<string>>
  removed: Map<string, string>
}

export interface PropFilters {
  keys?: Array<string>
  prefixes?: Array<string>
}

export function parseProps(file: string) {
  let props = new Map<string, string>()
  for (let line of parseLines(file)) {
    let [key, value] = line.split('=', 2)
    props.set(key, value)
  }

  return props
}

export async function loadPartitionProps(sourceRoot: string) {
  let partProps = new Map<string, Map<string, string>>() as PartitionProps

  for (let partition of ALL_SYS_PARTITIONS) {
    let propPath = `${sourceRoot}/${partition}/build.prop`
    if (partition === 'system' && !(await exists(propPath))) {
      // System-as-root
      propPath = `${sourceRoot}/system/system/build.prop`
    }
    // Android 12: some ext partitions have props in etc/build.prop
    if (!(await exists(propPath))) {
      propPath = `${sourceRoot}/${partition}/etc/build.prop`
    }
    if (!(await exists(propPath))) {
      continue
    }

    let props = parseProps(await readFile(propPath))
    partProps.set(partition, props)
  }

  return partProps
}

export function diffPartitionProps(partPropsRef: PartitionProps, partPropsNew: PartitionProps) {
  let partChanges = new Map<string, PropChanges>()
  for (let [partition, propsNew] of partPropsNew.entries()) {
    let propsRef = partPropsRef.get(partition)
    let changes = {
      added: new Map<string, string>(),
      modified: new Map<string, Array<string>>(),
      removed: new Map<string, string>(),
    } as PropChanges

    // Added, modified
    for (let [newKey, newValue] of propsNew.entries()) {
      if (propsRef?.has(newKey)) {
        let refValue = propsRef.get(newKey)!
        if (newValue !== refValue) {
          changes.modified.set(newKey, [refValue, newValue])
        }
      } else {
        changes.added.set(newKey, newValue)
      }
    }

    // Removed
    if (propsRef !== null) {
      for (let [refKey, refValue] of propsRef.entries()) {
        if (!propsNew.has(refKey)) {
          changes.removed.set(refKey, refValue)
        }
      }
    }

    partChanges.set(partition, changes)
  }

  return partChanges
}

export function filterPropKeys(props: Map<string, string>, filters: PropFilters) {
  let excludeKeys = new Set(filters.keys)
  for (let key of props.keys()) {
    if (excludeKeys.has(key) || filters.prefixes?.find(p => key.startsWith(p)) !== undefined) {
      props.delete(key)
    }
  }
}

export function filterPartPropKeys(partProps: PartitionProps, filters: PropFilters) {
  for (let props of partProps.values()) {
    filterPropKeys(props, filters)
  }
}
