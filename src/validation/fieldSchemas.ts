// Per-widget Zod schemas plus the per-field validateField() entry point.
//
// Each widget kind has a "value shape" the form stores, and this module
// validates that shape. The schema picks up min/max bounds from
// schemaDerived where applicable (number widget) and enum values from
// schemaDerived for enum / multi-enum widgets.
//
// validateField() returns the FIRST issue's message, or undefined when
// the value is valid. Field-level checks are only invoked for TOUCHED
// fields — untouched fields with no value are silent; required-but-empty
// is the cross-field rule layer's job.

import { z, type ZodTypeAny } from 'zod';
import type { ParamMeta, Widget } from '../params/paramMetadata';
import { getSchemaEntry } from '../params/paramMetadata';

// ---------------------------------------------------------------------------
// Widget -> schema builders
// ---------------------------------------------------------------------------

function nonEmptyString(): ZodTypeAny {
  return z.string().min(1, { message: 'Required.' });
}

function anyString(): ZodTypeAny {
  return z.string();
}

function numberSchema(meta: ParamMeta): ZodTypeAny {
  const entry = getSchemaEntry(meta.path);
  let s: z.ZodNumber = z.number({ invalid_type_error: 'Must be a number.' }).finite({
    message: 'Must be a finite number.',
  });
  if (entry?.shape.kind === 'integer') {
    s = s.int({ message: 'Must be an integer.' });
  }
  if (entry?.minimum !== undefined) {
    s = s.min(entry.minimum, { message: `Must be ≥ ${entry.minimum}.` });
  }
  if (entry?.maximum !== undefined) {
    s = s.max(entry.maximum, { message: `Must be ≤ ${entry.maximum}.` });
  }
  return s;
}

function booleanSchema(): ZodTypeAny {
  return z.boolean({ invalid_type_error: 'Must be true or false.' });
}

// Enum widget. Special case: `search_engine` legally accepts `null` to
// mean "no-search mode". For any other enum-shaped parameter we accept
// only the strings declared in the schema (or any string when the
// schema shape is not enum-typed — a safety fallback for widgets that
// declare 'enum' but whose schema is generated as a plain string, e.g.
// `qc_report.imputation_method` lacking enum values).
function enumSchema(meta: ParamMeta): ZodTypeAny {
  const entry = getSchemaEntry(meta.path);
  if (entry?.shape.kind === 'enum') {
    const values = entry.shape.values as readonly [string, ...string[]];
    const base = z.enum(values as unknown as [string, ...string[]], {
      errorMap: () => ({ message: 'Pick one of the allowed values.' }),
    });
    if (meta.path === 'search_engine') {
      return z.union([base, z.null()]);
    }
    return base;
  }
  // Non-enum shape but widget says enum: be permissive — any non-empty
  // string. Mirrors what the field can store. The Carafe source enum
  // (carafe.source) lives entirely in the UI layer; we accept any
  // non-empty string here and let the cross-field rule enforce the
  // legal-value list.
  return nonEmptyString();
}

function multiEnumSchema(meta: ParamMeta): ZodTypeAny {
  const entry = getSchemaEntry(meta.path);
  if (entry?.shape.kind === 'enum') {
    const values = entry.shape.values as readonly [string, ...string[]];
    return z.array(
      z.enum(values as unknown as [string, ...string[]], {
        errorMap: () => ({ message: 'Contains an invalid value.' }),
      }),
    );
  }
  // Multi-enum over a string-or-list shape (e.g. qc_report.report_format).
  // Field stores a string[] in the form; we accept any string[].
  return z.array(z.string().min(1, { message: 'Items cannot be empty.' }));
}

function stringListSchema(): ZodTypeAny {
  return z.array(z.string().min(1, { message: 'Items cannot be empty.' }));
}

// Tagged-union representing the spectra-source widget. Three kinds:
//   - single: one path string
//   - list:   one or more path strings
//   - batch-map: one or more {name, path} pairs
const SPECTRA_SOURCE_SCHEMA: ZodTypeAny = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('single'),
    path: z.string().min(1, { message: 'Path is required.' }),
  }),
  z.object({
    kind: z.literal('list'),
    paths: z
      .array(z.string().min(1, { message: 'Paths cannot be empty.' }))
      .min(1, { message: 'Add at least one path.' }),
  }),
  z.object({
    kind: z.literal('batch-map'),
    entries: z
      .array(
        z.object({
          name: z.string().min(1, { message: 'Batch name is required.' }),
          paths: z
            .array(z.string().min(1, { message: 'Paths cannot be empty.' }))
            .min(1, { message: 'Add at least one path.' }),
        }),
      )
      .min(1, { message: 'Add at least one batch entry.' }),
  }),
]);

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function schemaForWidget(meta: ParamMeta): ZodTypeAny | null {
  const widget: Widget = meta.widget;
  switch (widget) {
    case 'text':
    case 'file-or-url':
      return nonEmptyString();
    case 'textarea':
      return anyString();
    case 'number':
      return numberSchema(meta);
    case 'boolean':
      return booleanSchema();
    case 'enum':
      return enumSchema(meta);
    case 'multi-enum':
      return multiEnumSchema(meta);
    case 'string-list':
      return stringListSchema();
    case 'metadata-single':
      // Stores a single string (same shape as 'text'). The "value exists
      // in the metadata" invariant is a cross-field rule, not field-level.
      return nonEmptyString();
    case 'metadata-multi':
      // Stores string[] (same shape as 'string-list').
      return stringListSchema();
    case 'glob-regex-pair':
      // Field-level no-op. Cross-field rule (glob-xor-regex-*) covers
      // the only invariant that matters: not-both-set.
      return null;
    case 'batch-map':
      // Field-level no-op. The 'spectra-source' kind variant handles
      // the only batch-map storage in the form; cross-field rules
      // enforce non-emptiness via input-required.
      return null;
    case 'spectra-source':
      return SPECTRA_SOURCE_SCHEMA;
    default: {
      // Exhaustive guard.
      const _exhaustive: never = widget;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Validate a single field's value. Returns the first issue's message,
 * or undefined when the value is valid (or when the widget has no
 * field-level schema).
 *
 * Callers MUST only invoke this for touched fields; untouched empty
 * fields are reported (when required) by cross-field rules.
 *
 * `required` reflects the field's `requiredWhen` predicate for the
 * current state. An empty value means "unset" — for an OPTIONAL field
 * that is valid (a field the user typed into and then cleared must not
 * read as required). Presence of a required value is enforced here
 * (the `nonEmptyString` widgets surface "Required.") and, redundantly,
 * by the cross-field rule layer.
 */
export function validateField(
  meta: ParamMeta,
  value: unknown,
  required = false,
): string | undefined {
  if (!required && (value === '' || value === undefined)) return undefined;
  const schema = schemaForWidget(meta);
  if (schema === null) return undefined;
  const result = schema.safeParse(value);
  if (result.success) return undefined;
  return result.error.issues[0]?.message ?? 'Invalid value.';
}

// Exported for testing / introspection.
export const _internal = {
  schemaForWidget,
  SPECTRA_SOURCE_SCHEMA,
};
