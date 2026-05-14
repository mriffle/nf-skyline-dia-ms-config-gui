# nf-skyline-dia-ms config GUI

A static single-page web app that helps users generate `nextflow.config` files for the
[nf-skyline-dia-ms](https://github.com/mriffle/nf-skyline-dia-ms) DIA proteomics workflow.

The app is fully static. At runtime it does not fetch the workflow's `nextflow_schema.json` —
schema-derived facts (types, defaults, enums) are baked into the bundle at build time via a
codegen script, and the schema itself is vendored in this repo.

## Local development

```bash
npm install
npm run dev          # http://localhost:5173/nf-skyline-dia-ms-config-gui/
```

## Tests

```bash
npm test             # run once
npm run test:watch   # watch mode
```

The suite covers the Groovy emitter (golden files), all 18 cross-field validation rules,
the parameter-coverage gate, the store, and the trickiest UI widgets.

## Type checking

```bash
npm run typecheck
```

## Schema vendoring & refresh

This repo is **separate** from the workflow repo, so a copy of the workflow's
`nextflow_schema.json` is vendored here at the repo root. It is committed to git so PR diffs make
schema changes visible.

**To refresh from upstream and regenerate derived metadata in one step:**

```bash
npm run update-schema
```

This fetches the latest `nextflow_schema.json` from
`mriffle/nf-skyline-dia-ms@main` and runs codegen.

**If you've edited the vendored schema locally** (or just want to re-run codegen):

```bash
npm run regen-schema
```

Either way, the metadata-coverage test will fail if any new non-hidden schema parameter is
unaccounted for in either `paramMetadata.ts` or the `IGNORED_PARAM_PATHS` allow-list — by design,
so new parameters cannot quietly fall off the UI.

## How parameters reach the UI

- **Schema-derived facts** (types, defaults, enum values, hidden flag, min/max) →
  vendored `nextflow_schema.json` → codegen → `src/params/schemaDerived.generated.ts`
- **UX facts** (section, common-vs-advanced, help text, widget choice, conditional visibility) →
  hand-authored in `src/params/paramMetadata.ts`
- The two files are merged at type level; `paramMetadata.ts` references real schema paths and the
  TypeScript compiler rejects typos.

## Production build

```bash
npm run build
npm run preview     # serve dist/ locally to spot-check
```

## Deployment

The app is deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.
Tests and type checks run before the build step.

**One-time setup:** in the repository settings, set **Settings → Pages → Source** to
**GitHub Actions**. After the first successful workflow run, the site will be available at
`https://mriffle.github.io/nf-skyline-dia-ms-config-gui/`.

The Vite `base` is set to `/nf-skyline-dia-ms-config-gui/` to match this URL. If the repository
is renamed, update `vite.config.ts` accordingly.
