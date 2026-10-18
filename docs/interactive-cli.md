# Interactive CLI

The guided flow is included in `geoptimize@0.12.0`. Install the package and run the bare command:

```bash
npm install --save-dev geoptimize@0.12.0
npx --no-install geoptimize
```

When the CLI is run directly with no arguments, and both standard input and standard output are TTYs, it offers a short guided flow for scanning one target and writing an offline HTML report. To run it from a development checkout:

```bash
npm run build
node dist/cli/index.js
```

The flow lets the operator choose a website URL, a local HTML or Markdown file, or a local directory. It calls the same detailed scanner as `geoptimize scan --details`, then renders the same self-contained visual report used by `geoptimize report`. The default output is `geoptimize-report.html` in the current directory. Output files are created exclusively, so an existing file is never overwritten.

Enter `b` or `back` to return to the previous menu, or `c`, `cancel`, `q`, or `quit` to leave the flow. At any prompt, EOF or Ctrl-C leaves without creating a report. Before scanning starts, the prompt closes; Ctrl-C during the scan is then handled by the normal process interrupt. EOF after that point is no longer a prompt cancellation. A scan that returns no pages is reported as an error and cannot produce an empty success report.

Explicit commands and flags keep their existing Commander behaviour. The menu is not entered for `--help`, `--version`, or non-TTY invocation. All three package aliases, `geoptimize`, `geo`, and `geo-cli`, support the same entry point in the v0.12.0 release. URL and directory results retain the scanner's evidence and coverage limits; the guided flow does not turn a bounded scan into a complete site audit.
