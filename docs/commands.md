# Commands

This documents individual adevtool commands, most of which can be used independently without a config or full device bringup.

## Extract proprietary files

Given a device codename, vendor name, stock system source, and LineageOS proprietary-files.txt list, extract proprietary files and generate build files.

[![Speed comparison with LineageOS extract-utils](https://asciinema.org/a/eUMNIrKtBrln1CwE1zCUnJO8w.svg)](https://asciinema.org/a/eUMNIrKtBrln1CwE1zCUnJO8w)

<details>
<summary>Command-line help</summary>

```
extract proprietary files

USAGE
  $ adevtool extract LISTPATH

ARGUMENTS
  LISTPATH  path to LineageOS-compatible proprietary-files.txt list

OPTIONS
  -b, --buildId=buildId    build ID of the stock images (optional, only used for locating factory images)
  -d, --device=device      (required) device codename
  -h, --help               show CLI help
  -k, --skipCopy           skip file copying and only generate build files

  -s, --stockSrc=stockSrc  (required) path to (extracted) factory images, (mounted) images, (extracted) OTA package, 
                           OTA payload, or directory containing any such files (optionally under device and/or build ID 
                           directory)

  -t, --useTemp            use a temporary directory for all extraction (prevents reusing extracted files across runs)

  -v, --vendor=vendor      (required) device vendor/OEM name
```

</details>

## Identify presigned apps

Given a list of SELinux policy directories and a stock system source, identify APKs that should be presigned.

This is not a comprehensive list, as signature permissions and Google Play updates can also require apps to be presigned, but it will identify all apps necessary to boot and utilize basic hardware features.

Optionally, if input and output list paths are provided, filter the proprietary-files.txt and save a version with presigned tags added.

<details>
<summary>Command-line help</summary>

```
check for APKs that should be presigned

USAGE
  $ adevtool check-presigned [LISTPATH]

ARGUMENTS
  LISTPATH  path to LineageOS-compatible proprietary-files.txt list

OPTIONS
  -a, --aapt2=aapt2        [default: out/host/linux-x86/bin/aapt2] path to aapt2 executable
  -b, --buildId=buildId    build ID of the stock images (optional, only used for locating factory images)
  -d, --device=device      (required) device codename
  -h, --help               show CLI help
  -o, --outList=outList    output path for new proprietary-files.txt with PRESIGNED tags
  -p, --sepolicy=sepolicy  (required) paths to device and vendor sepolicy dirs

  -s, --stockSrc=stockSrc  (required) path to (extracted) factory images, (mounted) images, (extracted) OTA package, 
                           OTA payload, or directory containing any such files (optionally under device and/or build ID 
                           directory)

  -t, --useTemp            use a temporary directory for all extraction (prevents reusing extracted files across runs)
```

</details>

## Collect state

Given a reference build of AOSP, collect the state necessary for future vendor module generation.

Supports running for multiple devices simultaneously, optionally in parallel.

<details>
<summary>Command-line help</summary>

```
collect built system state for use with other commands

USAGE
  $ adevtool collect-state OUTPUT_PATH

ARGUMENTS
  OUTPUT_PATH  output path for system state JSON file(s)

OPTIONS
  -a, --aapt2=aapt2      [default: out/host/linux-x86/bin/aapt2] path to aapt2 executable
  -d, --device=device    (required) name of target device
  -h, --help             show CLI help
  -p, --parallel         generate devices in parallel (causes buggy progress spinners)
  -r, --outRoot=outRoot  [default: out] path to AOSP build output directory (out/)
```

</details>

## Compare files

Given two extracted/mounted systems, find missing files.

<details>
<summary>Command-line help</summary>

```
find missing system files compared to a reference system

USAGE
  $ adevtool diff-files SOURCEREF SOURCENEW

ARGUMENTS
  SOURCEREF  path to root of reference system
  SOURCENEW  path to root of new system

OPTIONS
  -a, --all   show all differences, not only missing/removed files
  -h, --help  show CLI help
```

</details>

## Compare properties

Given two extracted/mounted systems, find missing properties.

<details>
<summary>Command-line help</summary>

```
find missing and different properties compared to a reference system

USAGE
  $ adevtool diff-props SOURCEREF SOURCENEW

ARGUMENTS
  SOURCEREF  path to root of reference system
  SOURCENEW  path to root of new system

OPTIONS
  -a, --all           show all differences, not only missing props
  -b, --includeBuild  include build props
  -h, --help          show CLI help
```

</details>

## Compare vendor interface manifests

Given two extracted/mounted systems, find missing HALs in the vendor interface manifests.

<details>
<summary>Command-line help</summary>

```
find missing vintf declarations compared to a reference system

USAGE
  $ adevtool diff-vintf SOURCEREF SOURCENEW [OUTPATH]

ARGUMENTS
  SOURCEREF  path to root of reference system
  SOURCENEW  path to root of new system
  OUTPATH    output path for manifest fragment with missing HALs

OPTIONS
  -a, --all   show all differences, not only missing/removed HALs
  -h, --help  show CLI help
```

</details>

## Download factory images/OTAs/vendor packages

Given device codename(s), download factory images, full OTAs, and/or vendor packages.

<details>
<summary>Command-line help</summary>

```
download device factory images, OTAs, and/or vendor packages

USAGE
  $ adevtool download OUT

ARGUMENTS
  OUT  directory to save downloaded files in

OPTIONS
  -b, --buildId=buildId          (required) [default: latest] build ID(s) of the images to download
  -d, --device=device            (required) device(s) to download images for
  -h, --help                     show CLI help
  -t, --type=factory|ota|vendor  [default: factory] type(s) of images to download
```

</details>

## Generate full vendor module

Given a device config and stock system source, automatically generate a full vendor module.

<details>
<summary>Command-line help</summary>

```
generate all vendor parts automatically

USAGE
  $ adevtool generate-all CONFIG

ARGUMENTS
  CONFIG  path to device-specific YAML config

OPTIONS
  -a, --aapt2=aapt2              [default: out/host/linux-x86/bin/aapt2] path to aapt2 executable
  -b, --buildId=buildId          build ID of the stock images (optional, only used for locating factory images)

  -c, --customSrc=customSrc      [default: out] path to AOSP build output directory (out/) or (directory containing) 
                                 JSON state file

  -f, --factoryPath=factoryPath  path to stock factory images zip (for extracting firmware if stockSrc is not factory 
                                 images)

  -h, --help                     show CLI help

  -k, --skipCopy                 skip file copying and only generate build files

  -p, --parallel                 generate devices in parallel (causes buggy progress spinners)

  -s, --stockSrc=stockSrc        (required) path to (extracted) factory images, (mounted) images, (extracted) OTA 
                                 package, OTA payload, or directory containing any such files (optionally under device 
                                 and/or build ID directory)

  -t, --useTemp                  use a temporary directory for all extraction (prevents reusing extracted files across 
                                 runs)
```

</details>

## Generate preparatory vendor module

Given a device config and stock system source, generate a minimal vendor module to prepare for a reference build.

<details>
<summary>Command-line help</summary>

```
generate vendor parts to prepare for reference AOSP build (e.g. for collect-state)

USAGE
  $ adevtool generate-prep CONFIG

ARGUMENTS
  CONFIG  path to device-specific YAML config

OPTIONS
  -b, --buildId=buildId    build ID of the stock images (optional, only used for locating factory images)
  -h, --help               show CLI help
  -k, --skipCopy           skip file copying and only generate build files
  -p, --parallel           generate devices in parallel (causes buggy progress spinners)

  -s, --stockSrc=stockSrc  (required) path to (extracted) factory images, (mounted) images, (extracted) OTA package, 
                           OTA payload, or directory containing any such files (optionally under device and/or build ID 
                           directory)

  -t, --useTemp            use a temporary directory for all extraction (prevents reusing extracted files across runs)
```

</details>

## List system files

Given a device codename and stock system source, list the files and symlinks in each partition.

<details>
<summary>Command-line help</summary>

```
list system files and symlinks important for blobs

USAGE
  $ adevtool list-files OUT

ARGUMENTS
  OUT  directory to write partition file lists to

OPTIONS
  -b, --buildId=buildId    build ID of the stock images (optional, only used for locating factory images)
  -d, --device=device      (required) device codename
  -h, --help               show CLI help

  -s, --stockSrc=stockSrc  (required) path to (extracted) factory images, (mounted) images, (extracted) OTA package, 
                           OTA payload, or directory containing any such files (optionally under device and/or build ID 
                           directory)

  -t, --useTemp            use a temporary directory for all extraction (prevents reusing extracted files across runs)
```

</details>

## Resolve overridden build rules

Given a build log with override warnings and Soong module info, resolve overridden build rules into a list of packages to build from source.

<details>
<summary>Command-line help</summary>

```
resolve packages to build from a list of overridden targets

USAGE
  $ adevtool resolve-overrides OVERRIDELIST MODULEINFO

ARGUMENTS
  OVERRIDELIST  path to file containing build output with override warnings
  MODULEINFO    path to Soong module-info.json (out/target/product/$device/module-info.json)

OPTIONS
  -h, --help  show CLI help
```

</details>
