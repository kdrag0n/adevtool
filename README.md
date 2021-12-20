# adevtool

Android device support and bringup tool, designed for maximum automation and speed.

## Features

This tool automates the following tasks:

- Downloading factory images and full OTA packages
- Generating a list of proprietary files
- Resolving overridden build rules and building modules from source (when possible)
- Extracting, converting, and mounting factory images
- Extracting proprietary files
- Extracting bootloader and radio firmware
- Finding and adding missing system properties
- Overriding build fingerprint to help pass SafetyNet
- Adding missing SELinux policies
- Adding missing HALs to vendor interface manifests
- Generating resource overlays for device configs
- Fixing privileged app signing certificates referenced in SELinux policies

Google Pixel devices will benefit from the most automation, but several features can still be used to ease manual bringup on other devices:

- Check SELinux policies to identify apps that should be presigned
- Compare a built system against stock images to find missing files, properties, and vendor interface declarations
- Resolving overridden build rules from build warnings
- Listing system files relevant to bringup (in all partitions)
- Extracting files from proprietary-files.txt **up to 10x faster than LineageOS extract-utils**

## Installation

Pre-requisites:

- [Node.js](https://nodejs.org/)
- Optional:
  - For converting sparse factory images: [simg2img](https://github.com/anestisb/android-simg2img)
  - For extracting OTA packages: [payload-dumper-go](https://github.com/ssut/payload-dumper-go)
  - For extracting OTAs or factory images: `unzip`
  - For generating overlays: [AAPT2](https://developer.android.com/studio/command-line/aapt2) (included in AOSP and Android SDK)

To run adevtool without installation:

```bash
npx adevtool
```

To install adevtool globally using npm:

```bash
npm install -g adevtool
```

Using Yarn:

```bash
yarn global add adevtool
```

## Usage

- [Bringing up a new Pixel device](docs/pixel-bringup.md)
- [Generating or updating an existing device](docs/pixel-generate.md)
- [Using individual bringup helper commands](docs/commands.md)

## License

This tool is licensed under the [MIT license](LICENSE). Contributions are welcome!
