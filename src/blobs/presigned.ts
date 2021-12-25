import path from 'path'

import { parseSeappContexts } from '../selinux/seapp'
import { aapt2 } from '../util/process'
import { listFilesRecursive, readFile } from '../util/fs'
import { BlobEntry } from './entry'
import { Filters, filterValue } from '../config/filters'

export async function parsePresignedRecursive(sepolicyDirs: Array<string>) {
  let contexts = []
  for (let dir of sepolicyDirs) {
    for await (let file of listFilesRecursive(dir)) {
      if (path.basename(file) != 'seapp_contexts') {
        continue
      }

      let rawContexts = await readFile(file)
      contexts.push(...parseSeappContexts(rawContexts))
    }
  }

  return new Set(contexts.filter(c => c.seinfo != 'platform').map(c => c.name))
}

async function getPkgName(aapt2Path: string, apkPath: string) {
  return await aapt2(aapt2Path, 'dump', 'packagename', apkPath)
}

export async function updatePresignedBlobs(
  aapt2Path: string,
  source: string,
  presignedPkgs: Set<string>,
  entries: Iterable<BlobEntry>,
  entryCallback?: (entry: BlobEntry) => void,
  filters: Filters | null = null,
) {
  let updatedEntries = []
  for (let entry of entries) {
    if (path.extname(entry.path) != '.apk') {
      continue
    }

    if (entryCallback != undefined) {
      entryCallback(entry)
    }

    if (
      (filters != null && filterValue(filters, entry.srcPath)) ||
      presignedPkgs.has(await getPkgName(aapt2Path, `${source}/${entry.srcPath}`))
    ) {
      entry.isPresigned = true
      updatedEntries.push(entry)
    }
  }

  return updatedEntries
}

export async function enumeratePresignedBlobs(aapt2Path: string, source: string, presignedPkgs: Set<string>) {
  let presignedPaths = []
  for await (let file of listFilesRecursive(source)) {
    if (path.extname(file) != '.apk') {
      continue
    }

    let pkgName = await getPkgName(aapt2Path, file)
    if (presignedPkgs.has(pkgName)) {
      presignedPaths.push(file)
    }
  }

  return presignedPaths
}
