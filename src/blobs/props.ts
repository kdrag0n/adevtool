import { promises as fs } from 'fs'

import { exists } from '../util/fs'
import { parseLines } from '../util/parse'
import { ALL_PARTITIONS } from '../util/partitions'

export type PartitionProps = Map<string, Map<string, string>>

export interface PropChanges {
  added: Map<string, string>
  modified: Map<string, Array<string>>
  removed: Map<string, string>
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

  for (let partition of ALL_PARTITIONS) {
    let propPath = `${sourceRoot}/${partition}/build.prop`
    if (partition == 'system' && !(await exists(propPath))) {
      // System-as-root
      propPath = `${sourceRoot}/system/system/build.prop`
    }
    // Android 12: some partitions have props in etc/build.prop
    if ((partition == 'system_ext' || partition == 'product') && !(await exists(propPath))) {
      propPath = `${sourceRoot}/${partition}/etc/build.prop`
    }
    if (!(await exists(propPath))) {
      continue
    }

    let props = parseProps(await fs.readFile(propPath, { encoding: 'utf8' }));
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
        if (newValue != refValue) {
          changes.modified.set(newKey, [refValue, newValue])
        }
      } else {
        changes.added.set(newKey, newValue)
      }
    }

    // Removed
    if (propsRef != null) {
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
