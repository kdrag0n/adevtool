import * as ora from 'ora'
import * as chalk from 'chalk'

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
