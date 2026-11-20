# Changelog

All notable changes to Desk are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-20

First public release of the Desk skeleton.

- Local desktop shell for Windows, macOS, and Linux, with a tray icon and an optional login start.
- First-run setup for an app name, accent colour, and logo.
- Connection health checks for HTTP endpoints, local processes, and generic MCP servers, with reconnect and an alert log.
- Process reconnect waits until the program is running, so a slow start is not marked down.
- Markdown hub: a Google Drive folder link or a local folder, plus `DESK.md` instructions other assistants can read.
- Webhook alerts, with an optional authorization header stored in the OS keychain and a test button.
- Sandbox installs and smoke tests for npm and pip packages, with a registry, in-use flag, uninstall, and rollback.
- Git package installs are listed and not implemented yet.

[0.1.0]: https://github.com/LotusmirkAerospace/lotusmirk-desk/releases/tag/v0.1.0
