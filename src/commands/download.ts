import { Command, flags } from '@oclif/command'
import { promises as fs } from 'fs'
import chalk from 'chalk'
import { downloadFile, ImageType, IndexCache } from '../images/download'

const IMAGE_TYPE_MAP: { [type: string]: ImageType } = {
  'factory': ImageType.Factory,
  'ota': ImageType.Ota,
  'vendor': ImageType.Vendor,
}

export default class Download extends Command {
  static description = 'download device factory images, OTAs, and/or vendor packages'

  static flags = {
    help: flags.help({char: 'h'}),
    type: flags.string({char: 't', options: ['factory', 'ota', 'vendor'], description: 'type(s) of images to download', default: 'factory', multiple: true}),
    buildId: flags.string({char: 'b', description: 'build ID(s) of the images to download', required: true, multiple: true}),
    device: flags.string({char: 'd', description: 'device(s) to download images for', required: true, multiple: true}),
  }

  static args = [
    {name: 'out', description: 'directory to save downloaded files in', required: true},
  ]

  async run() {
    let {flags, args: {out}} = this.parse(Download)

    await fs.mkdir(out, { recursive: true })

    let cache: IndexCache = {}
    for (let device of flags.device) {
      this.log(chalk.greenBright(`${device}`))

      for (let type of flags.type) {
        let typeEnum = IMAGE_TYPE_MAP[type]
        if (typeEnum == undefined) {
          throw new Error(`Unknown type ${type}`)
        }
        let prettyType = type == 'ota' ? 'OTA' : type.charAt(0).toUpperCase() + type.slice(1)

        for (let buildId of flags.buildId) {
          this.log(chalk.bold(chalk.blueBright(`  ${prettyType} - ${buildId.toUpperCase()}`)))
          await downloadFile(typeEnum, buildId, device, out, cache)
        }
      }
    }
  }
}
