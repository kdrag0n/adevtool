import { promises as fs } from 'fs'
import * as unzipit from 'unzipit'

import { NodeFileReader } from '../util/zip'

export const ANDROID_INFO = 'android-info.txt'

export type FirmwareImages = Map<string, ArrayBuffer>

async function extractNestedImages(images: FirmwareImages, nestedZip: ArrayBuffer) {
  let { entries } = await unzipit.unzip(nestedZip)
  if (ANDROID_INFO in entries) {
    images.set(ANDROID_INFO, await entries[ANDROID_INFO].arrayBuffer())
  }
}

export async function extractFactoryFirmware(zipPath: string) {
  let reader = new NodeFileReader(zipPath)
  let images: FirmwareImages = new Map<string, ArrayBuffer>()

  try {
    let { entries } = await unzipit.unzip(reader)

    // Find images
    for (let [name, entry] of Object.entries(entries)) {
      if (name.includes('/image-')) {
        // Extract nested zip to get android-info.txt
        await extractNestedImages(images, await entry.arrayBuffer())
      } else if (name.includes('/bootloader-')) {
        images.set('bootloader.img', await entry.arrayBuffer())
      } else if (name.includes('/radio-')) {
        images.set('radio.img', await entry.arrayBuffer())
      }
    }

    return images
  } finally {
    await reader.close()
  }
}

export async function writeFirmwareImages(images: FirmwareImages, proprietaryDir: string) {
  let fwDir = `${proprietaryDir}/firmware`
  await fs.mkdir(fwDir, { recursive: true })

  let paths = []
  for (let [name, buffer] of images.entries()) {
    let path = `${fwDir}/${name}`
    paths.push(path)
    await fs.writeFile(path, new DataView(buffer))
  }

  return paths
}
