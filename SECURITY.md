# Security policy

Desk runs on your computer. It stores settings locally, keeps credentials in the operating system keychain, and does not require an account.

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/LotusmirkAerospace/lotusmirk-desk/security/advisories/new).

Do not open a public issue for a security report, and do not include tokens, webhook URLs, or keychain contents in an example.

## What to expect

A maintainer will acknowledge a report and follow up on GitHub. If the report is accepted, the fix will be released and credited in the changelog unless you ask not to be named.

## Scope

In scope: the Desk app, its local API bound to 127.0.0.1, sandbox installs, and how credentials are stored.

Out of scope: the third-party MCP servers, packages, or webhooks you choose to connect. Desk does not operate those services.
