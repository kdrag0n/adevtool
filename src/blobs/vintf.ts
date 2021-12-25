import { promises as fs } from 'fs'
import xml2js from 'xml2js'

import { exists, readFile } from '../util/fs'
import { EXT_PARTITIONS } from '../util/partitions'

const XML_BUILDER = new xml2js.Builder({
  xmldec: {
    version: '1.0',
  },
})

// Very ugly, but this is just the raw parsed XML format
export interface VintfHal {
  $: {
    format: string
    optional?: string
  }
  name: Array<string>
  transport: Array<string>
  version?: Array<string>
  interface: Array<{
    name: Array<string>
    instance: Array<string>
  }>
  fqname?: Array<string>
}

export interface VintfInfo {
  manifest: Array<VintfHal> | null
  matrix: Array<VintfHal> | null
}

export type PartitionVintfInfo = Map<string, VintfInfo>
export type PartitionVintfManifests = Map<string, Array<VintfHal>>

function halToKey(hal: VintfHal) {
  return JSON.stringify(hal)
}

export function getHalFqNames(hals: Array<VintfHal>) {
  return hals.flatMap(h => h.fqname?.map(suffix => h.name + suffix) ?? [])
}

export async function parseVintfManifest(manifestXml: string) {
  let doc = await xml2js.parseStringPromise(manifestXml)
  let hals = doc.manifest?.hal ?? doc['compatibility-matrix']?.hal ?? []
  return hals as Array<VintfHal>
}

export async function loadVintfManifest(root: string, partition: string, name = 'manifest') {
  let path = `${root}/${partition}/etc/vintf/${name}.xml`
  if (!(await exists(path))) {
    return null
  }

  let xml = await readFile(path)
  return parseVintfManifest(xml)
}

export async function loadPartVintfInfo(root: string) {
  let partInfo: PartitionVintfInfo = new Map<string, VintfInfo>()
  for (let partition of EXT_PARTITIONS) {
    let manifest = await loadVintfManifest(root, partition, 'manifest')
    let matrix = await loadVintfManifest(root, partition, 'compatibility_matrix')
    if (manifest !== null || matrix !== null) {
      partInfo.set(partition, {
        manifest,
        matrix,
      })
    }
  }

  return partInfo
}

export function diffVintfHals(halsRef: Array<VintfHal>, halsNew: Array<VintfHal>) {
  let refKeys = new Set(halsRef.map(halToKey))
  return halsNew.filter(h => !refKeys.has(halToKey(h)))
}

export function diffPartVintfManifests(vintfRef: PartitionVintfInfo, vintfNew: PartitionVintfInfo) {
  let partDiffs: PartitionVintfManifests = new Map<string, Array<VintfHal>>()
  for (let [partition, { manifest: halsNew }] of vintfNew.entries()) {
    if (halsNew === null) {
      continue
    }

    let halsRef = vintfRef.get(partition)?.manifest ?? []
    partDiffs.set(partition, diffVintfHals(halsRef, halsNew))
  }

  return partDiffs
}

export function serializeVintfHals(hals: Array<VintfHal>) {
  return XML_BUILDER.buildObject({
    manifest: {
      $: {
        version: '1.0',
        type: 'device',
      },
      hal: hals,
    },
  })
}

export async function writePartVintfManifests(partHals: PartitionVintfManifests, vintfDir: string) {
  let paths = new Map<string, string>()
  for (let [partition, hals] of partHals.entries()) {
    if (hals.length > 0) {
      let path = `${vintfDir}/adevtool_manifest_${partition}.xml`
      await fs.writeFile(path, serializeVintfHals(hals))
      paths.set(partition, path)
    }
  }

  return paths
}
