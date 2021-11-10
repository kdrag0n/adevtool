import { Command, flags } from '@oclif/command'
import { promises as fs } from 'fs'
import * as chalk from 'chalk'
import { downloadFile } from '../factory/download'

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
