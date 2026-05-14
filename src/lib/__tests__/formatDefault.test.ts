import { describe, expect, it } from 'vitest';
import { defaultAsPlaceholder, formatDefault } from '../formatDefault';

describe('formatDefault', () => {
  it('returns null for null and undefined', () => {
    expect(formatDefault(null)).toBeNull();
    expect(formatDefault(undefined)).toBeNull();
  });

  it('formats booleans as on/off', () => {
    expect(formatDefault(true)).toBe('on');
    expect(formatDefault(false)).toBe('off');
  });

  it('returns the raw string for non-empty strings', () => {
    expect(formatDefault('*.raw')).toBe('*.raw');
    expect(formatDefault('median')).toBe('median');
  });

  it('returns null for empty strings', () => {
    expect(formatDefault('')).toBeNull();
  });

  it('stringifies finite numbers', () => {
    expect(formatDefault(12)).toBe('12');
    expect(formatDefault(0.8)).toBe('0.8');
  });

  it('returns null for non-finite numbers', () => {
    expect(formatDefault(Number.NaN)).toBeNull();
    expect(formatDefault(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('renders array defaults with quoted string entries', () => {
    expect(formatDefault(['html'])).toBe("['html']");
    expect(formatDefault(['html', 'pdf'])).toBe("['html', 'pdf']");
  });

  it('returns null for empty arrays', () => {
    expect(formatDefault([])).toBeNull();
  });
});

describe('defaultAsPlaceholder', () => {
  it('returns the raw string for non-empty strings', () => {
    expect(defaultAsPlaceholder('*.raw')).toBe('*.raw');
  });

  it('stringifies finite numbers', () => {
    expect(defaultAsPlaceholder(12)).toBe('12');
  });

  it('returns undefined for non-string/number defaults', () => {
    expect(defaultAsPlaceholder(true)).toBeUndefined();
    expect(defaultAsPlaceholder(false)).toBeUndefined();
    expect(defaultAsPlaceholder(['html'])).toBeUndefined();
    expect(defaultAsPlaceholder(null)).toBeUndefined();
    expect(defaultAsPlaceholder(undefined)).toBeUndefined();
  });

  it('returns undefined for empty strings', () => {
    expect(defaultAsPlaceholder('')).toBeUndefined();
  });
});
