import {Command, flags} from '@oclif/command'
import {promises as fs} from 'fs'
import * as path from 'path'
import * as chalk from 'chalk'
import * as ora from 'ora'

import { ALL_PARTITIONS } from '../partitions'

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

// https://stackoverflow.com/a/45130990
async function* listFilesRecursive(dir: string): AsyncGenerator<string> {
  const dirents = await fs.readdir(dir, { withFileTypes: true })
  for (const dirent of dirents) {
    const res = path.resolve(dir, dirent.name)
    if (dirent.isDirectory()) {
      yield* listFilesRecursive(res)
    } else if (dirent.isFile() || dirent.isSymbolicLink()) {
      yield res
    }
  }
}

async function exists(path: string) {
  try {
    await fs.access(path)
    return true
  } catch {
    // Doesn't exist or can't read
    return false
  }
}

async function copyPart(partition: string, systemRoot: string, outDir: string) {
  let partRoot = `${systemRoot}/${partition}`
  if (!await exists(partRoot)) {
    return
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

  // Sort
  files = files.sort((a, b) => a.localeCompare(b))

  // Save results
  let outPath = `${outDir}/${partition}.list`
  fs.writeFile(outPath, files.join('\n') + '\n')

  spinner.stopAndPersist()
}

export default class ListFiles extends Command {
  static description = 'list system files and symlinks important for blobs'

  static flags = {
    help: flags.help({char: 'h'}),
  }

  static args = [
    {name: 'systemRoot', description: 'path to root of mounted system images (./system_ext, ./product, etc.)', required: true},
    {name: 'out', description: 'directory to write partition file lists to', required: true},
  ]

  async run() {
    let {args: {systemRoot, out}} = this.parse(ListFiles)

    fs.mkdir(out, { recursive: true })

    for (let partition of ALL_PARTITIONS) {
      await copyPart(partition, systemRoot, out)
    }
  }
}
