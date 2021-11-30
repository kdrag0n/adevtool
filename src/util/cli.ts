import ora from 'ora'
import chalk from 'chalk'

export type ProgressCallback = (progress: string) => void

export function createActionSpinner(action: string) {
  return ora({
    prefixText: chalk.bold(chalk.greenBright(action)),
    color: 'green',
  })
}

export function startActionSpinner(action: string) {
  return createActionSpinner(action).start()
}

export function stopActionSpinner(spinner: ora.Ora) {
  spinner.stopAndPersist()
}

export async function withSpinner<Return>(
  action: string,
  callback: (spinner: ora.Ora) => Promise<Return>,
) {
  let spinner = startActionSpinner(action)
  let ret = await callback(spinner)
  stopActionSpinner(spinner)

  return ret
}
