import * as path from 'path'
import * as chalk from 'chalk'
import * as ora from 'ora'

import { EXT_PARTITIONS } from '../partitions'
import { BlobEntry } from './entry'
import { exists, listFilesRecursive } from '../util/fs'

// Sub-partition directories to ignore
const IGNORE_DIRS = new Set([
  'fonts',
  'media',
])

// File extensions to ignore
const IGNORE_EXTS = new Set([
  'art',
  'odex',
  'vdex',
  'prof',
])

// Prefixes for files to ignore
const IGNORE_PREFIXES = paths([
  // GMS
  `system/etc/permissions/privapp-permissions-google.xml
product/usr/srec
product/app/arcore/arcore.apk
product/app/CalculatorGooglePrebuilt/CalculatorGooglePrebuilt.apk
product/app/CalendarGooglePrebuilt/CalendarGooglePrebuilt.apk
product/app/Chrome-Stub/Chrome-Stub.apk
product/app/Chrome/Chrome.apk.gz
product/app/Drive/Drive.apk
product/app/GoogleContacts/GoogleContacts.apk
product/app/GoogleContactsSyncAdapter/GoogleContactsSyncAdapter.apk
product/app/GoogleTTS/GoogleTTS.apk
product/app/LatinIMEGooglePrebuilt/LatinIMEGooglePrebuilt.apk
product/app/LocationHistoryPrebuilt/LocationHistoryPrebuilt.apk
product/app/Maps/Maps.apk
product/app/ModuleMetadataGoogle/ModuleMetadataGoogle.apk
product/app/Photos/Photos.apk
product/app/PlayAutoInstallConfig/PlayAutoInstallConfig.apk
product/app/PrebuiltDeskClockGoogle/PrebuiltDeskClockGoogle.apk
product/app/PrebuiltGmail/PrebuiltGmail.apk
product/app/talkback/talkback.apk
product/app/TrichromeLibrary-Stub/TrichromeLibrary-Stub.apk
product/app/TrichromeLibrary/TrichromeLibrary.apk.gz
product/app/Tycho/Tycho.apk
product/app/Videos/Videos.apk
product/app/WallpapersBReel
product/app/WebViewGoogle-Stub/WebViewGoogle-Stub.apk
product/app/WebViewGoogle/WebViewGoogle.apk.gz
product/app/YouTube/YouTube.apk
product/app/YouTubeMusicPrebuilt/YouTubeMusicPrebuilt.apk
product/etc/permissions/split-permissions-google.xml
product/etc/preferred-apps/google.xml
product/etc/sysconfig/google-staged-installer-whitelist.xml
product/etc/sysconfig/preinstalled-packages-
product/priv-app/AndroidAutoStubPrebuilt/AndroidAutoStubPrebuilt.apk
product/priv-app/ConfigUpdater/ConfigUpdater.apk
product/priv-app/FilesPrebuilt/FilesPrebuilt.apk
product/priv-app/GCS/GCS.apk
product/priv-app/GoogleDialer/GoogleDialer.apk
product/priv-app/GoogleOneTimeInitializer/GoogleOneTimeInitializer.apk
product/priv-app/GoogleRestorePrebuilt/GoogleRestorePrebuilt.apk
product/priv-app/PartnerSetupPrebuilt/PartnerSetupPrebuilt.apk
product/priv-app/Phonesky/Phonesky.apk
product/priv-app/PrebuiltBugle/PrebuiltBugle.apk
product/priv-app/PrebuiltGmsCore/
product/priv-app/RecorderPrebuilt/RecorderPrebuilt.apk
product/priv-app/SetupWizardPrebuilt/SetupWizardPrebuilt.apk
product/priv-app/Velvet/Velvet.apk
product/priv-app/WellbeingPrebuilt/WellbeingPrebuilt.apk
system_ext/priv-app/GoogleServicesFramework/GoogleServicesFramework.apk`,

  // Mainline system
  `system/apex/com.google.android.
system/app/GoogleExtShared/GoogleExtShared.apk
system/app/GooglePrintRecommendationService/GooglePrintRecommendationService.apk
system/priv-app/DocumentsUIGoogle/DocumentsUIGoogle.apk
system/priv-app/GooglePackageInstaller/GooglePackageInstaller.apk
system/priv-app/NetworkPermissionConfigGoogle/NetworkPermissionConfigGoogle.apk
system/priv-app/NetworkStackGoogle/NetworkStackGoogle.apk
system/priv-app/TagGoogle/TagGoogle.apk`,

  // Google Dialer
`product/etc/permissions/com.google.android.dialer.support.xml`,

  // Pixel 5
  `product/usr/share/ime/google
product/app/DevicePolicyPrebuilt/DevicePolicyPrebuilt.apk
product/app/DeviceStatisticsService/DeviceStatisticsService.apk
product/app/DiagnosticsToolPrebuilt/DiagnosticsToolPrebuilt.apk
product/app/GoogleCamera/GoogleCamera.apk
product/app/MarkupGoogle/MarkupGoogle.apk
product/app/MicropaperPrebuilt/MicropaperPrebuilt.apk
product/app/NgaResources/NgaResources.apk
product/app/PixelThemesStub/PixelThemesStub.apk
product/app/PixelWallpapers
product/app/PrebuiltGoogleTelemetryTvp/PrebuiltGoogleTelemetryTvp.apk
product/app/SafetyRegulatoryInfo/SafetyRegulatoryInfo.apk
product/app/SoundAmplifierPrebuilt/SoundAmplifierPrebuilt.apk
product/app/SoundPickerPrebuilt/SoundPickerPrebuilt.apk
product/etc/permissions/com.google.android.hardwareinfo.xml
product/etc/security/
product/priv-app/AmbientSensePrebuilt/AmbientSensePrebuilt.apk
product/priv-app/BetterBug/BetterBug.apk
product/priv-app/CarrierMetrics/CarrierMetrics.apk
product/priv-app/HardwareInfo/HardwareInfo.apk
product/priv-app/HelpRtcPrebuilt/HelpRtcPrebuilt.apk
product/priv-app/MaestroPrebuilt/MaestroPrebuilt.apk
product/priv-app/OdadPrebuilt/OdadPrebuilt.apk
product/priv-app/OTAConfigNoZeroTouchPrebuilt/OTAConfigNoZeroTouchPrebuilt.apk
product/priv-app/PixelLiveWallpaperPrebuilt/PixelLiveWallpaperPrebuilt.apk
product/priv-app/SafetyHubPrebuilt/SafetyHubPrebuilt.apk
product/priv-app/SCONE/SCONE.apk
product/priv-app/ScribePrebuilt/ScribePrebuilt.apk
product/priv-app/SecurityHubPrebuilt/SecurityHubPrebuilt.apk
product/priv-app/SettingsIntelligenceGooglePrebuilt/SettingsIntelligenceGooglePrebuilt.apk
product/priv-app/Showcase/Showcase.apk
product/priv-app/TipsPrebuilt/TipsPrebuilt.apk
system_ext/app/EmergencyInfoGoogleNoUi/EmergencyInfoGoogleNoUi.apk
system_ext/priv-app/GoogleFeedback/GoogleFeedback.apk
system_ext/priv-app/NexusLauncherRelease/NexusLauncherRelease.apk
system_ext/priv-app/PixelSetupWizard/PixelSetupWizard.apk
system_ext/priv-app/QuickAccessWallet/QuickAccessWallet.apk
system_ext/priv-app/SettingsGoogle/SettingsGoogle.apk
system_ext/priv-app/StorageManagerGoogle/StorageManagerGoogle.apk
system_ext/priv-app/SystemUIGoogle/SystemUIGoogle.apk
system_ext/priv-app/UvExposureReporter/UvExposureReporter.apk
system_ext/priv-app/WallpaperPickerGoogleRelease/WallpaperPickerGoogleRelease.apk`,

  // Pixel Dreamliner - Pixel Stand integration
  `product/etc/permissions/com.google.android.apps.dreamliner.xml
product/etc/sysconfig/dreamliner.xml
product/priv-app/Dreamliner`,

  // Pixel Turbo - battery prediction, adaptive charging
  `product/priv-app/TurboPrebuilt/TurboPrebuilt.apk
system_ext/priv-app/TurboAdapter/`,

  // Pixel Flipendo - Extreme Battery Saver
  `system_ext/app/Flipendo/Flipendo.apk`,

  // Pixel factory OTA
  `system_ext/etc/init/init.sota.rc
system_ext/etc/permissions/com.google.android.factoryota.xml
system_ext/priv-app/FactoryOta/FactoryOta.apk`,

  // Pixel 6
  `product/tts/google/
product/wallpaper/`,
])

function paths(blocks: Array<string>) {
  return blocks.flatMap(b => b.split('\n'))
}

export function parseFileList(list: string) {
  let entries = []

  for (let line of list.split('\n')) {
    // Ignore comments and empty/blank lines
    if (line.length == 0 || line.startsWith('#') || line.match(/^\s*$/)) {
      continue
    }

    // Split into path and flags first, ignoring whitespace
    let [srcPath, postModifiers] = line.trim().split(';')
    let modifiers = (postModifiers ?? '').split('|')

    // Parse "named dependency" flag (preceding -)
    let isNamedDependency = srcPath.startsWith('-')
    if (isNamedDependency) {
      srcPath = srcPath.slice(1)
    }

    // Split path into partition and sub-partition path
    let pathParts = srcPath.split('/')
    let partition = pathParts[0]
    let path: string
    if (EXT_PARTITIONS.has(partition)) {
      path = pathParts.slice(1).join('/')
    } else {
      partition = 'system'
      path = srcPath
    }

    entries.push({
      partition: partition,
      path: path,
      srcPath: srcPath,
      isPresigned: modifiers.includes('PRESIGNED'),
      isNamedDependency: isNamedDependency,
    } as BlobEntry)
  }

  // Sort by source path
  return entries.sort((a, b) => a.srcPath.localeCompare(b.srcPath))
}

export async function listPart(partition: string, systemRoot: string) {
  let partRoot = `${systemRoot}/${partition}`
  if (!await exists(partRoot)) {
    return null
  }

  // Unwrap system-as-root
  if (partition == 'system' && await exists(`${partRoot}/system`)) {
    partRoot += '/system'
  }
  let refRoot = path.dirname(partRoot)

  let spinner = ora({
    prefixText: chalk.bold(chalk.greenBright(`Listing ${partition}`)),
    color: 'green',
  }).start()

  let files = []
  for await (let file of listFilesRecursive(partRoot)) {
    // Remove root prefix
    file = path.relative(refRoot, file)
    spinner.text = file

    files.push(file)
  }

  // Filter
  files = files.filter((file) => {
    let pathParts = file.split('/')
    return !(IGNORE_DIRS.has(pathParts[1]) ||
        IGNORE_EXTS.has(path.extname(file).replace('.', '')) ||
        IGNORE_PREFIXES.find((p) => file.startsWith(p)) != undefined)
  })

  // Sort and return raw path list
  spinner.stopAndPersist()
  return files.sort((a, b) => a.localeCompare(b))
}
