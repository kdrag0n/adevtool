import { createWriteStream } from 'fs'
import * as cliProgress from 'cli-progress'
import fetch from 'node-fetch'
import { promises as stream } from 'stream'
import * as path from 'path'

const VENDOR_INDEX_URL = 'https://developers.google.com/android/drivers'
const VENDOR_URL_PREFIX = 'https://dl.google.com/dl/android/aosp/google_devices'

async function getUrl(type: string, buildId: string, device: string) {
  if (type == 'vendor') {
    let resp = await fetch(VENDOR_INDEX_URL)
    let index = await resp.text()

    // TODO: parse HTML properly
    let pattern = new RegExp(`"(${VENDOR_URL_PREFIX}-${device}-${buildId.toLowerCase()}-[a-z9-9.-_]+)">`)
    let match = index.match(pattern)
    if (match == null) {
      throw new Error(`Image not found: ${type}, ${buildId}, ${device}`)
    }

    return match[1]
  } else {
    // TODO: implement factory and ota
    throw new Error(`Unsupported type ${type}`)
  }
}

export async function downloadFile(type: string, buildId: string, device: string, outDir: string) {
  let url = await getUrl(type, buildId, device)

  let resp = await fetch(url)
  let name = path.basename(url)
  if (!resp.ok) {
    throw new Error(`Error ${resp.status}: ${resp.statusText}`)
  }

  let bar = new cliProgress.SingleBar({
    format: '    {bar} {percentage}% | {value}/{total} MB',
  }, cliProgress.Presets.shades_classic)
  let progress = 0
  let totalSize = parseInt(resp.headers.get('content-length') ?? '0') / 1e6
  bar.start(Math.round(totalSize), 0)
  resp.body!.on('data', chunk => {
    progress += chunk.length / 1e6
    bar.update(Math.round(progress))
  })

  await stream.pipeline(resp.body!, createWriteStream(`${outDir}/${name}`))
  bar.stop()
}
