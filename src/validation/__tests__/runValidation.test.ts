import { describe, expect, it } from 'vitest';

import type { FormState, Mode } from '../../params/paramMetadata';
import { runValidation } from '../runValidation';

interface MakeStateInput {
  readonly mode?: Mode;
  readonly values?: Record<string, unknown>;
  // For tests that need to express "value exists but was never touched".
  readonly untouched?: readonly string[];
}

function makeState({
  mode = 'general',
  values = {},
  untouched = [],
}: MakeStateInput = {}): FormState {
  const touched: Record<string, boolean> = {};
  for (const k of Object.keys(values)) touched[k] = true;
  for (const k of untouched) delete touched[k];
  return { mode, values, touched };
}

describe('runValidation — baseline empty / minimal states', () => {
  it('empty general-mode state is invalid with a single input-required error', () => {
    const report = runValidation(makeState());
    expect(report.isValid).toBe(false);
    expect(report.isDownloadable).toBe(false);
    expect(report.fieldErrors).toEqual({});
    const errs = report.crossFieldIssues.filter((i) => i.severity === 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]!.ruleId).toBe('input-required');
  });

  it('empty PDC-mode state is invalid with a single input-required error', () => {
    const report = runValidation(makeState({ mode: 'pdc' }));
    expect(report.isValid).toBe(false);
    const errs = report.crossFieldIssues.filter((i) => i.severity === 'error');
    expect(errs.some((e) => e.ruleId === 'input-required')).toBe(true);
  });
});

describe('runValidation — minimal-valid general-mode DIA-NN', () => {
  it('passes', () => {
    const state = makeState({
      values: {
        quant_spectra_dir: { kind: 'single', path: '/data/wide' },
        search_engine: 'diann',
        fasta: '/db.fasta',
      },
    });
    const report = runValidation(state);
    expect(report.fieldErrors).toEqual({});
    expect(report.crossFieldIssues).toEqual([]);
    expect(report.isValid).toBe(true);
    expect(report.isDownloadable).toBe(true);
  });
});

describe('runValidation — minimal-valid PDC-mode DIA-NN', () => {
  it('passes', () => {
    const state = makeState({
      mode: 'pdc',
      values: {
        'pdc.study_id': 'PDC000123',
        search_engine: 'diann',
        fasta: '/db.fasta',
      },
    });
    const report = runValidation(state);
    expect(report.fieldErrors).toEqual({});
    expect(report.crossFieldIssues).toEqual([]);
    expect(report.isValid).toBe(true);
    expect(report.isDownloadable).toBe(true);
  });

  it('passes msconvert_only PDC without a search engine', () => {
    const state = makeState({
      mode: 'pdc',
      values: {
        'pdc.study_id': 'PDC000123',
        msconvert_only: true,
      },
    });
    const report = runValidation(state);
    expect(report.isValid).toBe(true);
  });
});

describe('runValidation — warning-only state', () => {
  it('Cascadia + spectral library yields a downloadable report with a warning', () => {
    const state = makeState({
      values: {
        quant_spectra_dir: { kind: 'single', path: '/data/wide' },
        search_engine: 'cascadia',
        spectral_library: '/lib.dlib',
      },
    });
    const report = runValidation(state);
    expect(report.isValid).toBe(true);
    expect(report.isDownloadable).toBe(true);
    const warnings = report.crossFieldIssues.filter(
      (i) => i.severity === 'warning',
    );
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.some((w) => w.ruleId === 'cascadia-no-library')).toBe(true);
  });
});

describe('runValidation — mixed errors and warnings', () => {
  it('EncyclopeDIA without a library, plus Cascadia-style warning... actually use a clearer mix', () => {
    // Pick a state that produces both: vendor-raw-engine warning AND a
    // missing FASTA error.
    const state = makeState({
      values: {
        quant_spectra_dir: { kind: 'single', path: '/data/wide' },
        search_engine: 'encyclopedia',
        spectral_library: '/lib.dlib',
        use_vendor_raw: true,
      },
    });
    const report = runValidation(state);
    expect(report.isValid).toBe(false);
    expect(report.isDownloadable).toBe(false);
    const errors = report.crossFieldIssues.filter((i) => i.severity === 'error');
    const warnings = report.crossFieldIssues.filter(
      (i) => i.severity === 'warning',
    );
    expect(errors.some((e) => e.ruleId === 'fasta-required-when-searching')).toBe(
      true,
    );
    expect(warnings.some((w) => w.ruleId === 'vendor-raw-engine')).toBe(true);
  });
});

describe('runValidation — field-level errors only show for touched fields', () => {
  it('does not produce a field error for an untouched field with a value', () => {
    const state: FormState = {
      mode: 'general',
      values: {
        quant_spectra_dir: { kind: 'single', path: '/data/wide' },
        search_engine: 'diann',
        fasta: '/db.fasta',
        // cascadia.score_threshold has min/max bounds; we set an
        // invalid value but mark it untouched.
        'cascadia.score_threshold': 5,
      },
      touched: {
        quant_spectra_dir: true,
        search_engine: true,
        fasta: true,
        // intentionally NOT touching cascadia.score_threshold
      },
    };
    const report = runValidation(state);
    expect(report.fieldErrors['cascadia.score_threshold']).toBeUndefined();
  });

  it('produces a field error for a touched invalid number', () => {
    const state: FormState = {
      mode: 'general',
      values: {
        quant_spectra_dir: { kind: 'single', path: '/data/wide' },
        search_engine: 'cascadia',
        'cascadia.score_threshold': 5,
      },
      touched: {
        quant_spectra_dir: true,
        search_engine: true,
        'cascadia.score_threshold': true,
      },
    };
    const report = runValidation(state);
    expect(report.fieldErrors['cascadia.score_threshold']).toBeDefined();
    expect(report.isValid).toBe(false);
  });

  it('skips field-level checks on fields hidden by visibleWhen', () => {
    // diann.search_params is only visible when search_engine === 'diann'.
    // With cascadia selected, an empty diann.search_params should not
    // produce a field error even though it's touched.
    const state: FormState = {
      mode: 'general',
      values: {
        quant_spectra_dir: { kind: 'single', path: '/data/wide' },
        search_engine: 'cascadia',
        'diann.search_params': '',
      },
      touched: {
        quant_spectra_dir: true,
        search_engine: true,
        'diann.search_params': true,
      },
    };
    const report = runValidation(state);
    expect(report.fieldErrors['diann.search_params']).toBeUndefined();
  });
});
