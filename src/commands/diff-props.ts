import { Command, flags } from '@oclif/command'
import chalk from 'chalk'

import { diffPartitionProps, loadPartitionProps, PartitionProps } from '../blobs/props'

const BUILD_KEY_PATTERN = /^ro(?:\.(?:system|system_ext|product|vendor|odm|vendor_dlkm|odm_dlkm))?\.build\..+$/

function removeBuildProps(partProps: PartitionProps) {
  for (let props of partProps.values()) {
    for (let key of props.keys()) {
      if (key.match(BUILD_KEY_PATTERN)) {
        props.delete(key)
      }
    }
  }
}

function forEachPropLine(props: Map<string, string>, callback: (prop: string) => void) {
  for (let [key, value] of props.entries()) {
    callback(`${key}=${chalk.bold(value)}`)
  }
}

function forEachPropLineModified(props: Map<string, Array<string>>, callback: (prop: string) => void) {
  for (let [key, [refValue, newValue]] of props.entries()) {
    callback(`${key}=${chalk.bold(refValue)} -> ${chalk.bold(chalk.blue(newValue))}`)
  }
}

export default class DiffProps extends Command {
  static description = 'find missing and different properties compared to a reference system'

  static flags = {
    help: flags.help({ char: 'h' }),
    all: flags.boolean({ char: 'a', description: 'show all differences, not only missing props', default: false }),
    includeBuild: flags.boolean({ char: 'b', description: 'include build props', default: false }),
  }

  static args = [
    { name: 'sourceRef', description: 'path to root of reference system', required: true },
    { name: 'sourceNew', description: 'path to root of new system', required: true },
  ]

  async run() {
    let {
      flags: { all, includeBuild },
      args: { sourceRef, sourceNew },
    } = this.parse(DiffProps)

    let propsRef = await loadPartitionProps(sourceRef)
    let propsNew = await loadPartitionProps(sourceNew)

    // Remove build props?
    if (!includeBuild) {
      removeBuildProps(propsRef)
      removeBuildProps(propsNew)
    }

    let partChanges = diffPartitionProps(propsRef, propsNew)

    for (let [partition, changes] of partChanges.entries()) {
      this.log(chalk.bold(partition))

      forEachPropLine(changes.removed, p => this.log(chalk.red(`    ${p}`)))
      if (all) {
        forEachPropLine(changes.added, p => this.log(chalk.green(`    ${p}`)))
        forEachPropLineModified(changes.modified, p => this.log(`    ${p}`))
      }

      this.log()
    }
  }
}
