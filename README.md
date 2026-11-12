# PM - Guest Room

A modern Windows desktop client for Proxmox VE.

## Install

Run `release/PM-Guest-Room-Setup-1.1.0.exe` (installer with Start Menu and desktop shortcuts), or use `release/PM-Guest-Room-Portable-1.1.0.exe` (runs without installing).

The builds are unsigned, so Windows SmartScreen may warn on first launch. Click **More info → Run anyway**.

### Linux

Extract `release/PM-Guest-Room-1.1.0-linux-x64.tar.gz` and run `./install.sh` inside it. This installs to `~/.local/opt/pm-guest-room`, adds an app-menu entry and a `pm-guest-room` command, and offers to set up Chromium's sandbox helper with sudo (recommended on Ubuntu 24.04+). Run `./install.sh --uninstall` to remove it. You can also start it in place without installing: `./pm-guest-room.sh`.

Saved passwords on Linux use GNOME Keyring or KWallet. Without either, the app still remembers your servers but won't save passwords.

## Connecting

Enter your server's IP (port `8006` by default) with a username and password (realm `pam` for `root`) or an API token. Servers you connect to are saved for next launch. If you tick **Remember credentials**, the password is encrypted with Windows DPAPI. Self-signed certificates are accepted automatically, and TOTP two-factor logins are supported.

Settings are stored in `%APPDATA%\PM - Guest Room\settings.json`.

## Features

- **Datacenter**: health dashboard, resource search, options, storage definitions, scheduled backup jobs (with "run now"), replication, users / groups / API tokens / pools / roles / realms / permissions, HA, cluster firewall, task history and the cluster log
- **Nodes**: summary and performance graphs, a built-in shell, services, network interfaces (create, apply, revert), DNS, hosts, time, a live system log, certificates, updates (with upgrade in a shell), APT repositories, disks (SMART, wipe, GPT, LVM / LVM-thin / ZFS / directory creation), firewall, subscription, and reboot / shutdown / bulk actions
- **VMs**: a graphical noVNC console (Ctrl+Alt+Del, key combos, type text from the clipboard, scaling, fullscreen, pop-out window), a serial console, hardware (memory, CPU, disks with resize and move, CD/DVD, NICs, USB, PCI, EFI, TPM, cloud-init and more, including pending-change display and revert), cloud-init, options, boot order, QEMU monitor, backups and restore, snapshots, firewall and permissions
- **Containers**: an xterm.js console, resources and mount points, network, DNS, options, backups, snapshots, firewall and permissions
- **Storage**: usage graph, content browser, ISO and template upload with progress, download from URL, the CT template catalog, and backup restore
- **Power actions**: start, shutdown, reboot, stop, reset, pause, hibernate, clone, migrate, convert to template, and destroy. Right-click a guest in the tree for quick actions, or double-click it to open its console.
- **Wizards**: Create VM and Create CT
- **Tasks**: a live task panel and per-task log viewer, with toasts that track each task through to completion
- **Live stats**: CPU, memory and disk readings show two decimals; open summary pages poll every second and feed the sidebar and headers, instead of waiting for Proxmox's ~10-second cluster refresh

## Development

```bash
npm install
npm start          # build UI and launch
npm run dev        # rebuild UI on change (run `npx electron .` separately)
npm run dist       # build installer + portable exe into release/
npm run dist:linux-win  # on Windows: build the Linux tar.gz
npm run dist:linux      # on Linux: build AppImage, .deb and tar.gz
python scripts/make-icon.py  # rebuild icons from assets/logo-source.webp
```

Layout: `src/main` is the Electron main process (API client, console websocket relay, settings), and `src/renderer` is the React UI, bundled by esbuild into `dist/`.
