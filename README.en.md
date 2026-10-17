# DeepSeek Harness Chat Switcher

English · [中文](README.md)

A Windows Harness plugin with a single Work / Chat dropdown, icons, descriptions and a selected-mode checkmark.

It uses the official Cordis plugin lifecycle and can be enabled or disabled in the sidebar Plugins page. **A companion desktop bridge modifying `app.asar` is required for embedded persistent chat.** If an app update removes that bridge, the plugin offers a browser fallback instead of rejecting workspace boot. This community repository distributes source, never the original or modified application archive.

## Features and compatibility

- Dropdown mode selection and Ctrl+Shift+1 / Ctrl+Shift+2 shortcuts.
- Persistent embedded DeepSeek web chat, separate from work authorization and external browsers.
- Hidden preload 750ms after the visible workspace settles, without stealing focus or sending messages.
- Disabling the plugin hides the selector, returns to Work and restores chat throttling; enabling retains the chat renderer.
- Official work PKCE authorization in a separate session, compatibility guards, backup and checksum-protected restoration.

Chat does not invoke the Harness API. The website has its own limits; model processing still uses tokens. Switching does not stop active work tasks.

The desktop bridge accepts the tested Windows desktop builds `0.2.0-rc.2` and `0.2.1-rc.2`. See [compatibility.json](compatibility.json). macOS/Linux are unsupported. App updates may replace the bridge; never restore an old backup over a newer application. Restore the previous project version before upgrading its bridge.

## Install

Use Node.js 20+ and a compatible Harness. No npm dependencies or installation scripts are needed. Extract or clone the source and keep that directory, since local plugin installation uses a link. Exit Harness completely from the system tray, then run in the source directory:

```powershell
node scripts/patch.mjs --app-dir "D:\Apps\DeepSeek Harness" --dry-run
node scripts/patch.mjs --app-dir "D:\Apps\DeepSeek Harness"
$pluginDirectory = (Get-Location).Path.Replace('\', '/')
& "D:\Apps\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "link:$pluginDirectory"
```

Replace the application path. A configured `dsh` command can also register the package. Dry run makes no changes. Installation stores `app.asar.chat-switcher.backup` and `app.asar.chat-switcher.json` beside the archive. Never publish these files. Previously patched installations must first restore the original archive of the same supported build.

Start Harness. Use the top Work dropdown to select Chat. Manage the switch under **sidebar Plugins → Installed → deepseek-harness-chat-switcher**. The Settings plugin list is mainly informational.

The bundle patch inserts a `chat-modes` Loader entry; its client activates the desktop presentation and disposes it when disabled. The bridge is exposed only to the trusted main workspace. The chat website receives neither Electron APIs nor the Harness preload.

## Login and performance

Chat uses `persist:dsh-web-chat`; work authorization uses `persist:dsh-work-login` and the existing official grant handling. External-browser login does not synchronize. Isolation cannot bypass server-side expiry or revocation.

Preload contacts the website early and uses an additional renderer. Background throttling is disabled while the plugin is enabled and restored when disabled. Website/network latency can still affect readiness. Plugin toggles retain cookies and work data. Full Google/Apple identity-provider return flows have not been qualified.

## Remove, restore and test

To hide the feature, disable it in Plugins. To fully remove it, uninstall the package there, exit Harness, then restore the bridge:

```powershell
node scripts/restore.mjs --app-dir "D:\Apps\DeepSeek Harness"
npm test
```

Restoration checks both archives and refuses to overwrite subsequent app updates. It does not delete account or work data. Tests cover archive integrity, backup/restore guards, plugin registration/lifecycle, IPC origins, dropdown layout, session isolation, authorization callback scope, preload and keyboard switching. Tests do not authenticate users or send model requests.

[MIT](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [SECURITY.md](SECURITY.md). Redact credentials, account information, authorization URLs, cookies and logs from issues.

## Update resilience

Missing, incompatible or rejected bridge APIs no longer fail plugin boot or teardown. A Work / Chat dropdown opens official chat in the system browser when embedded chat is unavailable. Browser cookies remain separate from embedded chat. The native patcher still refuses unknown builds; see the exact version and commit pairs in compatibility.json. Future changes to the module loader or plugin system may still require adaptation; compatibility with every future release is not guaranteed.
