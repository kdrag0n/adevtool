#!/usr/bin/env bash

set -eufo pipefail

for pkg in $(adb shell pm list packages -s | sed 's/package://g')
do
    out="$(adb shell dumpsys package $pkg)"
    if grep -q "path: /data/app" <<< "$out"; then
        #echo $pkg
        sys_dir="$(grep codePath= <<< "$out" | cut -d'=' -f2 | grep -v /data | head -n1)"
        adb shell ls $sys_dir/'*.apk' | head -n1
    fi
done
