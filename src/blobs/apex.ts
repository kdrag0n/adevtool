import { promises as fs } from 'fs'
import * as path from 'path'
import * as unzipit from 'unzipit'

import { listFilesRecursive, TempState } from '../util/fs'
import { run } from '../util/process'
import { NodeFileReader } from '../util/zip'
import { BlobEntry } from './entry'
import { combinedPartPathToEntry } from './file_list'

export const ANDROID_INFO = 'android-info.txt'

export type FirmwareImages = Map<string, ArrayBuffer>

async function listPayload(partition: string, apexName: string, img: ArrayBuffer, tmp: TempState) {
  // Extract image
  let imgPath = `${tmp.dir}/apex_payload.img`
  await fs.writeFile(imgPath, new DataView(img))

  // Mount
  let mountPoint = `${tmp.dir}/payload`
  await fs.mkdir(mountPoint)
  await run(`mount -t ext4 -o ro ${imgPath} ${mountPoint}`)
  tmp.mounts.push(mountPoint)

  // Extract files, including apex_metadata.pb
  let entries: Array<BlobEntry> = []
  for await (let file of listFilesRecursive(mountPoint)) {
    let partPath = path.relative(mountPoint, file)
    let entry = combinedPartPathToEntry(partition, `${partition}/apex/${apexName}/${partPath}`)
    // I don't know of a way to make Soong copy files to a non-standard path ($part/apex/*)
    entry.disableSoong = true
    // Copy directly from mounted image
    entry.diskSrcPath = file

    entries.push(entry)
  }

  return entries
}

export async function flattenApex(partition: string, zipPath: string, tmp: TempState) {
  let apexName = path.basename(zipPath, '.apex')
  let entries: Array<BlobEntry> = []
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
        let payloadEntries = await listPayload(partition, apexName, img, tmp)
        entries.push(...payloadEntries)
      }
    }

    return entries
  } finally {
    await reader.close()
  }
}

export async function flattenAllApexs(rawEntries: Array<BlobEntry>, srcDir: string, tmp: TempState) {
  let entries = new Set(rawEntries)
  for (let entry of rawEntries) {
    if (path.extname(entry.path) != '.apex') {
      continue
    }

    // Flatten and add new entries
    let apexPath = `${srcDir}/${entry.srcPath}`
    let apexEntries = await flattenApex(entry.partition, apexPath, tmp)
    apexEntries.forEach(e => entries.add(e))

    // Remove the APEX blob entry
    entries.delete(entry)
  }

  return Array.from(entries)
}
