# Contributing

Contributions that make `geoptimize` more reproducible, explainable, or easier to adopt are welcome.

## Development setup

Use Node.js 22.12 or newer. Node 24 LTS is the recommended development version.

```bash
npm ci
npm run check
npm pack --dry-run
npm audit --audit-level=high
```

Do not commit `node_modules`, `dist`, package tarballs, credentials, or reports containing private URLs.

## First contributions

Start from an issue labeled `good first issue`. Comment on the issue before opening a pull request if the scope is unclear.

For scoring-rule work, follow [docs/methodology.md](docs/methodology.md): every rule change needs an evidence class plus positive, negative, and false-positive fixtures. Pull requests that claim ranking, citation, or AI-visibility outcomes will not be merged.

## Pull requests

Keep each pull request focused. Include:

- the problem and user workflow;
- tests or fixtures that fail before the change and pass after it;
- JSON/output compatibility notes;
- documentation updates for user-visible behavior;
- the source and evidence class for any scoring-rule change.

Rule proposals must follow [docs/methodology.md](docs/methodology.md). Unsupported ranking, citation, adoption, or performance claims will not be accepted. Do not add fabricated statistics to examples or fixtures.

## Commit and review expectations

- Run `npm run check`, `npm pack --dry-run`, and `npm audit --audit-level=high`.
- Preserve deterministic output unless the pull request explicitly versions the methodology change.
- Treat generated JSON-LD and crawler policy as reviewable candidates, never universal defaults.
- Add a changelog entry for behavior, compatibility, security, or methodology changes.

Opening an issue before a large change is recommended so scope and compatibility can be agreed first.
