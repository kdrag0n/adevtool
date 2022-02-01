# adevtool

Android ROM device support and bringup tool, designed for maximum automation and speed.

[![Demo video on asciinema](https://asciinema.org/a/kCWUN6XcyaDEU6bcoE65rVQrv.svg)](https://asciinema.org/a/kCWUN6XcyaDEU6bcoE65rVQrv)

## Features

This tool automates the following tasks for devices that mostly run AOSP out-of-the-box (e.g. Google Pixel):

- Downloading factory images and full OTA packages
- Generating a list of **proprietary files**
- Resolving overridden build rules and **building modules from source** (when possible)
- Extracting, converting, and mounting **factory images** [(supported source formats)](docs/system-source.md)
- Extracting proprietary files
- Extracting bootloader and radio **firmware**
- Finding and adding missing system **properties**
- Overriding build **fingerprint** to help pass SafetyNet
- Adding missing **SELinux policies**
- Adding missing HALs to **vendor interface** manifests
- Generating resource **overlays** for device configs
- Fixing privileged app signing **certificates** referenced in SELinux policies

This typically results in better device support with fewer bugs and issues, and makes it possible to quickly add support for new devices.

[Example generated vendor modules for Pixel devices](https://github.com/NeutronBlobs/android_vendor_google_devices)

### Non-AOSP devices

Pixel devices will benefit from the most automation, but several features can still be used to ease manual bringup on other devices:

- **Extract** files from proprietary-files.txt **[up to 2000% faster than LineageOS extract-utils (speed comparison)](https://asciinema.org/a/eUMNIrKtBrln1CwE1zCUnJO8w)**
  - LineageOS extract-utils: 1 min 27 sec
  - **adevtool: 4 sec**
  - Tested with Pixel 5 (redfin), cache cleared before testing
- **Compare** a built system against stock images to find missing files, properties, and vendor interface declarations
- **List** system files relevant to bringup (in all partitions)
- **Resolve overridden** build rules from build warnings
- Check SELinux policies to identify apps that should be **presigned**

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
- [Using individual helper commands](docs/commands.md)
- [Supported system source formats](docs/system-source.md)

## Why TypeScript?

TypeScript is not a common language for Android-related tools, but I picked it for several reasons:

- Fast (enough) and easily parallelizable
- Good static type system (for developer experience: fewer bugs and better editor code intelligence)
- Good libraries for friendly CLI interfaces with pretty output
- Relatively lightweight

### Why not...

- Python: May not meet speed/parallelization goals easily, types aren't as nice
- Kotlin: Requires big+heavy JVM to run, CLI libraries aren't as good
- Go: Good choice overall, but error checking can be overly verbose

Overall, TypeScript is a decent compromise on all of these points.

## License

This tool is licensed under the [MIT license](LICENSE), ensuring that anyone is free to use it for any purpose in compliance with the license. Contributions are welcome!
