import _ from 'lodash'

import { parseLines } from '../util/parse'
import { run } from '../util/process'

export type SelinuxFileLabels = Map<string, string>

export async function enumerateSelinuxLabels(root: string) {
  // Recursive, abs paths, don't follow symlinks
  let attrs = await run(`getfattr --absolute-names --recursive --physical -n security.selinux ${root}`)

  let labels: SelinuxFileLabels = new Map<string, string>()
  let lastPath = ''
  for (let line of parseLines(attrs, false)) {
    let match = line.match(/^# file: (.+)$/)
    if (match !== undefined) {
      lastPath = match[1]
      continue
    }

    match = line.match(/^security.selinux="(.+)"$/)
    if (match !== undefined) {
      let label = match[1]
      labels.set(lastPath, label)
      continue
    }
  }

  return labels
}

export function generateFileContexts(labels: SelinuxFileLabels) {
  return `${Array.from(labels.entries())
    .map(([path, context]) => `${_.escapeRegExp(path)} ${context}`)
    .join('\n')}\n`
}
