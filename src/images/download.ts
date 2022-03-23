import { createWriteStream } from 'fs'
import cliProgress from 'cli-progress'
import fetch from 'node-fetch'
import { promises as stream } from 'stream'
import path from 'path'
import _ from 'lodash'

const DEV_INDEX_URL = 'https://developers.google.com/android'
const DEV_COOKIE = 'devsite_wall_acks=nexus-image-tos,nexus-ota-tos'
const DL_URL_PREFIX = 'https://dl.google.com/dl/android/aosp/'

interface ImageTypeInfo {
  indexPath: string
  filePattern: string
}

export enum ImageType {
  Ota = 'ota',
  Factory = 'factory',
  Vendor = 'vendor',
}

export type IndexCache = { [type in ImageType]?: string }

const IMAGE_TYPES: Record<ImageType, ImageTypeInfo> = {
  [ImageType.Factory]: {
    indexPath: 'images',
    filePattern: 'DEVICE-BUILDID',
  },
  [ImageType.Ota]: {
    indexPath: 'ota',
    filePattern: 'DEVICE-ota-BUILDID',
  },
  [ImageType.Vendor]: {
    indexPath: 'drivers',
    filePattern: 'google_devices-DEVICE-BUILDID',
  },
}

async function getUrl(type: ImageType, buildId: string, device: string, cache: IndexCache) {
  let { indexPath, filePattern } = IMAGE_TYPES[type]

  let index = cache[type]
  if (index == undefined) {
    let resp = await fetch(`${DEV_INDEX_URL}/${indexPath}`, {
      headers: {
        Cookie: DEV_COOKIE,
      },
    })

    index = await resp.text()
    cache[type] = index
  }

  let filePrefix = filePattern
    .replace('DEVICE', device)
    .replace('BUILDID', buildId == 'latest' ? '' : `${buildId.toLowerCase()}-`)
  let urlPrefix = DL_URL_PREFIX + filePrefix

  let pattern = new RegExp(`"(${_.escapeRegExp(urlPrefix)}.+?)"`, 'g')
  let matches = Array.from(index.matchAll(pattern))
  if (matches.length == 0) {
    throw new Error(`Image not found: ${type}, ${buildId}, ${device}`)
  }

  if (buildId == 'latest') {
    return matches[matches.length - 1][1]
  }
  return matches[0][1]
}

export async function downloadFile(
  type: ImageType,
  buildId: string,
  device: string,
  outDir: string,
  cache: IndexCache = {},
) {
  let url = await getUrl(type, buildId, device, cache)

  console.log(`    ${url}`)
  let resp = await fetch(url)
  let name = path.basename(url)
  if (!resp.ok) {
    throw new Error(`Error ${resp.status}: ${resp.statusText}`)
  }

  let bar = new cliProgress.SingleBar(
    {
      format: '    {bar} {percentage}% | {value}/{total} MB',
    },
    cliProgress.Presets.shades_classic,
  )
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
