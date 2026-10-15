# PC setup host

A zero-dependency Python script that turns your PC into a local DNS + HTTPS
server for the one-time installation of the WebKit Autoloader. No
`pip install` — only the Python 3 standard library. The host is maintained in
this repository: `pc-host/host.py` is the server, and `tools/build_host.py`
packages it with the frontend into a single portable
`webkit-autoloader-host_v<version>.py`.

## What it does

- **DNS (UDP 53):** resolves `manuals.playstation.net` (or any `--target`) to
  your PC's local IP so the PS5's User's Guide page is served by you. Every
  other domain gets `NXDOMAIN`, which blocks PS5 telemetry and internet
  access entirely.
- **HTTPS (TCP 443):** serves the embedded setup docroot over a build-time
  self-signed certificate for the spoofed domain. The docroot contains the
  router page (`index.html`), the Poops and Relapse standalone pages, the
  multi-file umtx2 chain, and the `elfldr.elf` / `autoload.elf` payloads the
  umtx2 page fetches from one directory up — the complete setup, portable in
  one script.
- **Chain routing:** the router detects the PS5 firmware from the User-Agent
  and redirects to the right chain — umtx2 on 1.00–5.50, Relapse on
  7.00–12.02+ except 9.05/11.40, Poops there — honouring an explicit
  `?exploit=` choice. On a PC browser it just shows a note that no PS5 was
  detected.
- **HTTP (optional, `--http-port`):** same content over plain HTTP, mainly
  for browser-side testing without a certificate.
- Text responses are served with `charset=utf-8` (the stock umtx2 page has no
  charset declaration of its own and rendered mojibake on the PS5 without
  this).

Requests check the `overrides/` directory first, the embedded archive second,
and the `--base` directory last, so you can hot-swap individual files without
rebuilding.

## Usage

Run the built script on a PC on the same network as the PS5:

```sh
python3 webkit-autoloader-host_v<version>.py
```

Then on the PS5: set the network's DNS server to your PC's IP, open
**Settings → User's Guide**, and follow the installer page. Reboot once after
installation. On systems that restrict ports 53/443, run the host with
`sudo`. The startup banner shows the embedded version; a GitHub update check
against `pinkythegawd/ps5-webkit-autoloader` runs unless disabled.

For a local HTTP check without DNS or HTTPS:

```sh
python3 webkit-autoloader-host_v<version>.py --no-dns --no-https --http-port 8123
```

Running `pc-host/host.py` directly (without the embedded archive) needs a
frontend on disk:

```sh
cd pc-host
python3 host.py --base ../build/host
```

## Options

```text
--ip 1.2.3.4              IP to point the spoofed domain at (default: auto-detect)
--target domain           Domain to spoof (default: manuals.playstation.net)
--base <dir>              Frontend docroot served from disk (used only when the
                          embedded archive is absent, e.g. ../build/host)
--overrides ./overrides   Overrides directory checked before everything else
--dns-port 53             DNS UDP port
--https-port 443          HTTPS TCP port
--http-port 8080          Also serve plain HTTP on this port (optional)
--strict-host             Only serve requests with Host: <target>
--no-dns                  Disable the DNS server
--no-http                 Disable the HTTP server
--no-https                Disable the HTTPS server
--verbose                 Detailed per-request DNS/HTTP logging
--no-color                Disable coloured output
--no-update-check         Skip the GitHub update check at startup
```

## Overrides

Drop files into `pc-host/overrides/` mirroring the docroot layout; an
override wins over the embedded copy:

```
overrides/
└── umtx2/
    └── index.html   # served instead of the embedded umtx2 page
```

## Building

Build the host from an existing installer ELF with:

```sh
make host HOST_PAYLOAD=webkit-autoloader-installer_v<version>.elf
```

This stages the router, both chain pages, the prepared umtx2 page and the
payload binaries into `build/host/`, then runs `tools/build_host.py`, which
generates a self-signed certificate for the spoofed domain and embeds the
docroot into the script. `./build_release.sh` builds both the installer ELF
(Docker/SDK) and the versioned host script with a single pinned version.
