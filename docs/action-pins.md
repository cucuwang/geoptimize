# Verified upstream Action pins

Resolved through official GitHub repositories on 2026-09-09. Annotated tag objects
were dereferenced to commits; tag-object SHAs are not used as Action pins.

| Action | Upstream tag | Full commit |
| --- | --- | --- |
| actions/checkout | v4.3.0 | 08eba0b27e820071cde6df949e0beb9ba4906955 |
| actions/setup-node | v4.4.0 | 49933ea5288caeca8642d1e84afbd3f7d6820020 |
| actions/upload-artifact | v4.6.2 | ea165f8d65b6e75b540449e92b4886f43607fa02 |
| actions/download-artifact | v4.3.0 | d3f86a106a0bac45b974a628896c90dbdf5c8093 |
| actions/dependency-review-action | v5.0.0 | a1d282b36b6f3519aa1f3fc636f609c47dddb294 |
| github/codeql-action | v3, resolved on assessment date | 6f5948dfacef28e207b48d0905cf90c03365536d |
| ossf/scorecard-action | v2.4.3 | 4eaacf0543bb3f2c246792bd56e8cdeffafb205a |
| actions/attest-build-provenance | v3, resolved on assessment date | 977bb373ede98d70efdf65b84cb5f73e068dcc2a |

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
