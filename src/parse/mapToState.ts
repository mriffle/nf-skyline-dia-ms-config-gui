// Maps a list of ParsedEntry (the output of the Groovy parser) into a
// candidate FormState plus a structured UploadReport. This is the second
// half of the upload pipeline:
//
//   text  →  parseConfig  →  ParsedEntry[]  →  mapToState  →  { state, report }
//
// Decisions baked into this module (per the project plan):
//   - Loaded fields are always marked touched: true (the user committed
//     to the value by including it in the file).
//   - Mode is inferred from the file. PDC wins when ambiguous, with a
//     warning issue.
//   - use_carafe is inferred from the presence of any carafe.* key.
//   - carafe.source is inferred from which carafe input field is set when
//     not given explicitly; a mismatch when explicit is reported.
//   - Unknown / hidden / ignored params are dropped with an issue.
//   - Type / enum / range failures drop the value with an issue. Range
//     violations are non-fatal — value is kept, validator will warn too.

import {
  IGNORED_PARAM_PATHS,
  paramMetadata,
  paramMetadataByPath,
  type FormState,
  type Mode,
  type ParamMeta,
} from '../params/paramMetadata';
import { schemaDerived } from '../params/schemaDerived.generated';
import type { SchemaDerivedEntry, SchemaShape } from '../params/schemaTypes';
import type { ParsedEntry, ParsedValue, PreservedOuterBlock } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UploadIssue =
  | { kind: 'unknown-param'; path: string; rawValue: ParsedValue; line: number }
  | { kind: 'hidden-param-preserved'; path: string; line: number }
  | { kind: 'ignored-param'; path: string; line: number }
  | {
      kind: 'type-mismatch';
      path: string;
      expected: SchemaShape;
      gotType: string;
      rawValue: ParsedValue;
      line: number;
    }
  | {
      kind: 'enum-mismatch';
      path: string;
      allowed: readonly string[];
      got: ParsedValue;
      line: number;
    }
  | {
      kind: 'range-violation';
      path: string;
      value: number;
      min?: number;
      max?: number;
      line: number;
    }
  | { kind: 'string-coerced-to-list'; path: string; line: number }
  | {
      kind: 'list-truncated-to-string';
      path: string;
      original: readonly ParsedValue[];
      kept: string;
      line: number;
    }
  | {
      kind: 'mode-ambiguity';
      pdcPaths: readonly string[];
      generalPaths: readonly string[];
    }
  | {
      kind: 'carafe-source-mismatch';
      sourceFromFile: string;
      sourceInferred: string;
    };

export interface UploadReport {
  readonly loadedCount: number;
  readonly detectedMode: Mode;
  readonly modeAmbiguous: boolean;
  readonly inferredCarafeEnabled: boolean;
  readonly inferredCarafeSource: string | null;
  // Names of outer blocks (process, profiles, docker, ...) whose
  // verbatim text was preserved and will be appended to the generated
  // config after the params { } block.
  readonly preservedOuterBlockNames: readonly string[];
  readonly issues: readonly UploadIssue[];
}

export interface MapResult {
  readonly state: FormState;
  readonly report: UploadReport;
}

// ---------------------------------------------------------------------------
// Path classification
// ---------------------------------------------------------------------------

type Classification =
  | { kind: 'ignored' }
  // Path is real schema but marked hidden — load it into state anyway so
  // power-user customizations (image pins, infra settings) round-trip,
  // but flag it as preserved so the UI can surface that it was carried
  // over without being editable.
  | { kind: 'hidden-preserved'; schema: SchemaDerivedEntry }
  | { kind: 'unknown' }
  | { kind: 'ok'; schema: SchemaDerivedEntry; meta: ParamMeta };

// Some real schema paths have no direct ParamMeta — they're only
// reachable through a virtual entry's `affects` list (e.g.
// `quant_spectra_glob` is exposed via the `quant_spectra_files`
// glob-regex-pair widget). The form writes them, the emitter emits
// them, and they must load back. Map each such path to its parent
// virtual ParamMeta so coerce decisions (e.g. string-or-list widget
// choice) have something to consult.
const VIRTUAL_PARENT_BY_AFFECTED_PATH: ReadonlyMap<string, ParamMeta> = (() => {
  const directlyBound = new Set<string>();
  for (const meta of paramMetadata) {
    if (meta.virtual !== true) directlyBound.add(meta.path);
  }
  const out = new Map<string, ParamMeta>();
  for (const meta of paramMetadata) {
    if (!meta.affects) continue;
    for (const affected of meta.affects) {
      if (directlyBound.has(affected)) continue; // has its own meta
      if (out.has(affected)) continue; // first-declared virtual wins
      out.set(affected, meta);
    }
  }
  return out;
})();

function classify(path: string): Classification {
  if (IGNORED_PARAM_PATHS.has(path)) return { kind: 'ignored' };
  const schema = schemaDerived[path];
  if (!schema) return { kind: 'unknown' };
  const meta = paramMetadataByPath[path];
  // Hidden schema params with a deliberate surfaceHidden ParamMeta load
  // through the regular UI path so uploads populate the form field
  // instead of landing in the preserved sub-block.
  if (meta && meta.surfaceHidden === true) return { kind: 'ok', schema, meta };
  if (schema.hidden) return { kind: 'hidden-preserved', schema };
  if (meta) return { kind: 'ok', schema, meta };
  const parentVirtual = VIRTUAL_PARENT_BY_AFFECTED_PATH.get(path);
  if (parentVirtual) return { kind: 'ok', schema, meta: parentVirtual };
  return { kind: 'unknown' };
}

// ---------------------------------------------------------------------------
// Value coercion
// ---------------------------------------------------------------------------

interface CoerceOk {
  readonly ok: true;
  readonly value: unknown;
  readonly extraIssues?: readonly UploadIssue[];
}
interface CoerceFail {
  readonly ok: false;
  readonly issue: UploadIssue;
}
type CoerceResult = CoerceOk | CoerceFail;

function describeType(v: ParsedValue): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'list';
  return typeof v;
}

function coerce(
  path: string,
  rawValue: ParsedValue,
  schema: SchemaDerivedEntry,
  meta: ParamMeta | undefined,
  line: number,
): CoerceResult {
  // The quant_spectra_dir tagged union is the inverse of the emitter's
  // normalizeQuantSpectraDir. Handle it before generic shape coercion.
  if (path === 'quant_spectra_dir') {
    return coerceQuantSpectraDir(path, rawValue, schema, line);
  }

  const shape = schema.shape;
  switch (shape.kind) {
    case 'boolean':
      if (typeof rawValue === 'boolean') return { ok: true, value: rawValue };
      return failType(path, shape, rawValue, line);
    case 'integer': {
      if (typeof rawValue === 'number' && Number.isInteger(rawValue)) {
        const extras = checkRange(path, rawValue, schema, line);
        return { ok: true, value: rawValue, extraIssues: extras };
      }
      // Allow null for nullable integer fields (schema default null).
      if (rawValue === null) return { ok: true, value: null };
      return failType(path, shape, rawValue, line);
    }
    case 'number': {
      if (typeof rawValue === 'number') {
        const extras = checkRange(path, rawValue, schema, line);
        return { ok: true, value: rawValue, extraIssues: extras };
      }
      if (rawValue === null) return { ok: true, value: null };
      return failType(path, shape, rawValue, line);
    }
    case 'string':
      if (typeof rawValue === 'string') return { ok: true, value: rawValue };
      if (rawValue === null) return { ok: true, value: null };
      return failType(path, shape, rawValue, line);
    case 'enum': {
      // Allow null for "no-search" style fields where null means "off".
      if (rawValue === null) return { ok: true, value: null };
      if (typeof rawValue === 'string' && shape.values.includes(rawValue)) {
        return { ok: true, value: rawValue };
      }
      return {
        ok: false,
        issue: {
          kind: 'enum-mismatch',
          path,
          allowed: shape.values,
          got: rawValue,
          line,
        },
      };
    }
    case 'string-or-list':
      return coerceStringOrList(path, rawValue, shape, meta, line);
    case 'string-or-list-or-map':
      // Only quant_spectra_dir uses this in practice (handled above) and
      // output_directories which is hidden. Be permissive: accept string,
      // string[], or Record<string,string> as-is.
      if (
        typeof rawValue === 'string' ||
        Array.isArray(rawValue) ||
        (rawValue !== null && typeof rawValue === 'object')
      ) {
        return { ok: true, value: rawValue };
      }
      if (rawValue === null) return { ok: true, value: null };
      return failType(path, shape, rawValue, line);
  }
}

function coerceQuantSpectraDir(
  path: string,
  rawValue: ParsedValue,
  schema: SchemaDerivedEntry,
  line: number,
): CoerceResult {
  if (rawValue === null) return { ok: true, value: null };
  if (typeof rawValue === 'string') {
    return { ok: true, value: { kind: 'single', path: rawValue } };
  }
  if (Array.isArray(rawValue)) {
    const paths = rawValue.filter((v): v is string => typeof v === 'string');
    return { ok: true, value: { kind: 'list', paths } };
  }
  if (typeof rawValue === 'object') {
    const entries: { name: string; path: string }[] = [];
    for (const [k, v] of Object.entries(rawValue)) {
      if (typeof v === 'string') entries.push({ name: k, path: v });
    }
    return { ok: true, value: { kind: 'batch-map', entries } };
  }
  return failType(path, schema.shape, rawValue, line);
}

function coerceStringOrList(
  path: string,
  rawValue: ParsedValue,
  shape: SchemaShape,
  meta: ParamMeta | undefined,
  line: number,
): CoerceResult {
  const wantsList =
    meta?.widget === 'string-list' ||
    meta?.widget === 'multi-enum' ||
    meta?.widget === 'metadata-multi';
  if (typeof rawValue === 'string') {
    if (wantsList) {
      return {
        ok: true,
        value: rawValue.length === 0 ? [] : [rawValue],
        extraIssues:
          rawValue.length === 0
            ? []
            : [{ kind: 'string-coerced-to-list', path, line }],
      };
    }
    return { ok: true, value: rawValue };
  }
  if (Array.isArray(rawValue)) {
    const items = rawValue.filter((v): v is string => typeof v === 'string');
    if (wantsList) return { ok: true, value: items };
    // Widget expects a single string. Take the first; warn if there were
    // more.
    const kept = items[0] ?? '';
    if (items.length <= 1) return { ok: true, value: kept };
    return {
      ok: true,
      value: kept,
      extraIssues: [
        {
          kind: 'list-truncated-to-string',
          path,
          original: rawValue,
          kept,
          line,
        },
      ],
    };
  }
  if (rawValue === null) return { ok: true, value: null };
  return failType(path, shape, rawValue, line);
}

function failType(
  path: string,
  expected: SchemaShape,
  rawValue: ParsedValue,
  line: number,
): CoerceFail {
  return {
    ok: false,
    issue: {
      kind: 'type-mismatch',
      path,
      expected,
      gotType: describeType(rawValue),
      rawValue,
      line,
    },
  };
}

function checkRange(
  path: string,
  value: number,
  schema: SchemaDerivedEntry,
  line: number,
): UploadIssue[] {
  const issues: UploadIssue[] = [];
  if (schema.minimum !== undefined && value < schema.minimum) {
    issues.push({
      kind: 'range-violation',
      path,
      value,
      min: schema.minimum,
      max: schema.maximum,
      line,
    });
  } else if (schema.maximum !== undefined && value > schema.maximum) {
    issues.push({
      kind: 'range-violation',
      path,
      value,
      min: schema.minimum,
      max: schema.maximum,
      line,
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Mode inference
// ---------------------------------------------------------------------------

const PDC_PATH_PREFIX = 'pdc.';
const GENERAL_PATHS_FOR_MODE = new Set([
  'quant_spectra_dir',
  'quant_spectra_glob',
  'quant_spectra_regex',
  'chromatogram_library_spectra_dir',
  'chromatogram_library_spectra_glob',
  'chromatogram_library_spectra_regex',
  'use_vendor_raw',
  'vendor_raw_copy',
  'files_per_quant_batch',
  'files_per_chrom_lib',
  'replicate_metadata',
]);

interface ModeInference {
  readonly mode: Mode;
  readonly pdcPaths: readonly string[];
  readonly generalPaths: readonly string[];
  readonly ambiguous: boolean;
}

function inferMode(paths: readonly string[]): ModeInference {
  const pdcPaths: string[] = [];
  const generalPaths: string[] = [];
  for (const p of paths) {
    if (p === 'pdc.study_id' || p.startsWith(PDC_PATH_PREFIX)) pdcPaths.push(p);
    if (GENERAL_PATHS_FOR_MODE.has(p)) generalPaths.push(p);
  }
  // PDC mode is signalled by an explicit study id. Other pdc.* keys
  // alone are insufficient — they could be inert leftovers.
  const hasStudyId = pdcPaths.some((p) => p === 'pdc.study_id');
  const mode: Mode = hasStudyId ? 'pdc' : 'general';
  const ambiguous = hasStudyId && generalPaths.length > 0;
  return { mode, pdcPaths, generalPaths, ambiguous };
}

// ---------------------------------------------------------------------------
// Carafe inference
// ---------------------------------------------------------------------------

const CARAFE_SOURCE_BY_FIELD: ReadonlyMap<string, string> = new Map([
  ['carafe.spectra_file', 'file'],
  ['carafe.spectra_dir', 'dir'],
  ['carafe.pdc_files', 'pdc-files'],
  ['carafe.pdc_n_files', 'pdc-sample'],
]);

interface CarafeInference {
  readonly enabled: boolean;
  readonly source: string | null;
  readonly explicitSourceMismatch: { fromFile: string; inferred: string } | null;
}

function inferCarafe(
  values: Record<string, unknown>,
  explicitUseCarafe: boolean | undefined,
  explicitSource: string | undefined,
): CarafeInference {
  const carafePresent = Object.keys(values).some(
    (k) => k === 'carafe' || k.startsWith('carafe.'),
  );
  // Explicit `use_carafe` is authoritative if the user wrote it. Otherwise
  // infer from whether any carafe.* key is present.
  const enabled = explicitUseCarafe ?? carafePresent;
  if (!enabled) {
    return { enabled: false, source: null, explicitSourceMismatch: null };
  }
  let inferredSource: string | null = null;
  for (const [field, src] of CARAFE_SOURCE_BY_FIELD) {
    if (field in values && values[field] !== null && values[field] !== undefined) {
      inferredSource = src;
      break;
    }
  }
  if (typeof explicitSource === 'string' && explicitSource.length > 0) {
    if (inferredSource !== null && inferredSource !== explicitSource) {
      return {
        enabled: true,
        source: explicitSource,
        explicitSourceMismatch: { fromFile: explicitSource, inferred: inferredSource },
      };
    }
    return { enabled: true, source: explicitSource, explicitSourceMismatch: null };
  }
  return { enabled: true, source: inferredSource, explicitSourceMismatch: null };
}

// ---------------------------------------------------------------------------
// Top-level orchestration
// ---------------------------------------------------------------------------

// Recognized UI-only virtual paths that occasionally appear in
// hand-edited files. Pulled aside up front so they're not flagged as
// unknown — they feed the carafe inference instead.
const UI_VIRTUAL_HINTS = new Set(['use_carafe', 'carafe.source']);

export function mapToState(
  entries: readonly ParsedEntry[],
  preservedOuterBlocks: readonly PreservedOuterBlock[] = [],
): MapResult {
  const values: Record<string, unknown> = {};
  const touched: Record<string, boolean> = {};
  const issues: UploadIssue[] = [];
  let loadedCount = 0;

  let explicitUseCarafe: boolean | undefined;
  let explicitCarafeSource: string | undefined;

  for (const entry of entries) {
    if (entry.path === 'use_carafe') {
      if (typeof entry.value === 'boolean') {
        explicitUseCarafe = entry.value;
      } else {
        issues.push({
          kind: 'type-mismatch',
          path: entry.path,
          expected: { kind: 'boolean' },
          gotType: describeType(entry.value),
          rawValue: entry.value,
          line: entry.line,
        });
      }
      continue;
    }
    if (entry.path === 'carafe.source') {
      if (typeof entry.value === 'string') {
        explicitCarafeSource = entry.value;
      } else {
        issues.push({
          kind: 'type-mismatch',
          path: entry.path,
          expected: { kind: 'string' },
          gotType: describeType(entry.value),
          rawValue: entry.value,
          line: entry.line,
        });
      }
      continue;
    }
    if (UI_VIRTUAL_HINTS.has(entry.path)) {
      // Defensive: above branches should have handled every member of
      // the set already.
      continue;
    }
    const cls = classify(entry.path);
    switch (cls.kind) {
      case 'ignored':
        issues.push({ kind: 'ignored-param', path: entry.path, line: entry.line });
        continue;
      case 'unknown':
        issues.push({
          kind: 'unknown-param',
          path: entry.path,
          rawValue: entry.value,
          line: entry.line,
        });
        continue;
      case 'hidden-preserved':
      case 'ok': {
        const meta = cls.kind === 'ok' ? cls.meta : undefined;
        const result = coerce(entry.path, entry.value, cls.schema, meta, entry.line);
        if (!result.ok) {
          issues.push(result.issue);
          continue;
        }
        values[entry.path] = result.value;
        touched[entry.path] = true;
        loadedCount++;
        if (result.extraIssues) {
          for (const i of result.extraIssues) issues.push(i);
        }
        if (cls.kind === 'hidden-preserved') {
          issues.push({
            kind: 'hidden-param-preserved',
            path: entry.path,
            line: entry.line,
          });
        }
        break;
      }
    }
  }

  // Mode inference looks at the SET of loaded paths (plus parsed entries
  // for PDC paths even if they were unknown — but that won't happen in
  // practice because pdc.study_id is in the schema).
  const loadedPaths = Object.keys(values);
  const modeInfo = inferMode(loadedPaths);
  if (modeInfo.ambiguous) {
    issues.push({
      kind: 'mode-ambiguity',
      pdcPaths: modeInfo.pdcPaths,
      generalPaths: modeInfo.generalPaths,
    });
  }

  // Carafe inference + mark virtual `use_carafe` and (if needed) `carafe.source`.
  const carafe = inferCarafe(values, explicitUseCarafe, explicitCarafeSource);
  values['use_carafe'] = carafe.enabled;
  touched['use_carafe'] = true;
  if (carafe.enabled && carafe.source !== null) {
    values['carafe.source'] = carafe.source;
    touched['carafe.source'] = true;
  }
  if (carafe.explicitSourceMismatch) {
    issues.push({
      kind: 'carafe-source-mismatch',
      sourceFromFile: carafe.explicitSourceMismatch.fromFile,
      sourceInferred: carafe.explicitSourceMismatch.inferred,
    });
  }

  // Outer-block preservation. Concatenate verbatim slices in source
  // order with a single blank line between them; the emitter renders a
  // banner above and trailing newline below.
  const preservedOuterText =
    preservedOuterBlocks.length === 0
      ? undefined
      : preservedOuterBlocks.map((b) => b.text).join('\n\n');

  const state: FormState = {
    mode: modeInfo.mode,
    values,
    touched,
    ...(preservedOuterText !== undefined ? { preservedOuterText } : {}),
  };
  const report: UploadReport = {
    loadedCount,
    detectedMode: modeInfo.mode,
    modeAmbiguous: modeInfo.ambiguous,
    inferredCarafeEnabled: carafe.enabled,
    inferredCarafeSource: carafe.source,
    preservedOuterBlockNames: preservedOuterBlocks.map((b) => b.name),
    issues,
  };
  return { state, report };
}
