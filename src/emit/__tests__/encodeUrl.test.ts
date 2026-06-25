import { describe, expect, it } from 'vitest';

import { encodeUrlValue, encodeUrlsDeep } from '../encodeUrl';

describe('encodeUrlValue', () => {
  it('percent-encodes spaces in a typed URL', () => {
    expect(encodeUrlValue('https://panoramaweb.org/_webdav/My Lab/@files/s a.raw')).toBe(
      'https://panoramaweb.org/_webdav/My%20Lab/@files/s%20a.raw',
    );
  });

  it('leaves an already-encoded URL unchanged (no double-encoding)', () => {
    const enc = 'https://panoramaweb.org/_webdav/My%20Lab/%40files/s%20a.raw';
    expect(encodeUrlValue(enc)).toBe(enc);
  });

  it('normalizes a mixed typed/encoded URL to a single encoded form', () => {
    expect(
      encodeUrlValue('https://panoramaweb.org/_webdav/My Lab/%40files/s a.raw'),
    ).toBe('https://panoramaweb.org/_webdav/My%20Lab/%40files/s%20a.raw');
  });

  it('keeps "@" as-is (legal in a URL path)', () => {
    expect(encodeUrlValue('https://panoramaweb.org/_webdav/proj/@files/')).toContain(
      '/@files/',
    );
  });

  it('leaves a local filesystem path untouched (not a URL)', () => {
    expect(encodeUrlValue('/data/My Lab/s a.raw')).toBe('/data/My Lab/s a.raw');
  });

  it('leaves a relative path untouched', () => {
    expect(encodeUrlValue('relative/My Lab/x.raw')).toBe('relative/My Lab/x.raw');
  });

  it('returns malformed URL-looking input unchanged', () => {
    expect(encodeUrlValue('https://')).toBe('https://');
  });

  it('is idempotent', () => {
    const input = 'https://panoramaweb.org/_webdav/My Lab/@files/s a.raw';
    const once = encodeUrlValue(input);
    expect(encodeUrlValue(once)).toBe(once);
  });
});

describe('encodeUrlsDeep', () => {
  it('encodes a bare string', () => {
    expect(encodeUrlsDeep('https://h.org/My Lab/x.raw')).toBe('https://h.org/My%20Lab/x.raw');
  });

  it('encodes string elements of an array, leaving non-strings', () => {
    expect(
      encodeUrlsDeep(['https://h.org/My Lab/a.raw', '/local/b raw', 3]),
    ).toEqual(['https://h.org/My%20Lab/a.raw', '/local/b raw', 3]);
  });

  it('encodes batch-map values but not the keys', () => {
    expect(
      encodeUrlsDeep({ 'Batch One': 'https://h.org/My Lab/a.raw', b: '/local c' }),
    ).toEqual({ 'Batch One': 'https://h.org/My%20Lab/a.raw', b: '/local c' });
  });

  it('passes through non-string scalars', () => {
    expect(encodeUrlsDeep(true)).toBe(true);
    expect(encodeUrlsDeep(null)).toBe(null);
  });
});
