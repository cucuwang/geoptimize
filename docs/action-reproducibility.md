# Action reproducibility decision

Decision: retain the composite Action for this PR; evaluate a bundle separately.
Both Action metadata paths now pin setup-node to an upstream commit. The default
package-spec remains the exact published geoptimize version. No runtime behavior
or package-spec override has been removed.

| Dimension | A: runtime npm install | B: checked-in bundled JS |
| --- | --- | --- |
| Reproducibility | Top-level version fixed; transitive semver resolution varies. A dedicated action lock and isolated npm ci could improve this. | Fixed dependency bytes with Action commit; needs reproducible bundle verification. |
| Package size | Small checkout; dependency downloads on each fresh runner. | Larger repository artifact; quantify a prototype before choosing. |
| Maintenance | Existing release and package-spec testing paths. Dedicated lock adds synchronization work. | Bundler, license notices, build verification and binary/runtime compatibility checks. |
| Updates | npm version release; transitive resolution may change independently. | Every dependency update needs a rebuilt, reviewed bundle and new Action release. |
| Security surface | Registry and install lifecycle scripts on every run. | Removes most install-time resolution; bundled vulnerabilities persist until updated. |
| Marketplace | Current composite Action already works. | JavaScript Actions are supported; Node runtime and inputs/outputs need revalidation. |

The public `package-spec` input deliberately permits test tarballs/alternate specs.
Always running a fixed bundle would ignore that input; retaining an installer fallback
preserves much of the current surface. Puppeteer-core/browser paths, ESM dependencies,
and dynamic imports need bundle testing even though the Action's normal scan is local.
A broad runtime rewrite is outside this security PR.

Follow-up acceptance: prototype size and cold-run timing; build the bundle twice from
npm ci and compare hashes; preserve both metadata paths, package-spec semantics,
advisory/blocking behavior and outputs; inspect included licenses and optional browser
code; add a stale-bundle CI check and an explicit dependency update workflow. Do not
claim Option A has a fully locked consumer dependency tree.
