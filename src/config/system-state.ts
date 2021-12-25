import { listPart } from '../blobs/file-list'
import { parsePartOverlayApks, PartResValues } from '../blobs/overlays'
import { loadPartitionProps, PartitionProps } from '../blobs/props'
import { loadPartVintfInfo, PartitionVintfInfo } from '../blobs/vintf'
import { minimizeModules, parseModuleInfo, SoongModuleInfo } from '../build/soong-info'
import { parsePartContexts, SelinuxPartContexts } from '../selinux/contexts'
import { withSpinner } from '../util/cli'
import { readFile } from '../util/fs'
import { ALL_SYS_PARTITIONS } from '../util/partitions'

const STATE_VERSION = 4

export interface SystemState {
  deviceInfo: {
    name: string
  }

  partitionFiles: { [part: string]: Array<string> }
  partitionProps: PartitionProps
  partitionSecontexts: SelinuxPartContexts
  partitionOverlays: PartResValues
  partitionVintfInfo: PartitionVintfInfo

  moduleInfo: SoongModuleInfo
}

type SerializedSystemState = {
  version: number
} & SystemState

export function serializeSystemState(state: SystemState) {
  minimizeModules(state.moduleInfo)

  let diskState = {
    version: STATE_VERSION,
    ...state,
  }

  return JSON.stringify(
    diskState,
    (k, v) => {
      if (v instanceof Map) {
        return {
          _type: 'Map',
          data: Object.fromEntries(v.entries()),
        }
      }
      return v
    },
    2,
  )
}

export function parseSystemState(json: string) {
  let diskState = JSON.parse(json, (k, v) => {
    if (v?.hasOwnProperty('_type') && v?._type === 'Map') {
      return new Map(Object.entries(v.data))
    }
    return v
  }) as SerializedSystemState

  if (diskState.version !== STATE_VERSION) {
    throw new Error(`Outdated state v${diskState.version}; expected v${STATE_VERSION}`)
  }

  return diskState as SystemState
}

export async function collectSystemState(device: string, outRoot: string, aapt2Path: string) {
  let systemRoot = `${outRoot}/target/product/${device}`
  let moduleInfoPath = `${systemRoot}/module-info.json`
  let state = {
    deviceInfo: {
      name: device,
    },
    partitionFiles: {},
  } as SystemState

  // Files
  await withSpinner('Enumerating files', async spinner => {
    for (let partition of ALL_SYS_PARTITIONS) {
      spinner.text = partition

      let files = await listPart(partition, systemRoot)
      if (files === null) continue

      state.partitionFiles[partition] = files
    }
  })

  // Props
  state.partitionProps = await withSpinner('Extracting properties', () => loadPartitionProps(systemRoot))

  // SELinux contexts
  state.partitionSecontexts = await withSpinner('Extracting SELinux contexts', () => parsePartContexts(systemRoot))

  // Overlays
  state.partitionOverlays = await withSpinner('Extracting overlays', spinner =>
    parsePartOverlayApks(aapt2Path, systemRoot, path => {
      spinner.text = path
    }),
  )

  // vintf info
  state.partitionVintfInfo = await withSpinner('Extracting vintf manifests', () => loadPartVintfInfo(systemRoot))

  // Module info
  state.moduleInfo = await withSpinner('Parsing module info', async () =>
    parseModuleInfo(await readFile(moduleInfoPath)),
  )

  return state
}
