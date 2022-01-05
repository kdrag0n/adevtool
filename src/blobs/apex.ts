import { promises as fs } from 'fs'
import path from 'path'
import * as unzipit from 'unzipit'

import { enumerateSelinuxLabels, SelinuxFileLabels } from '../selinux/labels'
import { ProgressCallback } from '../util/cli'
import { createSubTmp, listFilesRecursive, mount, TempState } from '../util/fs'
import { NodeFileReader } from '../util/zip'
import { BlobEntry } from './entry'
import { combinedPartPathToEntry } from './file-list'

export const ANDROID_INFO = 'android-info.txt'

export type FirmwareImages = Map<string, ArrayBuffer>

export interface FlattenedApex {
  entries: Array<BlobEntry>
  labels: SelinuxFileLabels
}

async function listPayload(
  partition: string,
  apexName: string,
  img: ArrayBuffer,
  tmp: TempState,
  progressCallback?: ProgressCallback,
) {
  // Extract image
  let imgPath = `${tmp.dir}/apex_payload.img`
  await fs.writeFile(imgPath, new DataView(img))

  // Mount
  let mountpoint = `${tmp.dir}/payload`
  await fs.mkdir(mountpoint)
  await mount(imgPath, mountpoint)
  tmp.mounts.push(mountpoint)

  // Extract files, including apex_metadata.pb
  let apexRoot = `${partition}/apex/${apexName}`
  let entries: Array<BlobEntry> = []
  for await (let file of listFilesRecursive(mountpoint)) {
    if (progressCallback != undefined) {
      progressCallback(file)
    }

    let partPath = path.relative(mountpoint, file)
    let entry = combinedPartPathToEntry(partition, `${apexRoot}/${partPath}`)
    // I don't know of a way to make Soong copy files to a non-standard path ($part/apex/*)
    entry.disableSoong = true
    // Copy directly from mounted image
    entry.diskSrcPath = file

    entries.push(entry)
  }

  // Get SELinux labels
  let labels = await enumerateSelinuxLabels(mountpoint)
  // Fix paths
  labels = new Map(
    Array.from(labels.entries()).map(([file, context]) => [`/${apexRoot}/${path.relative(mountpoint, file)}`, context]),
  )

  return {
    entries,
    labels,
  } as FlattenedApex
}

export async function flattenApex(
  partition: string,
  zipPath: string,
  tmp: TempState,
  progressCallback?: ProgressCallback,
) {
  let apexName = path.basename(zipPath, '.apex')
  let entries: Array<BlobEntry> = []
  let labels: SelinuxFileLabels | null = null
  let reader = new NodeFileReader(zipPath)

  try {
    let { entries: zipEntries } = await unzipit.unzip(reader)

    for (let [name, zipEntry] of Object.entries(zipEntries)) {
      if (name == 'apex_pubkey') {
        // Extract public key file to tmp
        let pubkeyPath = `${tmp.dir}/apex_pubkey`
        await fs.writeFile(pubkeyPath, new DataView(await zipEntry.arrayBuffer()))

        // Add entry
        let entry = combinedPartPathToEntry(partition, `${partition}/apex/${apexName}/apex_pubkey`)
        entry.diskSrcPath = pubkeyPath
        entries.push(entry)
      } else if (name == 'apex_payload.img') {
        // Mount and add payload files as entries
        let img = await zipEntry.arrayBuffer()
        let payload = await listPayload(partition, apexName, img, tmp, progressCallback)
        entries.push(...payload.entries)
        labels = payload.labels
      }
    }

    return {
      entries,
      labels,
    } as FlattenedApex
  } finally {
    await reader.close()
  }
}

export async function flattenAllApexs(
  rawEntries: Array<BlobEntry>,
  srcDir: string,
  tmp: TempState,
  progressCallback?: ProgressCallback,
) {
  let entries = new Set(rawEntries)
  let labels = new Map<string, string>()
  for (let entry of rawEntries) {
    if (path.extname(entry.path) != '.apex') {
      continue
    }

    let apexPath = `${srcDir}/${entry.srcPath}`
    let subTmp = await createSubTmp(tmp, `flat_apex/${entry.srcPath}`)

    // Flatten and add new entries
    let apex = await flattenApex(entry.partition, apexPath, subTmp, progressCallback)
    apex.entries.forEach(e => entries.add(e))
    Array.from(apex.labels.entries()).forEach(([path, context]) => labels.set(path, context))

    // Remove the APEX blob entry
    entries.delete(entry)
  }

  return {
    entries: Array.from(entries),
    labels,
  } as FlattenedApex
}
