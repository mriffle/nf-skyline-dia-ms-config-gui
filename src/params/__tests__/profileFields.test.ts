import { describe, expect, it } from 'vitest';
import {
  hasPreservedProfilesBlock,
  paramMetadata,
  type FormState,
} from '../paramMetadata';

const PROFILE_FIELDS = [
  'max_cpus',
  'max_memory',
  'max_time',
  'mzml_cache_directory',
  'panorama_cache_directory',
];

const findMeta = (path: string) => {
  const meta = paramMetadata.find((m) => m.path === path);
  if (!meta) throw new Error(`No meta entry for path ${path}`);
  return meta;
};

const makeState = (preservedOuterText?: string): FormState => ({
  mode: 'general',
  values: {},
  touched: {},
  preservedOuterText,
});

describe('hasPreservedProfilesBlock', () => {
  it('is false for undefined / empty / no-profiles text', () => {
    expect(hasPreservedProfilesBlock(undefined)).toBe(false);
    expect(hasPreservedProfilesBlock('')).toBe(false);
    expect(hasPreservedProfilesBlock('process {\n    cpus = 4\n}')).toBe(false);
  });

  it('detects a profiles block at file scope (any inner profile name)', () => {
    expect(hasPreservedProfilesBlock('profiles {\n}')).toBe(true);
    expect(hasPreservedProfilesBlock('profiles{}')).toBe(true);
    expect(
      hasPreservedProfilesBlock("process {}\n\nprofiles {\n    myCluster { x = 1 }\n}"),
    ).toBe(true);
  });
});

describe('resource/cache fields visibility', () => {
  it('are visible when no profiles block was uploaded', () => {
    for (const path of PROFILE_FIELDS) {
      const meta = findMeta(path);
      expect(meta.visibleWhen?.(makeState())).toBe(true);
    }
  });

  it('are hidden once an uploaded config carries its own profiles block', () => {
    const state = makeState('profiles {\n    standard { x = 1 }\n}');
    for (const path of PROFILE_FIELDS) {
      const meta = findMeta(path);
      expect(meta.visibleWhen?.(state)).toBe(false);
    }
  });
});
