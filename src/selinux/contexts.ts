import path from 'path'
import { Filters, filterValue } from '../config/filters'

import { exists, listFilesRecursive, readFile } from '../util/fs'
import { parseLines } from '../util/parse'
import { EXT_PARTITIONS } from '../util/partitions'

const CONTEXT_TYPES = ['file', 'genfs', 'service', 'vndservice', 'hwservice', 'property', 'seapp']

const CONTEXT_FILENAMES = new Set([
  // Plain TYPE_contexts for AOSP sources
  ...CONTEXT_TYPES.map(type => `${type}_contexts`),
  // PART_TYPE_contexts for built systems
  ...CONTEXT_TYPES.flatMap(type => Array.from(EXT_PARTITIONS.values()).map(part => `${part}_${type}_contexts`)),
  // Special case for vendor
  'vndservice_contexts',
])

export type SelinuxContexts = Map<string, string>
export type SelinuxPartContexts = { [part: string]: SelinuxContexts }
export type SelinuxPartResolutions = Map<string, SelinuxDiffResolutions>

export interface SelinuxDiffResolutions {
  sepolicyDirs: Array<string>
  missingContexts: Array<string>
}

export async function parseContextsRecursive(dir: string, relativeBase: string) {
  // context -> source file path
  let contexts: SelinuxContexts = new Map<string, string>()
  for await (let file of listFilesRecursive(dir)) {
    if (!CONTEXT_FILENAMES.has(path.basename(file))) {
      continue
    }

    let rawContexts = await readFile(file)
    for (let line of parseLines(rawContexts)) {
      // Normalize whitespace to canonical single-space format
      let context = line.replaceAll(/\s+/g, ' ')
      contexts.set(context, path.relative(relativeBase, file))
    }
  }

  return contexts
}

export async function parsePartContexts(root: string) {
  let partContexts: SelinuxPartContexts = {}
  for (let partition of EXT_PARTITIONS) {
    let sepolicyDir = `${root}/${partition}/etc/selinux`
    if (!(await exists(sepolicyDir))) {
      continue
    }

    partContexts[partition] = await parseContextsRecursive(sepolicyDir, root)
  }

  return partContexts
}

function diffContexts(ctxRef: SelinuxContexts, ctxNew: SelinuxContexts) {
  return new Map(Array.from(ctxNew.entries()).filter(([ctx]) => !ctxRef.has(ctx)))
}

export function diffPartContexts(pctxRef: SelinuxPartContexts, pctxNew: SelinuxPartContexts) {
  let partDiffs: SelinuxPartContexts = {}
  for (let partition of EXT_PARTITIONS) {
    let ctxRef = pctxRef[partition]
    if (ctxRef == undefined) continue
    let ctxNew = pctxNew[partition]
    if (ctxNew == undefined) continue

    partDiffs[partition] = diffContexts(ctxRef, ctxNew)
  }

  return partDiffs
}

export function resolvePartContextDiffs(
  pctxDiffs: SelinuxPartContexts,
  sourceContexts: SelinuxContexts,
  filters: Filters | null = null,
) {
  let partSepolicyDirs: SelinuxPartResolutions = new Map<string, SelinuxDiffResolutions>()
  for (let [partition, diffs] of Object.entries(pctxDiffs)) {
    let buildDirs = new Set<string>()
    let missingContexts = []

    for (let context of diffs.keys()) {
      if (sourceContexts.has(context)) {
        let sourceFile = sourceContexts.get(context)!
        let sourceDir = sourceFile.split('/').slice(0, -1).join('/')

        if (filters != null && filterValue(filters, sourceDir)) {
          buildDirs.add(sourceDir)
        }
      } else {
        missingContexts.push(context)
      }
    }

    partSepolicyDirs.set(partition, {
      sepolicyDirs: Array.from(buildDirs),
      missingContexts,
    } as SelinuxDiffResolutions)
  }

  return partSepolicyDirs
}
