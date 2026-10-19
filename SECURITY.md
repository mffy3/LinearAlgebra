# Security

## What this project is

Linear Algebra is a static, client-side learning visualizer. It has:

- no backend, database, accounts, or authentication;
- no runtime dependencies;
- no analytics, telemetry, or network calls from the application;
- no file uploads or audio recording;
- no secrets, API keys, or tokens in the repository.

Because it is static, most classic server vulnerabilities do not apply. The
realistic risk surface is browser-side: unsafe DOM injection, malicious content
in a contributed asset, or a compromised development dependency.

## Supported versions

Security fixes are applied to the current `main` branch. This is a small
project; older snapshots are not separately maintained.

## Reporting a vulnerability

Please do not open a public issue with exploit details. Use the repository's
private security advisory feature, or contact the maintainers privately through
the repository hosting platform.

Include:

- affected page or file;
- steps to reproduce;
- expected and actual behavior;
- browser and version;
- any suggested fix.

Do not include real personal data, credentials, or private keys in a report.

## Out of scope

- Issues that require a modified local build or a compromised browser.
- Social-engineering attempts against maintainers.
- Reports that only demonstrate a missing feature.
- Third-party links; report those to the third party.

## Dependency policy

The application must remain dependency-free at runtime. Development-only tools
must be documented and reviewed before adoption. Do not commit `.env` files,
tokens, passwords, private keys, or local absolute paths.
