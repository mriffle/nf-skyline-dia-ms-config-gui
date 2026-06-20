# nf-skyline-dia-ms config GUI

**Hosted app:** <https://mriffle.github.io/nf-skyline-dia-ms-config-gui/>

A static single-page web app that helps users generate a `pipeline.config` Nextflow override
file for the [nf-skyline-dia-ms](https://github.com/mriffle/nf-skyline-dia-ms) DIA proteomics
workflow. Pass the downloaded file to Nextflow with `-c pipeline.config`.

## Why this exists

The workflow exposes ~99 user-facing parameters. Editing the config by hand is intimidating
and error-prone — getting an option name or namespace wrong silently falls back to the default
and there is no schema validation in the Nextflow runtime. This GUI presents the same
parameters in a sectioned, validated form with inline help, conditional visibility, and a live
preview of the generated Groovy config so users can copy or download a clean override.

Outputs are **override files** — only values the user actually set are written. The workflow's
own `nextflow.config` supplies every default, so the generated file stays minimal and easy to
read. A small handful of load-bearing parameters (search engine, search-engine-specific flags,
Skyline protein-grouping options, QC skip flag, etc.) are explicitly written even when
untouched so the resulting config is self-documenting about what ran.

## How it works

The app is fully static — no backend, no runtime fetches. The workflow's
`nextflow_schema.json` is **vendored** here at the repo root and baked into the bundle at
build time. Architecture in three pieces:

- **Schema-derived facts** (types, defaults, enums, hidden flags, min/max) come from the
  vendored schema via a codegen script that emits a strongly-typed
  `src/params/schemaDerived.generated.ts`.
- **UX facts** (section, common-vs-advanced tier, help text, widget choice, conditional
  visibility, conditional required-ness, conditional always-emit) are hand-authored in
  `src/params/paramMetadata.ts`. The TypeScript compiler rejects entries that reference
  schema paths that don't exist, and a coverage test fails if any non-hidden schema
  parameter is left unaccounted for.
- **Two output panes** share the same `FormState`:
  - The **Config preview** runs a pure `emitConfig(state)` function that groups params by
    section, builds a namespace tree, and emits Groovy with section banners and per-param
    comments. Output is byte-stable given fixed version/timestamp so it can be tested with
    golden files. The preview is also **editable in place**: an Edit mode swaps the read-only
    view for a syntax-highlighted text editor, and Apply re-parses your edits back into form
    state using the same parser that loads an existing `pipeline.config`. Edits round-trip
    *through state* — on Apply the config is re-canonicalized (comments, ordering, and
    unrecognized params are regenerated/dropped), so the form stays the single source of truth.
  - The **Workflow graph** runs a pure `computeWorkflowGraph(state)` function that returns
    nodes/edges for the DAG that would actually run given the current form state, rendered
    as a hand-written SVG (no chart library). Unselected branches are omitted entirely
    rather than greyed out.

State is persisted to `localStorage` via Zustand. Form validation runs two layers on every
change: per-widget Zod schemas (visible + touched fields only) and hand-written cross-field
rules. The download/copy buttons gate on the validation report having no errors.

The stack is intentionally lean: React + TypeScript + Vite + Tailwind + Zustand + Zod. No
UI component libraries (Tailwind primitives only), no chart libraries, no state library other
than Zustand.

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

The suite covers the Groovy emitter (golden files), the config parser and parse→emit
round-trip, every cross-field validation rule, workflow-graph scenarios, the
parameter-coverage gate, the store, and the trickiest UI widgets.

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

## Production build

```bash
npm run build
npm run preview     # serve dist/ locally to spot-check
```

## Deployment

The app is deployed to GitHub Pages by `.github/workflows/deploy.yml` when a GitHub Release is
published (or manually via `workflow_dispatch`) — pushes to `main` do **not** deploy, so the
version is bumped deliberately by cutting a release. The release tag (e.g. `v1.2.3`) supplies the
version shown in the footer and the generated config header. Tests and type checks run before the
build step.

**One-time setup:** in the repository settings, set **Settings → Pages → Source** to
**GitHub Actions**. After the first successful workflow run, the site will be available at
`https://mriffle.github.io/nf-skyline-dia-ms-config-gui/`.

The Vite `base` is set to `/nf-skyline-dia-ms-config-gui/` to match this URL. If the repository
is renamed, update `vite.config.ts` accordingly.
