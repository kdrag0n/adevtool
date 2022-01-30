# Bringing up a new Pixel device

This guide assumes basic familiarity with Android platform development. You must already have adevtool [installed](../README.md#installation).

This guide is only for initial bringup; see [Generating or updating an existing device](pixel-generate.md) for subsequent updates.

Most commands should be run at the root of your ROM tree, so `aapt2` and other files can be discovered automatically.

## 1. Download factory images

In order to extract proprietary files and other data, you need a copy of the stock ROM for your device. Download the latest factory images package for your device, replacing `raven` with your device's codename:

```bash
adevtool download ~/stock_images -d raven
```

The factory images ZIP will be saved in `~/stock_images`. Full OTA packages are not currently supported.

## 2. Create a config

Create a simple YAML config file to get started with your device. The [example config](../config/examples/device.yml) has detailed documentation for all possible config values, but this is the bare minimum you need to start:

```yaml
device:
  name: raven
  vendor: google_devices

platform:
  product_makefile: device/google/raviole/aosp_raven.mk

  sepolicy_dirs:
    - hardware/google/pixel-sepolicy
    - device/google/gs101-sepolicy
```

Replace `product_makefile` with the path to your device's product makefile (including the `aosp_` prefix). All Pixel devices use `hardware/google/pixel-sepolicy`, but check your device tree for the device-specific SELinux policies and replace the path accordingly. Most Qualcomm Pixel devices follow a format similar to `device/google/redbull-sepolicy`.

You can optionally follow the modular format of existing configs in config/pixel to reuse common Pixel configs as much as possible. This vastly simplifies making all features work, as most parts are the same across all Pixel devices.

## 3. Prepare for reference build

To find missing files, properties, and overlays automatically, adevtool needs a reference build of AOSP to compare with the stock ROM. Navigate to the root of your AOSP tree and generate a vendor module to prepare for this:

```bash
adevtool generate-prep -s ~/stock_images -b sq1d.211205.017 tools/adevtool/config/pixel/raven.yml
```

Replace `~/stock_images` with the directory containing your factory images package, `sq1d.211205.017` with the build ID, and `raven` with your device's codename. We recommend keeping a copy of adevtool at `tools/adevtool` so the config is easy to find, but you should also adjust the path if your configs are located somewhere else.

## 4. Attempt to build

After generating the vendor module, build the ROM to get a reference build. Make sure to do a `user` build using the device codename as it appears on the stock ROM (i.e. no `aosp_` prefix; you can build with a different device name and variant later if you want, but the reference build has strict requirements):

```bash
lunch raven-user
m installclean
m
```

**The first build is expected to fail — don't panic.** Read the errors to determine which dependencies are missing and add the missing files to the `filters: dep_files` section of the config accordingly. See the [Pixel 2020](../config/pixel/snippets/2020.yml#L26) config for reference.

After adding the missing files, generate the vendor module again (step 2) and attempt another build. Repeat until the build completes successfully.

Even when successful, the reference build **will not boot.** That's normal; this build is only for adevtool's reference purposes.

## 5. Collect state

Use the reference build to create a state file, which contains all necessary information from the build:

```bash
adevtool collect-state ~/raven.json -d raven
```

Once you have a state file, the reference build is no longer necessary, so you can safely discard it.

## 6. Fix app signing certificates

Some privileged apps have special SELinux domains assigned by signing certificate, and the default AOSP certificates don't match. Update the certificates:

```bash
adevtool fix-certs -d raven -s ~/stock_images -b sq1d.211205.017 -p hardware/google/pixel-sepolicy device/google/gs101-sepolicy
```

Pass the list of `sepolicy_dirs` in your config as arguments after `-p`.

This only needs to be done once as it modifies SELinux policies to update certificates as necessary. You may want to fork the modified repositories.

## 7. Generate vendor module

Now that you have a reference state file, generate the actual vendor module:

```bash
adevtool generate-all -s ~/stock_images -c ~/raven.json -b sq1d.211205.017 tools/adevtool/config/pixel/raven.yml
```

## 8. Build the actual ROM

You can now do an actual ROM build. We recommend doing an engineering build (`eng`) for easier debugging:

```bash
lunch raven-user
m installclean
m
```

This build will likely boot, but some features may be broken.

## 9. Refine the config

To fix features and improve the quality of your bringup, review the following generated files/folders in `vendor/google_devices/raven` to make sure they look reasonable:

- Resource overlays: `overlays/[partition].txt` (e.g. product.txt, vendor.txt)
- List of extracted proprietary files: `proprietary-files.txt`
- Generated vendor interface manifest: `vintf/adevtool_manifest_vendor.xml`
- SELinux policies and partitions: `proprietary/BoardConfigVendor.mk`
- System properties and built packages: `proprietary/device-vendor.mk`

Add filters and regenerate the module until everything looks good. It will be helpful to use [existing Pixel configs](../config/pixel) as references.

If you get a new Pixel device working with no apparent bugs, congrats! Please consider contributing official support for the device [by making a pull request](https://github.com/kdrag0n/adevtool/compare).
