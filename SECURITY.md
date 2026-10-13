# Security

The embedded chat and work-authorization pages have no Node.js integration and no Harness preload bridge. Each has a separate persistent browser session. The work callback only allows the initiating local host's `/oauth/callback` path; the original backend continues validating state and PKCE.

Do not include credentials, account identifiers, cookies, tokens, authorization links, complete logs or application archives in public issues.

For vulnerabilities involving this patch, use GitHub's private vulnerability reporting on this repository if enabled. If it is unavailable, open a minimal issue asking for a private reporting channel without exploit details or sensitive data.

For issues in the underlying DeepSeek application or website, use its official reporting channel. This repository cannot change server-side login policies.
