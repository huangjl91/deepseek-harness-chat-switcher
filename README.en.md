# DeepSeek Harness Chat Switcher

English · [中文](README.md)

An unofficial Windows patch that adds work/chat switching to DeepSeek Harness and opens work authorization in a separate browser session.

## Features

- Work/chat buttons and `Ctrl+Shift+1` / `Ctrl+Shift+2` shortcuts.
- Embedded [DeepSeek web chat](https://chat.deepseek.com/) without invoking the Harness API.
- Persistent, separate chat and work-authorization cookies; external browsers remain independent.
- Windows titlebar hit-test fix for actual mouse clicks.
- Compatibility checks, backup, dry run and checksum-protected restoration.

Switching to chat does not stop active work tasks. The website's limits and terms still apply; this feature does not make model processing tokenless.

## Compatibility

Only the tested Windows desktop build `0.2.0-rc.2`, commit `04f392c9ddd144fa426da2045178797da6db6c11`, is accepted. See [compatibility.json](compatibility.json).
Updates can overwrite this patch. The installer rejects unknown builds instead of silently modifying them. macOS/Linux support is not implemented.

## Install

Install a compatible Harness build and Node.js 20+. No npm dependencies are needed.
Download and extract the source, or clone this repository. Exit Harness completely through its system tray before proceeding.

```powershell
node scripts/patch.mjs --app-dir "D:\Apps\DeepSeek Harness" --dry-run
node scripts/patch.mjs --app-dir "D:\Apps\DeepSeek Harness"
```

Replace the example path. Dry run makes no changes. Installation creates a backup and a checksum manifest beside `resources/app.asar`; never publish these files.
If the application was already manually patched, restore the original backup of the same supported build first. Do not restore an old backup over an updated application.

## Login behavior

Chat uses `persist:dsh-web-chat`; work authorization uses `persist:dsh-work-login` and preserves the official PKCE callback and grant handling.
External-browser login does not synchronize into the embedded views. Session isolation does not bypass server-side authorization expiry, revocation or account rules. An expired work grant still requires official sign-in.

Manual official work authorization and web-chat login have been tested on Windows. Full Google/Apple identity-provider return flows have not been qualified.

## Restore and test

After fully exiting the application:

```powershell
node scripts/restore.mjs --app-dir "D:\Apps\DeepSeek Harness"
npm test
```

Restore refuses to overwrite a subsequent application update or use a damaged backup. Account and work data are not deleted.

Tests cover archive integrity, compatibility guards, backup/restoration, changed-build protection, cookie isolation, authorization callback scope and view lifecycle. No tests authenticate a user or send model requests.

The repository contains only patch source, not the original application, patched binaries, logos, cookies, credentials or user logs.

## License

[MIT](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for upstream attribution.
Please redact account information, tokens, authorization URLs and logs from issues. See [SECURITY.md](SECURITY.md).
