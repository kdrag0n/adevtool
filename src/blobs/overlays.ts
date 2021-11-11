import * as path from 'path'
import { aapt2 } from '../util/aapt2'

import { exists, listFilesRecursive } from '../util/fs'
import { parseLines } from '../util/parse'
import { EXT_PARTITIONS } from '../util/partitions'

const TARGET_PACKAGE_PATTERN = /^\s+A: http:\/\/schemas.android.com\/apk\/res\/android:targetPackage\(0x[a-z0-9]+\)="(.+)" \(Raw: ".*$/m

// This is terrible, but aapt2 doesn't escape strings properly and some of these
// strings contain double quotes, which break our parser.
const EXCLUDE_LOCALES = new Set(['ar', 'iw'])

export type ResValue = number | boolean | string | Array<ResValue>

export interface ResKey {
  type: string
  key: string
  flags: string | null
}

export type ResValues = Map<string, ResValue>

export type PartResValues = { [part: string]: ResValues }

function encodeResKey(key: ResKey) {
  return `${key.type}/${key.key}${key.flags != null ? `:${key.flags}` : ''}`
}

export function decodeResKey(encoded: string) {
  let [type, kf] = encoded.split('/')
  let [key, flags] = kf.split(':')

  return {
    type: type,
    key: key,
    flags: flags != undefined ? flags : null,
  } as ResKey
}

function toResKey(type: string | null, key: string | null, flags: string | null) {
  return encodeResKey({
    type: type!,
    key: key!,
    flags: flags!,
  })
}

function finishArray(
  values: Map<string, ResValue>,
  type: string | null,
  key: string | null,
  flags: string | null,
  arrayLines: Array<string> | null,
) {
  if (EXCLUDE_LOCALES.has(flags!)) {
    return
  }

  let array = parseAaptJson(arrayLines!.join('\n')) as Array<ResValue>

  // Change to typed array?
  if (array[0] instanceof String) {
    type = 'string-array'
  } else if (typeof array[0] == 'number') {
    // Float arrays are just <array>, so check for integers
    if (array.find(v => !Number.isInteger(v)) == undefined) {
      type = 'integer-array'
    }
  }

  values.set(toResKey(type, key, flags), array)
}

function parseAaptJson(value: string) {
  // Fix backslash escapes
  value = value.replaceAll(/\\/g, '\\\\')

  // Parse hex arrays
  value = value.replaceAll(/\b0x[0-9a-f]+\b/g, value => `${parseInt(value.slice(2), 16)}`)

  return JSON.parse(value)
}

function parseRsrcLines(rsrc: string) {
  // Finished values with encoded res keys
  let values: ResValues = new Map<string, ResValue>()

  // Current resource state machine
  let curType: string | null = null
  let curKey: string | null = null
  let curFlags: string | null = null
  let curArray: Array<string> | null = null

  // Parse line-by-line
  for (let line of parseLines(rsrc)) {
    // Start resource
    let resStart = line.match(/^resource 0x[a-z0-9]+ (.+)$/)
    if (resStart) {
      // Finish last array?
      if (curArray != null) {
        console.log({
          type: curType,
          key: curKey,
          flags: curFlags,
          curArray: curArray,
          arrayJson: curArray!.join('\n'),
        })
        finishArray(values, curType, curKey, curFlags, curArray)
      }

      let keyParts = resStart[1]!.split('/')
      curType = keyParts[0]
      curKey = keyParts[1]
      curFlags = null
      curArray = null
      continue
    }

    // New resource is array
    let arrayLine = line.match(/^\(([a-zA-Z0-9\-_+]*)\) \(array\) size=\d+$/)
    if (arrayLine) {
      // Finish last array?
      if (curArray != null) {
        console.log({
          type: curType,
          key: curKey,
          flags: curFlags,
          curArray: curArray,
          arrayJson: curArray!.join('\n').replaceAll(/\\/g, '\\\\'),
        })
        finishArray(values, curType, curKey, curFlags, curArray)
      }

      // Start new array
      curFlags = arrayLine[1]
      curArray = []
      continue
    }

    // New value
    let valueLine = line.match(/^\(([a-zA-Z0-9\-_+]*)\) (.+)$/)
    if (valueLine) {
      curFlags = valueLine![1]

      // Exclude broken locales and styles for now
      if (EXCLUDE_LOCALES.has(curFlags!) || curType == 'style') {
        continue
      }

      let value: ResValue
      let rawValue = valueLine![2]
      console.log({
        type: curType,
        key: curKey,
        flags: curFlags,
        rawValue: rawValue,
      })
      if (curType == 'dimen') {
        // Keep dimensions as strings to preserve unit
        value = rawValue
      } else if (curType == 'color') {
        // Hex color code
        value = parseInt(rawValue.slice(1), 16)
      } else if (rawValue.startsWith('(file) ')) {
        // Just return the file path for now
        value = rawValue.split(' ')[1]
      } else if (rawValue.startsWith('0x')) {
        // Hex integer
        value = parseInt(rawValue.slice(2), 16)
      } else if (rawValue.startsWith('(styled string) ')) {
        // Skip styled strings for now
        continue
      } else if (curType == 'string') {
        // Don't rely on quotes for simple strings
        value = rawValue.slice(1, -1)
      } else {
        value = parseAaptJson(rawValue)
      }

      values.set(toResKey(curType, curKey, curFlags), value)
    }

    // New type section
    let typeLine = line.match(/^type .+$/)
    if (typeLine) {
      // Just skip this line. Next resource/end will finish the last array, and this
      // shouldn't be added to the last array.
      continue
    }

    // Continuation of array?
    if (curArray != null) {
      curArray.push(line)
    }
  }

  // Finish remaining array?
  if (curArray != null) {
    finishArray(values, curType, curKey, curFlags, curArray)
  }

  return values
}

async function parseOverlayApksRecursive(
  aapt2Path: string,
  overlaysDir: string,
  pathCallback?: (path: string) => void,
) {
  let values: ResValues = new Map<string, ResValue>()

  for await (let apkPath of listFilesRecursive(overlaysDir)) {
    if (path.extname(apkPath) != '.apk') {
      continue
    }

    if (pathCallback != undefined) {
      pathCallback(apkPath)
    }

    // Check the manifest for eligibility first
    let manifest = await aapt2(aapt2Path, 'dump', 'xmltree', '--file', 'AndroidManifest.xml', apkPath)
    // Overlays that have categories are user-controlled, so they're not relevant here
    if (manifest.includes('A: http://schemas.android.com/apk/res/android:category(')) {
      continue
    }
    // Prop-guarded overlays are almost always in AOSP already, so don't bother checking them
    if (manifest.includes('A: http://schemas.android.com/apk/res/android:requiredSystemPropertyName(')) {
      continue
    }

    // Get the target package
    let match = manifest.match(TARGET_PACKAGE_PATTERN)
    if (!match) throw new Error(`Overlay ${apkPath} is missing target package`)
    let targetPkg = match[1]

    // Overlay is eligible, now read the resource table
    let rsrc = await aapt2(aapt2Path, 'dump', 'resources', apkPath)
    let apkValues = parseRsrcLines(rsrc)

    // Merge overlayed values
    for (let [key, value] of apkValues) {
      values.set(key, value)
    }
  }

  return values
}

export async function parsePartOverlayApks(
  aapt2Path: string,
  root: string,
  pathCallback?: (path: string) => void,
) {
  let partValues: PartResValues = {}

  for (let partition of EXT_PARTITIONS) {
    let src = `${root}/${partition}/overlay`
    if (!(await exists(src))) {
      continue
    }

    partValues[partition] = await parseOverlayApksRecursive(aapt2Path, src, pathCallback)
  }

  return partValues
}
