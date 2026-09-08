# Framework Plugins Design — Vite + Next.js

> Historical design note. The v0.6 methodology supersedes AEO outcome language in this document; current behavior and limitations are defined in `docs/methodology.md`.

## Goal

Add build-time AEO optimization to Vite and Next.js projects. On build, automatically scan output, generate llms.txt + JSON-LD, and print AEO score. Zero config required.

## User Experience

```ts
// vite.config.ts
import { aeoPlugin } from 'geoptimize/vite';
export default defineConfig({ plugins: [aeoPlugin()] });

// next.config.mjs
import { withAeo } from 'geoptimize/next';
export default withAeo({});
```

Build output:
```
[geoptimize] Scanning build output...
[geoptimize] AEO Score: 72/100 (3 pages)
[geoptimize] Generated: llms.txt, llms-full.txt, _aeo/generated-schemas.json
```

## Architecture

### File Structure (additions only)

```
src/plugins/
├── vite.ts     → Vite plugin (~50 lines)
└── next.ts     → Next.js plugin (~50 lines)
```

### Package exports (add to existing package.json)

```json
{
  "exports": {
    ".": "./dist/core/index.js",
    "./vite": "./dist/plugins/vite.js",
    "./next": "./dist/plugins/next.js"
  }
}
```

### Plugin Options

```ts
interface AeoPluginOptions {
  silent?: boolean;   // suppress console output (default: false)
  outDir?: string;    // override output directory (auto-detected by default)
}
```

No other options. YAGNI.

### Vite Plugin (`src/plugins/vite.ts`)

- Uses `closeBundle` hook (runs after all files written to dist/)
- Resolves output dir from Vite's `resolvedConfig.build.outDir`
- Calls `scanDirectory(outDir)` → `generate(report, pages, siteInfo)`
- Writes llms.txt, llms-full.txt, _aeo/ to outDir
- Prints one-line score summary to console

### Next.js Plugin (`src/plugins/next.ts`)

- Wraps next.config via `withAeo(nextConfig)`
- Uses webpack plugin `afterEmit` hook (runs after build output written)
- Detects output dir: `.next/` for server, `out/` for static export
- Same core logic: scan → generate → print score

### Constraints

- Each plugin file < 60 lines
- Only imports from `../core/scanner` and `../core/generator`
- Zero new dependencies
- No chalk in plugins (use plain console.log with `[geoptimize]` prefix)
- Does not run in dev mode (only production builds)

## Testing

- `src/plugins/__tests__/vite.test.ts` — mock Vite config, verify plugin calls core correctly
- `src/plugins/__tests__/next.test.ts` — mock Next.js config, verify wrapper behavior
- Test fixtures: reuse existing `src/core/__tests__/fixtures/`

## Verification

1. `tsc --noEmit` passes
2. `vitest run` — all tests pass
3. `import { aeoPlugin } from 'geoptimize/vite'` resolves correctly
4. `import { withAeo } from 'geoptimize/next'` resolves correctly
5. Build a minimal Vite project with plugin → llms.txt appears in dist/
