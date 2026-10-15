#!/usr/bin/env python3
"""Generate patches/umtx2-autoload.patch for the MikePinku fork.

Starts from upstream's v0.5.2 umtx2-autoload.patch (same pinned umtx2 commit,
a080beb), applies it to a pristine copy of third_party/umtx2/document/en/ps5,
then retargets it for the unified architecture:

  - the staged ELF loader and autoload payload live one directory UP from the
    page (../elfldr.elf, ../autoload.elf), not in ../payloads/;
  - the autoload payload defaults to autoload.elf (no orchestrator query
    string) while ?autoload=<name> still overrides;
  - the chain boots the shared localhost-only elfldr instead of umtx2's own
    network-facing elfldr-ps5.elf;
  - the page runs the full chain on load with no interaction;
  - title/header credit the fork.

Usage: python3 tools/gen_umtx2_patch.py
"""

import os
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SOURCE = os.path.join(ROOT, "third_party", "umtx2", "document", "en", "ps5")
OLD_PATCH = os.path.join(ROOT, "patches", "umtx2-autoload-upstream-base.patch")
OUT_PATCH = os.path.join(ROOT, "patches", "umtx2-autoload.patch")

# (file, old, new, description) — applied after the upstream base patch.
RETARGETS = [
    (
        "main.js",
        'wkalBase: "../payloads/",',
        'wkalBase: "../",',
        "autoload base",
    ),
    (
        "main.js",
        'var wkalAutoloadName = new URLSearchParams(location.search).get("autoload") || sessionStorage.getItem("wkal_autoload");',
        'var wkalAutoloadName = new URLSearchParams(location.search).get("autoload") || sessionStorage.getItem("wkal_autoload") || "autoload.elf";',
        "autoload default name",
    ),
    (
        "main.js",
        'if (await load_local_elf("elfldr-ps5.elf") == 0) {',
        'if (await load_local_elf("elfldr.elf", "../") == 0) {',
        "shared localhost-only elfldr",
    ),
    (
        "index.html",
        "<title>PS5 UMTX2 Jailbreak</title>",
        '<meta charset="utf-8">\n    <title>WebKit Autoloader \u2014 umtx2 (by MikePinku)</title>',
        "charset + page title",
    ),
    (
        "index.html",
        '<h1 class="text-center">PS5 UMTX2 Jailbreak (1.xx-5.xx)</h1>',
        '<h1 class="text-center">WebKit Autoloader <small>umtx2 \u00b7 FW 1.xx\u20135.xx \u00b7 by MikePinku</small></h1>',
        "page header",
    ),
    (
        "index.html",
        """        window.onload = function () {
            let autoload = sessionStorage.getItem(SESSIONSTORE_ON_LOAD_AUTORUN_KEY);
            if (autoload) {
                run(autoload == "wkonly", false);
            }
        };""",
        """        // WKAL: the autoloader runs the full chain on load, with no
        // interaction. The autoload payload defaults to ../autoload.elf
        // (see main.js) — no session keys or query parameters needed.
        window.onload = function () {
            run(false, false);
        };""",
        "auto-run on load",
    ),
]


def run(cmd, cwd, **kwargs):
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(
            "Error: %s failed (%s):\n%s%s"
            % (" ".join(cmd), kwargs.get("what", "command"), result.stdout, result.stderr)
        )
    return result.stdout


def main():
    umtx2_git = os.path.join(ROOT, "third_party", "umtx2", ".git")
    if not (os.path.isdir(umtx2_git) or os.path.isfile(umtx2_git)):
        sys.exit("Error: umtx2 submodule is not initialised.\nRun: git submodule update --init")
    if not os.path.isfile(OLD_PATCH):
        sys.exit("Error: %s not found." % OLD_PATCH)

    src_hash = run(["git", "rev-parse", "--short", "HEAD"], SOURCE, what="rev-parse").strip()

    work = tempfile.mkdtemp(prefix="umtx2-patch-")
    dest = os.path.join(work, "ps5")
    subprocess.run(["cp", "-R", SOURCE + "/.", dest], check=True)
    payloads = os.path.join(dest, "payloads")
    for name in os.listdir(payloads):
        os.remove(os.path.join(payloads, name))

    run(["git", "init", "-q"], dest, what="git init")
    run(["git", "config", "user.name", "pkal"], dest)
    run(["git", "config", "user.email", "pkal@localhost"], dest)
    run(["git", "add", "-A"], dest)
    run(["git", "commit", "-q", "-m", "pristine"], dest)

    # Upstream's v0.5.2 patch applies against this exact umtx2 commit.
    run(["git", "apply", OLD_PATCH], dest, what="git apply upstream base patch")

    for fname, old, new, what in RETARGETS:
        path = os.path.join(dest, fname)
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
        if new in text:
            continue  # already retargeted
        if old not in text:
            sys.exit("Error: %s anchor not found in %s (%s)." % (repr(old[:60]), fname, what))
        text = text.replace(old, new, 1)
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(text)

    run(["git", "add", "-A"], dest)
    diff = run(["git", "diff", "--cached", "HEAD"], dest, what="git diff")
    with open(OUT_PATCH, "w", encoding="utf-8", newline="") as f:
        f.write(diff)
    print("Wrote %s (%d lines, umtx2 %s)." % (OUT_PATCH, len(diff.splitlines()), src_hash))


if __name__ == "__main__":
    main()
