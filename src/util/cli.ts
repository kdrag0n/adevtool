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
