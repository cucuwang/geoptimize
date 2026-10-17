# Verified upstream Action pins

Resolved through official GitHub repositories on 2026-09-13. Annotated tag objects
were dereferenced to commits; tag-object SHAs are not used as Action pins.

CodeQL was updated to v4.38.1 on 2026-10-17 after checking its upstream tag
and [official release notes](https://github.com/github/codeql-action/releases/tag/v4.38.1).

| Action | Upstream tag | Full commit |
| --- | --- | --- |
| actions/checkout | v7.0.1 | 3d3c42e5aac5ba805825da76410c181273ba90b1 |
| actions/setup-node | v7.0.0 | 820762786026740c76f36085b0efc47a31fe5020 |
| actions/upload-artifact | v7.0.1 | 043fb46d1a93c77aae656e7c1c64a875d1fc6a0a |
| actions/download-artifact | v8.0.1 | 3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c |
| actions/dependency-review-action | v5.0.0 | a1d282b36b6f3519aa1f3fc636f609c47dddb294 |
| github/codeql-action | v4.38.1 | 1c5b675653bb5c22dbe9b12b556ec555138e09fd |
| ossf/scorecard-action | v2.4.4 | 2d1146689b8cda280b9bc96326124645441f03bc |
| actions/attest-build-provenance | v4.2.2 | 4d101475d8b20a2381f78447822ac1eab6504dd8 |

Recheck with `GET /repos/{owner}/{repo}/git/ref/tags/{tag}`. When object.type is
`tag`, follow object.url until object.type is `commit`. Cross-check the official
release notes before accepting a Dependabot update. A mutable major tag is only the
lookup source; the workflow itself always executes the recorded full commit.

Permissions: ordinary CI/readme/contracts/release validation use contents:read.
CodeQL adds security-events:write. Scorecard adds security-events:write and
id-token:write for public result publication. Only the gated publication job adds
contents:write (draft/assets/finalization), id-token:write (OIDC) and
attestations:write. Checkout never persists credentials. No pull_request_target or
write-token job executes PR code.
