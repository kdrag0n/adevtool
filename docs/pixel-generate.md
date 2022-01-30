# Generating or updating an existing device

This guide assumes basic familiarity with Android platform development. You must already have adevtool [installed](../README.md#installation).

While the focus of this guide is on a single device, examples are also shown for working on multiple devices at the same time. If you're working on multiple devices, many commands can be sped up by adding the `-p` argument to do the work for each device in parallel.

Most commands should be run at the root of your ROM tree, so `aapt2` and other files can be discovered automatically.

## 1. Download factory images

In order to extract proprietary files and other data, you need a copy of the stock ROM for your device. Download the latest factory images package for your device, replacing `raven` with your device's codename:

```bash
adevtool download ~/stock_images -d raven

# For multiple devices
adevtool download ~/stock_images -d raven oriole
```

The factory images ZIP will be saved in `~/stock_images`. Full OTA packages are not currently supported.

## 2. Collect state from a reference build

**Skip to [step 3](#3-generate-vendor-module) if you already have a state file. This is a one-time step.**

To find missing files, properties, and overlays automatically, adevtool needs a reference build of AOSP to compare with the stock ROM. Navigate to the root of your AOSP tree and generate a vendor module to prepare for this:

```bash
adevtool generate-prep -s ~/stock_images -b sq1d.211205.017 tools/adevtool/config/pixel/raven.yml

# For multiple devices
adevtool generate-prep -s ~/stock_images -b sq1d.211205.017 tools/adevtool/config/pixel/2021.yml
```

Replace `~/stock_images` with the directory containing your factory images package, `sq1d.211205.017` with the build ID, and `raven` with your device's codename. We recommend keeping a copy of adevtool at `tools/adevtool` so the config is easy to find, but you should also adjust the path if your configs are located somewhere else.

After generating the vendor module, build the ROM to get a reference build. Make sure to do a `user` build using the device codename as it appears on the stock ROM (i.e. no `aosp_` prefix; you can build with a different device name and variant later if you want, but the reference build has strict requirements):

```bash
lunch raven-user
m installclean
m
```

Then use the reference build to create a state file, which contains all necessary information from the build:

```bash
adevtool collect-state ~/raven.json -d raven

# For multiple devices (device_states is a directory)
adevtool collect-state ~/device_states -d raven oriole
```

Once you have a state file, the reference build is no longer necessary, so you can safely discard it.

### For future updates

This step is only necessary across major Android version upgrades (e.g. Android 12 to 13), or occasionally quarterly feature drops for the latest Pixel generation of Pixel devices. It's also necessary when the format of the state file changes, but we try to keep the format stable when possible.

In all other cases, you can reuse the same state file for future updates without needing to do reference builds again. You can also share the file, so other people building for the same device don't need to do their own reference builds.

## 3. Generate vendor module

Now that you have a reference state file, generating the actual vendor module is easy:

```bash
adevtool generate-all -s ~/stock_images -c ~/raven.json -b sq1d.211205.017 tools/adevtool/config/pixel/raven.yml

# For multiple devices
adevtool generate-all -s ~/stock_images -c ~/device_states -b sq1d.211205.017 tools/adevtool/config/pixel/2021.yml
```

Replace `~/raven.json` with the path to your state file if you're building for a single device, or the directory containing your state files if you have multiple devices. Other arguments are the same as in previous steps.

You should now have everything you need to do a full custom ROM build!
