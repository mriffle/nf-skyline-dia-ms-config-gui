// Pure function: FormState -> Nextflow override-config string.
//
// Pipeline:
//   1. Collect (path, value) entries from state.values filtered by touched
//      (plus alwaysEmit paths).
//   2. Normalize tagged-union values (quant_spectra_dir variants).
//   3. Drop entries whose path is a virtual paramMetadata entry that does
//      not write back to itself.
//   4. Group entries by UI section (in section order from sections.ts).
//   5. Within each section, build a namespace tree and render it.
//   6. Each section emits a banner comment (title + blurb); each emitted
//      leaf (or dotted-collapsed leaf) emits a comment with its label +
//      help text just above the assignment.
//
// Output ordering is now section-driven (matching the form UI), not
// "scalars-first" as it was previously. Order within a section follows
// paramMetadata order.

import type { FormState, ParamMeta, SectionId } from '../params/paramMetadata';
import {
  paramMetadata,
  paramMetadataByPath,
  getEffectiveDefault,
  isAlwaysEmit,
  hasPreservedProfilesBlock,
} from '../params/paramMetadata';
import { sections, type Section } from '../params/sections';
import { toGroovyLiteral } from './groovyLiteral';
import {
  buildNamespaceTree,
  freezeTree,
  type OrderedEntry,
  type TreeNode,
} from './namespaceTree';
import { header, INDENT } from './format';

declare const __APP_VERSION__: string;

export interface EmitOptions {
  readonly version?: string;
  readonly timestamp?: Date;
}

// Maximum content width per comment line, measured AFTER the indent and
// the leading "// ". Total rendered line ~= indent + 3 + this value.
const COMMENT_BODY_WIDTH = 81;

// Width of the '=' bars in section banner comments (content only).
const BANNER_BAR_WIDTH = 72;

// Resource/cache params that are emitted into the generated `standard`
// execution profile rather than into params { }. They never appear in the
// params block; renderProfilesBlock reads them directly from state.
const PROFILE_PARAM_PATHS: ReadonlySet<string> = new Set([
  'max_cpus',
  'max_memory',
  'max_time',
  'mzml_cache_directory',
  'panorama_cache_directory',
]);

// ---------------------------------------------------------------------------
// Param ordering & virtual handling
// ---------------------------------------------------------------------------

interface PathInfo {
  // True only for paths whose metadata entry is virtual AND which is
  // not also one of the entry's own `affects` targets. Such paths exist
  // purely as UI controls (e.g. `use_carafe`, `quant_spectra_files`) and
  // should never appear in the emitted config. Paths that are "virtual"
  // but write back to themselves (e.g. `quant_spectra_dir`) are real
  // emit targets — the virtual flag merely says the UI uses a custom
  // widget — and are NOT marked virtualOnly here.
  readonly virtualOnly: boolean;
  readonly order: number; // metadata appearance index
}

const PATH_INFO: ReadonlyMap<string, PathInfo> = (() => {
  const m = new Map<string, PathInfo>();
  paramMetadata.forEach((meta, i) => {
    const writesSelf = meta.virtual === true && (meta.affects?.includes(meta.path) ?? false);
    const virtualOnly = meta.virtual === true && !writesSelf;
    m.set(meta.path, { virtualOnly, order: i });
  });
  return m;
})();

// Real schema paths exposed only through a virtual entry's `affects`
// list (e.g. `quant_spectra_glob` reachable via the glob-regex-pair
// `quant_spectra_files`). They're emitted without a per-param comment
// but still need a section assignment and an ordering hint, both
// inherited from the parent virtual.
const VIRTUAL_PARENT_BY_AFFECTED_PATH: ReadonlyMap<string, ParamMeta> = (() => {
  const directlyBound = new Set<string>();
  for (const meta of paramMetadata) {
    if (meta.virtual !== true) directlyBound.add(meta.path);
  }
  const out = new Map<string, ParamMeta>();
  for (const meta of paramMetadata) {
    if (!meta.affects) continue;
    for (const affected of meta.affects) {
      if (directlyBound.has(affected)) continue;
      if (out.has(affected)) continue;
      out.set(affected, meta);
    }
  }
  return out;
})();

function infoForPath(path: string): PathInfo {
  const direct = PATH_INFO.get(path);
  if (direct) return direct;
  const parent = VIRTUAL_PARENT_BY_AFFECTED_PATH.get(path);
  if (parent) {
    const parentInfo = PATH_INFO.get(parent.path);
    if (parentInfo) return { virtualOnly: false, order: parentInfo.order };
  }
  return { virtualOnly: false, order: Number.POSITIVE_INFINITY };
}

// ---------------------------------------------------------------------------
// quant_spectra_dir tagged-union normalization
// ---------------------------------------------------------------------------

function normalizeQuantSpectraDir(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  const v = value as { kind?: unknown; path?: unknown; paths?: unknown; entries?: unknown };
  if (v.kind === 'single' && typeof v.path === 'string') {
    return v.path;
  }
  if (v.kind === 'list' && Array.isArray(v.paths)) {
    return v.paths.filter((p): p is string => typeof p === 'string');
  }
  if (v.kind === 'batch-map' && Array.isArray(v.entries)) {
    const out: Record<string, string> = {};
    for (const raw of v.entries as readonly unknown[]) {
      if (raw === null || typeof raw !== 'object') continue;
      const e = raw as { name?: unknown; path?: unknown };
      if (typeof e.name !== 'string' || typeof e.path !== 'string') continue;
      out[e.name] = e.path;
    }
    return out;
  }
  return value;
}

function normalizeValue(path: string, value: unknown): unknown {
  if (path === 'quant_spectra_dir') {
    return normalizeQuantSpectraDir(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Entry collection
// ---------------------------------------------------------------------------

function collectEntries(state: FormState): OrderedEntry[] {
  const entries: OrderedEntry[] = [];
  const seenPaths = new Set<string>();

  // The resource/cache params are routed into the generated standard profile
  // — but only when we actually generate it. If the upload owns the profiles
  // layer the generated profile is suppressed, so any such param loaded from
  // the upload must still emit into params { } (top-level) to avoid dropping
  // it silently.
  const generatesProfile = !hasPreservedProfilesBlock(state.preservedOuterText);

  const consider = (path: string, rawValue: unknown): void => {
    if (seenPaths.has(path)) return;
    if (generatesProfile && PROFILE_PARAM_PATHS.has(path)) return; // in the profile block
    const info = infoForPath(path);
    if (info.virtualOnly) return; // UI-only virtuals don't emit
    const value = normalizeValue(path, rawValue);
    if (value === undefined) return;
    seenPaths.add(path);
    entries.push({ path, value, order: info.order });
  };

  // 1. Touched paths.
  for (const [path, isTouched] of Object.entries(state.touched)) {
    if (isTouched !== true) continue;
    if (!(path in state.values)) continue;
    consider(path, state.values[path]);
  }

  // 2. AlwaysEmit paths. Value from state.values if present (even untouched —
  // e.g. seeded by createDefaultState); otherwise the effective default.
  // alwaysEmit may be a predicate, in which case it gates on form state.
  for (const meta of paramMetadata) {
    if (!isAlwaysEmit(meta, state)) continue;
    if (seenPaths.has(meta.path)) continue;
    const rawValue =
      meta.path in state.values ? state.values[meta.path] : getEffectiveDefault(meta);
    consider(meta.path, rawValue);
  }

  entries.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
  return entries;
}

interface SectionEntries {
  readonly section: Section;
  readonly entries: OrderedEntry[];
}

interface GroupedEntries {
  readonly sectionGroups: SectionEntries[];
  // Entries with no direct ParamMeta and no virtual-parent fallback —
  // typically hidden / infrastructure params loaded verbatim from an
  // uploaded config. Rendered in their own banner at the end of
  // params { }.
  readonly preservedEntries: OrderedEntry[];
}

function groupBySection(entries: readonly OrderedEntry[]): GroupedEntries {
  const bySectionId = new Map<SectionId, OrderedEntry[]>();
  const preservedEntries: OrderedEntry[] = [];
  for (const entry of entries) {
    const meta =
      paramMetadataByPath[entry.path] ??
      VIRTUAL_PARENT_BY_AFFECTED_PATH.get(entry.path);
    if (!meta) {
      preservedEntries.push(entry);
      continue;
    }
    const bucket = bySectionId.get(meta.section);
    if (bucket) bucket.push(entry);
    else bySectionId.set(meta.section, [entry]);
  }
  const sectionGroups: SectionEntries[] = [];
  for (const section of sections) {
    const e = bySectionId.get(section.id);
    if (!e || e.length === 0) continue;
    sectionGroups.push({ section, entries: e });
  }
  preservedEntries.sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  return { sectionGroups, preservedEntries };
}

// ---------------------------------------------------------------------------
// Comment rendering helpers
// ---------------------------------------------------------------------------

function wrapCommentLines(text: string, level: number): string[] {
  const indent = INDENT.repeat(level);
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];
  const out: string[] = [];
  let current = '';
  for (const w of words) {
    if (current.length === 0) {
      current = w;
    } else if (current.length + 1 + w.length <= COMMENT_BODY_WIDTH) {
      current = `${current} ${w}`;
    } else {
      out.push(current);
      current = w;
    }
  }
  if (current.length > 0) out.push(current);
  return out.map((line) => `${indent}// ${line}`);
}

function renderSectionBanner(section: Section, level: number): string[] {
  const indent = INDENT.repeat(level);
  const bar = `${indent}// ${'='.repeat(BANNER_BAR_WIDTH)}`;
  const titleLine = `${indent}// ${section.title}`;
  const blurbLines = wrapCommentLines(section.blurb, level);
  return [bar, titleLine, bar, ...blurbLines];
}

function renderParamComment(meta: ParamMeta, level: number): string[] {
  const text = `${meta.label} — ${meta.help}`;
  return wrapCommentLines(text, level);
}

// ---------------------------------------------------------------------------
// Tree rendering
// ---------------------------------------------------------------------------

function renderAssignment(name: string, value: unknown, level: number): string {
  const prefix = INDENT.repeat(level);
  const literal = toGroovyLiteral(value, level * 4, name);
  return `${prefix}${name} = ${literal}`;
}

// Render a leaf (with its comment header) at the given indent level. The
// `displayName` is what appears on the left of `=` — may be a dotted form
// when a single-child branch has been collapsed into the parent.
function renderLeafLines(
  metaPath: string,
  displayName: string,
  value: unknown,
  level: number,
): string[] {
  const meta = paramMetadataByPath[metaPath];
  const comment = meta ? renderParamComment(meta, level) : [];
  return [...comment, renderAssignment(displayName, value, level)];
}

function renderNodes(nodes: readonly TreeNode[], level: number): string[] {
  const ordered = [...nodes].sort((a, b) => a.order - b.order);
  const out: string[] = [];
  for (let i = 0; i < ordered.length; i++) {
    if (i > 0) out.push('');
    out.push(...renderNode(ordered[i]!, level));
  }
  return out;
}

function renderNode(node: TreeNode, level: number): string[] {
  if (node.kind === 'leaf') {
    const tail = node.path.split('.').pop()!;
    return renderLeafLines(node.path, tail, node.value, level);
  }
  return renderBranch(node, level);
}

function renderBranch(
  branch: Extract<TreeNode, { kind: 'branch' }>,
  level: number,
): string[] {
  const children = branch.children;
  if (children.length === 1) {
    const child = children[0]!;
    if (child.kind === 'leaf') {
      const dotted = `${branch.name}.${child.path.split('.').pop()!}`;
      return renderLeafLines(child.path, dotted, child.value, level);
    }
    const inner = renderBranch(child, level);
    return inner.map((line) => prependNamespace(line, branch.name, level));
  }
  const prefix = INDENT.repeat(level);
  const inner = renderNodes(children, level + 1);
  return [`${prefix}${branch.name} {`, ...inner, `${prefix}}`];
}

/**
 * Prepend `name.` to the identifier at the start of an emitted line whose
 * indentation matches `level`. Used to flatten single-child nested branches
 * into dotted form (e.g. `encyclopedia.quant.params = ...`).
 *
 * Lines starting with `//`, lines that are deeper (extra leading spaces),
 * empty lines, and block-closing `}` lines are left alone.
 */
function prependNamespace(line: string, name: string, level: number): string {
  const prefix = INDENT.repeat(level);
  if (!line.startsWith(prefix)) return line;
  const next = line.charAt(prefix.length);
  if (next === '' || next === ' ' || next === '}' || next === '/') return line;
  const rest = line.slice(prefix.length);
  return `${prefix}${name}.${rest}`;
}

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------

function defaultVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function emitConfig(state: FormState, options?: EmitOptions): string {
  const version = options?.version ?? defaultVersion();
  const timestamp = options?.timestamp ?? new Date();
  const head = header(version, timestamp);

  const all = collectEntries(state);
  const grouped = groupBySection(all);
  const empty = grouped.sectionGroups.length === 0 && grouped.preservedEntries.length === 0;
  const paramsBody = empty ? 'params { }' : renderParamsBlock(grouped);

  return `${head}\n${paramsBody}\n${renderProfilesBlock(state)}${renderPreservedOuterBlocks(state.preservedOuterText)}`;
}

// Effective Groovy literal for a profile-bound param: the user's value if
// set, otherwise the field's effective default.
function profileLiteral(state: FormState, path: string): string {
  const meta = paramMetadataByPath[path];
  const raw =
    path in state.values
      ? state.values[path]
      : meta
        ? getEffectiveDefault(meta)
        : undefined;
  return toGroovyLiteral(raw, 0, path);
}

// Always-emitted `standard` execution profile, built from the resource/cache
// form fields. Nextflow applies the `standard` profile automatically when no
// -profile is given, so these settings take effect by default. Suppressed
// when the uploaded config already carried its own profiles { } block — the
// user owns the profiles layer and we never override it.
function renderProfilesBlock(state: FormState): string {
  if (hasPreservedProfilesBlock(state.preservedOuterText)) return '';
  const bar = `// ${'='.repeat(BANNER_BAR_WIDTH)}`;
  const cpus = profileLiteral(state, 'max_cpus');
  const memory = profileLiteral(state, 'max_memory');
  const time = profileLiteral(state, 'max_time');
  const mzmlCache = profileLiteral(state, 'mzml_cache_directory');
  const panoramaCache = profileLiteral(state, 'panorama_cache_directory');
  const i1 = INDENT;
  const i2 = INDENT.repeat(2);
  const lines: string[] = [
    bar,
    '// Execution profile',
    bar,
    ...wrapCommentLines(
      'This is the standard profile — Nextflow applies it automatically when ' +
        'you run without a -profile option, so these settings take effect by ' +
        'default. resourceLimits caps the CPUs, memory, and walltime any single ' +
        'task may request — edit them to match the machine you run on. The ' +
        'workflow also ships slurm and awsbatch profiles; pass e.g. ' +
        '`-profile slurm` to use one instead.',
      0,
    ),
    'profiles {',
    `${i1}standard {`,
    `${i2}process.executor = 'local'`,
    '',
    `${i2}// Cap on the resources any single task may request.`,
    `${i2}process.resourceLimits = [ cpus: ${cpus}, memory: ${memory}, time: ${time} ]`,
    '',
    `${i2}// Where msconvert mzML output and downloaded Panorama files`,
    `${i2}// are cached between runs.`,
    `${i2}params.mzml_cache_directory = ${mzmlCache}`,
    `${i2}params.panorama_cache_directory = ${panoramaCache}`,
    `${i1}}`,
    '}',
  ];
  return `\n${lines.join('\n')}\n`;
}

function renderParamsBlock(grouped: GroupedEntries): string {
  const bodyLines: string[] = [];
  for (let i = 0; i < grouped.sectionGroups.length; i++) {
    if (i > 0) bodyLines.push('');
    const { section, entries } = grouped.sectionGroups[i]!;
    const tree = buildNamespaceTree(entries);
    const topNodes = freezeTree(tree);
    bodyLines.push(...renderSectionBanner(section, 1));
    bodyLines.push('');
    bodyLines.push(...renderNodes(topNodes, 1));
  }
  if (grouped.preservedEntries.length > 0) {
    if (grouped.sectionGroups.length > 0) bodyLines.push('');
    bodyLines.push(...renderPreservedParamsBanner(1));
    bodyLines.push('');
    const tree = buildNamespaceTree(grouped.preservedEntries);
    const topNodes = freezeTree(tree);
    bodyLines.push(...renderNodes(topNodes, 1));
  }
  return `params {\n${bodyLines.join('\n')}\n}`;
}

// Banner above the "preserved params" sub-block inside params { } —
// covers hidden / infrastructure params that were loaded from an
// uploaded config but aren't surfaced in the form (e.g. `images.*`).
function renderPreservedParamsBanner(level: number): string[] {
  const indent = INDENT.repeat(level);
  const bar = `${indent}// ${'='.repeat(BANNER_BAR_WIDTH)}`;
  return [
    bar,
    `${indent}// Preserved from uploaded config`,
    bar,
    ...wrapCommentLines(
      'Parameters loaded verbatim from your uploaded config that are not surfaced in the form (typically infrastructure or pinned image versions). Use Reset to remove them.',
      level,
    ),
  ];
}

// Preserved outer blocks (process { }, profiles { }, ...) captured from
// a previously uploaded config. Rendered verbatim after the params { }
// block under an explanatory banner so the user can tell what came from
// where. Empty string when there's nothing to preserve.
function renderPreservedOuterBlocks(text: string | undefined): string {
  if (text === undefined || text.length === 0) return '';
  const banner = [
    '',
    `// ${'='.repeat(BANNER_BAR_WIDTH)}`,
    '// Preserved from uploaded config',
    `// ${'='.repeat(BANNER_BAR_WIDTH)}`,
    '// These blocks were present in the uploaded config alongside',
    '// params { }. They are emitted verbatim and not validated.',
    '// Use Reset in the form to remove them.',
    '',
  ].join('\n');
  // Ensure trailing newline so the file always ends cleanly.
  const trimmed = text.replace(/\s+$/, '');
  return `${banner}${trimmed}\n`;
}
