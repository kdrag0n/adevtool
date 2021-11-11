import { $ } from 'zx'

$.verbose = false

export async function aapt2(path: string, ...args: Array<string>) {
  let procOut = await $`${path} ${args.join('\n')}`
  return procOut.stdout.trim()
}
