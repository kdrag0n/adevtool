import { promises as fs } from 'fs'
import * as path from 'path'
import * as xml2js from 'xml2js'

import { serializeBlueprint } from '../build/soong'
import { aapt2 } from '../util/aapt2'
import { exists, listFilesRecursive } from '../util/fs'
import { XML_HEADER } from '../util/headers'
import { parseLines } from '../util/parse'
import { EXT_PARTITIONS } from '../util/partitions'

const TARGET_PACKAGE_PATTERN = /^\s+A: http:\/\/schemas.android.com\/apk\/res\/android:targetPackage\(0x[a-z0-9]+\)="(.+)" \(Raw: ".*$/m

// This is terrible, but aapt2 doesn't escape strings properly and some of these
// strings contain double quotes, which break our parser.
const EXCLUDE_LOCALES = new Set(['ar', 'iw'])

// Diff exclusions
const DIFF_EXCLUDE_TYPES = new Set(['raw', 'xml', 'color'])
const DIFF_EXCLUDE_PACKAGES = new Set([
  'com.google.android.documentsui',
  'com.google.android.pixel.setupwizard',
  'com.android.managedprovisioning',
  'com.android.providers.settings',
  'com.google.android.cellbroadcastreceiver',
  'com.google.android.cellbroadcastservice',
  'com.android.simappdialog',
])
const DIFF_EXCLUDE_PREFIXES = [
  'android:drawable/ic_doc_',
  'android:string/config_system',
  'android:string-array/config_companionDevice',
  'android:string/config_default',
  'android:string/biometric_',
  'android:string/widget_',
  'android:bool/config_assist',
  'com.android.settings:bool/config_',
  'com.android.settings:string/display_white_balance_',
  'com.android.settings:string/fingerprint_',
  'com.android.settings:string/security_settings_',
  'com.android.settings:string/lock_settings_',
  'com.android.systemui:string/branded_',
  'com.android.settings:string/security_settings_',
  'com.android.settings:string/unlock_disable_frp_',
  'com.android.wifi.resources:integer/config_wifi_framework_wifi_score_',
]
const DIFF_EXCLUDE_KEYS = new Set([
  'android:bool/config_enableGeolocationTimeZoneDetection',
  'android:bool/config_enablePrimaryLocationTimeZoneProvider',
  'android:bool/config_enableSecondaryLocationTimeZoneProvider',
  'android:string-array/config_accessibility_allowed_install_source',
  'android:string-array/config_allowedSecureInstantAppSettings',
  'android:string-array/config_disabledUntilUsedPreinstalledImes',
  'com.android.providers.contacts:string/metadata_sync_pacakge',
  'android:string/harmful_app_warning_title',
  'com.google.android.permissioncontroller:string/help_app_permissions',
  'com.google.android.networkstack:bool/config_dhcp_client_hostname',
  'android:string/config_defaultDndAccessPackages',
  'android:string/config_primaryLocationTimeZoneProviderPackageName',
  'android:string/config_secondaryLocationTimeZoneProviderPackageName',
  'android:string/config_servicesExtensionPackage',
  'android:bool/config_swipe_up_gesture_setting_available',
  'android:bool/config_showGesturalNavigationHints',
  'android:bool/config_volumeHushGestureEnabled',
  'android:integer/config_defaultNightMode',
  'android:string-array/config_batteryPackageTypeService',
  'android:array/config_notificationMsgPkgsAllowedAsConvos',
  'android:bool/config_bugReportHandlerEnabled',
  'android:bool/config_defaultRingtonePickerEnabled',
  'android:bool/config_profcollectReportUploaderEnabled',
  'android:bool/config_sendPackageName',
  'android:bool/config_smart_battery_available',
  'android:bool/config_volumeShowRemoteSessions',
  'android:dimen/config_highResTaskSnapshotScale',
  'android:integer/config_storageManagerDaystoRetainDefault',
  'android:string/android_start_title',
  'android:string/android_upgrading_title',
  'android:string/config_batterySaverScheduleProvider',
  'android:string/config_bodyFontFamily',
  'android:string/config_bodyFontFamilyMedium',
  'android:string/config_emergency_dialer_package',
  'android:string/config_feedbackIntentExtraKey',
  'android:string/config_feedbackIntentNameKey',
  'android:string/config_headlineFontFamily',
  'android:string/config_headlineFontFamilyMedium',
  'android:string/config_headlineFontFeatureSettings',
  'android:string/config_helpIntentExtraKey',
  'android:string/config_helpIntentNameKey',
  'android:string/config_helpPackageNameKey',
  'android:string/config_helpPackageNameValue',
  'android:string/config_incidentReportApproverPackage',
  'android:string/config_powerSaveModeChangedListenerPackage',
  'android:string/config_recentsComponentName',
  'android:string/config_retailDemoPackage',
  'android:string/config_retailDemoPackageSignature',
  'android:string/config_secondaryHomePackage',
  'com.android.settings:string-array/config_settings_slices_accessibility_components',
  'com.android.settings:string/setup_fingerprint_enroll_finish_message',
  'com.android.settings:string/suggested_fingerprint_lock_settings_summary',
  'com.android.systemui:string-array/config_controlsPreferredPackages',
  'com.android.systemui:bool/config_hspa_data_distinguishable',
  'com.android.systemui:bool/config_touch_context_enabled',
  'com.android.systemui:bool/config_wlc_support_enabled',
  'com.android.systemui:drawable/ic_qs_branded_vpn',
  'com.android.systemui:drawable/stat_sys_branded_vpn',
  'com.android.systemui:string/config_dockComponent',
  'com.android.systemui:string/config_screenshotEditor',
  'com.android.phone:string-array/config_countries_to_enable_shortcut_view',
  'com.android.phone:string/dialer_default_class',
  'com.android.phone:string/platform_number_verification_package',
  'com.android.server.telecom:bool/config_hspa_data_distinguishable',
  'com.android.server.telecom:string/call_diagnostic_service_package_name',
  'com.android.server.telecom:string/dialer_default_class',
  'com.android.traceur:bool/config_hspa_data_distinguishable',
  'android:string-array/config_defaultFirstUserRestrictions',
  'android:string-array/config_keep_warming_services',
  'android:bool/config_enableFusedLocationOverlay',
  'android:bool/config_enableGeocoderOverlay',
  'android:bool/config_enableGeofenceOverlay',
  'android:bool/config_enableNetworkLocationOverlay',
  'android:string/config_deviceProvisioningPackage',
  'android:string/default_wallpaper_component',
  'android:bool/config_pinnerHomeApp',
  'com.android.settings:string-array/slice_allowlist_package_names',
])

const DIFF_MAP_PACKAGES = new Map([
  ['com.google.android.wifi.resources', 'com.android.wifi.resources'],
  ['com.google.android.connectivity.resources', 'com.android.connectivity.resources'],
  ['com.google.android.networkstack.tethering', 'com.android.networkstack.tethering'],
])

export type ResValue = number | boolean | string | Array<ResValue>

export interface ResKey {
  targetPkg: string
  type: string
  key: string
  flags: string | null
}

export type ResValues = Map<string, ResValue>

export type PartResValues = { [part: string]: ResValues }

function encodeResKey(key: ResKey) {
  return `${key.targetPkg}:${key.type}/${key.key}${key.flags?.length ? `|${key.flags}` : ''}`
}

export function decodeResKey(encoded: string) {
  let [targetPkg, tkf] = encoded.split(':')
  let [type, kf] = tkf.split('/')
  let [key, flags] = kf.split('|')

  return {
    targetPkg: targetPkg,
    type: type,
    key: key,
    flags: flags != undefined ? flags : null,
  } as ResKey
}

function toResKey(
  targetPkg: string,
  type: string | null,
  key: string | null,
  flags: string | null,
) {
  return encodeResKey({
    targetPkg: targetPkg,
    type: type!,
    key: key!,
    flags: flags!,
  })
}

function finishArray(
  values: Map<string, ResValue>,
  targetPkg: string,
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
  if (typeof array[0] == 'string') {
    type = 'string-array'
  } else if (typeof array[0] == 'number') {
    // Float arrays are just <array>, so check for integers
    if (array.find(v => !Number.isInteger(v)) == undefined) {
      type = 'integer-array'
    }
  }

  values.set(toResKey(targetPkg, type, key, flags), array)
}

function parseAaptJson(value: string) {
  // Fix backslash escapes
  value = value.replaceAll(/\\/g, '\\\\')

  // Parse hex arrays
  value = value.replaceAll(/\b0x[0-9a-f]+\b/g, value => `${parseInt(value.slice(2), 16)}`)

  return JSON.parse(value)
}

function parseRsrcLines(rsrc: string, targetPkg: string) {
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
        finishArray(values, targetPkg, curType, curKey, curFlags, curArray)
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
        finishArray(values, targetPkg, curType, curKey, curFlags, curArray)
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

      values.set(toResKey(targetPkg, curType, curKey, curFlags), value)
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
    finishArray(values, targetPkg, curType, curKey, curFlags, curArray)
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
    let apkValues = parseRsrcLines(rsrc, targetPkg)

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

function shouldDeleteKey(rawKey: string, { targetPkg, type, key, flags }: ResKey) {
  // Simple exclusion sets
  if (DIFF_EXCLUDE_TYPES.has(type) ||
        DIFF_EXCLUDE_PACKAGES.has(targetPkg) ||
        DIFF_EXCLUDE_KEYS.has(rawKey)) {
    return true
  }

  // Exclude localized values for now
  if (flags != null) {
    return true
  }

  // Exclusion prefixes (expensive, so these are checked last)
  if (DIFF_EXCLUDE_PREFIXES.find(p => rawKey.startsWith(p)) != undefined) {
    return true
  }

  return false
}

function filterValues(values: ResValues) {
  for (let [rawKey, value] of values.entries()) {
    let key = decodeResKey(rawKey)

    if (shouldDeleteKey(rawKey, key)) {
      values.delete(rawKey)
    } else if (DIFF_MAP_PACKAGES.has(key.targetPkg)) {
      let targetPkg = DIFF_MAP_PACKAGES.get(key.targetPkg)!
      let newKey = encodeResKey({
        targetPkg: targetPkg,
        type: key.type,
        key: key.key,
        flags: key.flags,
      })

      values.delete(rawKey)
      values.set(newKey, value)
    }
  }
}

export function diffPartOverlays(pvRef: PartResValues, pvNew: PartResValues) {
  let missingPartValues: PartResValues = {}
  for (let [partition, valuesNew] of Object.entries(pvNew)) {
    let valuesRef = pvRef[partition]
    let missingValues: ResValues = new Map<string, ResValue>()

    // Filter values first
    filterValues(valuesRef)
    filterValues(valuesNew)

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

export async function serializePartOverlays(partValues: PartResValues, overlaysDir: string) {
  let xmlBuilder = new xml2js.Builder({
    xmldec: {},
  })

  let buildPkgs = []
  for (let [partition, values] of Object.entries(partValues)) {
    // Group by package
    let pkgValues = new Map<string, Map<ResKey, ResValue>>()
    for (let [key, value] of values.entries()) {
      let keyInfo = decodeResKey(key)
      if (pkgValues.has(keyInfo.targetPkg)) {
        pkgValues.get(keyInfo.targetPkg)!.set(keyInfo, value)
      } else {
        pkgValues.set(keyInfo.targetPkg, new Map<ResKey, ResValue>([[keyInfo, value]]))
      }
    }

    // Now serialize each package-partition combination
    for (let [targetPkg, values] of pkgValues.entries()) {
      let rroName = `${targetPkg}.auto_generated_rro_${partition}_adevtool__`

      let bp = serializeBlueprint({
        noNamespace: true,
        modules: [{
          _type: 'runtime_resource_overlay',
          name: rroName,

          ...(partition == 'system_ext' && { system_ext_specific: true }),
          ...(partition == 'product' && { product_specific: true }),
          ...(partition == 'vendor' && { soc_specific: true }),
          ...(partition == 'odm' && { device_specific: true }),
        }],
      })

      let manifest = `${XML_HEADER}
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${rroName}">

    <overlay android:targetPackage="${targetPkg}" android:isStatic="true" android:priority="1" />
    <application android:hasCode="false" />

</manifest>
`

      let valuesObj = { resources: { } as { [type: string]: Array<any> } }
      for (let [{type, key}, value] of values.entries()) {
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

      let valuesXml = XML_HEADER + xmlBuilder.buildObject(valuesObj).replace(/^<\?xml.*>$/m, '')

      // Write files
      let overlayDir = `${overlaysDir}/${partition}_${targetPkg}`
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
