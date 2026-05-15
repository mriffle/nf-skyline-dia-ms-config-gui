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
    │   ├── crossFieldRules.ts          18 hand-authored cross-field rules
    │   ├── runValidation.ts            entry point: state → ValidationReport
    │   └── types.ts
    ├── emit/
    │   ├── groovyLiteral.ts            value → Groovy literal
    │   ├── namespaceTree.ts            dotted paths → nested block tree
    │   ├── format.ts                   header + indentation helpers
    │   ├── emitConfig.ts               pure: state → string
    │   └── __tests__/golden/*.config   golden output files (checked in)
    ├── components/
    │   ├── layout/                     AppShell (hosts Preview/Workflow tabs), SectionNav, FormPane
    │   ├── form/                       Section, Field, FieldShell, HelpPopover,
    │   │                               AdvancedToggle, ValidationSummary
    │   ├── widgets/                    10 widgets — see "Widget catalog" below
    │   ├── preview/                    PreviewPane, GroovyHighlighter, PreviewActions
    │   ├── workflow/                   WorkflowGraphPane, WorkflowGraphSvg (live DAG render)
    │   └── ModeToggle.tsx              top-of-form General/PDC mode selector
    ├── workflow/
    │   ├── types.ts                    GraphNode/GraphEdge/WorkflowGraph types
    │   ├── computeWorkflowGraph.ts     pure: state → WorkflowGraph
    │   └── layout.ts                   stage-banded (x, y) positioning + viewBox
    ├── hooks/                          useFieldValue, useValidation, useFormState
    └── lib/
        ├── download.ts, clipboard.ts
        └── formatDefault.ts            renders schema defaults for hints/placeholders
```

`scripts/visual-check.mjs` (Playwright + chromium) seeds `localStorage` for ten
form-state scenarios and screenshots both tabs. Used for visual smoke-checks
when touching the workflow graph or layout. Run `npm run dev` first, then
`node scripts/visual-check.mjs --port 5173`. Output PNGs land in `screenshots/`
(gitignored). `scripts/click-check.mjs` is a smaller companion that exercises
the click-to-focus behavior on input nodes.

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
  `carafe.cli_options` (predicate on `carafeEnabled`), and
  `skyline.group_proteins` / `skyline.group_by_gene` /
  `skyline.protein_parsimony` (predicate on `skylineNotSkipped`).

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
  showAdvanced: boolean,
  activeSection: SectionId | null,
  storeVersion: <CURRENT_STORE_VERSION>,
}
```

Actions: `setValue`, `clearValue`, `setMode`, `toggleAdvanced`,
`setShowAdvanced`, `setActiveSection`, `reset`. Mode-change clearing logic
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

If you change what's pre-seeded, bump `CURRENT_STORE_VERSION` so the
`persist.migrate` step resets stale browser drafts to the new default.

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

### 5. Validation

Two layers, both running on every state change:

1. **Per-widget Zod schemas** (`fieldSchemas.ts`) — applied only to *visible*
   and *touched* fields. Type-shape correctness.
2. **Hand-rolled cross-field rules** (`crossFieldRules.ts`) — 18 rules, each
   with `id`, `severity: 'error' | 'warning'`, and a `check(state)` returning
   `null` or `{ message, fields }`. Rule IDs are stable and referenced by
   tests.

`runValidation(state) → ValidationReport`. The download / copy buttons
gate on `report.isDownloadable` (no error-severity issues anywhere).
Warnings render in the summary but do not block.

### 6. Groovy emitter

Pure function `emitConfig(state, options?) → string`. Highest-stakes
correctness boundary in the app. Order of operations:

1. Filter to touched entries (plus any `alwaysEmit` paths).
2. Normalize the `quant_spectra_dir` tagged union (`{kind: 'single'|'list'|'batch-map', ...}`)
   to its concrete shape.
3. Skip *virtual* entries that don't write a real path.
4. **Group entries by UI section** (in `sections.ts` order). Sections with
   no emitted entries are dropped.
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

The right column of the app exposes two tabs: **Config preview** (the Groovy
override emitter, default tab) and **Workflow graph** (an SVG visualization
of the Nextflow DAG that *would actually run* given the current form state).

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
- **`AppShell.tsx`** owns the active-tab state (`'preview' | 'workflow'`,
  defaults to `'preview'`). The mobile show/hide toggle wraps the entire
  tabbed area, preserving prior behavior.

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
| `batch-map`           | virtual — list of `{name, path}` rows             |
| `spectra-source`      | virtual — radio for single / list / batch-map     |

Virtual widgets have `virtual: true` and list real schema paths in `affects`
so the coverage test sees them as accounted for.

## Hard rules / invariants

1. **Emit only touched paths.** Never auto-write defaults into state.
2. **The schema is the type authority; `paramMetadata.ts` is the UX
   authority.** Type/default/enum facts always come from
   `schemaDerived.generated.ts`.
3. **Hidden schema params must not appear in the UI.** The codegen sets
   `hidden: true` from the schema; the coverage test enforces this.
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

## Schema sync workflow

When the upstream workflow's schema changes:

```bash
npm run update-schema     # fetches from upstream + runs regen
npm test                  # coverage test will fail if new params unaccounted for
```

When the coverage test fails: add the new param to `paramMetadata.ts`
(with section, tier, help, widget, visibility predicates as needed) or
add it to `IGNORED_PARAM_PATHS`. Then re-run tests.

The upstream schema has a known typo: key `cascadia.score_threshold ` has
a trailing space. The codegen trims keys, so `paramMetadata.ts` uses the
clean name. Don't try to "fix" this locally — the trim handles it.

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
- **The `quant_spectra_dir` value is a tagged union**, not a plain string.
  Always one of `{kind: 'single', path}`, `{kind: 'list', paths}`, or
  `{kind: 'batch-map', entries}`. The emitter normalizes this to the
  correct Groovy shape.
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
| Zustand store internals              | LIGHT   | Smoke + mode-switch behavior         |
| Visual regression (SVG)              | MANUAL  | `scripts/visual-check.mjs` on demand |

Current count: **282 tests across 17 files**. Run `npm test` before pushing.

Every meaningful new feature should grow tests. Every golden-file scenario
change should regenerate the golden bytes (compare carefully — the diff
should match what you intended to change).

## Deployment

- GitHub Pages, served by `.github/workflows/deploy.yml`.
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
