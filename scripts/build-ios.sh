#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build
python3 scripts/prepare-ios.py
xcodegen generate --spec ios/project.yml --project ios

mkdir -p release
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
project=ios/WorldForge.xcodeproj
destination='generic/platform=iOS'

if [[ -n "${WORLDFORGE_EXPORT_OPTIONS:-}" ]]; then
  xcodebuild archive -project "$project" -scheme WorldForge -configuration Release \
    -destination "$destination" -archivePath "$work/WorldForge.xcarchive" \
    "${@:1}"
  xcodebuild -exportArchive -archivePath "$work/WorldForge.xcarchive" \
    -exportPath "$work/export" -exportOptionsPlist "$WORLDFORGE_EXPORT_OPTIONS"
  cp "$work/export/WorldForge.ipa" release/WorldForge-iOS.ipa
  unzip -t release/WorldForge-iOS.ipa
else
  xcodebuild build -project "$project" -scheme WorldForge -configuration Release \
    -destination "$destination" -derivedDataPath "$work/build" \
    CODE_SIGNING_ALLOWED=NO
  mkdir -p "$work/Payload"
  cp -R "$work/build/Build/Products/Release-iphoneos/WorldForge.app" "$work/Payload/"
  test -s "$work/Payload/WorldForge.app/WorldForge.html"
  test -s "$work/Payload/WorldForge.app/Assets.car"
  file "$work/Payload/WorldForge.app/WorldForge" | grep -E 'Mach-O.*arm64'
  rm -f release/WorldForge-iOS-unsigned.ipa
  ditto -c -k --keepParent "$work/Payload" release/WorldForge-iOS-unsigned.ipa
  unzip -t release/WorldForge-iOS-unsigned.ipa
fi
