// Percent-encode URL values entered by the user (e.g. Panorama WebDAV file
// locations) so the generated config carries syntactically valid URLs —
// spaces become %20, etc.
//
// Only values that are actually URLs (have a `scheme://` prefix) are touched;
// bare local filesystem paths are left exactly as typed, since percent-encoding
// a local path would break it.
//
// The encoding is delegated to the platform `URL` parser, which is:
//   - double-encoding-safe: an already-encoded `%20` / `%40` passes through
//     unchanged (unlike encodeURI, which would turn `%20` into `%2520`),
//   - standards-compliant: it leaves URL-significant characters (`:` `/` `@`
//     `?` `#` ...) intact and encodes only what must be encoded,
//   - self-gating: it throws on anything that isn't a valid absolute URL, so
//     malformed input falls through unchanged rather than being mangled.
//
// `URL` normalizes a little more than just encoding (it lowercases the host,
// drops a default port, resolves `.`/`..` segments). That is harmless for the
// Panorama WebDAV URLs these fields hold.

const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Encode a single string value if (and only if) it is a URL. */
export function encodeUrlValue(value: string): string {
  if (!URL_SCHEME_RE.test(value)) return value;
  try {
    return new URL(value).href;
  } catch {
    return value;
  }
}

/**
 * Apply `encodeUrlValue` across the shapes a URL-bearing field may hold after
 * normalization: a bare string, an array of strings (string-list / list-kind
 * spectra), or a name->path(s) map (batch-map, whose values may themselves be
 * lists). Only string leaves are encoded; map keys (batch names) and non-string
 * entries are left untouched.
 */
export function encodeUrlsDeep(value: unknown): unknown {
  if (typeof value === 'string') return encodeUrlValue(value);
  // Recurse rather than only encoding string leaves one level down: a batch-map
  // value may itself be a list of paths.
  if (Array.isArray(value)) {
    return value.map((item) => encodeUrlsDeep(item));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = encodeUrlsDeep(v);
    }
    return out;
  }
  return value;
}
