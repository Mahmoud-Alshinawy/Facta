#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 path/to/app.AppImage" >&2
  exit 2
fi

APPIMAGE="$(realpath "$1")"
APPIMAGETOOL="${APPIMAGETOOL:?APPIMAGETOOL must point to appimagetool}"

if [[ ! -f "$APPIMAGE" ]]; then
  echo "AppImage not found: $APPIMAGE" >&2
  exit 1
fi

WORKDIR="$(mktemp -d)"
EXTRACTED="$WORKDIR/squashfs-root"
OUTPUT="$WORKDIR/repaired.AppImage"

cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

cd "$WORKDIR"
"$APPIMAGE" --appimage-extract >/dev/null

if [[ ! -d "$EXTRACTED/usr" ]]; then
  echo "Invalid AppImage: extracted usr directory is missing" >&2
  exit 1
fi

# Remove host-driver-bound libraries that can conflict with Fedora,
# CachyOS, Mesa, Wayland, and libglvnd.
find "$EXTRACTED/usr/lib" \( -type f -o -type l \) -print0 |
  while IFS= read -r -d '' file; do
    case "$(basename "$file")" in
      libwayland-*.so*|\
      libEGL.so*|\
      libGLES*.so*|\
      libGL.so*|\
      libGLX.so*|\
      libGLdispatch.so*|\
      libOpenGL.so*|\
      libgbm.so*|\
      libdrm.so*)
        rm -f "$file"
        ;;
    esac
  done

# Do not ship GLVND vendor metadata from the Ubuntu build host.
rm -rf "$EXTRACTED/usr/share/glvnd/egl_vendor.d"

"$APPIMAGETOOL" \
  --appimage-extract-and-run \
  --no-appstream \
  "$EXTRACTED" \
  "$OUTPUT"

mv "$OUTPUT" "$APPIMAGE"
chmod +x "$APPIMAGE"

echo "Repaired AppImage: $APPIMAGE"
