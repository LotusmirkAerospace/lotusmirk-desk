# Contributing to Desk

Desk is free software. Issues and pull requests are welcome.

## Setup

You need Node.js 22 or newer.

```bash
git clone https://github.com/LotusmirkAerospace/lotusmirk-desk.git
cd lotusmirk-desk
npm install
npm run dev
```

## Checks

```bash
npm run lint
npm test
npm run typecheck
```

`npm test` skips the live network install. To install `is-odd` in a temporary sandbox as well:

```bash
DESK_LIVE=1 npm run test:live
```

## Pull requests

Keep a change focused. The UI in `src/renderer` should not import `src/core` or `src/adapters`. New connector or package behavior belongs in an adapter. See the README for the two adapter interfaces.

Do not commit secrets, access tokens, personal contact details, or paths from your machine. Credentials in the app belong in the OS keychain, and tests should use the in-memory secret store.

## Adapters

- Connection checks implement `ConnectionAdapter` and are registered in `src/adapters/connection/index.ts`.
- Package sources implement `RepoSourceAdapter` and are registered in `src/adapters/repo/index.ts`.
- Set `implemented: false` if the adapter should appear in the list before it can run.

## Conduct

This project uses the [Contributor Covenant](CODE_OF_CONDUCT.md). Report security issues privately, as described in [SECURITY.md](SECURITY.md).
