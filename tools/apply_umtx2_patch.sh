#!/usr/bin/env bash
# Prepare the umtx2 copy used by the frontend and apply our autoloader patch.
#
# umtx2 lives as a pristine git submodule in third_party/umtx2 (never
# modified). The frontend needs the exploit under frontend/umtx2, so this
# script:
#   1. copies third_party/umtx2/document/en/ps5 -> frontend/umtx2
#      (flattened: the exploit's document/en/ps5 dir becomes the copy root, so
#      the pointer URL is the short /app/<version>/umtx2/index.html)
#   2. prunes the bundled payloads dir (the chain boots the shared
#      localhost-only elfldr from ../elfldr.elf and sends ../autoload.elf)
#   3. applies patches/umtx2-autoload.patch to the copy
#
# The copy is gitignored (frontend/umtx2/), so the submodule is never dirtied.
# patches/umtx2-autoload.patch is generated from
# patches/umtx2-autoload-upstream-base.patch by tools/gen_umtx2_patch.py.
# Run after every submodule update:
#
#   git submodule update --init
#   python3 tools/gen_umtx2_patch.py   # only when umtx2 changed upstream
#   tools/apply_umtx2_patch.sh
#
# The Makefile runs this automatically before staging/serving (umtx2-prepare).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT/third_party/umtx2"
DEST="$ROOT/frontend/umtx2"
PATCH="$ROOT/patches/umtx2-autoload.patch"

umtx2_git="$SOURCE/.git"
if [ ! -e "$umtx2_git" ]; then
    echo "Error: umtx2 submodule is not initialised."
    echo "Run: git submodule update --init"
    exit 1
fi

if [ ! -f "$PATCH" ]; then
    echo "Error: patch file not found: $PATCH"
    echo "Generate it with: python3 tools/gen_umtx2_patch.py"
    exit 1
fi

# 1. Fresh copy of the exploit root (document/en/ps5), flattened, with the
#    bundled payloads dir emptied: the shared localhost-only elfldr and the
#    autoload payload are staged one directory up (../elfldr.elf,
#    ../autoload.elf), and the payload menu is unused by the autoloader.
rm -rf "$DEST"
mkdir -p "$DEST/payloads"
cp -R "$SOURCE/document/en/ps5"/. "$DEST"/
rm -rf "$DEST/payloads"
mkdir -p "$DEST/payloads"

# 1b. Normalize to LF: umtx2 commits CRLF and no .gitattributes, so a fresh
#     checkout is CRLF on every platform, while the patch below is LF. Without
#     this, application would depend on the machine's core.autocrlf (CI fails,
#     Windows-only machines pass). Binaries only ever exist in payloads/,
#     pruned above, so a walk is safe.
"${PYTHON:-python3}" - "$DEST" <<'PYEOF'
import os
import sys

for dirpath, _dirs, files in os.walk(sys.argv[1]):
    for name in files:
        path = os.path.join(dirpath, name)
        with open(path, "rb") as f:
            data = f.read()
        if b"\r\n" in data:
            with open(path, "wb") as f:
                f.write(data.replace(b"\r\n", b"\n"))
PYEOF

# 2. Turn the copy into a throwaway git repo so `git apply` can handle the
#    patch. Two commits: pristine umtx2, then our autoloader patch.
SRC_HASH=$(git -C "$SOURCE" rev-parse --short HEAD)
git -C "$DEST" init -q
git -C "$DEST" config user.name "pkal"
git -C "$DEST" config user.email "pkal@localhost"
git -C "$DEST" add -A
git -C "$DEST" commit -q -m "umtx2 pristine (flattened document/en/ps5, submodule $SRC_HASH)"

# 3. Apply the patch
cd "$DEST"
if git apply --check "$PATCH" 2>/dev/null; then
    git apply "$PATCH"
    git add -A
    git commit -q -m "Apply PKAL autoloader patch"
    echo "umtx2: copied to $DEST and autoloader patch applied."
elif git apply --reverse --check "$PATCH" 2>/dev/null; then
    echo "umtx2: autoloader patch is already applied."
else
    echo "Error: patch does not apply cleanly to $DEST."
    echo "umtx2 has likely changed upstream — regenerate the patch:"
    echo "  python3 tools/gen_umtx2_patch.py"
    git apply --check "$PATCH" || true
    exit 1
fi

# 4. Sanity check: the patched main.js must carry our integration markers, the
#    chain must boot the shared localhost-only elfldr from ../elfldr.elf, the
#    confirm() dialogs must be gone, and the payloads dir must be empty.
#    Catches a silently truncated or stale patch.
if ! grep -q 'wkalAutoloadName = new URLSearchParams' main.js \
    || ! grep -q 'wkalAutoload' main.js \
    || ! grep -q 'load_local_elf("elfldr.elf", "../")' main.js \
    || ! grep -q '"\.\.\/"' main.js \
    || grep -q 'confirm(' main.js \
    || grep -q 'load_local_elf("elfldr-ps5.elf")' main.js \
    || ! grep -q 'run(false, false)' index.html \
    || ! grep -qi 'meta charset="utf-8"' index.html \
    || [ "$(find payloads -maxdepth 1 -type f | wc -l)" -ne 0 ]; then
    echo "Error: umtx2 patch verification FAILED — integration markers missing."
    echo "patches/umtx2-autoload.patch is incomplete or out of date."
    echo "Regenerate it: python3 tools/gen_umtx2_patch.py"
    exit 1
fi
echo "umtx2: patch verification OK (autoload on load, shared elfldr via ../elfldr.elf, confirm removed, payloads pruned)."

# Parse-check the patched JS in the mode the browser will use it in. A
# `node --check foo.js` parses in CommonJS (sloppy) mode, but these are ES
# modules (strict) — a scope collision that sloppy mode accepts still kills the
# chain on the console. See tools/check_exploit_js.py.
"${PYTHON:-python3}" "$ROOT/tools/check_exploit_js.py" "$DEST"

# Drop the throwaway git repo: frontend/umtx2 is packaged verbatim into the
# installer's file registry and the PC host zip, and neither must embed .git.
rm -rf "$DEST/.git"
