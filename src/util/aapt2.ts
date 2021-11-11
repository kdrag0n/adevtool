import * as util from 'util'
import { exec as execCb } from 'child_process'

const exec = util.promisify(execCb)

export async function aapt2(path: string, ...args: Array<string>) {
  // TODO: stop using shell
  let { stdout, stderr } = await exec(`${path} ${args.join(' ')}`)
  return stdout.trim()
}
