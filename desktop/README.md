# SLVP Admin — desktop app

A Windows app (Electron) that opens the deployed admin portal in its own window. The portal itself
isn't bundled: it runs on Cloudflare (server routes for AI, the photo editor, …), so the app loads
it from its URL, and sign-in works the same as in the browser.

- Portal pages and sign-in providers (Supabase, Google, Microsoft) open in the app. Other links open
  in the default browser.
- The election QR viewer (`/elections/<id>/qr`) opens in its own full-screen window. Esc leaves
  full screen and F11 toggles it.
- It remembers its window size and position, runs as a single instance, and shows a retry page when
  the portal can't be reached.
- It updates itself from `<admin>/api/desktop/` (checks at start and every 4 hours).
- The portal's **Account → Desktop app** page (profile menu → Desktop app) has the download. Inside
  the app, that page shows the installed version and a "Check for updates" button
  (`window.slvpDesktop`, from [src/preload.js](src/preload.js)).

## Development

```bash
npm install
npm start                                   # opens http://localhost:3000 (package.json → slvp.adminUrl)
SLVP_ADMIN_URL=http://localhost:3123 npm start   # another address (development only)
```

If `npm start` fails with `Cannot read properties of undefined (reading 'getVersion')`, your shell
has `ELECTRON_RUN_AS_NODE=1` set (some editor terminals set it). Unset it first.

## Building

```bash
SLVP_ADMIN_URL=https://<admin portal origin> npm run dist   # dist/SLVP-Admin-Setup-<version>.exe + latest.yml
```

`SLVP_ADMIN_URL` is required. It is baked into the app and is also the base of the update feed.

## Publishing (CI)

[.github/workflows/build-desktop.yml](../.github/workflows/build-desktop.yml) runs on pushes to
`main` that touch `desktop/`, or by hand (Actions → Build desktop app → Run workflow). It builds on
a Windows runner, sets the version to `<major>.<minor>.<run number>`, and uploads the installer and
then `latest.yml` to the R2 bucket `slvp-desktop`. Then it deletes the previous installer, so the
bucket only ever holds one build (~120 MB, well inside R2's free 10 GB; downloads from R2 are free).
The admin Worker serves the bucket (binding `DESKTOP_RELEASES`) at:

| Route                       | What                                                        |
| --------------------------- | ----------------------------------------------------------- |
| `/api/desktop/latest`       | JSON: version, file name, size, date (the download page)    |
| `/api/desktop/download`     | Redirects to the newest installer                           |
| `/api/desktop/<file>`       | `latest.yml` or `SLVP-Admin-Setup-<version>.exe` (updater) |

One-time setup:

1. Create the bucket: `npx wrangler r2 bucket create slvp-desktop`. Do this **before** the next
   admin deploy, because `admin/wrangler.jsonc` binds it.
2. Add the repository variable `DESKTOP_ADMIN_URL`, the admin portal's origin
   (`https://slvp-admin.kape-dev.space`).
3. Give the `CLOUDFLARE_API_TOKEN` secret the **Workers R2 Storage: Edit** permission.

The installer isn't code-signed, so Windows SmartScreen warns on first run (More info → Run anyway).
Adding a certificate (`win.signtoolOptions` / `CSC_LINK`) removes that warning.
