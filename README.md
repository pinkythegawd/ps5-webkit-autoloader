<p align="center">
 <img src="./assets/icon.svg" width="128" />
</p>
<h1 align="center">PS5 WebKit Autoloader</h1>
<p align="center">MikePinku fork &mdash; by <a href="https://www.github.com/pinkythegawd">MikePinku</a></p>
&nbsp;
<p align="center">Automatically loads the WebKit exploit and your elf payloads.<br>Supports firmwares <b>1.00&ndash;5.50</b> and <b>7.00&ndash;13.60</b>.</p>

| Firmware | Chain |
| --- | --- |
| 1.00 &ndash; 5.50 | **umtx2** (PSFree-based, restored in this fork) |
| 7.00 &ndash; 12.00 | **Poops** |
| 7.00 &ndash; 13.60 (except 9.05, 11.40) | **Relapse** |
| 9.05, 11.40 | **Poops** (Relapse does not support these) |

## Why this fork?

Upstream [itsPLK/ps5-webkit-autoloader](https://github.com/itsPLK/ps5-webkit-autoloader)
dropped firmware 1.00&ndash;5.50 when it moved to its unified architecture. This fork
keeps that unified base and **restores the low-firmware umtx2 chain** alongside Poops
and Relapse, with a fresh coat of paint:

- **Three chains, one installer.** The installer asks only when your firmware genuinely
  supports more than one chain; otherwise it just picks the right one.
- **Old firmwares get the same offline treatment.** The umtx2 chain is cached the same
  way as Poops/Relapse, so a 1.00&ndash;5.50 console also works fully offline after the
  one-time setup, with a homescreen shortcut.
- **Redesigned UI** (dark pink theme) across the installer, the autoloader page and the
  PC host, with **English/French** toggle on the autoloader page.
- **Better PC setup host.** The single-file `webkit-autoloader-host.py` now carries the
  whole setup docroot — a firmware router page, both standalone chain pages and the
  multi-file umtx2 chain — and serves every text file with an explicit UTF-8 charset.

Everything below works the same as upstream, because this fork is built on its architecture.

## Why WebKit Autoloader?

WebKit exploits are usually loaded by pointing your PS5's DNS at some server hosted by someone on the internet. That means you're putting your trust in whoever runs that server — and if it goes down, changes, or disappears, your setup breaks.

This autoloader does it differently:

- **Fully offline, no third-party DNS.** After a one-time install from your PC, everything is served straight from your PS5. There's nothing external to go down or change behind your back.
- **One-time setup, then a homescreen shortcut.** Once it's installed, you don't need a PC or the internet — just launch "WebKit Autoloader" from the homescreen and you're done.
- **Payloads loaded the way you already know.** After the exploit chain runs, your payloads are sent via **Payload Manager**, or a custom `autoload.txt`.

## Setup Instructions

There are two ways to set up the autoloader, depending on whether you're already jailbroken.

### Already jailbroken? Just load the installer ELF

1. Download `webkit-autoloader-installer_vX.Y.Z.elf` from the [Releases](https://github.com/pinkythegawd/ps5-webkit-autoloader/releases) page.
2. Send it to your PS5 with `elfldr`, or launch it from Payload Manager.
3. The installer opens the browser to cache the autoloader page (choose a chain if prompted; on 1.00&ndash;5.50 umtx2 is picked for you), creates the **WebKit Autoloader** app on the homescreen, and exits.
4. **Reboot once**, then launch **WebKit Autoloader** from the homescreen.

### Not jailbroken yet

If you aren't jailbroken yet, you'll need to host the exploit locally on your PC for the initial setup:

1. Download `webkit-autoloader-host.py` (or the `.exe`) from the [Releases](https://github.com/pinkythegawd/ps5-webkit-autoloader/releases) and run it on a PC on your network.
2. On your PS5, set your network's DNS server to your PC's IP address.
3. Open the **User's Guide** from Settings — the host routes your firmware to the right chain automatically and installs the **WebKit Autoloader** app on the homescreen.
4. **Reboot once**, then launch **WebKit Autoloader** from the homescreen.

## How to Use

There are two ways to configure payloads:

### 🟢 Option 1: Payload Manager

If no `autoload.txt` config is found, the autoloader will automatically launch **[Payload Manager](https://github.com/itsPLK/ps5-payload-manager)** — a fully-featured PS5 payload manager with a web UI. This lets you configure and send payloads directly from your browser, without needing to manually set up config files or transfer ELF files ahead of time.

Just run the autoloader — if there's nothing configured, Payload Manager starts automatically.

> **Note:** Payload Manager also has its own built-in autoload feature, which lets you configure payloads to load automatically on startup — all managed through its web UI. This is separate from the `autoload.txt` mechanism described below.

---

### ⚙️ Option 2: Manual Config (`autoload.txt`)

For a fixed, automated payload chain, you can configure payloads manually:

- Create a directory named `ps5_autoloader`.
- Inside this directory, place your `.elf` / `.bin` files, and an `autoload.txt` file.
  - In `autoload.txt`, list the files you want to load, one filename per line.
  - Filenames are case-sensitive — ensure each name exactly matches the file.
  - You can add lines like `!1000` to make the loader wait 1000 ms before sending the next payload.
- Put the `ps5_autoloader` directory in one of these locations (priority order - highest first):
  - Root of a USB drive
  - Internal drive: `/data/ps5_autoloader`

> **Note:** When an `autoload.txt` config is found, Payload Manager is **not** launched automatically. If you also want Payload Manager available, place `pldmgr.elf` in your `ps5_autoloader` directory and add it to `autoload.txt`.

## Additional Info

<details>
<summary><i>How to update the autoloader?</i></summary>

The autoloader content is cached on the console, so updating is exactly the same as the initial install. Simply follow the **[Setup Instructions](#setup-instructions)** using the new release files.

The latest installer payload will re-create the homescreen app and refresh the cached page for you. Your payloads and `autoload.txt` on USB / internal storage are never touched.
</details>

<details>
<summary><i>How to use a custom ELF Loader?</i></summary>

The autoloader uses a custom version of **elfldr** that only accepts connections from the PS5 itself (localhost). This improves security by preventing unauthorized devices on your network from sending payloads to your console.

If you want to use a "normal" ELF Loader that allows sending payloads from any device, you can simply load it through **Payload Manager**.

Alternatively, if you are using a manual config file (`autoload.txt`):
1. Place your custom ELF Loader (e.g. `elfldr.elf`) in the `ps5_autoloader` directory.
2. Add `elfldr.elf` to your `autoload.txt`.
3. **Note**: If you are loading other payloads right after `elfldr.elf` in your `autoload.txt`, add a sleep command immediately after it (like `!4000` to sleep for 4 seconds) to give the new ELF Loader time to start up and listen before subsequent payloads are sent.

Example `autoload.txt`:
```text
# Load custom ELF Loader
elfldr.elf
# Give it 4 seconds to start up (only needed if sending more payloads)
!4000
# Send other payloads
etaHEN.elf
```
</details>

---

## For developers

If you want to create or test your own WebKit payloads, check out [ps5-webkit-remote-loader](https://github.com/itsPLK/ps5-webkit-remote-loader), which this project is based on. It lets you send and run JavaScript payloads directly over the network on port 9027.

Build both release artifacts with `./build_release.sh` (Docker required). Run `make test`
for the offline checks (payloads, installer, exploit-selection flow, umtx2 patch and host
router), `make umtx2-prepare` to (re)generate the umtx2 chain after a submodule update,
`make dev` for a local page preview of every chain, and `make host` to build the PC setup
host. See [ARCHITECTURE.md](ARCHITECTURE.md) for the build and cache layout, and
[pc-host/README.md](pc-host/README.md) for the host's options.

## Credits

This fork stands on the shoulders of a lot of people:

* **[itsPLK](https://github.com/itsPLK)** — [ps5-webkit-autoloader](https://github.com/itsPLK/ps5-webkit-autoloader), the unified architecture this fork extends, plus [ps5-elfldr](https://github.com/itsPLK/ps5-elfldr) and [ps5-unified-autoloader](https://github.com/itsPLK/ps5-unified-autoloader)
* **[idlesauce](https://github.com/idlesauce)** & contributors — [umtx2](https://github.com/idlesauce/umtx2), the FW 1.00&ndash;5.50 chain restored by this fork, building on **[abc](https://github.com/abc)**'s [PSFree](https://github.com/abc/psfree) and the psfree-lapse team's work
* **[shahrilnet](https://github.com/shahrilnet)** & **[n0llptr](https://github.com/n0llptr)** — the original umtx kernel exploit research
* **[jordyidk](https://github.com/jordyidk)** & contributors — [slopkit (Poops)](https://github.com/jordyidk/slopkit)
* **[soniciso1](https://github.com/soniciso1)**, **[ntfargo](https://github.com/ntfargo)** & contributors — [Relapse](https://github.com/soniciso1/relapse)
* **[john-tornblom](https://github.com/john-tornblom)** — [ps5-payload-sdk](https://github.com/ps5-payload-dev/sdk/) and [elfldr](https://github.com/ps5-payload-dev/elfldr)
* **[SpecterDev](https://github.com/Cryptogenic)**, **[ChendoChap](https://github.com/ChendoChap)**, **[SlidyBat](https://github.com/SlidyBat)**, **[flat_z](https://github.com/flatz)**, **[SocraticBliss](https://github.com/SocraticBliss)**, **[zecoxao](https://github.com/notnotzecoxao)** and everyone in the PS5 R&D Discord whose kernel research and offsets the chains rely on
* See [ps5-webkit-remote-loader](https://github.com/itsPLK/ps5-webkit-remote-loader) for runtime and toolchain credits.

## Disclaimer

This tool is provided as-is for research and development purposes only. Use at your own risk. The developers are not responsible for any damage, data loss, or consequences resulting from the use of this software.

## License

This project is licensed under the GPL-3.0 License — see [LICENSE](LICENSE). It is a fork
of [itsPLK/ps5-webkit-autoloader](https://github.com/itsPLK/ps5-webkit-autoloader), and
all upstream credits apply.
