import path from 'path'

import { BlobEntry, partPathToSrcPath, srcPathToPartPath } from './entry'
import { exists, listFilesRecursive } from '../util/fs'
import { createActionSpinner, stopActionSpinner } from '../util/cli'
import { parseLines } from '../util/parse'
import { MAKEFILE_HEADER } from '../util/headers'
import { Filters, filterValues } from '../config/filters'

export function parseFileList(list: string) {
  let entries = []

  for (let line of parseLines(list)) {
    // Split into path and flags first, ignoring whitespace
    let [srcPath, postModifiers] = line.trim().split(';')
    let modifiers = (postModifiers ?? '').split('|')

    // Parse "named dependency" flag (preceding -)
    let isNamedDependency = srcPath.startsWith('-')
    if (isNamedDependency) {
      srcPath = srcPath.slice(1)
    }

    // Split path into partition and sub-partition path
    let [partition, path] = srcPathToPartPath(srcPath)

    entries.push({
      partition,
      path,
      srcPath,
      isPresigned: modifiers.includes('PRESIGNED'),
      isNamedDependency,
    } as BlobEntry)
  }

  // Sort by source path
  return entries.sort((a, b) => a.srcPath.localeCompare(b.srcPath))
}

export async function listPart(
  partition: string,
  systemRoot: string,
  filters: Filters | null = null,
  showSpinner = false,
) {
  let partRoot = `${systemRoot}/${partition}`
  if (!(await exists(partRoot))) {
    return null
  }

  // Unwrap system-as-root
  if (partition == 'system' && (await exists(`${partRoot}/system`))) {
    partRoot += '/system'
  }
  let refRoot = path.dirname(partRoot)

  let spinner = createActionSpinner(`Listing ${partition}`)
  if (showSpinner) {
    spinner.start()
  }

  let files = []
  for await (let file of listFilesRecursive(partRoot)) {
    // Remove root prefix
    file = path.relative(refRoot, file)
    if (showSpinner) {
      spinner.text = file
    }

    files.push(file)
  }

  // Filter
  if (filters != null) {
    files = filterValues(filters, files)
  }

  if (showSpinner) {
    stopActionSpinner(spinner)
  }

  // Sort and return raw path list
  return files.sort((a, b) => a.localeCompare(b))
}

export function serializeBlobList(entries: Iterable<BlobEntry>) {
  let lines = []
  for (let entry of entries) {
    let depFlag = entry.isNamedDependency ? '-' : ''
    let suffixFlags = entry.isPresigned ? ';PRESIGNED' : ''
    lines.push(depFlag + entry.srcPath + suffixFlags)
  }

  return `${MAKEFILE_HEADER}

${lines.join('\n')}`
}

export function diffLists(filesRef: Array<string>, filesNew: Array<string>) {
  let setRef = new Set(filesRef)
  return filesNew.filter(f => !setRef.has(f)).sort((a, b) => a.localeCompare(b))
}

export function combinedPartPathToEntry(partition: string, combinedPartPath: string) {
  // Decompose into 2-part partition path
  let partPath = combinedPartPath.split('/').slice(1).join('/')

  // Convert to source path
  let srcPath = partPathToSrcPath(partition, partPath)

  return {
    partition,
    path: partPath,
    srcPath,
    isPresigned: false,
    // TODO
    isNamedDependency: false,
  } as BlobEntry
}
