// Pure function: FormState -> Nextflow override-config string.
//
// Pipeline:
//   1. Collect (path, value) entries from state.values filtered by touched.
//   2. Normalize tagged-union values (quant_spectra_dir variants).
//   3. Drop entries whose path is a virtual paramMetadata entry (the
//      virtual writes to its `affects` set; only the real underlying
//      paths reach us as touched entries).
//   4. Order entries by paramMetadata appearance; unknown paths go last
//      in alphabetical order.
//   5. Build a namespace tree and render it into the params { } body.

import type { FormState } from '../params/paramMetadata';
import { paramMetadata, getEffectiveDefault } from '../params/paramMetadata';
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

function infoForPath(path: string): PathInfo {
  return PATH_INFO.get(path) ?? { virtualOnly: false, order: Number.POSITIVE_INFINITY };
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

  const consider = (path: string, rawValue: unknown): void => {
    if (seenPaths.has(path)) return;
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

  // 2. AlwaysEmit paths. The value comes from state.values if present
  // (even when not touched — e.g. seeded by createDefaultState); otherwise
  // we fall back to the metadata's effective default.
  for (const meta of paramMetadata) {
    if (meta.alwaysEmit !== true) continue;
    if (seenPaths.has(meta.path)) continue;
    const rawValue =
      meta.path in state.values ? state.values[meta.path] : getEffectiveDefault(meta);
    consider(meta.path, rawValue);
  }

  // Stable sort: metadata order first, then alphabetical for unknowns
  // (which share Infinity).
  entries.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
  return entries;
}

// ---------------------------------------------------------------------------
// Tree rendering
// ---------------------------------------------------------------------------

/**
 * Render a list of TreeNodes at the given indent level. At a branch with
 * exactly one direct child the recursion collapses the segment to dotted
 * form; multi-child branches become `name { … }` blocks.
 *
 * If `scalarsFirst` is true (used for the top-level `params { }` body
 * per the spec), leaves are emitted before branches; otherwise nodes
 * are emitted strictly in paramMetadata order.
 */
function renderNodes(
  nodes: readonly TreeNode[],
  level: number,
  scalarsFirst: boolean,
): string[] {
  const ordered = scalarsFirst ? splitScalarsFirst(nodes) : sortedByOrder(nodes);
  const out: string[] = [];
  for (const node of ordered) {
    if (node.kind === 'leaf') {
      out.push(renderAssignment(node.path.split('.').pop()!, node.value, level));
    } else {
      out.push(...renderBranch(node, level));
    }
  }
  return out;
}

function sortedByOrder(nodes: readonly TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => a.order - b.order);
}

function splitScalarsFirst(nodes: readonly TreeNode[]): TreeNode[] {
  const leaves = nodes
    .filter((n): n is Extract<TreeNode, { kind: 'leaf' }> => n.kind === 'leaf')
    .sort((a, b) => a.order - b.order);
  const branches = nodes
    .filter((n): n is Extract<TreeNode, { kind: 'branch' }> => n.kind === 'branch')
    .sort((a, b) => a.order - b.order);
  return [...leaves, ...branches];
}

function renderAssignment(name: string, value: unknown, level: number): string {
  const prefix = INDENT.repeat(level);
  const literal = toGroovyLiteral(value, level * 4, name);
  return `${prefix}${name} = ${literal}`;
}

function renderBranch(
  branch: Extract<TreeNode, { kind: 'branch' }>,
  level: number,
): string[] {
  const children = branch.children;
  if (children.length === 1) {
    const child = children[0]!;
    if (child.kind === 'leaf') {
      // Dotted form: e.g. `pdc.study_id = 'X'`.
      const dottedName = `${branch.name}.${child.path.split('.').pop()!}`;
      return [renderAssignment(dottedName, child.value, level)];
    }
    // Single nested branch — recurse, prepending this segment to the
    // produced lines' first identifier. We achieve this by rendering
    // the sub-branch then prepending `branch.name.` to the leading
    // identifier of each emitted line. Simpler: recurse with a wrapped
    // name.
    const childBranch = child;
    const inner = renderBranch(childBranch, level);
    return inner.map((line) => prependNamespace(line, branch.name, level));
  }
  // Multi-child: emit a block. Inside a block, strict paramMetadata
  // order (no scalars-first hoisting).
  const prefix = INDENT.repeat(level);
  const inner = renderNodes(children, level + 1, false);
  const out: string[] = [];
  out.push(`${prefix}${branch.name} {`);
  out.push(...inner);
  out.push(`${prefix}}`);
  return out;
}

/**
 * Prepend `name.` to the identifier at the start of a rendered dotted
 * assignment or block-opening line. Used to flatten single-child nested
 * branches into dotted form (e.g. `encyclopedia.quant.params = ...` or
 * `encyclopedia.quant { ... }`).
 *
 * Only the first line at exactly `level` indentation gets the prefix;
 * deeper lines (block bodies) and the closing `}` are left untouched.
 */
function prependNamespace(line: string, name: string, level: number): string {
  const prefix = INDENT.repeat(level);
  // Match exactly `prefix` followed by a non-space character — i.e. the
  // line is at this level's depth, not deeper.
  if (!line.startsWith(prefix)) return line;
  const next = line.charAt(prefix.length);
  if (next === ' ' || next === '' || next === '}') return line;
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

  const entries = collectEntries(state);
  const tree = buildNamespaceTree(entries);
  const topNodes = freezeTree(tree);

  const head = header(version, timestamp);
  if (topNodes.length === 0) {
    return `${head}\nparams { }\n`;
  }
  const bodyLines = renderNodes(topNodes, 1, true);
  return `${head}\nparams {\n${bodyLines.join('\n')}\n}\n`;
}
