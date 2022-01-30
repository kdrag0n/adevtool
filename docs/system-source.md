# System source formats

Many adevtool commands require stock system images to introspect and extract files from. You can supply these in many different formats:

- Directory containing mounted partitions (system/, vendor/, etc.)
- Directory containing extracted factory images package
- Dircetory containing sparse or raw partition images (system.img, vendor.img, etc.)
- Factory images package (e.g. raven-sq1d.220105.007-factory-d8f6b8a4.zip)
- Fastboot update images (nested ZIP extracted from factory images, e.g. image-raven-sq1d.220105.007.zip)
- Full OTA package (WIP)
- payload.bin from a full OTA package (WIP)

More flexible sources that can contain multiple devices and builds are also supported, including directories containing any of the above formats...

- Directly in the directory (e.g. `$SRC/raven-sq1d.220105.007-factory-d8f6b8a4.zip`)
- Under the build ID (e.g. `$SRC/sq1d.220105.007/raven-sq1d.220105.007-factory-d8f6b8a4.zip`)
- Under the device name (e.g. `$SRC/raven/raven-sq1d.220105.007-factory-d8f6b8a4.zip`)
- Under the device name and build ID (e.g. `$SRC/raven/sq1d.220105.007/raven-sq1d.220105.007-factory-d8f6b8a4.zip`)
- Under the build ID and device name (e.g. `$SRC/sq1d.220105.007/raven/raven-sq1d.220105.007-factory-d8f6b8a4.zip`)

All commands that accept stock system images, with the exception of comparison commands (diff-files, diff-props, diff-vintf), support all of the source formats listed above. Make sure to pass the build ID as an argument (`-b` or `--buildId`) to enable support for directories containing build IDs.
