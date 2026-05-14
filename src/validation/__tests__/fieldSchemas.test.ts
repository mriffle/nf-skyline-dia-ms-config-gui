import { describe, expect, it } from 'vitest';

import { paramMetadataByPath } from '../../params/paramMetadata';
import { validateField } from '../fieldSchemas';

function metaFor(path: string) {
  const meta = paramMetadataByPath[path];
  if (!meta) throw new Error(`unknown param path: ${path}`);
  return meta;
}

describe('validateField — text / file-or-url', () => {
  it('accepts a non-empty string for text', () => {
    expect(validateField(metaFor('pdc.study_id'), 'PDC000123')).toBeUndefined();
  });

  it('rejects empty string for text', () => {
    expect(validateField(metaFor('pdc.study_id'), '')).toBeDefined();
  });

  it('accepts a non-empty string for file-or-url', () => {
    expect(validateField(metaFor('fasta'), '/db/proteins.fasta')).toBeUndefined();
  });

  it('rejects empty string for file-or-url', () => {
    expect(validateField(metaFor('fasta'), '')).toBeDefined();
  });

  it('rejects wrong type for text (number)', () => {
    expect(validateField(metaFor('pdc.study_id'), 42)).toBeDefined();
  });
});

describe('validateField — textarea', () => {
  it('accepts empty string for textarea', () => {
    // carafe.cli_options is the only textarea widget.
    expect(validateField(metaFor('carafe.cli_options'), '')).toBeUndefined();
  });

  it('accepts a multi-line string', () => {
    expect(validateField(metaFor('carafe.cli_options'), 'a\nb')).toBeUndefined();
  });
});

describe('validateField — number', () => {
  it('accepts a number in range (cascadia.score_threshold 0-1)', () => {
    expect(validateField(metaFor('cascadia.score_threshold'), 0.5)).toBeUndefined();
  });

  it('rejects a number below the minimum', () => {
    expect(validateField(metaFor('cascadia.score_threshold'), -0.1)).toBeDefined();
  });

  it('rejects a number above the maximum', () => {
    expect(validateField(metaFor('cascadia.score_threshold'), 1.5)).toBeDefined();
  });

  it('accepts integer at min for carafe.pdc_n_files (min=1)', () => {
    expect(validateField(metaFor('carafe.pdc_n_files'), 1)).toBeUndefined();
  });

  it('rejects integer below min for carafe.pdc_n_files', () => {
    expect(validateField(metaFor('carafe.pdc_n_files'), 0)).toBeDefined();
  });

  it('rejects a non-integer for carafe.pdc_n_files', () => {
    expect(validateField(metaFor('carafe.pdc_n_files'), 1.5)).toBeDefined();
  });

  it('rejects NaN / Infinity', () => {
    expect(validateField(metaFor('cascadia.score_threshold'), NaN)).toBeDefined();
    expect(validateField(metaFor('cascadia.score_threshold'), Infinity)).toBeDefined();
  });

  it('rejects a string for number', () => {
    expect(validateField(metaFor('cascadia.score_threshold'), '0.5')).toBeDefined();
  });
});

describe('validateField — boolean', () => {
  it('accepts true / false', () => {
    expect(validateField(metaFor('panorama.upload'), true)).toBeUndefined();
    expect(validateField(metaFor('panorama.upload'), false)).toBeUndefined();
  });

  it('rejects non-boolean', () => {
    expect(validateField(metaFor('panorama.upload'), 'yes')).toBeDefined();
    expect(validateField(metaFor('panorama.upload'), 1)).toBeDefined();
  });
});

describe('validateField — enum', () => {
  it('accepts an allowed enum value', () => {
    expect(validateField(metaFor('search_engine'), 'diann')).toBeUndefined();
    expect(validateField(metaFor('search_engine'), 'encyclopedia')).toBeUndefined();
    expect(validateField(metaFor('search_engine'), 'cascadia')).toBeUndefined();
  });

  it('accepts null for search_engine (no-search mode)', () => {
    expect(validateField(metaFor('search_engine'), null)).toBeUndefined();
  });

  it('rejects an unknown enum value', () => {
    expect(validateField(metaFor('search_engine'), 'mascot')).toBeDefined();
  });

  it('rejects null for an enum that does not allow it', () => {
    expect(validateField(metaFor('qc_report.normalization_method'), null)).toBeDefined();
  });

  it('accepts any non-empty string for carafe.source (UI-only enum)', () => {
    // carafe.source has widget=enum but no schema entry; the schema
    // falls back to non-empty string.
    expect(validateField(metaFor('carafe.source'), 'file')).toBeUndefined();
    expect(validateField(metaFor('carafe.source'), '')).toBeDefined();
  });
});

describe('validateField — multi-enum', () => {
  it('accepts an empty array', () => {
    expect(validateField(metaFor('qc_report.report_format'), [])).toBeUndefined();
  });

  it('accepts an array of strings', () => {
    expect(
      validateField(metaFor('qc_report.report_format'), ['html', 'pdf']),
    ).toBeUndefined();
  });

  it('rejects non-array', () => {
    expect(validateField(metaFor('qc_report.report_format'), 'html')).toBeDefined();
  });

  it('rejects array with empty strings', () => {
    expect(validateField(metaFor('qc_report.report_format'), [''])).toBeDefined();
  });
});

describe('validateField — string-list', () => {
  it('accepts an array of strings', () => {
    expect(
      validateField(metaFor('carafe.pdc_files'), ['a.raw', 'b.raw']),
    ).toBeUndefined();
  });

  it('accepts an empty array', () => {
    expect(validateField(metaFor('carafe.pdc_files'), [])).toBeUndefined();
  });

  it('rejects an array with an empty string element', () => {
    expect(validateField(metaFor('carafe.pdc_files'), ['a', ''])).toBeDefined();
  });

  it('rejects non-array', () => {
    expect(validateField(metaFor('carafe.pdc_files'), 'a.raw')).toBeDefined();
  });
});

describe('validateField — glob-regex-pair (virtual, no-op)', () => {
  it('always returns undefined', () => {
    expect(validateField(metaFor('quant_spectra_files'), null)).toBeUndefined();
    expect(validateField(metaFor('quant_spectra_files'), { glob: '*.raw' })).toBeUndefined();
  });
});

describe('validateField — spectra-source (tagged union)', () => {
  it('accepts kind=single with a non-empty path', () => {
    expect(
      validateField(metaFor('quant_spectra_dir'), {
        kind: 'single',
        path: '/data/wide',
      }),
    ).toBeUndefined();
  });

  it('rejects kind=single with empty path', () => {
    expect(
      validateField(metaFor('quant_spectra_dir'), { kind: 'single', path: '' }),
    ).toBeDefined();
  });

  it('accepts kind=list with one or more paths', () => {
    expect(
      validateField(metaFor('quant_spectra_dir'), {
        kind: 'list',
        paths: ['/a', '/b'],
      }),
    ).toBeUndefined();
  });

  it('rejects kind=list with an empty paths array', () => {
    expect(
      validateField(metaFor('quant_spectra_dir'), { kind: 'list', paths: [] }),
    ).toBeDefined();
  });

  it('rejects kind=list with empty path elements', () => {
    expect(
      validateField(metaFor('quant_spectra_dir'), { kind: 'list', paths: [''] }),
    ).toBeDefined();
  });

  it('accepts kind=batch-map with one or more entries', () => {
    expect(
      validateField(metaFor('quant_spectra_dir'), {
        kind: 'batch-map',
        entries: [{ name: 'b1', path: '/x' }],
      }),
    ).toBeUndefined();
  });

  it('rejects kind=batch-map with an empty entries array', () => {
    expect(
      validateField(metaFor('quant_spectra_dir'), {
        kind: 'batch-map',
        entries: [],
      }),
    ).toBeDefined();
  });

  it('rejects kind=batch-map with empty name or path', () => {
    expect(
      validateField(metaFor('quant_spectra_dir'), {
        kind: 'batch-map',
        entries: [{ name: '', path: '/x' }],
      }),
    ).toBeDefined();
    expect(
      validateField(metaFor('quant_spectra_dir'), {
        kind: 'batch-map',
        entries: [{ name: 'b1', path: '' }],
      }),
    ).toBeDefined();
  });

  it('rejects an unknown kind', () => {
    expect(
      validateField(metaFor('quant_spectra_dir'), { kind: 'weird', path: '/x' }),
    ).toBeDefined();
  });
});
