import { promises as fs } from 'fs'
import * as unzipit from 'unzipit'

import { NodeFileReader } from '../util/zip'

export const ANDROID_INFO = 'android-info.txt'

export type FirmwareImages = Map<string, ArrayBuffer>

async function extractFactoryZipFirmware(path: string, images: FirmwareImages) {
  let reader = new NodeFileReader(path)

  try {
    let { entries } = await unzipit.unzip(reader)

    // Find images
    for (let [name, entry] of Object.entries(entries)) {
      if (name.includes('/bootloader-')) {
        images.set('bootloader.img', await entry.arrayBuffer())
      } else if (name.includes('/radio-')) {
        images.set('radio.img', await entry.arrayBuffer())
      }
    }
  } finally {
    await reader.close()
  }
}

async function extractFactoryDirFirmware(path: string, images: FirmwareImages) {
  for (let file of await fs.readdir(path)) {
    if (file.startsWith('bootloader-')) {
      let buf = await fs.readFile(`${path}/${file}`)
      images.set('bootloader.img', buf.buffer)
    } else if (file.startsWith('radio-')) {
      let buf = await fs.readFile(`${path}/${file}`)
      images.set('radio.img', buf.buffer)
    }
  }
}

// Path can be a directory or zip
export async function extractFactoryFirmware(path: string) {
  let images: FirmwareImages = new Map<string, ArrayBuffer>()

  if ((await fs.stat(path)).isDirectory()) {
    await extractFactoryDirFirmware(path, images)
  } else {
    await extractFactoryZipFirmware(path, images)
  }

  return images
}

export async function writeFirmwareImages(images: FirmwareImages, fwDir: string) {
  let paths = []
  for (let [name, buffer] of images.entries()) {
    let path = `${fwDir}/${name}`
    paths.push(path)
    await fs.writeFile(path, new DataView(buffer))
  }

  return paths
}

export function generateAndroidInfo(device: string, blVersion: string, radioVersion: string) {
  return `require board=${device}

require version-bootloader=${blVersion}
require version-baseband=${radioVersion}
`
}
