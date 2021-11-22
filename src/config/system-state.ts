import { PartResValues } from "../blobs/overlays"
import { PartitionProps } from "../blobs/props"
import { PartitionVintfInfo } from "../blobs/vintf"
import { SelinuxPartContexts } from "../selinux/contexts"

const STATE_VERSION = 1

export interface SystemState {
  partitionFiles: { [part: string]: Array<string> }
  partitionProps: PartitionProps
  partitionSecontexts: SelinuxPartContexts
  partitionOverlays: PartResValues
  partitionVintfInfo: PartitionVintfInfo
}

type SerializedSystemState = {
  version: number
} & SystemState

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
    if (v?.hasOwnProperty('_type') && v?._type == 'Map') {
      return new Map(Object.entries(v.data))
    } else {
      return v
    }
  }) as SerializedSystemState

  if (diskState.version != STATE_VERSION) {
    throw new Error(`Outdated state v${diskState.version}; expected v${STATE_VERSION}`)
  }

  return diskState as SystemState
}
