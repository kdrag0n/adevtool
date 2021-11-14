# Include this file from device.mk to prepare an AOSP build for adevtool referencestate collection.

# Build the vendor image, so adevtool knows what's missing.
BOARD_VENDORIMAGE_FILE_SYSTEM_TYPE := ext4

# All overlays must be compiled as RROs so adevtool can parse them.
PRODUCT_ENFORCE_RRO_TARGETS := *

# If you're building for a Pixel device, remove android.hardware.wifi@1.0-service
# from device.mk. adevtool will extract Google's implementation from the stock ROM.
