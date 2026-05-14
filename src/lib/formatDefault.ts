// Format a schema default value for two purposes:
//  - formatDefault: a human-readable hint, e.g. "*.raw", "on", "12", "['html']"
//  - defaultAsPlaceholder: a raw string suitable as an <input placeholder>
//
// Both return null/undefined when there is no meaningful display value
// (null/undefined defaults, empty strings, empty arrays).

export function formatDefault(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (typeof value === 'string') {
    if (value.length === 0) return null;
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const inner = value
      .map((v) => (typeof v === 'string' ? `'${v}'` : String(v)))
      .join(', ');
    return `[${inner}]`;
  }
  return null;
}

export function defaultAsPlaceholder(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}
