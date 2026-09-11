# Property-based security checks

`src/core/__tests__/security-fuzz.test.ts` uses the exact `fast-check` `4.10.0` development dependency to exercise the public parsing, prompt, and report-rendering APIs with bounded generated inputs. The checks cover robots comment handling and hash tails, HTML-to-prompt normalization and the 8,000-character content excerpt limit, and hostile report fields rendered through Cheerio to verify that they do not create additional executable DOM nodes.

The default run is deterministic and bounded at 200 cases per property with seed `20260911`. The file is included by the normal `npm test` command. To run only these checks, use:

```sh
npm run test:fuzz
```

When fast-check reports a failing case, replay it with the reported seed and path while selecting the failing property by its exact test name. This keeps a path from one property from being applied to the other properties:

```sh
FUZZ_SEED=20260911 FUZZ_PATH='0:1:2' npm run test:fuzz -- -t 'keeps robots comments inert and never retains a hash comment tail in parsed rules'
```

The path is the value printed by fast-check for the failing property. Replace the seed, path, and test name with the values from the failure report. For a longer local run, increase the case budget without changing the default CI workload:

```sh
FUZZ_NUM_RUNS=1000 npm run test:fuzz
```

These are deterministic property-based tests. They are not coverage-guided fuzzing, do not make network requests, and do not replace the repository's static analysis or browser-level verification.
