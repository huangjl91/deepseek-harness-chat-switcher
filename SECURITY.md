# Security

The embedded chat and work-authorization pages have no Node.js integration and no Harness preload bridge. Each has a separate persistent browser session. The work callback only allows the initiating local host's `/oauth/callback` path; the original backend continues validating state and PKCE.

The companion desktop bridge exposes only plugin activation and deactivation to the trusted `dsh-app://app/` main frame. Main-process IPC checks both the exact workspace webContents and its main frame. Remote websites and subframes receive no plugin bridge. Toolbar commands are accepted only from the local toolbar's main frame. Install and enable only plugin code you trust, as ordinary Harness plugins share the trusted host and workspace environment.

Do not include credentials, account identifiers, cookies, tokens, authorization links, complete logs or application archives in public issues.

For vulnerabilities involving this patch, use GitHub's private vulnerability reporting on this repository if enabled. If it is unavailable, open a minimal issue asking for a private reporting channel without exploit details or sensitive data.

For issues in the underlying DeepSeek application or website, use its official reporting channel. This repository cannot change server-side login policies.
