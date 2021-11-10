import { promises as fs } from 'fs'
import * as unzipit from 'unzipit'

import { NodeFileReader } from '../util/zip'

export const ANDROID_INFO = 'android-info.txt'

export interface FactoryFirmware {
  androidInfo: string
  bootloaderImage: ArrayBuffer
  radioImage: ArrayBuffer
}

export async function extractFirmware(zipPath: string) {
  let reader = new NodeFileReader(zipPath)
  try {
    let { entries } = await unzipit.unzip(reader)

    // Find bootloader and radio
    let androidInfo: string
    let bootloaderImage: ArrayBuffer
    let radioImage: ArrayBuffer
    for (let [name, entry] of Object.entries(entries)) {
      if (name.endsWith(`/${ANDROID_INFO}`)) {
        androidInfo = await entries[ANDROID_INFO].text()
      } else if (name.includes('/bootloader-')) {
        bootloaderImage = await entry.arrayBuffer()
      } else if (name.includes('/radio-')) {
        radioImage = await entry.arrayBuffer()
      }
    }

    return {
      androidInfo: androidInfo!,
      bootloaderImage: bootloaderImage!,
      radioImage: radioImage!,
    } as FactoryFirmware
  } finally {
    await reader.close()
  }
}

export async function writeFirmware(fw: FactoryFirmware, proprietaryDir: string) {
  //TODO
  //await fs.writeFile(`${proprietaryDir}/${ANDROID_INFO}`, fw.androidInfo)
  await fs.writeFile(`${proprietaryDir}/bootloader.img`, new DataView(fw.bootloaderImage))
  await fs.writeFile(`${proprietaryDir}/radio.img`, new DataView(fw.radioImage))
}
