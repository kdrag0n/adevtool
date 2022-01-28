#!/usr/bin/env bash

set -euo pipefail
shopt -s nullglob

cd "$(dirname "$0")"

[[ $# -eq 2 ]] || exit 1

DEVICE=$1
BUILD=$2
MOUNT_ROOT="mount"
DL_ROOT="dl"
blob_partitions=(system product system_ext vendor)

# Prints an info message in light green
function msg() {
    echo -e "\e[1;32m$*\e[0m"
}

# Prints an error in light red
function err() {
    echo -e "\e[1;31m$*\e[0m"
}

# Prints a warning in light yellow
function warn() {
    echo -e "\e[1;33m$*\e[0m"
}

function kill_jobs() {
    jobs -p | xargs -I{} kill -- {}
}

function pushd() {
    command pushd "$@" > /dev/null
}

function popd() {
    command popd "$@" > /dev/null
}

trap kill_jobs EXIT

function download_factory() {
    local device="$1"
    local build_id="$2"
    local dl_dir="$3"

    echo "  - Factory $BUILD image for $DEVICE"
    ../android-prepare-vendor/scripts/download-nexus-image.sh -y -d "$device" -b "$build_id" -o "$dl_dir"
}

(
    msg "Downloading $DEVICE $BUILD images"
    dl_dir="$DL_ROOT"
    mkdir -p "$dl_dir"
    if [[ "$(ls "$dl_dir" | grep -e "$DEVICE-$BUILD" | wc -l)" -ge 1 ]]; then
        echo "Skipping download, already present"
    else
        download_factory "$DEVICE" "$BUILD" "$dl_dir"
    fi
) &
wait

dl_dir="$DL_ROOT"
msg "Extracting images for $DEVICE $BUILD"
dev_mount="$MOUNT_ROOT"

# Extract zip (and delete if necessary)
if [[ ! -d "$dl_dir/$DEVICE-$BUILD" ]]; then
    unzip -d "$dl_dir" "$dl_dir/$DEVICE-"*.zip
fi

pushd "$dl_dir/$DEVICE-"*/
build_parts=("${blob_partitions[@]}")
for part in "${build_parts[@]}"
do
    msg "  - $part"
    if [[ ! -f "$part.img" ]]; then
        unzip "image-$DEVICE"*.zip "$part.img"
    fi
    if [[ ! -f "$part.img.raw" ]]; then
        if file "$part.img" | grep -q 'Android sparse image'; then
            simg2img "$part.img" "$part.img.raw"
        else
            ln "$part.img" "$part.img.raw"
        fi
    fi

    mountpoint="$dev_mount/$part"
    sudo mkdir -p "$mountpoint"
    # Unmount if already mounted
    if mountpoint -q "$mountpoint"; then
        sudo umount "$mountpoint"
    fi
    sudo mount -o ro "$part.img.raw" "$mountpoint"
done
popd

