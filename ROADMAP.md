# Roadmap

## v0.6 — Evidence Release

The release goal is a trustworthy CI lint contract, not additional GEO claims.

Release gates:

- current repository identity across npm, README, Action, and Claude plugin metadata;
- green CI on supported Node.js LTS releases;
- zero high or critical npm audit findings at release time;
- versioned methodology with evidence classes and explicit non-goals;
- public positive, negative, and false-positive fixtures for every scored rule;
- root GitHub Action metadata and an end-to-end sample repository;
- stable JSON output, changelog, release notes, and rollback instructions.

The code-level gates are enforced by `npm run release:check`, `src/core/__tests__/release-contract.test.ts`, the versioned corpus in `fixtures/v0.6/`, and the local composite Action contract. CI compares real Node.js 22 and 24 package manifests and hashes. Repository rulesets and the release runbook remain separate maintainer controls.

## Product validation after v0.6

- Validate one core workflow: static site or documentation CI content-readiness lint.
- Obtain three independently controlled public adoption examples.
- Triage external issues and document support boundaries before adding framework breadth.
- Measure technical outcomes such as a caught `noindex` regression or schema/content mismatch. Keep ranking and citation outcomes separate.

## Not planned without new evidence

- claiming that a readiness score predicts search position or AI citation;
- awarding points for `llms.txt`, FAQ count, schema count, or a fixed meta-description length;
- automatic deployment of generated JSON-LD or crawler policy;
- adding more AI scorers and calling their average consensus.
