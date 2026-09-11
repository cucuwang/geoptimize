# Code scanning remediation plan

Assessment date: 2026-09-11. Repository: `cucuwang/geoptimize`. Baseline commit:
`e4580129e746110cdacf3b4644757c9575c56a93`. The latest readback still reports all
13 alerts open on `main`. This file records the work required to make each result
reviewable; it does not claim that an alert is closed.

## Evidence boundary

The public Scorecard result for this commit was produced at 2026-09-11 06:28:05Z
with Scorecard v5.3.0 and score 6.5. The pinned
[`ossf/scorecard-action` v2.4.3 `go.mod`](https://github.com/ossf/scorecard-action/blob/v2.4.3/go.mod)
requires Scorecard v5.3.0. The current Scorecard result is available from the
[official result API](https://api.securityscorecards.dev/projects/github.com/cucuwang/geoptimize).

The CodeQL 2.27.0 baseline reproduced four findings at the original locations:
two `js/polynomial-redos` findings in `src/core/ai-prompt.ts:3` and
`src/core/site-audit.ts:93`, and two `js/bad-tag-filter` findings in
`src/core/__tests__/visual-report.test.ts:35` and `:97`. Local worker changes are
not public alert closure. A workflow success, local scan, or agent review does not
replace the final GitHub code-scanning readback.

Status in this plan uses these meanings:

- `Local planned / worker`: a local change or verification is assigned in the
  current worktree. It has not become public evidence.
- `Remote awaiting authorization`: applying a GitHub setting, creating external
  attestations, or rerunning a historical workflow needs explicit remote
  authorization. Read-only result and alert readback remains available for review.
- `Observed`: a value read from the current public result or the repository
  administration evidence. It is retained as a baseline, not upgraded to a fix.

## Per-alert plan

| # | Alert and observed baseline | Local status / owner | Exact acceptance and readback | Rollback |
| --- | --- | --- | --- | --- |
| 1 | **Branch-Protection**: Scorecard 4. Warnings are stale-review dismissal off, zero required approvers, CODEOWNERS review off, and last-push approval off on `main`. A fresh release readback shows all 10 current GitHub Releases target `main`, so the current Scorecard default/release set is `main`. | Local plan by Luna. No GitHub mutation. | After reviewer identities are confirmed, change only the four pull-request review fields on `main-required-checks` and read every current default/release target. The proposed full target is the rule field set below, followed by a Scorecard v5.3.0 result of 10 with no Branch-Protection warnings. Re-evaluate if a future release targets a branch. | Save pre-change ruleset/branch JSON. Restore only the previous field values if the rule causes a merge or release problem. Keep `protect-main`, its maintenance-branch coverage, and protected release tags. |
| 2 | **Pinned-Dependencies**: `npmCommand` warning at `scripts/verify-release-candidate.sh:94`; current check score 7. | Implemented and locally verified. Pinned-Dependencies 10; Node 22/24 release gates passed. | The clean consumer must install the verified tarball from a generated lockfile, retain SHA-256/SHA-512 and package-contract checks, and pass `npm run release:check`. Local and next main Scorecard v5.3.0 results must show no `npmCommand not pinned by hash` warning for this path. | Revert only the helper and its named call site using the worker diff; retain the verified tarball and checksums. |
| 3 | **Pinned-Dependencies**: `npmCommand` warning at `scripts/verify-release-v0.6.sh:128`; current check score 7. | Implemented and locally verified. Pinned-Dependencies 10; Node 22/24 release gates passed. | Run the v0.6 verifier against its existing expected artifact path and check the final Scorecard result for zero unpinned npm commands. Do not weaken the version, digest, or public-package checks. | Restore only the v0.6 call-site/helper pair and keep its prior verification gates. |
| 4 | **Pinned-Dependencies**: `npmCommand` warning at `scripts/verify-release-v0.8.sh:128`; current check score 7. | Implemented and locally verified. Pinned-Dependencies 10; Node 22/24 release gates passed. | Run the v0.8 verifier against its existing expected artifact path and check the final Scorecard result for zero unpinned npm commands. | Restore only the v0.8 call-site/helper pair and keep its prior verification gates. |
| 5 | **Code-Review**: Scorecard found `0/19` approved changesets. | Remote awaiting authorization and a real independent human reviewer. Root/Luna review cannot manufacture the historical approvals. | For each sampled human changeset, require an actual GitHub `APPROVED` review by a human whose login differs from the author. Scorecard also recognizes a non-author merger in its detector, but that source behavior does not fabricate the requested historical approvals. Read the review records and then a new Scorecard v5.3.0 result. A branch rule alone cannot rewrite the historical 0/19 window. | Never delete or synthesize review records. If a branch rule is staged and causes deadlock, restore its prior approval count while retaining the review audit. |
| 6 | **Security-Policy**: Scorecard 4 because `SECURITY.md` was detected but had no linked content. | Implemented and locally verified. Security-Policy 10; post-merge readback pending. | The file now states that private vulnerability reporting is enabled and links directly to `https://github.com/cucuwang/geoptimize/security/advisories/new`; scope and seven-day acknowledgement target remain. The fresh repository API readback is `enabled: true`. After merge, read a Scorecard result containing `Found linked content` and no Security-Policy warning. | Restore the previous text only through a reviewed file diff if required. Do not create a public exploit-report fallback or change the remote reporting setting here. |
| 7 | **CII-Best-Practices**: Scorecard 0, no badge detected. | Local planned / gap document updated. External registration and attestations are remote awaiting authorization. | A maintainer registers the canonical URL `https://github.com/cucuwang/geoptimize`, completes the actual Passing questionnaire, and supplies human attestations for `know_secure_design` and `know_common_errors`. v5.3.0 maps InProgress to 2, Passing to 5, Silver to 7, and Gold to 10. This workflow supplies no custom policy, so the pinned v2.4.3 default policy's per-check threshold is 5. Read the effective SARIF policy, confirm a public Passing-or-higher project status, and confirm no `CIIBestPracticesID` result for the same commit before adding a badge. | Keep the badge absent while registration or review is incomplete. If a public badge is later found to be unearned or stale, remove only that badge and correct the questionnaire evidence; do not fabricate a status. |
| 8 | **SAST**: Scorecard 7; 8 of 23 sampled PR heads had an accepted SAST check. | Local planned / existing CodeQL workflow retained unchanged. No complex arbitrary-code workflow. | For every sampled merged PR, read check runs for the exact PR `HeadSHA`; accept only completed runs with conclusion `success` or `neutral` and app slug `github-code-scanning` or `github-advanced-security`. A new Scorecard v5.3.0 result must report all sampled commits checked. Main-only rescans do not backfill old PR heads. Historical backfill is valid only when GitHub can rerun that exact retained PR head and the resulting check run is read back. Otherwise allow the normal future window to converge. | Keep the current workflow and action pins. If a workflow edit is later authorized and fails, restore the last known-good workflow without changing unrelated workflows. |
| 9 | **Fuzzing**: Scorecard 0, no fuzzer integration detected. | Implemented and locally verified. Fuzzing 10; standard and extended property tests passed. | The TypeScript test imports `fast-check` and exercises bounded parser/report properties. Run `npm test`, `npm run test:fuzz`, and `npm run build`; local Scorecard v5.3.0 must detect the TypeScript property-based integration, then a later main result must report `project is fuzzed`. Property tests alone do not prove the remote result. | Revert only the worker's test and dev-dependency changes if they fail review; preserve unrelated tests and source fixes. |
| 10 | **CodeQL `js/polynomial-redos`** at `src/core/ai-prompt.ts:3`; input was the HTML tag-stripping regexp. | Implemented and locally verified. Final CodeQL scan returned zero findings. | The final code must use linear tag scanning with the existing 8,000-character excerpt limit and equivalent prompt output. Targeted tests and CodeQL 2.27.0 on the final commit must show no finding for this query/path. | Restore only the `ai-prompt.ts` change from its precise diff if behavior regresses. |
| 11 | **CodeQL `js/polynomial-redos`** at `src/core/site-audit.ts:93`; input was the robots comment regexp. | Implemented and locally verified. Final CodeQL scan returned zero findings. | The final parser must retain directive and sitemap semantics while avoiding the flagged regexp. Targeted robots tests and CodeQL 2.27.0 on the final commit must show no finding for this query/path. | Restore only the `site-audit.ts` change from its precise diff if behavior regresses. |
| 12 | **CodeQL `js/bad-tag-filter`** at `src/core/__tests__/visual-report.test.ts:35`; assertion parsed generated HTML with a case-sensitive tag regexp. | Implemented and locally verified. Final CodeQL scan returned zero findings. | Parse the rendered report as a DOM and assert text and executable-node invariants through Cheerio. The visual-report tests must pass and CodeQL 2.27.0 must return no finding at the final path. | Restore only the affected assertion block from its precise diff; retain the production renderer and unrelated tests. |
| 13 | **CodeQL `js/bad-tag-filter`** at `src/core/__tests__/visual-report.test.ts:97`; same assertion risk in interactive details. | Implemented and locally verified. Final CodeQL scan returned zero findings. | Apply the same DOM-based assertion discipline to the interactive report case, then read back a clean CodeQL result for the final path. | Restore only the affected assertion block from its precise diff. |

## Branch-Protection full-score target

The v5.3.0 evaluator uses a tiered score. One approving reviewer reaches only the
review prerequisite; the full score requires at least two approving reviewers,
review from code owners, last-push approval, stale-review dismissal, administrator
enforcement, up-to-date branches, required status checks, pull requests for code
changes, and deletion/force-push protection. See the official
[branch-protection evaluator](https://github.com/ossf/scorecard/blob/v5.3.0/checks/evaluation/branch_protection.go)
and [raw branch collection](https://github.com/ossf/scorecard/blob/v5.3.0/checks/raw/branch_protection.go).

The current `main-required-checks` ruleset (ID `22637595`) is Active, applies to the
default branch, has zero bypass actors, requires pull requests, resolved conversations
and up-to-date branches, and currently has required approving reviews `0`, stale-review
dismissal `false`, CODEOWNERS review `false`, and last-push approval `false`. Its eight
required contexts are:

```text
test-and-build (22)
test-and-build (24)
release-candidate-reproducibility
lint-readme-commands
action-contract
dependency-review
CodeQL (javascript-typescript)
CodeQL (actions)
```

The exact remote proposal is:

| Rule field | Full-score target | Preserve |
| --- | --- | --- |
| Required approving reviews | `2` | First identify two independent human reviewer accounts. A temporary value of `1` is a practical risk step only after one reviewer is available; it is not the full-score target. |
| Dismiss stale approvals when new commits are pushed | Enabled | Existing pull-request and conversation-resolution requirements. |
| Require review from Code Owners | Enabled | The existing `.github/CODEOWNERS` file; confirm an eligible human owner before enabling. |
| Require approval of the most recent reviewable push | Enabled | Existing branch freshness requirement. |
| Require status checks | Enabled, strict/up to date | All eight contexts above, with their current names and matrix values. |
| Require pull request before changes | Enabled | Existing no-direct-change protection. |
| Bypass actors / administrator bypass | Empty / disabled | Existing no-bypass posture. Do not add an emergency bypass to solve a maintainer deadlock. |

Scorecard v5.3.0 evaluates the default branch and release branches discovered from
repository releases. The current readback enumerated all 10 release targets as `main`,
so changing `main-required-checks` on `main` covers the present Scorecard target set.
The legacy `protect-main` ruleset (ID `22617494`) separately covers
`maintenance/aeoptimize-0.7` and `maintenance/geoptimize-0.8` for deletion and
non-fast-forward protection; preserve that coverage unchanged. Do not extend the
eight main CI contexts to those maintenance branches because the workflows target
`main` and such an extension could deadlock their maintenance work. Re-enumerate
release targets whenever a future release branch is introduced. `protect-release-tags`
for `v*.*.*` also remains unchanged.

There is no reviewer identity in the current evidence. Confirm the people who can
review and the code-owner account first. This avoids putting a single maintainer
behind an approval count or CODEOWNERS requirement that nobody else can satisfy.
If a second independent reviewer cannot be confirmed, keep the full-score target
pending and report the practical one-reviewer posture as partial.

## Detection sources and remote gates

The official v5.3.0 sources define the acceptance conditions used above:

- [Branch-Protection evaluation](https://github.com/ossf/scorecard/blob/v5.3.0/checks/evaluation/branch_protection.go)
  and [raw branch discovery](https://github.com/ossf/scorecard/blob/v5.3.0/checks/raw/branch_protection.go)
  cover default and release branches and the tiered 10-point target.
- [Code-Review raw check](https://github.com/ossf/scorecard/blob/v5.3.0/checks/raw/code_review.go)
  and the [`codeApproved` probe](https://github.com/ossf/scorecard/blob/v5.3.0/probes/codeApproved/impl.go)
  group recent commits into changesets and require an approval by a login different
  from the author; bot-authored changesets are skipped. The GitHub adapter also
  records a non-author merger as an approval, which is detector behavior rather than
  a substitute for the requested independent review evidence.
- [Security-Policy parsing](https://github.com/ossf/scorecard/blob/v5.3.0/checks/raw/security_policy.go)
  and [evaluation](https://github.com/ossf/scorecard/blob/v5.3.0/checks/evaluation/security_policy.go)
  award points for a policy file, reporting text and a URL or email link.
- [CII raw lookup](https://github.com/ossf/scorecard/blob/v5.3.0/checks/raw/cii_best_practices.go)
  asks the Best Practices API for the repository URI; [evaluation](https://github.com/ossf/scorecard/blob/v5.3.0/checks/evaluation/cii_best_practices.go)
  maps InProgress/Passing/Silver/Gold to 2/5/7/10. The pinned action's
  [default policy](https://github.com/ossf/scorecard-action/blob/v2.4.3/policies/template.yml)
  sets the Passing threshold to 5.
- [SAST raw detection](https://github.com/ossf/scorecard/blob/v5.3.0/checks/raw/sast.go)
  calls `ListCheckRunsForRef(pr.HeadSHA)`, accepts completed `success` or `neutral`
  runs and recognizes the relevant CodeQL app slugs. [SAST evaluation](https://github.com/ossf/scorecard/blob/v5.3.0/checks/evaluation/sast.go)
  scores the sampled proportion and gives the all-commits result only at full coverage.
- [Fuzzing detection](https://github.com/ossf/scorecard/blob/v5.3.0/checks/raw/fuzzing.go)
  recognizes the TypeScript `fast-check` import pattern; the [fuzzed probe definition](https://github.com/ossf/scorecard/blob/v5.3.0/probes/fuzzed/def.yml)
  is separate from the SAST check and does not replace this Fuzzing acceptance.
- CodeQL's official help for [`js/polynomial-redos`](https://codeql.github.com/codeql-query-help/javascript/js-polynomial-redos/)
  and [`js/bad-tag-filter`](https://codeql.github.com/codeql-query-help/javascript/js-bad-tag-filter/)
  describes the two query classes addressed by the local workers.

Remote operations remain outside this local plan: changing rulesets, assigning or
inviting reviewers, registering or answering the Best Practices questionnaire,
rerunning retained historical PR workflows, and declaring or dismissing alerts.
After any authorized remote step, read back the exact setting or public result and
retain its timestamp, commit SHA and relevant run or project identifier.

## Local verification and remaining blockers

Code and tests were verified at implementation commit `e555f752da92e29c3e7d3276589bbc8f0098c0b2`.
The scanners used the same versions as the baseline GitHub analyses.

| Check | Baseline | Revised local result |
| --- | --- | --- |
| CodeQL 2.27.0, JavaScript queries 2.4.5 | 4 findings | 0 findings across 87 rules; 47 source files analyzed; no execution errors or warnings |
| Scorecard v5.3.0 Pinned-Dependencies | 7 | 10; all 6 npm commands pinned |
| Scorecard v5.3.0 Security-Policy | 4 | 10; reporting link detected |
| Scorecard v5.3.0 Fuzzing | 0 | 10; TypeScript property tests detected |
| Fresh `npm run check` without pre-existing `dist` | Not recorded for this change | 263 tests across 19 files and TypeScript build passed |
| Extended property tests | Not recorded for this change | 3 properties, 1,000 cases each, seed `1192026`, passed |
| Clean Node 22.23.2 / npm 10.9.8 release gate | Not recorded for this change | Passed |
| Clean Node 24.11.1 / npm 11.19.0 release gate | Not recorded for this change | Passed |

Both release gates ran the complete tests, TypeScript build, Action contract,
zero-vulnerability npm audit, real consumer `npm ci`, all three CLI aliases and
report smoke checks. The resulting tarballs were byte-identical, with 104
files and SHA-256 `6564bbaa28cdf086a179610dfcd95555fe4f24f6a87d7762fe310f2e319128f4`.
The two public verifier scripts are byte-identical; their shared behavior is covered
by the verifier tests, including rejected hashes, failed downloads and symlinked
`TMPDIR`. No public release was created by these checks.

Alerts #2, #3, #4, #6, #9, #10, #11, #12 and #13 have verified local remediation.
Their GitHub closure requires the reviewed changes to reach `main` and the next
CodeQL/Scorecard analyses to be read back. Push, PR creation, merge and repository
setting changes remain separate remote actions.

Alerts #1, #5, #7 and #8 retain the human review, external questionnaire and
historical coverage requirements described above. No reviewer identity has been
selected, no Best Practices claim has been submitted, and repository rules remain
unchanged. Read-only GitHub verification remains authorized.
