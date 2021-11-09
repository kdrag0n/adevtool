import { Command, flags } from '@oclif/command'
import { createWriteStream, promises as fs } from 'fs'
import * as chalk from 'chalk'
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

async function downloadFile(type: string, buildId: string, device: string, outDir: string) {
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

export default class Download extends Command {
  static description = 'download device factory images, OTAs, and/or vendor packages'

  static flags = {
    help: flags.help({char: 'h'}),
    type: flags.string({char: 't', options: ['factory', 'ota', 'vendor'], description: 'type(s) of images to download', default: 'factory', multiple: true}),
    buildId: flags.string({char: 'b', description: 'build ID/number of the image(s) to download', required: true}),
    device: flags.string({char: 'd', description: 'device(s) to download images for', required: true, multiple: true}),
  }

  static args = [
    {name: 'out', description: 'directory to save downloaded files in', required: true},
  ]

  async run() {
    let {flags, args: {out}} = this.parse(Download)

    await fs.mkdir(out, { recursive: true })

    let buildId = flags.buildId.toUpperCase()

    for (let type of flags.type) {
      let prettyType = type == 'ota' ? 'OTA' : type.charAt(0).toUpperCase() + type.slice(1)
      this.log(chalk.bold(chalk.blueBright(`${prettyType} - ${buildId}`)))

      for (let device of flags.device) {
        this.log(chalk.greenBright(`  ${device}`))
        await downloadFile(type, buildId, device, out)
      }
    }
  }
}
