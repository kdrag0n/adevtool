import { PartitionProps } from "../blobs/props"

const STATE_VERSION = 1

interface SerializedSystemState {
  version: number

  partitionFiles: { [part: string]: Array<string> }
  partitionProps: PartitionProps
}

export interface SystemState {
  partitionFiles: { [part: string]: Array<string> }
  partitionProps: PartitionProps
}

export function serializeSystemState(state: SystemState) {
  let diskState = {
    version: STATE_VERSION,
    ...state,
  }

  return JSON.stringify(diskState, (k, v) => {
    if (v instanceof Map) {
      return {
        _type: 'Map',
        data: Object.fromEntries(v.entries()),
      }
    } else {
      return v
    }
  }, 2)
}

export function parseSystemState(json: string) {
  let diskState = JSON.parse(json, (k, v) => {
    if (v.hasOwnProperty('_type') && v._type == 'Map') {
      return new Map(Object.entries(v.data))
    } else {
      return v
    }
  }) as SerializedSystemState

  if (diskState.version != STATE_VERSION) {
    throw new Error(`Outdated state v${diskState.version}; expected v${STATE_VERSION}`)
  }

  return {
    partitionFiles: diskState.partitionFiles,
    partitionProps: diskState.partitionProps,
  } as SystemState
}
