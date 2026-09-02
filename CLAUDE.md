# CLAUDE.md

Context for AI coding agents working in this repo. Keep updates terse and practical.

**Update this file as part of any project-affecting change.** When you add a
new mechanism (e.g., `defaultOverride`), change a default, bump store
versions, add conventions, or revise hard rules, update CLAUDE.md in the
same pass. The goal is that a fresh agent reading this file gets accurate
guidance without having to re-derive it from the code.

## What this is

A static React + TypeScript single-page web app that helps users generate a
`pipeline.config` Nextflow override file for the
[nf-skyline-dia-ms](https://github.com/mriffle/nf-skyline-dia-ms) DIA proteomics
workflow. The workflow has ~99 user-facing parameters and editing the config by
hand is intimidating; this app exposes them via a sectioned, validated form
with a live preview, then emits a clean minimal override. (The downloaded file
is named `pipeline.config` rather than `nextflow.config` so users explicitly
pass it via `-c pipeline.config` instead of it being auto-picked-up.)

The app is **separate** from the workflow repo. It is deployed to GitHub Pages
at https://mriffle.github.io/nf-skyline-dia-ms-config-gui/ and does **not**
talk to the workflow repo at runtime. The workflow's `nextflow_schema.json` is
**vendored** here at the repo root and baked into the bundle at build time.

## Common commands

All run from the repo root.

```bash
npm install
npm run dev            # localhost:5173/nf-skyline-dia-ms-config-gui/
npm test               # run all Vitest tests
npm run test:watch
npm run typecheck      # tsc -b --noEmit
npm run build          # tsc + vite build
npm run preview        # serve dist/ locally
npm run regen-schema   # regenerate src/params/schemaDerived.generated.ts from
                       # the vendored nextflow_schema.json
npm run update-schema  # fetch latest schema from mriffle/nf-skyline-dia-ms@main
                       # then regen
```

## Repository layout

```
/
├── nextflow_schema.json                vendored from upstream — schema source of truth
├── vite.config.ts                      base: /nf-skyline-dia-ms-config-gui/ (Pages slug)
├── package.json                        deps + scripts; version flows to __APP_VERSION__
├── vitest.config.ts                    jsdom env, __APP_VERSION__ define for tests
├── tailwind.config.ts                  slate scale + custom accent.* indigo
├── scripts/
│   ├── gen-param-metadata.ts           schema → schemaDerived.generated.ts
│   └── update-schema.ts                fetch upstream schema (used by update-schema script)
├── .github/workflows/deploy.yml        Pages deploy on push to main
└── src/
    ├── App.tsx, main.tsx, index.css
    ├── params/
    │   ├── schemaTypes.ts              types for the schema-derived module
    │   ├── schemaDerived.generated.ts  AUTO-GENERATED, committed; never hand-edit
    │   ├── sections.ts                 10 ordered UI sections
    │   └── paramMetadata.ts            hand-authored UX overlay; PRIMARY edit target
    ├── state/
    │   ├── formState.ts                StoreState type, default factory
    │   └── store.ts                    Zustand store + persist middleware
    ├── validation/
    │   ├── fieldSchemas.ts             Zod schemas per widget kind
    │   ├── crossFieldRules.ts          29 hand-authored cross-field rules
    │   ├── runValidation.ts            entry point: state → ValidationReport
    │   └── types.ts
    ├── emit/
    │   ├── groovyLiteral.ts            value → Groovy literal
    │   ├── encodeUrl.ts                percent-encode URL field values (see §6 sub)
    │   ├── namespaceTree.ts            dotted paths → nested block tree
    │   ├── format.ts                   header + indentation helpers
    │   ├── emitConfig.ts               pure: state → string
    │   └── __tests__/golden/*.config   golden output files (checked in)
    ├── parse/                          inverse of emit — see Architecture §9
    │   ├── types.ts                    ParsedValue, ParsedEntry, ParseResult
    │   ├── groovyLexer.ts              tokenize the Groovy subset we accept
    │   ├── groovyParser.ts             AST: blocks + assignments
    │   ├── parseConfig.ts              find params { } + flatten to entries
    │   ├── wellFormedness.ts           pre-flight syntax gate — see §9 sub
    │   ├── loadPipeline.ts             shared text→outcome pipeline (gate→parse→map);
    │   │                               used by upload AND editable preview — see §11
    │   └── mapToState.ts               entries → FormState + UploadReport
    ├── metadata/                        sample-metadata upload — see Architecture §12
    │   ├── types.ts                    MetadataTable, MetadataError/Warning, format
    │   ├── parseDelimited.ts           hand-rolled RFC-4180-ish CSV/TSV parser
    │   ├── validateMetadata.ts         detect format → parse → clean → table+warnings
    │   ├── serializeMetadata.ts        inverse: MetadataTable → CSV/TSV text (download)
    │   └── options.ts                  derive columns / replicates / control-values;
    │                                   shared by picker widgets AND validation rules
    ├── components/
    │   ├── layout/                     AppShell (hosts Preview/Workflow/Metadata tabs + Wizard overlay),
    │   │                               SectionNav, FormPane
    │   ├── form/                       Section, Field, FieldShell, HelpPopover,
    │   │                               AdvancedToggle, ValidationSummary
    │   ├── widgets/                    12 widgets — see "Widget catalog" below
    │   ├── preview/                    PreviewPane (read-only view + in-place text editor),
    │   │                               GroovyHighlighter (+ highlightTokens helper),
    │   │                               CodeEditor (highlighted overlay editor),
    │   │                               PreviewActions — see §11
    │   ├── workflow/                   WorkflowGraphPane, WorkflowGraphSvg (live DAG render)
    │   ├── metadata/                   MetadataPane (spreadsheet + download/clear),
    │   │                               UploadMetadataControl, MetadataUploadDialog,
    │   │                               MetadataErrorDialog — see §12
    │   ├── upload/                     UploadControl, UploadDialog, UploadErrorDialog
    │   ├── wizard/                     Wizard, WizardChrome, WizardRadioCards,
    │   │                               WizardAdvancedSection, flow.ts, screens/*
    │   └── ModeToggle.tsx              top-of-form General/PDC mode selector
    ├── workflow/
    │   ├── types.ts                    GraphNode/GraphEdge/WorkflowGraph types
    │   ├── computeWorkflowGraph.ts     pure: state → WorkflowGraph
    │   └── layout.ts                   stage-banded (x, y) positioning + viewBox
    ├── hooks/                          useFieldValue, useValidation, useFormState
    └── lib/
        ├── download.ts, clipboard.ts
        ├── formatDefault.ts            renders schema defaults for hints/placeholders
        └── spectraFormat.ts            shared file-extension classifier (raw / mzml / dzip)
                                        used by both computeWorkflowGraph and the wizard
```

`scripts/visual-check.mjs` (Playwright + chromium) seeds `localStorage` for ten
form-state scenarios and screenshots both tabs. Used for visual smoke-checks
when touching the workflow graph or layout. Run `npm run dev` first, then
`node scripts/visual-check.mjs --port 5173`. Output PNGs land in `screenshots/`
(gitignored). `scripts/click-check.mjs` is a smaller companion that exercises
the click-to-focus behavior on input nodes.

`scripts/wizard-smoke.mjs` and `scripts/wizard-smoke-branches.mjs` walk the
wizard end-to-end (the happy path + the PDC / Cascadia / Carafe branches)
and dump screenshots under `screenshots/wizard*/`. Useful for verifying
that `shouldShow` predicates and per-screen radio cards still render
correctly after touching wizard/flow.ts or any screen file.

`scripts/edit-diag.mjs` drives the editable preview (§11): it measures the
read-only preview box vs the edit overlay box (they must match) and
screenshots the edit / confirm-dialog / syntax-error states to
`screenshots/edit/`. Run after touching `PreviewPane` / `CodeEditor` /
`PreviewActions` or the right-pane layout — the failure modes it guards
are the editor collapsing / `CodeEditor`'s two layers drifting out of
alignment, a second scrollbar appearing, and the modal being trapped in
the sticky stacking context (must portal to `document.body`).

## Architecture — the load-bearing concepts

### 1. Hybrid parameter metadata (the most important idea)

- **Schema-derived facts** (type, default, enum, hidden flag, min/max) live in
  `nextflow_schema.json`. The codegen script flattens nested `properties` to
  dotted paths (`pdc.study_id`, `encyclopedia.quant.params`, ...) and writes a
  strongly-typed `schemaDerived.generated.ts`. The generated file is
  **committed to git** so PRs make schema drift visible.
- **UX facts** (section, common/advanced tier, help text, widget choice,
  visibility predicates, required predicates) are **hand-authored** in
  `src/params/paramMetadata.ts`. This file is the primary edit target when
  changing the form.
- The two layers are merged at the type level. The compiler rejects
  `paramMetadata.ts` entries that reference paths not in the generated map
  (unless `virtual: true`).
- **Coverage gate** (`src/params/__tests__/metadata-coverage.test.ts`):
  every non-hidden schema path must be (a) a real `ParamMeta` entry,
  (b) listed in some virtual entry's `affects` array, or (c) in
  `IGNORED_PARAM_PATHS`. Otherwise the test fails — this is how schema
  drift is caught loudly instead of silently.
- **`defaultOverride` escape hatch** on `ParamMeta`: when the upstream
  `nextflow_schema.json` default disagrees with the workflow's actual
  `nextflow.config` default (e.g. `carafe.cli_options` is `""` in the
  schema but a long string in the runtime config), set
  `defaultOverride: <real default>` on the metadata entry. Used for UI
  display only (placeholder + `Default: X` hint). Does NOT affect emit
  or validation by itself. Resolved by `getEffectiveDefault(meta)`.
- **`alwaysEmit` on `ParamMeta`**: marks a parameter as "load-bearing —
  always write it to the generated config, even when the user hasn't
  touched it". May be `true` (unconditional) or a `(state) => boolean`
  predicate that gates the behavior on form state. The emit pipeline
  picks the user's value if present, otherwise falls back to
  `getEffectiveDefault(meta)`. When the predicate returns false the
  param falls back to the normal emit-only-touched rule. The field UI
  suppresses the `Default: X` hint while always-emit is active because
  the value is already visible in the input. Evaluate via the exported
  `isAlwaysEmit(meta, state)` helper — don't compare the field directly.
  Pair with `defaultOverride` when the UI default differs from the
  schema default, and pre-seed the value in `createDefaultState` if a
  cross-field validator must see the value from first render. Currently
  used by: `search_engine` (true), `qc_report.skip` (true),
  `diann.search_params` / `diann.fasta_digest_params` (predicate on
  `searchEngineIs('diann','DiaNN')`), `encyclopedia.quant.params` /
  `encyclopedia.chromatogram.params` (predicate on
  `searchEngineIs('encyclopedia','EncyclopeDIA')`),
  `cascadia.use_gpu` / `cascadia.score_threshold` (predicate on
  `searchEngineIs('cascadia','CascaDIA','Cascadia')`),
  `carafe.cli_options` (predicate on `carafeEnabled`),
  `skyline.group_proteins` / `skyline.group_by_gene` /
  `skyline.protein_parsimony` (predicate on `skylineNotSkipped`), and
  `qc_report.report_format` (predicate on `qcReportNotSkipped`, paired
  with `defaultOverride: ['html']` — QC reports default to HTML only;
  see §5 for the matching cross-field rule).
- **`surfaceHidden` opt-in on `ParamMeta`**: deliberate exception to the
  "hidden schema params don't appear in the UI" rule. Set on a ParamMeta
  whose `path` binds to a schema entry marked `hidden: true` (the coverage
  test would otherwise reject the binding). Currently used by `images.diann`
  — users routinely override the DIA-NN container to a self-built image of
  a newer DIA-NN release because DIA-NN's strict license prevents
  redistribution of versions after 1.8.1 on registries like Docker Hub.
  The upload classifier prefers a `surfaceHidden` ParamMeta over the
  `hidden-preserved` fallback, so uploaded values populate the form field
  instead of landing in the preserved sub-block.

### 2. Mode toggle (General / PDC)

- `FormState.mode: 'general' | 'pdc'` lives in the Zustand store. Default
  general.
- Sets the top-level branching for the form: which input section is visible,
  whether `replicate_metadata` is shown, whether `search_engine` is forced to
  diann (PDC), etc.
- Helper predicates `inGeneral` / `inPdc` are defined in `paramMetadata.ts`
  and used in `visibleWhen` / `requiredWhen` closures.
- Mode switch via the UI calls `previewClearTargetsForModeChange` to identify
  touched-but-now-invisible paths; if non-empty, a `window.confirm` asks the
  user before wiping that branch's state.
- **Mode-specific option filtering**: the `Carafe input source` enum
  (`carafe.source`) exposes `pdc-files` / `pdc-sample` only in PDC mode.
  `EnumSelect` filters its options by current `mode`. `setMode` has an
  explicit cleanup branch that drops the value if it would become invalid
  after switching to General. If you add more mode-conditional enum
  options, follow the same pattern.

### 3. Store (`src/state/store.ts`)

Zustand store, persisted to `localStorage` (key
`nf-skyline-dia-ms.config-builder.v1`).

```
StoreState = {
  mode: 'general' | 'pdc',
  values: Record<string, unknown>,
  touched: Record<string, boolean>,
  preservedOuterText?: string,   // see §9 — verbatim outer blocks from upload
  metadata?: MetadataTable,      // see §12 — uploaded sample-metadata table
  showAdvanced: boolean,
  activeSection: SectionId | null,
  storeVersion: <CURRENT_STORE_VERSION>,
}
```

Actions: `setValue`, `clearValue`, `setMode`, `toggleAdvanced`,
`setShowAdvanced`, `setActiveSection`, `reset`, `loadFromConfig`,
`loadMetadata`, `clearMetadata`. Mode-change clearing logic
evaluates every `paramMeta.visibleWhen` against old vs. new state and clears
paths that would become invisible.

**Default state ships some values pre-set** (`createDefaultState`):
- `use_carafe: true` — Carafe is the recommended path; virtual so not emitted
- `search_engine: 'diann'` — paired with `alwaysEmit: true` on the meta;
  pre-seeded so the validator's `searchEngineIs('diann', 'encyclopedia')`
  predicate fires on first render (so e.g. `requiredWhen` on FASTA is
  active immediately).
- `qc_report.skip: false` — paired with `defaultOverride: false` and
  `alwaysEmit: true` on the meta. The upstream schema defaults `skip` to
  `true` (don't run QC); the builder flips this and writes `skip = false`
  explicitly so every generated config runs QC unless the user opts out.
- `batch_report.skip: true` — matches the upstream schema default. Not
  `alwaysEmit`; the seed only exists so the toggle and the dependent
  `visibleWhen` predicates (which hide child fields when skip is on)
  display the correct effective default from first render.
- `skyline.group_proteins: true` — paired with `defaultOverride: true` on
  the meta. The upstream schema defaults this to `false`; the builder
  flips it. `alwaysEmit` is gated on `skylineNotSkipped`, so the
  generated config writes `group_proteins = true` whenever Skyline is
  running.
- `qc_report.report_format: ['html']` — paired with
  `defaultOverride: ['html']` and `alwaysEmit` gated on
  `qcReportNotSkipped`. The schema declares no default; the builder ships
  an "HTML only" stance. Pre-seeded so the `qc-report-format-required`
  cross-field rule (§5) sees a valid selection from first render.

- `msconvert.do_demultiplex: true` — matches the workflow/schema default.
  Not `alwaysEmit`; the seed exists so the toggle shows the value the
  workflow would actually use, and so the `vendor-raw-demultiplex` rule
  (§5) fires on the untouched case. Without the seed the value reads
  `undefined`, the rule stays silent, and the builder happily emits a
  config with `use_vendor_raw = true` and no demultiplex line — which the
  workflow then rejects at startup, since its own default is `true`.

If you change what's pre-seeded, bump `CURRENT_STORE_VERSION` so the
`persist.migrate` step resets stale browser drafts to the new default.
(Currently `10` — v10 pre-seeded `msconvert.do_demultiplex`; v9 changed
batch-map entries from `{name, path}` to `{name, paths[]}`; v8 added the
persisted `metadata` table, see §12.)

### 4. Emit-only-touched invariant (DO NOT BREAK)

`emitConfig(state)` outputs **only paths where `touched[path] === true`**,
PLUS any params for which `isAlwaysEmit(meta, state)` returns true (either
the `alwaysEmit: true` flag or an `alwaysEmit` predicate that fires for the
current state — see the list in section 1).
A param the user never edited and that isn't active under `alwaysEmit` is
*not* emitted, even if its current value equals the schema default. The
workflow's own `nextflow.config` supplies defaults; this app generates
an **override** file. Schema defaults are shown in the UI as placeholder
+ `Default: X` hint, but never written to state until the user types.

For `alwaysEmit` params: the emitter takes the value from
`state.values[path]` if present (even when not touched — e.g. seeded by
`createDefaultState`), otherwise falls back to `getEffectiveDefault(meta)`.

Verbatim text in `state.preservedOuterText` (captured from a previously
uploaded config — see §9) is appended after the closing `}` of
`params { }` under a banner. This is the one exception to "only emit
what's modelled in metadata": it's user-provided source carried through
without re-parsing.

Touched paths with no `ParamMeta` AND no `VIRTUAL_PARENT_BY_AFFECTED_PATH`
fallback — typically hidden / infrastructure params like `images.diann`
loaded verbatim from an upload — emit into a synthetic "Preserved from
uploaded config" sub-block at the end of `params { }`, namespace-collapsed
the same way real sections are (so `images.diann` + `images.proteowizard`
render as one `images { … }` block). They share `state.values` /
`state.touched` with regular paths; only the routing in `groupBySection`
distinguishes them.

**Always-emitted `standard` execution profile** (a second exception to
"emit only modelled params"). After `params { }`, the emitter appends a
`profiles { standard { … } }` block (see `renderProfilesBlock` in
`emitConfig.ts`) so users always have a visible, commented place to set
local-run resources. It carries `process.executor`,
`process.resourceLimits = [ cpus, memory, time ]`, and the two cache-dir
`params.*`. The values come from five form fields —
`max_cpus` / `max_memory` / `max_time` / `mzml_cache_directory` /
`panorama_cache_directory` (listed in `PROFILE_PARAM_PATHS`) — which are
**routed out of `params { }` entirely** (`collectEntries` skips them) and
into this profile. The profile is built from `state.values[path]` if set,
else `getEffectiveDefault(meta)`; the two cache dirs use `defaultOverride`
(`mzml_cache` / `raw_cache`) because the schema defaults are the upstream
author's absolute cluster paths.

Two worlds, branched on `hasPreservedProfilesBlock(state.preservedOuterText)`
(exported from `paramMetadata.ts` — a structural `/profiles\s*\{/` test, so
any inner profile name counts):
- **We own the profiles layer** (fresh config, or uploaded config with no
  `profiles { }`): the generated `standard` profile is emitted; the five
  form fields are visible.
- **The user owns it** (uploaded config already has a `profiles { }`): the
  generated profile is **suppressed** (we never override the user's
  profiles, which may have arbitrary names like `slurm` / `aws`); their
  block round-trips verbatim via `preservedOuterText`. The five form fields
  are hidden (`visibleWhen: noPreservedProfiles`) and `PreservedBlocksNotice`
  explains resources are managed in their own profiles section.

### 5. Validation

Two layers, both running on every state change:

1. **Per-widget Zod schemas** (`fieldSchemas.ts`) — applied only to *visible*
   and *touched* fields. Type-shape correctness.
2. **Hand-rolled cross-field rules** (`crossFieldRules.ts`) — 29 rules, each
   with `id`, `severity: 'error' | 'warning'`, and a `check(state)` returning
   `null` or `{ message, fields }`. Rule IDs are stable and referenced by
   tests. Rules 20-26 are the metadata-membership rules (`metadata-*-valid`):
   they no-op unless a metadata table is loaded, then error if a selected
   value isn't a column / replicate / control-value present in it — see §12.

`batch-names-valid` mirrors `normalize_batch_map()` + `validate_batch_names()`
in the workflow's `modules/utils.nf`: surrounding whitespace is **trimmed**
(by the workflow, and by `normalizeQuantSpectraDir` on emit), so names are
compared trimmed and only separators / control chars are rejected. It adds a
uniqueness check the workflow gets for free — a Groovy Map can't hold
duplicate keys, but the form's entry list can, and the emitter's name→path
map would silently keep only the last one. Keep the two in sync: if the
workflow's rule changes, change this rule too.

`runValidation(state) → ValidationReport`. The download / copy buttons
gate on `report.isDownloadable` (no error-severity issues anywhere).
Warnings render in the summary but do not block.

### 6. Groovy emitter

Pure function `emitConfig(state, options?) → string`. Highest-stakes
correctness boundary in the app. Order of operations:

1. Filter to touched entries (plus any `alwaysEmit` paths).
2. Normalize the `quant_spectra_dir` tagged union (`{kind: 'single'|'list'|'batch-map', ...}`)
   to its concrete shape.
2b. **Percent-encode URL field values** (`encodeUrl.ts`, applied in
   `collectEntries` after normalization). For URL-bearing fields only —
   every `file-or-url` widget plus the explicit `URL_BEARING_EXTRA_PATHS`
   set (`panorama.upload_url`, `quant_spectra_dir`, `skyline.skyr_file`) —
   each string leaf (also array elements / batch-map values) is run through
   `encodeUrlValue`. That helper touches a value **only when it has a
   `scheme://` prefix** (so bare local paths like `/data/My Lab/x.raw` are
   left exactly as typed) and delegates encoding to the platform `new
   URL().href`: spaces → `%20`, double-encoding-safe (an existing `%20` /
   `%40` passes through), `@` and other URL-significant chars kept, and it
   falls through unchanged on malformed input (the constructor throws). It
   is idempotent, so parse→emit round-trips are stable. To add a URL field
   that isn't `file-or-url`, add its path to `URL_BEARING_EXTRA_PATHS`.
3. Skip *virtual* entries that don't write a real path.
4. **Group entries by UI section** (in `sections.ts` order). Sections with
   no emitted entries are dropped. Each entry's section comes from either
   its direct `paramMetadata` entry OR its parent virtual entry in
   `VIRTUAL_PARENT_BY_AFFECTED_PATH` (e.g. `quant_spectra_glob`
   inherits the `input-general` section from its `glob-regex-pair`
   parent). Anything that lands in neither bucket goes into a synthetic
   "preserved" group emitted at the end of `params { }` under a
   `// === Preserved from uploaded config ===` banner — typically
   uploaded hidden / infra params with no UI control (see §9).
5. Within each section, build a namespace tree and emit:
   - **block form** (`pdc { ... }`) when a namespace has ≥2 emitted
     children at the same level, otherwise dotted form (`pdc.study_id = 'X'`).
   - a section banner comment (`// === Title === \n // blurb…`) before
     the section's contents.
   - a per-param comment (`// Label — help text…`) above every leaf
     assignment, wrapped at `COMMENT_BODY_WIDTH` (81 cols of content
     after the `// ` prefix). Affected sub-paths without their own
     metadata entry (e.g. `quant_spectra_glob`) are emitted without a
     per-param comment.
6. Always prepend the header comment with version + UTC timestamp.

Ordering is **section-driven, then metadata-order within a section**.
There is no longer any "scalars first" hoisting at the top of `params { }`
— a `pdc { ... }` block now appears wherever the input-pdc section
falls, even if other sections contain only scalars.

Each namespace prefix (`pdc.`, `carafe.`, `encyclopedia.`, …) currently
lives in exactly one section. If you add a parameter that breaks this
invariant, the same namespace would render as two separate blocks (e.g.
`pdc { ... }` twice in different sections). Groovy DSL accepts this but
it's noisy — prefer assigning new params to the section that owns their
namespace.

Tested via **golden files** in `src/emit/__tests__/golden/*.config`. To add
a scenario: create a new `.config` file, add a test that constructs the
matching state via `makeState({...})` and asserts equality with the file.
Output is byte-stable when `version` and `timestamp` are passed as options.
When you change anything that affects rendering (e.g. wording of a
section blurb, label, or help text; section order; banner format) you
must regenerate every golden — a tiny temporary test that writes
`emit(state)` to disk is the fastest way to do this.

### 7. Workflow graph (live DAG visualization)

The right column of the app exposes three tabs: **Config preview** (the Groovy
override emitter, default tab), **Workflow graph** (an SVG visualization
of the Nextflow DAG that *would actually run* given the current form state),
and **Metadata** (the uploaded sample-metadata spreadsheet — see §12).

Architecture mirrors the emitter:

- **`src/workflow/computeWorkflowGraph.ts`** — pure function
  `(state: FormState) → WorkflowGraph`. **No React, no store, no DOM imports.**
  Reads `state.values` and `state.mode` directly; **does NOT consult `state.touched`**
  (the graph reflects the workflow that would run for the current values, not
  what's been emitted to the config).
- **`src/workflow/layout.ts`** — assigns `(x, y)` centers to nodes by re-indexing
  used stages to a contiguous row sequence, returns viewBox dimensions.
- **`src/components/workflow/WorkflowGraphSvg.tsx`** — hand-written SVG.
  No `<canvas>`, no D3/Visx/ReactFlow. Process nodes are rounded rectangles;
  file nodes are rectangles with a dog-ear cut (polygon path) in the top-right
  corner to evoke a document.
- **`src/components/workflow/WorkflowGraphPane.tsx`** — pane wrapper. Hugs
  intrinsic content height (don't change to `h-full` — that reintroduces a
  large empty whitespace gap below the graph since unlike PreviewPane the SVG
  has a fixed natural height).
- **`AppShell.tsx`** owns the active-tab state
  (`'preview' | 'graph' | 'metadata'`, defaults to `'preview'`; the third
  Metadata tab is §12). The mobile show/hide toggle wraps the entire tabbed
  area, preserving prior behavior. All non-preview tabs are disabled while
  the preview is in edit mode (they'd unmount `PreviewPane` and lose the
  buffer).

**Active-only graph**: only nodes that will actually run / be consumed are
emitted. Unselected branches (the other search engines, FASTA in Cascadia
mode, the user library when Carafe is supplying one, optional inputs the user
hasn't filled) are omitted entirely — *not* faded. This keeps the graph
focused on "what's about to run." There are only two node statuses:

- `active` — process will execute / file is provided. Accent fill.
- `required-missing` — user-supplied input that's needed but not set.
  Same chrome as a filled file node, but the filename slot renders `?`
  in red (`MISSING_LABEL_COLOR` in `WorkflowGraphSvg.tsx`). The descriptive
  sublabel ("Spectra files", "FASTA database", etc.) is shown in its
  normal position.

**Skyline template special case**: the workflow uses a built-in default
template if the user doesn't supply one, so the template node is always
'active' when Skyline runs — labeled `Default template` when unset, the
filename when set.

**Click-to-focus**: input file nodes that carry a `formPath` are clickable
(also keyboard-activatable via Enter/Space). A click scrolls the matching
`#field-<path>` into view, focuses the first input within it, and briefly
flashes the field's background (`.wf-field-flash` keyframes in
`index.css`). Process and output nodes have no `formPath` and remain
non-interactive. The Carafe-input node has a special fallback: when
`carafe.source` is unset, its `formPath` is `'carafe.source'` itself
(the source-selector dropdown) so the click always lands somewhere
useful; once a source is picked, `formPath` switches to that source's
specific value field.

**Edge routing**: edges that span 2+ rows are routed with a cubic bezier
that bows past the central column of intermediate nodes. The `apexX` is
placed `APEX_CLEARANCE` (24px) outside the obstacle envelope; the
control-point x is back-solved from `apexX` because for a cubic with
both control points at the same x, the curve's midpoint sits only ~75%
of the way out toward that x. Side selection picks whichever side
minimizes total endpoint travel. If both endpoints already sit clearly
to the same side of the obstacle, the curve falls back to a plain
straight bezier (cleaner). Adjacent rows always use the simple bezier
since there are no obstacles in between. **Don't replace this with
orthogonal/Manhattan routing through side channels** — the user
explicitly rejected that approach as "not natural" because the lines
flowed out to the page edges and back in.

**Conditional gating** is hand-coded in `computeWorkflowGraph.ts` against
`state.values`. Do **not** try to reuse `requiredWhen` from `paramMetadata.ts`
— the form's "required" semantics differ from the workflow's. If the workflow
adds a new conditional process, edit `computeWorkflowGraph.ts` and add a
matching scenario test in `__tests__/computeWorkflowGraph.test.ts`.

**Sub-process granularity** — the graph models conditional sub-processes that
actually fire, not just top-level branches:
- `Convert to mzML` (msconvert) appears only when RAW files are present AND
  not (`search_engine == 'diann'` AND `use_vendor_raw == true`). Carafe spectra
  always trigger msconvert for RAW (Carafe ignores `use_vendor_raw`).
- `Extract Bruker` (unzip) appears only when `.d.zip` files are present.
  EncyclopeDIA/Cascadia don't accept `.d.zip` so the node is suppressed for
  them.
- `Predict library (DIA-NN)` appears only when DIA-NN runs without a
  user library and without Carafe.
- `Convert .blib → .dlib` and `Convert .dlib → TSV` appear when the user's
  library file extension forces them.
- Empirical-library build (`Build empirical library`, with sublabel
  `EncyclopeDIA` or `DIA-NN (subset search)`) appears when
  `chromatogram_library_spectra_dir` is set and the engine supports it
  (Cascadia ignores it). The user-facing concept is "empirical library";
  the underlying schema path still uses the legacy `chromatogram_library_*`
  names, and EncyclopeDIA's tooling still calls its build step
  "chromatogram." Don't rename the schema keys.
- `Annotate doc` appears when replicate metadata is set or in PDC mode.
- `Minimize doc` appears only when `skyline.minimize == true`.

File types are inferred from spectra paths' extensions (`.raw`, `.mzML`,
`.d.zip`); when types can't be determined (directory without glob) the
detector returns `uncertain` which conservatively triggers msconvert.

**Carafe override**: when `use_carafe === true`, the user spectral-library
input node is omitted entirely (Carafe overrides `params.spectral_library`
in the workflow with a warning). The library-consuming process gets its
edge from the Carafe-generated library output instead.

**Rendering rules to keep in mind**:
- Edges are filtered against the final node set; a "edge integrity" test
  guards this. Don't emit dangling edges.
- All SVG hand-written. Adding a chart library would violate the no-UI-libs
  rule and add weight that hand-rolled paths don't need.

### 8. Widget catalog

Each widget is a memoized React component receiving `WidgetProps`:

| Widget                | Used for                                          |
| --------------------- | ------------------------------------------------- |
| `text`, `file-or-url` | `TextInput`                                       |
| `textarea`            | `TextareaInput`                                   |
| `number`              | `NumberInput`                                     |
| `boolean`             | `BooleanToggle` (switch-style)                    |
| `enum`                | `EnumSelect` (native `<select>`)                  |
| `multi-enum`          | `MultiEnumChecks` (checkbox group)                |
| `string-list`         | `StringListInput` (chip-style)                    |
| `glob-regex-pair`     | virtual — pairs `*_glob` + `*_regex` mutex'd      |
| `batch-map`           | virtual — list of `{name, paths[]}` rows          |
| `spectra-source`      | virtual — radio for single / list / batch-map     |
| `metadata-single`     | `MetadataSingleSelect` — select when metadata loaded, else `TextInput` |
| `metadata-multi`      | `MetadataMultiSelect` — checkbox group when loaded, else `StringListInput` |

Virtual widgets have `virtual: true` and list real schema paths in `affects`
so the coverage test sees them as accounted for.

The two `metadata-*` widgets carry a `metadataSource: 'columns' |
'replicates' | 'control-values'` on their `ParamMeta` and read
`store.metadata` to source options; with no table loaded they delegate to
the free-text widget (their pre-metadata behavior). They store the same
value shapes as `text` / `string-list`, so emit and the round-trip are
unaffected. `metadata-multi` is in the list-storing-widget set in
`mapToState.ts` (alongside `string-list` / `multi-enum`). See §12.

### 9. Config upload (parse → state restoration)

The inverse of the emit pipeline. The "Load config…" button in the header
lets users upload an existing `pipeline.config` and have its values
restored into the form. All parsing happens in the browser; nothing is
sent anywhere.

**Pipeline:**

```
text → checkWellFormedness (HARD GATE — rejects on any syntax error)
     → parseConfig (lex + parse + locate params { } + flatten)
     → mapToState (classify + coerce + infer mode/carafe)
     → loadFromConfig (atomic store replace)
```

The well-formedness check is a pre-flight gate run by `UploadControl`
**before** `parseConfig`. If it reports any issue the upload is rejected
outright — no partial state load. This exists because the lexer and
parser both recover from typos (the lexer emits a STRING token for
`'unterm` plus an error; the parser skips stray tokens via `recover()`
to the next IDENT/RBRACE/EOF). Without the gate, a file with a single
syntax error would silently load only the salvageable entries, leaving
the user with a half-loaded form and no signal that anything was lost.

**Modules** (`src/parse/`):
- `groovyLexer.ts` — tokenizer for the Groovy subset we accept (single,
  double, and triple-quoted strings with `\\ \' \" \n \r \t \b \f \0`
  escapes; integers, decimals, scientific notation, `_` digit
  separators, type suffixes `L G F D I`; `// /* */` comments).
  Rejects GString interpolation (`${...}`) — there's no way to
  evaluate it statically.
- `groovyParser.ts` — recursive-descent parser into a small AST of
  `block`, `assignment`, and `directive` nodes. Error recovery: every
  parse failure pushes a `ParseError` and resyncs at the next IDENT /
  RBRACE / EOF. Distinguishes list literals (`[1,2,3]`) from map
  literals (`['k':'v']`) by lookahead on `KEY ':' `. `directive` is
  the Nextflow method-call form (`includeConfig 'path'`) — whitelisted
  by name in `FILE_SCOPE_DIRECTIVES` so typos like `fasta '/db'` still
  error loudly. To add a new directive, append its bare identifier to
  that set; the parser will then capture it with start/end offsets
  identical to a block.
- `wellFormedness.ts` — `checkWellFormedness(source) → { isWellFormed,
  issues }`. Internally runs `lex` + a brace/bracket balance pass +
  `parseTokens`, aggregates and dedupes the errors, and decorates each
  with a pre-built source-line snippet (line + caret indicator) for
  rendering in `<pre>`. **Deliberately app-agnostic** — depends only on
  the other parse-stack modules and `types.ts`, so it's reusable from
  any other GUI built on the same Groovy subset.

  Strictness is split into two tiers:
    * **File-wide** (enforced everywhere, including outer blocks):
      unterminated strings, unterminated `/* */` comments, and
      brace/bracket balance. These break the lexer's ability to find
      subsequent tokens (or, for balance, our ability to locate block
      boundaries) — any of them anywhere in the file is fatal.
    * **Scoped to `params { }`** (NOT enforced in outer blocks like
      `process { }`, `profiles { }`): GString interpolation,
      unexpected characters, invalid number literals, and every parse
      error (missing `=`, expected-value with wrong token, unclosed
      lists/maps, etc.).

  The scoping matters because outer blocks round-trip verbatim via
  `parseConfig.collectOuterScope` — their contents may use the full
  Groovy / Nextflow grammar (Nextflow selectors `withName:NAME { … }`
  / `withLabel:LABEL { … }`, dotted reference values like
  `params.max_cpus`, GString interpolation `"${params.outdir}/x"`,
  closures, operators, semicolons). We don't model any of that, so we
  don't get to call it "malformed". The scope is computed by walking
  the parsed AST for a `params` block (two-pass top-level-first, same
  strategy as `parseConfig.findParamsBlock`) and using its line range
  to filter scoped issues. If no params block is found, scoped issues
  are dropped entirely — downstream `parseConfig` will produce its own
  "no params { } block found" diagnostic. To re-use the module for a
  different config grammar, change the `SCOPED_BLOCK_NAME` constant
  inside the module.

  Balance pass does NOT pop on mismatch so one stray closer doesn't
  cascade into two errors.
- `parseConfig.ts` — orchestrator. Locates the first `params { }` block
  via two-pass search (prefer top-level over nested wrappers like
  `profiles { standard { params { } } }`). Supports the
  `params.pdc { ... }` shorthand (segments after `params` become a
  prefix). Flattens block + dotted forms into a single `(path, value)`
  entry list. Deduplicates with last-wins. Outer scope is split into two
  buckets: `preservedOuterBlocks` (named braced blocks like `process { }`
  / `profiles { }` AND whitelisted method-call directives like
  `includeConfig 'path'`, captured verbatim as source slices via the
  start/end offsets the parser attaches to `AstBlock` / `AstDirective`)
  and `ignoredTopLevelAssignments` (bare `foo = 'x'` at file scope,
  still discarded — there's no good way to round-trip them without
  evaluating the RHS).
- `mapToState.ts` — entries → `FormState` + `UploadReport`. The most
  judgment-heavy module; see decisions below.

**Path classification** (in `mapToState.classify`):
1. `IGNORED_PARAM_PATHS` membership → `ignored-param` (discarded).
2. Not in `schemaDerived` → `unknown-param` (discarded).
3. Has direct `ParamMeta` with `surfaceHidden: true` → coerce normally
   (deliberate surface of a hidden schema path, e.g. `images.diann`).
4. Schema entry has `hidden: true` → `hidden-preserved`: loaded into
   state.values + touched, reported as `hidden-param-preserved`
   (informational, sky-blue in dialog). The emitter routes them to the
   "preserved" sub-block inside `params { }` since there's no
   `ParamMeta` driving section assignment.
5. Has direct `ParamMeta` → coerce normally.
6. Has no direct `ParamMeta` but is the target of some virtual entry's
   `affects` list (`quant_spectra_glob`, `chromatogram_library_spectra_glob`,
   `carafe.spectra_glob` / `carafe.spectra_regex`) → look up the
   parent virtual via `VIRTUAL_PARENT_BY_AFFECTED_PATH` and coerce
   using that meta. Without this fallback, upload would flag these
   as `unknown-param` and the form's glob-regex-pair widgets would
   silently lose user-set values on round-trip.

**Recognized UI virtuals** (`use_carafe`, `carafe.source`) are pulled
out of the entry stream up front so they're not flagged as unknown —
they feed the carafe inference instead. Other virtual paths in
`paramMetadata` (e.g. `quant_spectra_files`) shouldn't appear in real
files; if they do, they're flagged as unknown.

The same `VIRTUAL_PARENT_BY_AFFECTED_PATH` map is built independently
in `mapToState.ts` and `emit/emitConfig.ts` — kept duplicated rather
than extracted to avoid coupling the parse and emit pipelines. If you
change `affects` semantics, update both.

**Value coercion** is shape-driven against `schemaDerived[path].shape`:
- `boolean`, `integer`, `number`, `string`, `enum`: strict; mismatches
  drop the value with a `type-mismatch` / `enum-mismatch` issue.
- `null` is accepted for any nullable shape (the schema default for
  many fields is null; `search_engine = null` is "no-search mode").
- Range bounds are non-fatal: keep the value, record `range-violation`.
- `string-or-list` coerces based on the matching widget kind. List-storing
  widgets (`string-list` AND `multi-enum`, e.g. `qc_report.report_format`)
  want an array; everything else wants a scalar:
  - list-storing widget + scalar string in file → wrap in 1-element
    array (`string-coerced-to-list`).
  - list-storing widget + array → kept as-is.
  - scalar widget + array in file → keep the first element
    (`list-truncated-to-string` if length > 1).
- `quant_spectra_dir` is special — the inverse of the emitter's
  `normalizeQuantSpectraDir`. String → `{kind:'single'}`, array →
  `{kind:'list'}`, object → `{kind:'batch-map'}`. A batch-map value may be
  a string or a list of strings; both load as `paths[]`.

**Mode inference**: `pdc.study_id` present → `'pdc'`, else `'general'`.
If both PDC and general inputs are present, PDC wins and a
`mode-ambiguity` issue is reported. Other `pdc.*` keys without
`pdc.study_id` do NOT flip the mode (they could be inert leftovers).

**`use_carafe` inference**:
- Explicit `use_carafe = true|false` in the file is authoritative.
- Otherwise: any `carafe.*` path present → `true`.

**`carafe.source` inference**: if not explicit in the file, inferred
from which carafe input field is set (`carafe.spectra_file` →
`'file'`, `carafe.spectra_dir` → `'dir'`,  `carafe.pdc_files` →
`'pdc-files'`, `carafe.pdc_n_files` → `'pdc-sample'`). A mismatch
between explicit `carafe.source` and the inferred value is reported as
`carafe-source-mismatch`; the explicit value still wins in state.

**Touched semantics**: every successfully loaded path becomes
`touched: true`. The user committed to the value by writing it in the
file. This includes `alwaysEmit`-eligible paths if they appear.

**`UploadReport` issue kinds**:
- *Discarded* (red in the dialog): `unknown-param`, `ignored-param`,
  `type-mismatch`, `enum-mismatch`.
- *Preserved* (sky-blue info): `hidden-param-preserved` — loaded into
  state and re-emitted into the params { } "preserved" sub-block.
- *Loaded with notes* (amber): `range-violation`,
  `string-coerced-to-list`, `list-truncated-to-string`,
  `mode-ambiguity`, `carafe-source-mismatch`.
- Plus parse-time `duplicates` (amber), `preservedOuterBlocks` (info /
  sky-blue — covers both braced blocks AND directives like
  `includeConfig`), and `ignoredTopLevelAssignments` (amber) rendered
  separately.

**Outer-scope preservation** — both named braced blocks alongside
`params { }` (`process { }`, `profiles { }`, `docker { }`, etc.) AND
whitelisted method-call directives like `includeConfig 'path'` survive
a round-trip verbatim:
1. `parseConfig` slices their source text via the start/end offsets the
   parser captures on `AstBlock` / `AstDirective` and exposes them as
   `preservedOuterBlocks` on `ParseResult` (one bucket — directives are
   stored alongside blocks since they ride the same pipeline).
2. `mapToState(entries, preservedOuterBlocks)` concatenates the slices
   with one blank line between them and writes them to
   `state.preservedOuterText` (optional field on `FormState`,
   undefined when there's nothing to preserve). Report carries
   `preservedOuterBlockNames` for the dialog summary.
3. `emitConfig` appends them after the closing `}` of `params { }`
   under a `// === Preserved from uploaded config ===` banner. Verbatim
   — the captured text is not re-formatted or re-validated.
4. The form pane shows `PreservedBlocksNotice` (sky-blue, with a
   collapsible "Show content" pre) above the section list while
   `preservedOuterText` is non-empty. The same component also lists any
   hidden-preserved param paths in state — see "Hidden-param
   preservation" below.
5. `reset` clears the field; `loadFromConfig` replaces it; the wrapping
   `profiles { }` around a chosen nested `params { }` is *not*
   preserved (re-emitting it would duplicate everything in `params`).

**Hidden-param preservation** — schema-`hidden` params (e.g. `images.*`
container pinnings, `output_directories`) are loaded verbatim instead
of discarded so power-user customizations round-trip:
1. `classify` returns `hidden-preserved` (see classification list above).
2. Value goes into `state.values` and `state.touched` like any other
   path. The form doesn't render them — there's no `ParamMeta`.
3. `emit` routes them to a synthetic "Preserved from uploaded config"
   sub-block at the end of `params { }` (since they have no section
   assignment), with namespace collapse (`images.diann` +
   `images.proteowizard` → one `images { ... }` block).
4. `PreservedBlocksNotice` enumerates them as code-styled chips.
5. `reset` clears them along with all other state.values.

**Store integration**: a `loadFromConfig(loaded)` action atomically
replaces `mode`, `values`, `touched`, `preservedOuterText`. Loaded
values are layered ON TOP of `createDefaultState()` seeds so paths the
file doesn't mention (e.g. `qc_report.skip` if absent) still read
sensible defaults. Bypasses `setMode`'s clearing logic — the loaded
state is already mode-coherent for the target mode. Resets
`activeSection`; preserves `showAdvanced` (UI density preference).
`reset` must explicitly set `preservedOuterText: undefined` because
Zustand's `set` merges with current state and `createDefaultState`
doesn't carry the field.

**UI** (`src/components/upload/`):
- `UploadControl.tsx` — header button next to Reset, hidden file
  input, lifecycle state. Uses `FileReader` rather than
  `File.text()` for jsdom compat. Runs `checkWellFormedness` first
  and short-circuits to `UploadErrorDialog` (syntax-errors variant)
  on failure. Otherwise calls `parseConfig`, then passes
  `parsed.preservedOuterBlocks` into `mapToState` as the second arg.
- `UploadDialog.tsx` — preview modal: summary, replace warning when
  current touched, collapsible discarded (red) + advisory (amber) +
  preserved (sky-blue, info tone) issue groups, Cancel / Load.
  Escape cancels.
- `UploadErrorDialog.tsx` — two variants discriminated by
  `variant.kind`. `'syntax-errors'` renders the per-issue list with
  source snippets (4-char gutter + caret indicator) for files that
  failed the well-formedness gate. `'no-params-block'` is the
  pre-existing variant for files that parsed cleanly but had no
  `params { }` content. Same chrome (title, Close, Escape) either way.
  The syntax-errors variant ALSO renders an "Import" secondary button
  (with warning copy explaining the risk) when `onProceedAnyway` is
  provided — letting the user override a false-positive in our checker. The
  bypass is intentionally NOT offered on the no-params-block variant
  (there's nothing to import). UploadControl stashes the file text on
  the error state so the bypass can resume the post-gate pipeline
  (`parseConfig` → `mapToState` → preview dialog) without re-reading
  the file.
- `src/components/form/PreservedBlocksNotice.tsx` — informational
  banner shown in the form pane (between `ValidationSummary` and the
  section list). Renders when `state.preservedOuterText` is non-empty
  OR when any touched path in state is schema-hidden. Shows a
  collapsible "Show outer-scope content" pre for the verbatim text and
  enumerates hidden-preserved param paths as code chips.

**Round-trip stability** — two properties verified by
`src/parse/__tests__/roundtrip.test.ts`:
1. **Idempotency** for every emit golden: parse → emit → parse → emit
   produces the same bytes as the first emit. This is the user-facing
   property — a load + re-download converges after one cycle.
2. **Byte-stable** parse → emit reproduces the original golden — now only
   for `preserved-outer-blocks.config`. The always-emitted `standard`
   profile (§4) breaks byte-stability for ordinary goldens: it is generated
   under an "Execution profile" banner, but on re-upload the parser captures
   it into `preservedOuterText`, so the second emit re-renders it under the
   generic "Preserved from uploaded config" banner. Identical content, only
   the banner relabels — so those goldens are idempotency-only (they still
   converge after one cycle, verified by property 1).
   `preserved-outer-blocks.config` already carries its own `profiles { }`
   block, which suppresses the generated profile, so there's no banner to
   relabel and it stays byte-stable. (Two other reasons a golden could be
   idempotency-only: stripped emit-test states and the engine-predicate
   `alwaysEmit` asymmetry — see the "Hard rules" gotcha below.)

### 10. Wizard (guided form entry)

An opt-in step-by-step alternative to the form. Triggered by the "Start
wizard…" header button (next to "Load config…"). Replaces the
form/preview layout while active; finishing drops the user back into the
form view with state intact. Reads and writes the same Zustand store as
the form — there is no parallel "wizard state" to keep in sync.

**File layout** (all under `src/components/wizard/`):

- `Wizard.tsx` — container. Owns the local `currentScreenId` and snaps
  to a still-applicable screen if the active subset shrinks.
- `WizardChrome.tsx` — left progress strip with clickable completed
  steps, current title, Back / Next / Finish / Exit buttons.
- `WizardRadioCards.tsx` — generic radio-card group for the top-level
  branching questions (mode, engine, library strategy, etc.).
- `WizardAdvancedSection.tsx` — per-screen "Advanced options" expander
  with local open state (does NOT flip `store.showAdvanced`).
- `flow.ts` — screen catalog. Each screen exports `id`, `title`,
  `shortLabel`, `shouldShow(state)`, optional `canAdvance(state)`, and
  `Component`. The wizard renders only screens whose `shouldShow`
  returns true; skipped screens drop out of the progress strip too.
- `screens/*.tsx` — one file per screen (Mode, InputData,
  ConversionOnly, InputFormat, VendorRaw, SearchEngine, Fasta,
  LibraryStrategy, CarafeInput, EmpiricalLibrary, Skyline,
  ReplicateMetadata, Reports, Panorama, Execution, Review).

**Branching examples** (see `flow.ts` for the full set):

- The Input format screen asks `Thermo .raw` / `Bruker .d.zip` / `mzML`
  and stores the choice in `state.values['quant_input_format']` (a
  wizard-only key; the emitter's `groupBySection` silently drops it
  because there's no `paramMetadata` entry). The Vendor RAW screen is
  shown only when format=raw — `.d.zip` and `mzML` skip it entirely.
- On General-mode entry, the Input format screen runs a one-shot
  detection from file extensions via `dominantFormat(facts)` (from
  `src/lib/spectraFormat.ts`) and pre-seeds the radio when
  unambiguous. PDC mode has no paths to inspect so the user must pick.
- PDC mode hides Replicate-metadata and Empirical-library.
  Vendor RAW now appears in PDC too when the user declares format=raw
  (`use_vendor_raw`'s `visibleWhen: inGeneral` was dropped from
  paramMetadata so the toggle is mode-agnostic).
- Cascadia hides FASTA, Library strategy, Carafe input, and Empirical
  library entirely.
- msconvert-only hides everything between Conversion-scope and
  Panorama.

**Demultiplex routing.** `msconvert.do_demultiplex` is a single global
setting that applies to every stream the workflow msconverts, and it
is **mutually exclusive with `use_vendor_raw`** — demultiplexing
overlapping (staggered) DIA windows is done by msconvert's
`demultiplex` filter, and vendor RAW skips msconvert entirely, so
DIA-NN and Skyline would read overlapped spectra undeconvolved. The
workflow rejects the combination at startup; here it is the
`vendor-raw-demultiplex` error rule (§5).

Because of that, the Vendor RAW screen surfaces demultiplex in **both**
branches:

- "Convert RAW to mzML first" — the ordinary question, in a neutral box.
- "Feed RAW directly to DIA-NN" — same field, in a box that turns red
  when the value is `true`, explaining the conflict. It has to be
  answerable here: an error does not block wizard Next (it surfaces on
  Review), and `setValue` marks a path touched permanently, so a user
  who enabled demultiplex under "convert" and then switched to "direct"
  still emits `msconvert.do_demultiplex = true`. Hiding the field would
  leave them with an unresolvable error.

The Carafe Input screen no longer surfaces demultiplex at all. It used
to, via `showDemultiplexHere()`, for format=raw + vendor RAW — exactly
the combination that is now rejected.

`msconvert.do_simasspectra` and `msconvert.mz_shift_ppm` always live
inside an Advanced expander adjacent to demultiplex, on the convert
branch only.

**Field reuse**: each screen renders existing widgets via `<Field
path="...">` so the dropdowns, glob/regex pair, batch map, etc. behave
identically to the form. Advanced-tier fields rendered inside
`<WizardAdvancedSection>` pass `bypassTier` to `Field` so they appear
without flipping the global `showAdvanced` toggle.

**Selection state for derived choices** (library strategy, optional
empirical library, optional replicate metadata): the wizard reads
`state.touched[path]` rather than `isNonEmptyString(value)` to decide
which radio is selected. This is so a user who picks "Upload my own
library" — which seeds `spectral_library: ''` and marks it touched —
keeps the Upload radio selected while they're mid-edit of an empty
path. Switching radios always uses `clearValue` first, which removes
both the value and the touched flag, so the discriminator resets
cleanly.

**`canAdvance` gating**: the Next button is disabled when the current
screen's `canAdvance(state)` returns false. Used to enforce required
inputs for the screen the user is on (e.g. FASTA path, PDC study ID,
Carafe input matching the selected source). It does NOT block on
errors elsewhere in the state — those are surfaced on the Review
screen via the existing `ValidationSummary`.

**Default state interaction**: `createDefaultState()` seeds
`use_carafe: true`, so the Library-strategy screen lands with Carafe
preselected on a fresh wizard. The radio shows "Predict from FASTA"
with the "Recommended" badge so the user understands the cheaper
option. For DIA-NN, `readStrategy` falls back to `'predict'` when
neither Carafe nor an uploaded library is active — without this,
clicking "Predict" would clear `use_carafe` and leave no radio
selected (because predict is the absence of the other two flags).

### 11. Editable preview (in-place text editing)

The Config-preview pane doubles as a lightweight text editor. The
**Edit** button (in `PreviewActions`) snapshots the current
`emitConfig(state)` into a transient `draft` buffer and switches the
pane from the read-only `GroovyHighlighter` to the **`CodeEditor`**
overlay (a syntax-highlighted editable view). This is **Option A**:
edits round-trip *through state* — the text is never the source of
truth.

- **Suspended projection**: while editing, the live `emitConfig` is not
  rendered (only the `draft` is), so a form change can't clobber the
  buffer. The buffer seeds once on entering edit mode and only changes
  on keystrokes.
- **Apply** runs the shared `runLoadPipeline(draft)` (`src/parse/loadPipeline.ts`
  — the same gate→parse→map used by upload):
    * `syntax-errors` / `no-params` → reuse `UploadErrorDialog`; stay in
      edit mode so the user can fix it (no "Import anyway" bypass here —
      the gate must hold for hand edits).
    * `ok` with notices (issues / duplicates / preserved outer blocks /
      ignored top-level assignments) → reuse `UploadDialog` with
      `source="edit"` (relabels title→"Apply edited configuration?",
      button→"Apply", and the caller passes `confirmReplace={false}`).
      Confirm → `loadFromConfig`; Cancel → stay editing.
    * `ok` with zero notices → commit silently via `loadFromConfig`.
- **Cancel** discards the buffer and resumes the live view.
- **Contract / canonicalization**: Apply re-parses, so it is **lossy**
  exactly like upload — unknown (non-schema) params and any comments
  *inside* `params { }` are dropped; ordering/comments/banners
  regenerate. Outer blocks + hidden params still round-trip (§9).
- **Known interaction (decision (a), accepted + surfaced)**: for a fresh
  config the emitted text contains the generated `standard` profile
  (§4). On Apply the parser captures it into `preservedOuterText`, which
  flips `hasPreservedProfilesBlock` true — so on re-emit the profile is
  re-rendered under the "Preserved from uploaded config" banner and the
  five execution form fields hide (`visibleWhen: noPreservedProfiles`).
  So **Edit→Apply with no changes is not a perfect no-op** for a fresh
  config (config-equivalent, idempotent thereafter). The notices dialog
  surfaces this as "1 item preserved verbatim" rather than hiding it.
- **Shell guarding** (`AppShell`): editing state is mirrored up via
  `PreviewPane`'s `onEditingChange` callback. While editing, AppShell
  disables the Workflow-graph tab (so `PreviewPane` can't unmount and
  lose the buffer), Reset, Start-wizard, and Load-config (`UploadControl`
  gained a `disabled` prop), and dims the `FormPane` with a
  pointer-events overlay. Download/Copy are hidden in the edit toolbar —
  you Apply first, then download from the read-only view (so downloads
  always reflect validated, state-derived output).
- **`CodeEditor` overlay** (`src/components/preview/CodeEditor.tsx`):
  syntax highlighting in an editable area is impossible with a bare
  `<textarea>` (single text color), and editor libraries (CodeMirror /
  Monaco) are barred by hard rules #4/#8. So it's the hand-rolled
  overlay: a **transparent-text `<textarea>` sits exactly on top of a
  highlighted `<pre>`** (rendered via `highlightTokens` — the shared
  helper extracted from `GroovyHighlighter`). The user edits the
  textarea (`text-transparent` + `caret-slate-100`) and sees the colored
  `<pre>` through it. Both layers are full-content-size inside ONE
  scrolling parent, so they scroll together with **no JS scroll-sync**.
  Alignment invariants (verified by `scripts/edit-diag.mjs`):
    * Both layers MUST share `HIGHLIGHT_FONT_CLASSES` (exported from
      `GroovyHighlighter`) + identical `px-3 py-3` padding, or the caret
      drifts off the glyphs.
    * The `<pre>` is in-flow (drives the box height/width, so the pane
      doesn't collapse — the same mechanism the read-only `<pre>` uses);
      the `<textarea>` is `absolute inset-0` over it.
    * The outer `overflow-auto` div is the **sole scroller**; the
      textarea is `overflow-hidden` so it never adds a second scrollbar.
    * A trailing `\n` in a `white-space: pre` block has no height, so a
      zero-width space is appended to the highlight source when the value
      ends in a newline (or is empty) — otherwise the highlight layer is
      one line shorter than the textarea and the bottom drifts.
- **Sticky-stacking-context gotcha (don't regress —
  `scripts/edit-diag.mjs` guards it)**:
    * The preview column is `position: sticky` → a stacking context. A
      dialog rendered inside the aside is trapped at `z:auto` there, so
      the form-dim overlay (`z-10`, which lands in the *root* stacking
      context) paints over it and washes it out. Fix: both dialogs are
      `createPortal`'d to `document.body`.

### 12. Sample-metadata upload (CSV/TSV)

An optional, **GUI-only** feature: users upload a sample-metadata table
(one column per metadata field, one row per sample) via "Load metadata…"
in the header. It is **never emitted into the config** — it drives
metadata-aware form pickers + cross-field validation and can be
re-downloaded after cleaning. Independent of (and coexists with) the
config-upload feature (§9); loading a config preserves loaded metadata and
vice versa.

**Core modules** (`src/metadata/`, app-agnostic except `options.ts`):
- `parseDelimited.ts` — hand-rolled RFC-4180-ish parser → grid of fields
  (handles quoting, embedded delimiters/newlines, CRLF, BOM). Only lexical
  error it raises is an unterminated quoted field; structural checks live
  in the validator. Quotes are special only at field start (lenient).
- `validateMetadata.ts` — `detectFormat` (extension, else sniff tabs vs
  commas in the header) → parse → structural checks → clean table +
  warnings. **Rejects** (errors, no table loads): empty file, header-only
  (no data rows), ragged rows, empty/duplicate column names, no/ambiguous
  `Replicate` column. **Cleans + warns** (table still loads): trims every
  header/cell (warn with sample list), moves a non-first `Replicate` column
  to the front, normalizes `Replicate` casing (case-insensitive match), and
  flags duplicate replicate names. Errors carry a source-line snippet where
  applicable.
- `serializeMetadata.ts` — inverse of the parser; renders the **cleaned**
  table back to CSV/TSV in its original `format` with RFC-4180 quoting.
  `parse(serialize(table))` round-trips. Used by the Download button.
- `options.ts` — `variableColumns` (all columns except `Replicate`),
  `replicateNames`, `columnValues`, and `optionsForSource(table, source,
  controlKey?)`. **Single source of truth** shared by the picker widgets
  and the validation rules.

**Data model**: `MetadataTable = { fileName, format: 'csv'|'tsv',
columns: string[] (Replicate first, unique), rows: Record<col,string>[] }`.
Stored as the optional `metadata` field on `FormState` (so cross-field
rules read `s.metadata`), persisted (store v8), wiped on Reset (explicit
`metadata: undefined` — same Zustand-merge gotcha as `preservedOuterText`).
Actions: `loadMetadata` / `clearMetadata`. Emit + parse ignore it entirely.

**UI**:
- `UploadMetadataControl` (header button, mirrors `UploadControl`:
  FileReader, dialog lifecycle) → `MetadataUploadDialog` (confirm + warning
  summary) or `MetadataErrorDialog` (snippet errors, **no** import-anyway
  bypass). On confirm → `loadMetadata` + auto-switch to the Metadata tab.
- `MetadataPane` (third right-pane tab) — sticky-header / sticky-first-col
  spreadsheet, Download + Clear actions, empty-state prompt.

**Metadata-driven fields**: seven `qc_report.*` / `batch_report.*` fields
use the `metadata-single` / `metadata-multi` widgets with a `metadataSource`
(see §8). They drive: PCA color vars + covariate vars + batch1/batch2 +
control key (`columns`), exclude replicates (`replicates`), control values
(`control-values` — the distinct values of whatever column `control_key`
names). With no table loaded they're free text (unchanged). The
`metadata-*-valid` cross-field rules (§5, rules 20-26) enforce membership
**only when a table is loaded** (error severity, gated on the relevant
`*.skip`), so a stale value from an uploaded config blocks download. The
wizard's QC/batch screens render these via `<Field>`, so the pickers light
up there automatically — no wizard changes.

## Hard rules / invariants

1. **Emit only touched paths.** Never auto-write defaults into state.
2. **The schema is the type authority; `paramMetadata.ts` is the UX
   authority.** Type/default/enum facts always come from
   `schemaDerived.generated.ts`.
3. **Hidden schema params must not appear in the UI** — except when a
   `ParamMeta` opts in via `surfaceHidden: true` (see §1; currently
   `images.diann`). The codegen sets `hidden: true` from the schema; the
   coverage test enforces this with the surfaceHidden caveat.
   `IGNORED_PARAM_PATHS` is the explicit allow-list for params that exist
   in the schema but are intentionally not surfaced (e.g. `aws.batch.*`).
4. **No external component libraries.** Tailwind primitives only — no
   shadcn, Radix, MUI, Headless UI, Mantine, Framer Motion, etc.
5. **No state libraries other than Zustand.**
6. **Strict TypeScript** — no `any`. Use `unknown` + narrowing. `tsconfig`
   has `noUncheckedIndexedAccess`, `noImplicitOverride`, etc.
7. **All emit output is byte-stable** given fixed `version` + `timestamp`
   options. Don't introduce nondeterminism (Sets, Map iteration, etc.) in
   the emit pipeline.
8. **Be efficient with the bundle.** No fixed size ceiling, but don't add
   bloat: prefer hand-rolled SVG / small utilities over heavy npm
   dependencies, especially UI/chart libraries. Run `npm run build` after
   adding a dependency and check the gzipped JS line — a sudden jump of
   tens of KB warrants justification.
9. **Schema lives at the repo root** (`./nextflow_schema.json`), not at
   `../nextflow_schema.json` — this repo is standalone, not a subfolder.
10. **Upload runs the well-formedness gate first.** `UploadControl` must
    call `checkWellFormedness` BEFORE `parseConfig`/`mapToState` and
    short-circuit on any issue. Don't be tempted to "just use the parser's
    errors" — the lexer and parser both intentionally recover from typos
    so they can still report multiple problems in one pass; that recovery
    drops content silently and is unacceptable as a load gate. The gate
    is overridable by the user via the "Import" button on the
    syntax-errors dialog (in case the checker has a false positive on
    valid syntax), but the default path always rejects. The
    well-formedness module is also app-agnostic (zero project-specific
    imports) so it can be lifted into other config GUIs as-is — keep it
    that way.

## Schema sync workflow

When the upstream workflow's schema changes:

```bash
npm run update-schema     # fetches from upstream + runs regen
npm test                  # coverage test will fail if new params unaccounted for
```

When the coverage test fails: add the new param to `paramMetadata.ts`
(with section, tier, help, widget, visibility predicates as needed) or
add it to `IGNORED_PARAM_PATHS`. Then re-run tests.

## Conventions for adding things

### New cross-field rule
1. Append to `crossFieldRules.ts` with a new stable `id`.
2. Add a test pair in `crossFieldRules.test.ts`: one firing case, one silent case.
3. If the rule says "X is required when Y", also add a `requiredWhen`
   predicate to the matching `ParamMeta` entry so the asterisk appears in
   the UI.

### New emit golden scenario
1. Create `src/emit/__tests__/golden/<name>.config` with the exact expected
   output (including the fixed-version/timestamp header).
2. Add a test in `emitConfig.test.ts` that constructs the state and
   asserts equality.

### New parameter (after a schema change)
1. `npm run update-schema` (or `regen-schema` if you've edited the vendored
   schema manually).
2. Coverage test fails listing missing paths.
3. Add a `ParamMeta` entry in the appropriate section of `paramMetadata.ts`
   with `section`, `tier`, `label`, `help`, `widget`, plus `visibleWhen` /
   `requiredWhen` if conditional. Conditional visibility is the only
   "disabled" mechanism — there is no `enabledWhen`; if a field shouldn't
   be edited given other state, hide it via `visibleWhen`.
4. If the new param shouldn't be surfaced: add it to `IGNORED_PARAM_PATHS`
   with a comment explaining why.

### New widget kind
1. Add to the `Widget` union in `paramMetadata.ts`.
2. Implement in `src/components/widgets/`.
3. Add a dispatch case in `Field.tsx`.
4. Add to the `Widget` table in this CLAUDE.md.

### New `UploadIssue` kind
1. Add the variant to the `UploadIssue` union in `src/parse/mapToState.ts`.
2. Decide whether it's a discard or advisory issue and update
   `isDiscardIssue` in `src/components/upload/UploadDialog.tsx`.
3. Add a `formatIssue` case there too — what the user sees in the dialog.
4. Add a firing test in `src/parse/__tests__/mapToState.test.ts`.

### Schema default disagrees with workflow's runtime default
If `npm run update-schema` pulls in a default that doesn't match the value
the workflow actually uses (check the workflow's `nextflow.config`), don't
patch the vendored schema — set `defaultOverride: <real default>` on the
matching `ParamMeta` entry. Leave a short comment explaining why. The
emitter and validator still see the schema default; only the displayed
`Default: X` hint and the input placeholder pick up the override.

### Changing the seeded default state
If you change `createDefaultState()` in `src/state/formState.ts` (e.g.
pre-seeding a new virtual value, changing initial mode), bump
`CURRENT_STORE_VERSION` so `persist.migrate` resets existing browser
drafts to the new defaults. Update the corresponding store test that
asserts `values: { ... }` and the `parsed.version` check in the
persistence test.

### Making a parameter always appear in the generated config
Set `alwaysEmit` on its `ParamMeta` entry — either `true` for unconditional
always-emit, or a `(state) => boolean` predicate when it should only emit
under certain form state (e.g. engine- or feature-gated params). The
emitter includes the param whenever `isAlwaysEmit(meta, state)` is true,
regardless of `touched`. Combine with `defaultOverride` if the UI default
differs from the schema default, and pre-seed the value in
`createDefaultState` so cross-field validators that read it work from
first render.

When you add an `alwaysEmit` field:
- Re-evaluate every golden file in `src/emit/__tests__/golden/` — for
  unconditional `alwaysEmit: true` the field appears in every emit, and
  even a predicate-gated entry will affect many scenarios. Either way,
  most goldens will change.
- The `Default: X` hint is auto-suppressed by `Field.tsx` for
  `alwaysEmit` fields.

### New wizard screen
1. Add a file under `src/components/wizard/screens/` exporting the
   screen component (and a `<name>CanAdvance(state)` function if Next
   should be gated by per-screen validation).
2. Add the screen to the `WizardScreenId` union and the `wizardScreens`
   array in `src/components/wizard/flow.ts`, in the desired flow order.
   Provide `shouldShow(state)` if the screen is conditional (skipped
   for some modes/engines/feature flags) and the optional
   `canAdvance(state)`.
3. Reuse existing widgets via `<Field path="…">`. Render advanced-tier
   fields inside `<WizardAdvancedSection>` and pass `bypassTier` to
   each so they appear without flipping `store.showAdvanced`.
4. For top-level branching questions, use `<WizardRadioCards>` and
   derive the selected option from `state.values` / `state.touched`
   (don't track a separate "user clicked" state — the wizard reads
   from the store on every render).
5. If your screen toggles a virtual flag like `use_carafe` that has an
   `affects` list, remember the radio's selected state must remain
   readable from `state` alone after a click — see the
   "Selection state for derived choices" note in Architecture §10.
6. Run `node scripts/wizard-smoke.mjs --port 5173` and
   `node scripts/wizard-smoke-branches.mjs --port 5173` to verify the
   end-to-end walk and the branch-skipping logic.

## Gotchas

- **`__APP_VERSION__`** is a Vite `define` injected at build time. Tests run
  outside Vite, so `vitest.config.ts` also defines it. If you add code that
  references `__APP_VERSION__` and tests start failing with "is not defined",
  ensure both configs have it.
- **`localStorage` in tests** requires `// @vitest-environment jsdom` at the
  top of the test file.
- **`act()` warnings** are silenced via
  `globalThis.IS_REACT_ACT_ENVIRONMENT = true` in `src/test/setup.ts`.
- **Mode toggle in tests**: prefer `useStore.getState().setMode('pdc')`
  directly. The UI toggle path goes through `window.confirm`, which jsdom
  defaults to returning false on.
- **`metadata` leaks across tests via `setState`.** Zustand's
  `useStore.setState(createDefaultState())` *merges*, and
  `createDefaultState()` has no `metadata` key — so a table loaded by one
  test survives into the next. Reset it explicitly in `beforeEach`:
  `useStore.setState({ ...createDefaultState(), metadata: undefined })`
  (same gotcha the real `reset` action handles).
- **The `quant_spectra_dir` value is a tagged union**, not a plain string.
  Always one of `{kind: 'single', path}`, `{kind: 'list', paths}`, or
  `{kind: 'batch-map', entries}`. The emitter normalizes this to the
  correct Groovy shape. A batch-map entry is `{name, paths: string[]}` — a
  batch may draw from several directories. The emitter writes a bare string
  for a one-path batch and a Groovy list for a multi-path one, so
  single-path batch maps render exactly as they did before multi-path
  support existed (which is what keeps the older goldens byte-identical).
- **Don't commit `tsconfig.tsbuildinfo`** (it's in `.gitignore` but rsync
  can drag it in if you ever copy from elsewhere).
- **Empty `params { }` block** is intentional when nothing is touched
  (and no `alwaysEmit` paths produce a value). The emitter produces
  `params { }` on one line in that case.
- **Section blurbs and per-param `label`/`help` text are emitted into
  the generated config as comments** by the emitter. Edits to
  `sections.ts` blurbs or to `paramMetadata.ts` label/help strings will
  invalidate every emit golden — regenerate them after any such change.
- **Known upstream schema/config drift**: `nextflow_schema.json` declares
  `carafe.cli_options.default = ""`, but the workflow's `nextflow.config`
  defines a long real default. We work around it locally via
  `defaultOverride` on the matching `ParamMeta` entry. If `update-schema`
  ever pulls in a fixed upstream default, the override becomes redundant
  but harmless — feel free to remove it. There's no automated detector.
- **Engine-predicate `alwaysEmit` asymmetry**: `diann.search_params`,
  `diann.fasta_digest_params`, `encyclopedia.{quant,chromatogram}.params`,
  `cascadia.use_gpu`, `cascadia.score_threshold` use a
  `searchEngineIs(...)` predicate for `alwaysEmit`. The predicate
  inspects `state.values['search_engine']` — if `search_engine` is NOT
  in `state.values` (only present via the unconditional `alwaysEmit:
  true + defaultOverride` path), the predicate returns false and those
  engine-specific defaults are NOT emitted. After upload, the loader
  always puts `search_engine` in `state.values`, so re-emit produces a
  more verbose config than some emit-test fixtures predicted. This is
  why `roundtrip.test.ts` uses idempotency for the goldens whose source
  state was stripped, and byte-equality only for the realistic ones.
- **Upload uses `FileReader`, not `File.text()`** in
  `UploadControl.tsx`. The `.text()` method isn't reliably available
  in jsdom across vitest versions; `FileReader` is universally
  supported.
- **Carafe enabled-by-default** means the form is invalid on first load
  until the user picks a Carafe input source (or turns Carafe off). This
  is intentional — Carafe is the recommended library path. Existing tests
  that exercise the user-supplied-library scenarios must explicitly set
  `use_carafe: false`.
- **`search_engine` is `alwaysEmit`-marked and pre-seeded to 'diann'.**
  Tests that construct a `FormState` directly (e.g. via `makeState({...})`
  in `emitConfig.test.ts`) get the alwaysEmit behavior automatically and
  will see `search_engine = 'diann'` in their golden files even if the
  test doesn't set it. If a test scenario means a different engine (e.g.
  Cascadia), the test should set `search_engine` explicitly to match.
- **No-search mode is no longer reachable via the UI.** The "(no search)"
  option was removed from `EnumSelect` because the user wants a search
  engine always selected. The underlying validation rule
  `no-search-requires-library` and the emitter's null handling still
  exist (for testing and for users who hand-edit the generated config),
  but the form cannot produce `search_engine: null` through any control.
- **`Field` accepts a `bypassTier` prop.** The form pane gates advanced
  fields on `store.showAdvanced`; the wizard renders advanced fields
  inside its per-screen `<WizardAdvancedSection>` with `bypassTier`
  so the global toggle stays unaffected. Visibility predicates
  (`visibleWhen`) are still honored.

## Testing strategy — what's worth testing and what isn't

| Surface                              | Tested? | Why                                  |
| ------------------------------------ | ------- | ------------------------------------ |
| `emitConfig` golden files            | YES     | Output correctness IS the product    |
| `groovyLiteral` escape edge cases    | YES     | Quote/backslash edge cases           |
| Every cross-field validation rule    | YES     | One firing + one silent test each    |
| Per-widget Zod schemas               | LIGHT   | Zod is itself tested                 |
| `requiredWhen` predicates            | YES     | They drive visible required markers  |
| Metadata coverage gate               | YES     | Highest-leverage drift detector      |
| Trickiest widgets (BatchMap, ModeToggle, GlobRegexPair, SpectraSourceRadio) | YES | Hand-tested interactions |
| `computeWorkflowGraph` scenarios     | YES     | Each conditional gate has a test     |
| Full form snapshots                  | NO      | High churn, low signal               |
| Zustand store internals              | LIGHT   | Smoke + mode-switch + loadFromConfig |
| Groovy lexer / parser / parseConfig  | YES     | Every shape the emitter produces     |
| `mapToState` issue categorization    | YES     | One firing test per UploadIssue kind |
| `checkWellFormedness` (each malformed shape) | YES | Pre-flight gate must not let real syntax errors through |
| `checkWellFormedness` (emit goldens) | YES     | Regression guard: emitter output must always be well-formed |
| `checkWellFormedness` outer-block tolerance | YES | Nextflow process selectors, dotted refs, GString in outer blocks must NOT fail the gate |
| URL percent-encoding (`encodeUrl`)   | YES     | Spaces→%20, no double-encode, local paths untouched |
| Round-trip (parse → emit) idempotency| YES     | Per emit golden                      |
| Round-trip byte-stable               | PARTIAL | Only preserved-outer-blocks now — see §9 |
| Upload UI flow (UploadControl)       | YES     | Button → preview → load → store; both error variants |
| Editable preview (PreviewPane)       | YES     | Edit→Apply round-trip: clean / notices-confirm / syntax-reject / cancel |
| CodeEditor overlay                   | YES     | Textarea binding + highlight layer sync; alignment is visual (edit-diag) |
| Metadata parse/validate/serialize    | YES     | Delimiter sniff, quotes, trim/dedup/Replicate-first, round-trip — §12 |
| Metadata picker widgets + pane       | YES     | Free-text fallback vs constrained picker; spreadsheet + download/clear |
| Metadata membership rules            | YES     | One firing + one silent per `metadata-*-valid` rule |
| Visual regression (SVG)              | MANUAL  | `scripts/visual-check.mjs` on demand |

Current count: **637 tests across 32 files**. Run `npm test` before pushing.

Every meaningful new feature should grow tests. Every golden-file scenario
change should regenerate the golden bytes (compare carefully — the diff
should match what you intended to change).

## Deployment

- GitHub Pages, served by `.github/workflows/deploy.yml`.
- **Trigger**: a published GitHub Release (or manual `workflow_dispatch`).
  Pushes to `main` do NOT deploy — version is meant to be bumped
  deliberately by cutting a release.
- **Version source**: the release tag name (e.g. `v1.2.3`) is passed to
  the build via the `APP_VERSION` env var. `vite.config.ts` strips the
  leading `v` and injects the result as `__APP_VERSION__`, which surfaces
  in the footer (`v1.2.3`) and the emit header comment. For local builds
  and `npm run dev` (no `APP_VERSION` set) the version falls back to the
  sentinel `0.0.1-dev` so a non-release bundle is visually obvious.
  `package.json`'s `version` field is no longer load-bearing — it can
  stay at any value without affecting deployment.
- Build runs `typecheck`, `test`, then `build`. All three must pass for
  the deploy step to run.
- **One-time manual setup**: in the repo's GitHub settings, set
  **Settings → Pages → Source: GitHub Actions**.
- Vite `base: '/nf-skyline-dia-ms-config-gui/'` matches the deployed URL
  slug. If the repo is renamed, update `vite.config.ts`.

## What NOT to do

- Don't fetch `nextflow_schema.json` at runtime. It's a build-time input,
  not an HTTP dependency.
- Don't auto-prefill input values with schema defaults. Use placeholders
  + the `Default: X` hint instead.
- Don't expose hidden / legacy params (e.g. `skyline_document_name` top-level
  alias) in the UI.
- Don't add UI libraries. Tailwind primitives + small custom components only.
- Don't break the byte-stability of emit output. If you need new nondeterministic
  state, route it through emit options instead.
- Don't commit `dist/`, `node_modules/`, or `tsconfig.tsbuildinfo`.
- Don't add features when fixing bugs. Fix the bug, ship.
- Don't write multi-paragraph code comments. Most code shouldn't need
  comments at all.
