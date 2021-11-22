import { promises as fs } from 'fs'
import * as path from 'path'

import { parseSeappContexts } from '../sepolicy/seapp'
import { aapt2 } from '../util/process'
import { listFilesRecursive } from '../util/fs'
import { BlobEntry } from './entry'

export async function parsePresignedRecursive(sepolicyDirs: Array<string>) {
  let contexts = []
  for (let dir of sepolicyDirs) {
    for await (let file of listFilesRecursive(dir)) {
      if (path.basename(file) != 'seapp_contexts') {
        continue
      }

      let rawContexts = await fs.readFile(file, { encoding: 'utf8' })
      contexts.push(...parseSeappContexts(rawContexts))
    }
  }

  return new Set(contexts.filter(c => c.seinfo != 'platform')
    .map(c => c.name))
}

export async function updatePresignedBlobs(
  aapt2Path: string,
  source: string,
  presignedPkgs: Set<string>,
  entries: Iterable<BlobEntry>,
  entryCallback?: (entry: BlobEntry) => void,
) {
  let updatedEntries = []
  for (let entry of entries) {
    if (path.extname(entry.path) != '.apk') {
      continue
    }

    if (entryCallback != undefined) {
      entryCallback(entry)
    }

    let pkgName = await aapt2(aapt2Path, 'dump', 'packagename', `${source}/${entry.srcPath}`)
    if (presignedPkgs.has(pkgName)) {
      entry.isPresigned = true
      updatedEntries.push(entry)
    }
  }

  return updatedEntries
}

export async function enumeratePresignedBlobs(
  aapt2Path: string,
  source: string,
  presignedPkgs: Set<string>,
) {
  let presignedPaths = []
  for await (let file of listFilesRecursive(source)) {
    if (path.extname(file) != '.apk') {
      continue
    }

    let pkgName = await aapt2(aapt2Path, 'dump', 'packagename', file)
    if (presignedPkgs.has(pkgName)) {
      presignedPaths.push(file)
    }
  }

  return presignedPaths
}
