// Value -> Groovy literal string conversion.
//
// Handles the subset of value shapes the emitter may encounter:
// null, booleans, integers, non-integer numbers, single-quoted strings,
// arrays of scalars, and plain objects (string -> string maps) emitted as
// Groovy Map literals. Unknown shapes throw with a descriptive error.

const SINGLE_LINE_ARRAY_LIMIT = 80;

/**
 * Convert a value to its Groovy literal string form.
 *
 * The `indent` parameter is the number of leading spaces for *continuation*
 * lines inside a multi-line literal (Map entries, or wrapped array items).
 * The first line of the literal itself is emitted with no leading whitespace
 * (callers indent the first line themselves).
 */
export function toGroovyLiteral(value: unknown, indent: number, path?: string): string {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(
        `Cannot emit non-finite number for ${path ?? '(unknown path)'}: ${String(value)}`,
      );
    }
    if (Number.isInteger(value)) {
      return String(value);
    }
    // Force decimal form. JS toString already avoids scientific notation
    // for numbers within typical config ranges; we additionally guard
    // against scientific notation here by reformatting if needed.
    const s = String(value);
    if (s.includes('e') || s.includes('E')) {
      // Fall back to a fixed representation that strips trailing zeros.
      return value.toFixed(20).replace(/\.?0+$/, '');
    }
    return s;
  }

  if (typeof value === 'string') {
    return quoteString(value);
  }

  if (Array.isArray(value)) {
    return formatArray(value, indent, path);
  }

  if (typeof value === 'object' && value !== null) {
    // Reject Dates and other non-plain objects up front.
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new Error(
        `Cannot emit value of type ${describeType(value)} for ${path ?? '(unknown path)'}`,
      );
    }
    return formatMap(value as Record<string, unknown>, indent, path);
  }

  throw new Error(
    `Cannot emit value of type ${describeType(value)} for ${path ?? '(unknown path)'}`,
  );
}

function describeType(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return 'function';
  if (value instanceof Date) return 'Date';
  return typeof value;
}

function quoteString(value: string): string {
  // Order matters: escape backslashes first so we don't re-escape the
  // backslashes introduced by later steps.
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `'${escaped}'`;
}

function formatArray(value: readonly unknown[], indent: number, path?: string): string {
  if (value.length === 0) return '[]';
  const items = value.map((item) => toGroovyLiteral(item, indent + 4, path));
  const singleLine = `[${items.join(', ')}]`;
  if (singleLine.length <= SINGLE_LINE_ARRAY_LIMIT) {
    return singleLine;
  }
  const inner = ' '.repeat(indent + 4);
  const closer = ' '.repeat(indent);
  return `[\n${items.map((i) => inner + i).join(',\n')}\n${closer}]`;
}

function formatMap(
  value: Record<string, unknown>,
  indent: number,
  path?: string,
): string {
  // Validate all entries first (so we throw cleanly even on empty-after-filter).
  const keys = Object.keys(value);
  if (keys.length === 0) {
    // Groovy distinguishes an empty Map [:] from an empty list [].
    return '[:]';
  }
  const inner = ' '.repeat(indent + 4);
  const closer = ' '.repeat(indent);
  const lines = keys.map((key) => {
    const quotedKey = quoteString(key);
    const rendered = toGroovyLiteral(value[key], indent + 4, path);
    return `${inner}${quotedKey}: ${rendered}`;
  });
  return `[\n${lines.join(',\n')}\n${closer}]`;
}
