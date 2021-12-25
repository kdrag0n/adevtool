import chalk from 'chalk'

export async function forEachDevice<Device>(
  devices: Device[],
  parallel: boolean,
  callback: (device: Device) => Promise<void>,
  deviceKey: (device: Device) => string = d => d as any as string,
) {
  let jobs = []
  let isMultiDevice = devices.length > 1
  for (let device of devices) {
    if (isMultiDevice) {
      console.log(`

${chalk.bold(chalk.blueBright(deviceKey(device)))}
`)
    }

    let job = callback(device)
    if (parallel) {
      jobs.push(job)
    } else {
      await job
    }
  }

  await Promise.all(jobs)
}
