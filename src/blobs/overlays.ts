import { promises as fs } from 'fs'
import path from 'path'
import xml2js from 'xml2js'

import { serializeBlueprint } from '../build/soong'
import { aapt2 } from '../util/process'
import { exists, listFilesRecursive } from '../util/fs'
import { XML_HEADER } from '../util/headers'
import { parseLines } from '../util/parse'
import { EXT_PARTITIONS } from '../util/partitions'
import { Filters, filterValue } from '../config/filters'

const TARGET_PACKAGE_PATTERN = makeManifestRegex('targetPackage')
const TARGET_NAME_PATTERN = makeManifestRegex('targetName')

// This is terrible, but aapt2 doesn't escape strings properly and some of these
// strings contain double quotes, which break our parser.
const EXCLUDE_LOCALES = new Set(['ar', 'iw'])

// Diff exclusions
const DIFF_EXCLUDE_TYPES = new Set(['raw', 'xml', 'color'])
const DIFF_MAP_PACKAGES = new Map([
  ['com.google.android.wifi.resources', 'com.android.wifi.resources'],
  ['com.google.android.connectivity.resources', 'com.android.connectivity.resources'],
  ['com.google.android.networkstack', 'com.android.networkstack'],
  ['com.google.android.networkstack.tethering', 'com.android.networkstack.tethering'],
  ['com.google.android.permissioncontroller', 'com.android.permissioncontroller'],
])

const XML_BUILDER = new xml2js.Builder()

export type ResValue = number | boolean | string | Array<ResValue>

export interface ResKey {
  targetPkg: string
  targetName: string | null
  type: string
  key: string
  flags: string | null
}

export type ResValues = Map<string, ResValue>

export type PartResValues = { [part: string]: ResValues }

function makeManifestRegex(attr: string) {
  return new RegExp(
    /^\s+A: http:\/\/schemas.android.com\/apk\/res\/android:/.source +
      attr +
      /\(0x[a-z0-9]+\)="(.+)" \(Raw: ".*$/.source,
    'm', // multiline flag
  )
}

function encodeResKey(key: ResKey) {
  // pkg/name:type/key|flags
  return (
    `${key.targetPkg}${key.targetName?.length ? `/${key.targetName}` : ''}:` +
    `${key.type}/${key.key}${key.flags?.length ? `|${key.flags}` : ''}`
  )
}

export function decodeResKey(encoded: string) {
  let [tpn, tkf] = encoded.split(':')
  let [targetPkg, targetName] = tpn.split('/')
  let [type, kf] = tkf.split('/')
  let [key, flags] = kf.split('|')

  return {
    targetPkg,
    targetName: targetName !== undefined ? targetName : null,
    type,
    key,
    flags: flags !== undefined ? flags : null,
  } as ResKey
}

function toResKey(
  targetPkg: string,
  targetName: string | null,
  type: string | null,
  key: string | null,
  flags: string | null,
) {
  return encodeResKey({
    targetPkg,
    targetName,
    type: type!,
    key: key!,
    flags: flags!,
  })
}

function finishArray(
  values: Map<string, ResValue>,
  targetPkg: string,
  targetName: string | null,
  type: string | null,
  key: string | null,
  flags: string | null,
  arrayLines: Array<string> | null,
) {
  // Exclude problematic locales and types (ID references)
  let rawValue = arrayLines!.join('\n')
  if (EXCLUDE_LOCALES.has(flags!) || rawValue.startsWith('[@0x')) {
    return
  }

  let array = parseAaptJson(rawValue) as Array<ResValue>

  // Change to typed array?
  if (typeof array[0] === 'string') {
    type = 'string-array'
  } else if (typeof array[0] === 'number') {
    // Float arrays are just <array>, so check for integers
    if (array.find(v => !Number.isInteger(v)) === undefined) {
      type = 'integer-array'
    }
  }

  values.set(toResKey(targetPkg, targetName, type, key, flags), array)
}

function parseAaptJson(value: string) {
  // Fix backslash escapes
  value = value.replaceAll(/\\/g, '\\\\')

  // Parse hex arrays
  value = value.replaceAll(/\b0x[0-9a-f]+\b/g, value => `${parseInt(value.slice(2), 16)}`)

  return JSON.parse(value)
}

function parseRsrcLines(rsrc: string, targetPkg: string, targetName: string | null) {
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
      if (curArray !== null) {
        finishArray(values, targetPkg, targetName, curType, curKey, curFlags, curArray)
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
      if (curArray !== null) {
        finishArray(values, targetPkg, targetName, curType, curKey, curFlags, curArray)
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
      if (EXCLUDE_LOCALES.has(curFlags!) || curType === 'style') {
        continue
      }

      let value: ResValue
      let rawValue = valueLine![2]
      if (rawValue.startsWith('(file) ')) {
        // Return @[path]
        value = `@${rawValue.split(' ')[1]}`
      } else if (curType === 'dimen') {
        // Keep dimensions as strings to preserve unit
        value = rawValue
      } else if (curType === 'color') {
        // Raw hex code
        value = rawValue
      } else if (rawValue.startsWith('0x')) {
        // Hex integer
        value = parseInt(rawValue.slice(2), 16)
      } else if (rawValue.startsWith('(styled string) ')) {
        // Skip styled strings for now
        continue
      } else if (curType === 'string') {
        // Don't rely on quotes for simple strings
        value = rawValue.slice(1, -1)
      } else {
        value = parseAaptJson(rawValue)
      }

      values.set(toResKey(targetPkg, targetName, curType, curKey, curFlags), value)
    }

    // New type section
    let typeLine = line.match(/^type .+$/)
    if (typeLine) {
      // Just skip this line. Next resource/end will finish the last array, and this
      // shouldn't be added to the last array.
      continue
    }

    // Continuation of array?
    if (curArray !== null) {
      curArray.push(line)
    }
  }

  // Finish remaining array?
  if (curArray !== null) {
    finishArray(values, targetPkg, targetName, curType, curKey, curFlags, curArray)
  }

  return values
}

async function parseOverlayApksRecursive(
  aapt2Path: string,
  overlaysDir: string,
  pathCallback?: (path: string) => void,
  filters: Filters | null = null,
) {
  let values: ResValues = new Map<string, ResValue>()

  for await (let apkPath of listFilesRecursive(overlaysDir)) {
    if (path.extname(apkPath) !== '.apk') {
      continue
    }

    if (pathCallback !== undefined) {
      pathCallback(apkPath)
    }

    if (filters !== null && !filterValue(filters, path.relative(overlaysDir, apkPath))) {
      continue
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

    // Get the target overlayable config name, if it exists
    match = manifest.match(TARGET_NAME_PATTERN)
    let targetName = match === undefined ? null : match[1]

    // Overlay is eligible, now read the resource table
    let rsrc = await aapt2(aapt2Path, 'dump', 'resources', apkPath)
    let apkValues = parseRsrcLines(rsrc, targetPkg, targetName)

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
  filters: Filters | null = null,
) {
  let partValues: PartResValues = {}

  for (let partition of EXT_PARTITIONS) {
    let src = `${root}/${partition}/overlay`
    if (!(await exists(src))) {
      continue
    }

    partValues[partition] = await parseOverlayApksRecursive(aapt2Path, src, pathCallback, filters)
  }

  return partValues
}

function shouldDeleteKey(filters: Filters, rawKey: string, { targetPkg, type, key, flags }: ResKey) {
  // Simple exclusion sets
  if (DIFF_EXCLUDE_TYPES.has(type)) {
    return true
  }

  // Exclude localized values for now
  if (flags !== null) {
    return true
  }

  // User-provided filters
  if (!filterValue(filters, rawKey)) {
    return true
  }

  return false
}

function filterValues(keyFilters: Filters, valueFilters: Filters, values: ResValues) {
  for (let [rawKey, value] of values.entries()) {
    let key = decodeResKey(rawKey)

    if (shouldDeleteKey(keyFilters, rawKey, key) || (typeof value === 'string' && !filterValue(valueFilters, value))) {
      // Key/value filter
      values.delete(rawKey)
    } else if (DIFF_MAP_PACKAGES.has(key.targetPkg)) {
      // Package map
      let targetPkg = DIFF_MAP_PACKAGES.get(key.targetPkg)!
      let newKey = encodeResKey({
        ...key,
        targetPkg,
      })

      values.delete(rawKey)
      values.set(newKey, value)
    }
  }
}

export function diffPartOverlays(
  pvRef: PartResValues,
  pvNew: PartResValues,
  keyFilters: Filters,
  valueFilters: Filters,
) {
  let missingPartValues: PartResValues = {}
  for (let [partition, valuesNew] of Object.entries(pvNew)) {
    let valuesRef = pvRef[partition]
    let missingValues: ResValues = new Map<string, ResValue>()

    // Filter values first
    filterValues(keyFilters, valueFilters, valuesRef)
    filterValues(keyFilters, valueFilters, valuesNew)

    // Find missing overlays
    for (let [key, refValue] of valuesRef.entries()) {
      if (!valuesNew.has(key)) {
        missingValues.set(key, refValue)
      }
    }

    if (missingValues.size > 0) {
      missingPartValues[partition] = missingValues
    }
  }

  return missingPartValues
}

function serializeXmlObject(obj: any) {
  return XML_HEADER + XML_BUILDER.buildObject(obj).replace(/^<\?xml.*>$/m, '')
}

export async function serializePartOverlays(partValues: PartResValues, overlaysDir: string) {
  let buildPkgs = []
  for (let [partition, values] of Object.entries(partValues)) {
    // Group by package and target name
    let pkgValues = new Map<string, Map<ResKey, ResValue>>()
    for (let [key, value] of values.entries()) {
      let keyInfo = decodeResKey(key)
      let pkgNameKey = `${keyInfo.targetPkg}${keyInfo.targetName?.length ? `/${keyInfo.targetName}` : ''}`

      if (pkgValues.has(pkgNameKey)) {
        pkgValues.get(pkgNameKey)!.set(keyInfo, value)
      } else {
        pkgValues.set(pkgNameKey, new Map<ResKey, ResValue>([[keyInfo, value]]))
      }
    }

    // Now serialize each (package,target)-partition combination
    for (let [pkgNameKey, values] of pkgValues.entries()) {
      let [targetPkg, targetName] = pkgNameKey.split('/')
      let genTarget = pkgNameKey.replace('/', '__')
      let rroName = `${genTarget}.auto_generated_rro_${partition}_adevtool__`

      let bp = serializeBlueprint({
        modules: [
          {
            _type: 'runtime_resource_overlay',
            name: rroName,

            ...(partition === 'system_ext' && { system_ext_specific: true }),
            ...(partition === 'product' && { product_specific: true }),
            ...(partition === 'vendor' && { soc_specific: true }),
            ...(partition === 'odm' && { device_specific: true }),
          },
        ],
      })

      let manifest = serializeXmlObject({
        manifest: {
          $: {
            'xmlns:android': 'http://schemas.android.com/apk/res/android',
            package: rroName,
          },
          overlay: [
            {
              $: {
                'android:targetPackage': targetPkg,
                'android:targetName': targetName,
                'android:isStatic': 'true',
                'android:priority': '1',
              },
            },
          ],
          application: [{ $: { 'android:hasCode': 'false' } }],
        },
      })

      let valuesObj = { resources: {} as { [type: string]: Array<any> } }
      for (let [{ type, key }, value] of values.entries()) {
        let entry = {
          $: {
            name: key,
          },
        } as { [key: string]: any }

        if (type.includes('array')) {
          entry.item = (value as Array<any>).map(v => JSON.stringify(v))
        } else {
          entry._ = value
        }

        if (valuesObj.resources.hasOwnProperty(type)) {
          valuesObj.resources[type].push(entry)
        } else {
          valuesObj.resources[type] = [entry]
        }
      }

      let valuesXml = serializeXmlObject(valuesObj)

      // Write files
      let overlayDir = `${overlaysDir}/${partition}_${genTarget}`
      let resDir = `${overlayDir}/res/values`
      await fs.mkdir(resDir, { recursive: true })
      await fs.writeFile(`${overlayDir}/Android.bp`, bp)
      await fs.writeFile(`${overlayDir}/AndroidManifest.xml`, manifest)
      await fs.writeFile(`${resDir}/values.xml`, valuesXml)

      buildPkgs.push(rroName)
    }
  }

  return buildPkgs
}
