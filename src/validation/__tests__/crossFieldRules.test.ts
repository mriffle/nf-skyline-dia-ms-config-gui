import { describe, expect, it } from 'vitest';

import type { FormState, Mode } from '../../params/paramMetadata';
import type { MetadataTable } from '../../metadata/types';
import { crossFieldRules, type CrossFieldRule } from '../crossFieldRules';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface MakeStateInput {
  readonly mode?: Mode;
  readonly values?: Record<string, unknown>;
}

function makeState({ mode = 'general', values = {} }: MakeStateInput = {}): FormState {
  const touched: Record<string, boolean> = {};
  for (const k of Object.keys(values)) touched[k] = true;
  return { mode, values, touched };
}

function ruleById(id: string): CrossFieldRule {
  const r = crossFieldRules.find((x) => x.id === id);
  if (!r) throw new Error(`unknown rule: ${id}`);
  return r;
}

const QUANT_OK = {
  quant_spectra_dir: { kind: 'single' as const, path: '/data/wide' },
};

// A minimal valid general-mode DIA-NN config used as a "good" baseline
// in many silent-rule tests.
const VALID_DIANN_GENERAL: Record<string, unknown> = {
  ...QUANT_OK,
  search_engine: 'diann',
  fasta: '/db.fasta',
};

const VALID_DIANN_PDC: Record<string, unknown> = {
  'pdc.study_id': 'PDC000123',
  search_engine: 'diann',
  fasta: '/db.fasta',
};

// ---------------------------------------------------------------------------
// 1. input-required
// ---------------------------------------------------------------------------

describe('rule: input-required', () => {
  const rule = ruleById('input-required');

  it('fires in general mode when quant_spectra_dir is unset', () => {
    const r = rule.check(makeState());
    expect(r).not.toBeNull();
    expect(r!.fields).toContain('quant_spectra_dir');
  });

  it('fires in general mode when quant_spectra_dir is an empty single', () => {
    const r = rule.check(
      makeState({ values: { quant_spectra_dir: { kind: 'single', path: '' } } }),
    );
    expect(r).not.toBeNull();
  });

  it('fires in PDC mode when pdc.study_id is unset', () => {
    const r = rule.check(makeState({ mode: 'pdc' }));
    expect(r).not.toBeNull();
    expect(r!.fields).toContain('pdc.study_id');
  });

  it('stays silent in general mode with a non-empty single path', () => {
    expect(rule.check(makeState({ values: QUANT_OK }))).toBeNull();
  });

  it('stays silent in PDC mode with a study id', () => {
    expect(
      rule.check(makeState({ mode: 'pdc', values: { 'pdc.study_id': 'PDC000001' } })),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. glob-xor-regex-quant
// ---------------------------------------------------------------------------

describe('rule: glob-xor-regex-quant', () => {
  const rule = ruleById('glob-xor-regex-quant');

  it('fires when both glob and regex are set', () => {
    const r = rule.check(
      makeState({
        values: {
          ...QUANT_OK,
          quant_spectra_glob: '*.raw',
          quant_spectra_regex: '.*\\.raw',
        },
      }),
    );
    expect(r).not.toBeNull();
    expect(r!.fields).toContain('quant_spectra_glob');
    expect(r!.fields).toContain('quant_spectra_regex');
  });

  it('stays silent when only glob is set', () => {
    expect(
      rule.check(
        makeState({ values: { ...QUANT_OK, quant_spectra_glob: '*.raw' } }),
      ),
    ).toBeNull();
  });

  it('stays silent when only regex is set', () => {
    expect(
      rule.check(
        makeState({ values: { ...QUANT_OK, quant_spectra_regex: '.*\\.raw' } }),
      ),
    ).toBeNull();
  });

  it('stays silent when neither is set (default glob applies)', () => {
    expect(rule.check(makeState({ values: QUANT_OK }))).toBeNull();
  });

  it('stays silent in PDC mode', () => {
    expect(rule.check(makeState({ mode: 'pdc' }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. glob-xor-regex-chrom
// ---------------------------------------------------------------------------

describe('rule: glob-xor-regex-chrom', () => {
  const rule = ruleById('glob-xor-regex-chrom');

  it('fires when both glob and regex are set', () => {
    const r = rule.check(
      makeState({
        values: {
          chromatogram_library_spectra_dir: '/data/narrow',
          chromatogram_library_spectra_glob: '*.raw',
          chromatogram_library_spectra_regex: '.*\\.raw',
        },
      }),
    );
    expect(r).not.toBeNull();
  });

  it('stays silent when only one is set', () => {
    expect(
      rule.check(
        makeState({
          values: {
            chromatogram_library_spectra_dir: '/data/narrow',
            chromatogram_library_spectra_glob: '*.raw',
          },
        }),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. glob-xor-regex-carafe
// ---------------------------------------------------------------------------

describe('rule: glob-xor-regex-carafe', () => {
  const rule = ruleById('glob-xor-regex-carafe');

  it('fires when carafe dir source has both glob and regex set', () => {
    const r = rule.check(
      makeState({
        values: {
          use_carafe: true,
          'carafe.source': 'dir',
          'carafe.spectra_dir': '/data/carafe',
          'carafe.spectra_glob': '*.raw',
          'carafe.spectra_regex': '.*\\.raw',
        },
      }),
    );
    expect(r).not.toBeNull();
  });

  it('stays silent when use_carafe is false', () => {
    expect(
      rule.check(
        makeState({
          values: {
            use_carafe: false,
            'carafe.spectra_glob': '*.raw',
            'carafe.spectra_regex': '.*\\.raw',
          },
        }),
      ),
    ).toBeNull();
  });

  it('stays silent when only glob is set', () => {
    expect(
      rule.check(
        makeState({
          values: {
            use_carafe: true,
            'carafe.source': 'dir',
            'carafe.spectra_dir': '/data/carafe',
            'carafe.spectra_glob': '*.raw',
          },
        }),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. pdc-forces-diann
// ---------------------------------------------------------------------------

describe('rule: pdc-forces-diann', () => {
  const rule = ruleById('pdc-forces-diann');

  it('fires when PDC mode uses encyclopedia', () => {
    const r = rule.check(
      makeState({
        mode: 'pdc',
        values: { 'pdc.study_id': 'PDC000123', search_engine: 'encyclopedia' },
      }),
    );
    expect(r).not.toBeNull();
    expect(r!.fields).toContain('search_engine');
  });

  it('stays silent in PDC mode with DIA-NN', () => {
    expect(
      rule.check(makeState({ mode: 'pdc', values: VALID_DIANN_PDC })),
    ).toBeNull();
  });

  it('stays silent in PDC mode when msconvert_only is true', () => {
    expect(
      rule.check(
        makeState({
          mode: 'pdc',
          values: {
            'pdc.study_id': 'PDC000123',
            msconvert_only: true,
            search_engine: 'encyclopedia',
          },
        }),
      ),
    ).toBeNull();
  });

  it('stays silent in general mode', () => {
    expect(rule.check(makeState({ values: VALID_DIANN_GENERAL }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. carafe-source-required
// ---------------------------------------------------------------------------

describe('rule: carafe-source-required', () => {
  const rule = ruleById('carafe-source-required');

  it('fires when use_carafe is true but no source is set', () => {
    const r = rule.check(makeState({ values: { use_carafe: true } }));
    expect(r).not.toBeNull();
    expect(r!.fields).toContain('carafe.source');
  });

  it('fires on an invalid source value', () => {
    const r = rule.check(
      makeState({ values: { use_carafe: true, 'carafe.source': 'bogus' } }),
    );
    expect(r).not.toBeNull();
  });

  it('stays silent when source is one of the legal values', () => {
    for (const src of ['file', 'dir', 'pdc-files', 'pdc-sample']) {
      expect(
        rule.check(
          makeState({ values: { use_carafe: true, 'carafe.source': src } }),
        ),
      ).toBeNull();
    }
  });

  it('stays silent when use_carafe is false', () => {
    expect(rule.check(makeState({ values: { use_carafe: false } }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. carafe-input-matches-source
// ---------------------------------------------------------------------------

describe('rule: carafe-input-matches-source', () => {
  const rule = ruleById('carafe-input-matches-source');

  it('fires for file source without a spectra_file', () => {
    expect(
      rule.check(
        makeState({ values: { use_carafe: true, 'carafe.source': 'file' } }),
      ),
    ).not.toBeNull();
  });

  it('fires for dir source without a spectra_dir', () => {
    expect(
      rule.check(
        makeState({ values: { use_carafe: true, 'carafe.source': 'dir' } }),
      ),
    ).not.toBeNull();
  });

  it('fires for pdc-files source without a list', () => {
    expect(
      rule.check(
        makeState({
          values: { use_carafe: true, 'carafe.source': 'pdc-files' },
        }),
      ),
    ).not.toBeNull();
  });

  it('fires for pdc-sample source with n < 1', () => {
    expect(
      rule.check(
        makeState({
          values: {
            use_carafe: true,
            'carafe.source': 'pdc-sample',
            'carafe.pdc_n_files': 0,
          },
        }),
      ),
    ).not.toBeNull();
  });

  it('stays silent for file source with a non-empty file', () => {
    expect(
      rule.check(
        makeState({
          values: {
            use_carafe: true,
            'carafe.source': 'file',
            'carafe.spectra_file': '/x.raw',
          },
        }),
      ),
    ).toBeNull();
  });

  it('stays silent for pdc-files source with a non-empty array', () => {
    expect(
      rule.check(
        makeState({
          values: {
            use_carafe: true,
            'carafe.source': 'pdc-files',
            'carafe.pdc_files': ['a.raw'],
          },
        }),
      ),
    ).toBeNull();
  });

  it('stays silent for pdc-sample source with n >= 1', () => {
    expect(
      rule.check(
        makeState({
          values: {
            use_carafe: true,
            'carafe.source': 'pdc-sample',
            'carafe.pdc_n_files': 3,
          },
        }),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. carafe-pdc-requires-study
// ---------------------------------------------------------------------------

describe('rule: carafe-pdc-requires-study', () => {
  const rule = ruleById('carafe-pdc-requires-study');

  it('fires when carafe pdc-files used in general mode', () => {
    const r = rule.check(
      makeState({
        values: { use_carafe: true, 'carafe.source': 'pdc-files' },
      }),
    );
    expect(r).not.toBeNull();
  });

  it('fires in PDC mode but without a study id', () => {
    const r = rule.check(
      makeState({
        mode: 'pdc',
        values: { use_carafe: true, 'carafe.source': 'pdc-sample' },
      }),
    );
    expect(r).not.toBeNull();
  });

  it('stays silent in PDC mode with a study id', () => {
    expect(
      rule.check(
        makeState({
          mode: 'pdc',
          values: {
            'pdc.study_id': 'PDC000123',
            use_carafe: true,
            'carafe.source': 'pdc-files',
          },
        }),
      ),
    ).toBeNull();
  });

  it('stays silent for non-PDC carafe sources', () => {
    expect(
      rule.check(
        makeState({
          values: { use_carafe: true, 'carafe.source': 'file' },
        }),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 9. carafe-pdc-n-files-bound
// ---------------------------------------------------------------------------

describe('rule: carafe-pdc-n-files-bound', () => {
  const rule = ruleById('carafe-pdc-n-files-bound');

  it('fires when carafe.pdc_n_files > pdc.n_raw_files', () => {
    const r = rule.check(
      makeState({
        mode: 'pdc',
        values: { 'carafe.pdc_n_files': 10, 'pdc.n_raw_files': 5 },
      }),
    );
    expect(r).not.toBeNull();
  });

  it('stays silent when carafe.pdc_n_files <= pdc.n_raw_files', () => {
    expect(
      rule.check(
        makeState({
          mode: 'pdc',
          values: { 'carafe.pdc_n_files': 3, 'pdc.n_raw_files': 5 },
        }),
      ),
    ).toBeNull();
  });

  it('stays silent when one of the two is unset', () => {
    expect(
      rule.check(makeState({ values: { 'carafe.pdc_n_files': 3 } })),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 10. no-search-requires-library
// ---------------------------------------------------------------------------

describe('rule: no-search-requires-library', () => {
  const rule = ruleById('no-search-requires-library');

  it('fires when search_engine is null and no library is set', () => {
    const r = rule.check(
      makeState({ values: { ...QUANT_OK, search_engine: null } }),
    );
    expect(r).not.toBeNull();
    expect(r!.fields).toContain('spectral_library');
  });

  it('fires when no-search but skyline is skipped', () => {
    const r = rule.check(
      makeState({
        values: {
          ...QUANT_OK,
          search_engine: null,
          spectral_library: '/lib.dlib',
          'skyline.skip': true,
        },
      }),
    );
    expect(r).not.toBeNull();
  });

  it('stays silent when no-search with library and skyline not skipped', () => {
    expect(
      rule.check(
        makeState({
          values: {
            ...QUANT_OK,
            search_engine: null,
            spectral_library: '/lib.dlib',
          },
        }),
      ),
    ).toBeNull();
  });

  it('stays silent when a real search engine is selected', () => {
    expect(rule.check(makeState({ values: VALID_DIANN_GENERAL }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 11. fasta-required-when-searching
// ---------------------------------------------------------------------------

describe('rule: fasta-required-when-searching', () => {
  const rule = ruleById('fasta-required-when-searching');

  it('fires for DIA-NN without a FASTA', () => {
    const r = rule.check(
      makeState({ values: { ...QUANT_OK, search_engine: 'diann' } }),
    );
    expect(r).not.toBeNull();
    expect(r!.fields).toContain('fasta');
  });

  it('fires for EncyclopeDIA without a FASTA', () => {
    const r = rule.check(
      makeState({
        values: {
          ...QUANT_OK,
          search_engine: 'encyclopedia',
          spectral_library: '/lib.dlib',
        },
      }),
    );
    expect(r).not.toBeNull();
  });

  it('stays silent for Cascadia (no FASTA needed)', () => {
    expect(
      rule.check(
        makeState({ values: { ...QUANT_OK, search_engine: 'cascadia' } }),
      ),
    ).toBeNull();
  });

  it('stays silent for DIA-NN with a FASTA', () => {
    expect(rule.check(makeState({ values: VALID_DIANN_GENERAL }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 12. encyclopedia-requires-library
// ---------------------------------------------------------------------------

describe('rule: encyclopedia-requires-library', () => {
  const rule = ruleById('encyclopedia-requires-library');

  it('fires for encyclopedia without a library or carafe', () => {
    const r = rule.check(
      makeState({
        values: { ...QUANT_OK, search_engine: 'encyclopedia', fasta: '/db.fa' },
      }),
    );
    expect(r).not.toBeNull();
  });

  it('stays silent for encyclopedia with a spectral library', () => {
    expect(
      rule.check(
        makeState({
          values: {
            ...QUANT_OK,
            search_engine: 'encyclopedia',
            spectral_library: '/lib.dlib',
            fasta: '/db.fa',
          },
        }),
      ),
    ).toBeNull();
  });

  it('stays silent for encyclopedia with Carafe enabled', () => {
    expect(
      rule.check(
        makeState({
          values: {
            ...QUANT_OK,
            search_engine: 'encyclopedia',
            use_carafe: true,
            fasta: '/db.fa',
          },
        }),
      ),
    ).toBeNull();
  });

  it('stays silent for other engines', () => {
    expect(rule.check(makeState({ values: VALID_DIANN_GENERAL }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 13. cascadia-no-chrom (warning)
// ---------------------------------------------------------------------------

describe('rule: cascadia-no-chrom', () => {
  const rule = ruleById('cascadia-no-chrom');

  it('fires for Cascadia + chromatogram_library_spectra_dir set', () => {
    const r = rule.check(
      makeState({
        values: {
          ...QUANT_OK,
          search_engine: 'cascadia',
          chromatogram_library_spectra_dir: '/data/narrow',
        },
      }),
    );
    expect(r).not.toBeNull();
    expect(rule.severity).toBe('warning');
  });

  it('stays silent for Cascadia without chrom dir', () => {
    expect(
      rule.check(
        makeState({ values: { ...QUANT_OK, search_engine: 'cascadia' } }),
      ),
    ).toBeNull();
  });

  it('stays silent for non-Cascadia engines', () => {
    expect(
      rule.check(
        makeState({
          values: {
            ...VALID_DIANN_GENERAL,
            chromatogram_library_spectra_dir: '/data/narrow',
          },
        }),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 14. cascadia-no-library (warning)
// ---------------------------------------------------------------------------

describe('rule: cascadia-no-library', () => {
  const rule = ruleById('cascadia-no-library');

  it('fires for Cascadia + spectral library set', () => {
    const r = rule.check(
      makeState({
        values: {
          ...QUANT_OK,
          search_engine: 'cascadia',
          spectral_library: '/lib.dlib',
        },
      }),
    );
    expect(r).not.toBeNull();
    expect(rule.severity).toBe('warning');
  });

  it('fires for Cascadia + use_carafe', () => {
    expect(
      rule.check(
        makeState({
          values: {
            ...QUANT_OK,
            search_engine: 'cascadia',
            use_carafe: true,
          },
        }),
      ),
    ).not.toBeNull();
  });

  it('stays silent for Cascadia with no library inputs', () => {
    expect(
      rule.check(
        makeState({ values: { ...QUANT_OK, search_engine: 'cascadia' } }),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 15. batch-mode-engine
// ---------------------------------------------------------------------------

describe('rule: batch-mode-engine', () => {
  const rule = ruleById('batch-mode-engine');

  it('fires in general mode with batch-map quant + encyclopedia', () => {
    const r = rule.check(
      makeState({
        values: {
          quant_spectra_dir: {
            kind: 'batch-map',
            entries: [{ name: 'b1', path: '/x' }],
          },
          search_engine: 'encyclopedia',
        },
      }),
    );
    expect(r).not.toBeNull();
  });

  it('fires in PDC mode with batch file + encyclopedia', () => {
    const r = rule.check(
      makeState({
        mode: 'pdc',
        values: {
          'pdc.study_id': 'PDC000123',
          'pdc.batch_file': '/tmp/batches.tsv',
          search_engine: 'encyclopedia',
        },
      }),
    );
    expect(r).not.toBeNull();
  });

  it('stays silent in general mode with batch-map + DIA-NN', () => {
    expect(
      rule.check(
        makeState({
          values: {
            quant_spectra_dir: {
              kind: 'batch-map',
              entries: [{ name: 'b1', path: '/x' }],
            },
            search_engine: 'diann',
          },
        }),
      ),
    ).toBeNull();
  });

  it('stays silent in general mode with a single quant + encyclopedia', () => {
    expect(
      rule.check(
        makeState({ values: { ...QUANT_OK, search_engine: 'encyclopedia' } }),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 15b. batch-names-valid
// ---------------------------------------------------------------------------

describe('rule: batch-names-valid', () => {
  const rule = ruleById('batch-names-valid');

  function withBatches(names: readonly string[]) {
    return makeState({
      values: {
        ...VALID_DIANN_GENERAL,
        quant_spectra_dir: {
          kind: 'batch-map',
          entries: names.map((name) => ({ name, paths: ['/data/x'] })),
        },
      },
    });
  }

  it('fires on duplicate batch names', () => {
    const r = rule.check(withBatches(['PlateA', 'PlateB', 'PlateA']));
    expect(r).not.toBeNull();
    expect(r?.message).toContain('unique');
    expect(r?.message).toContain('PlateA');
  });

  it('fires on a batch name containing a path separator', () => {
    const r = rule.check(withBatches(['a/b']));
    expect(r).not.toBeNull();
    expect(r?.message).toContain('a/b');
  });

  it('fires on a batch name containing a backslash', () => {
    expect(rule.check(withBatches(['a\\b']))).not.toBeNull();
  });

  it('fires on a batch name with leading or trailing whitespace', () => {
    const r = rule.check(withBatches(['Plate1 ']));
    expect(r).not.toBeNull();
    expect(r?.message).toContain('whitespace');
  });

  it('fires on a batch name containing a control character', () => {
    expect(rule.check(withBatches(['Plate\u0001']))).not.toBeNull();
  });

  it('is silent for distinct, well-formed names', () => {
    expect(rule.check(withBatches(['PlateA', 'PlateB']))).toBeNull();
  });

  it('is silent for a name containing an interior space', () => {
    expect(rule.check(withBatches(['Plate 1']))).toBeNull();
  });

  it('is silent when quant input is not a batch map', () => {
    expect(rule.check(makeState({ values: VALID_DIANN_GENERAL }))).toBeNull();
  });

  it('ignores blank names, which the per-field schema already rejects', () => {
    expect(rule.check(withBatches(['', '']))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 16. panorama-upload-requires-url
// ---------------------------------------------------------------------------

describe('rule: panorama-upload-requires-url', () => {
  const rule = ruleById('panorama-upload-requires-url');

  it('fires when upload is enabled but no URL is set', () => {
    const r = rule.check(makeState({ values: { 'panorama.upload': true } }));
    expect(r).not.toBeNull();
    expect(r!.fields).toContain('panorama.upload_url');
  });

  it('stays silent when upload is enabled with a URL', () => {
    expect(
      rule.check(
        makeState({
          values: {
            'panorama.upload': true,
            'panorama.upload_url': 'https://panoramaweb.org/_webdav/x',
          },
        }),
      ),
    ).toBeNull();
  });

  it('stays silent when upload is disabled', () => {
    expect(
      rule.check(makeState({ values: { 'panorama.upload': false } })),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 17. panorama-import-prereqs
// ---------------------------------------------------------------------------

describe('rule: panorama-import-prereqs', () => {
  const rule = ruleById('panorama-import-prereqs');

  it('fires when import is enabled but upload is off', () => {
    const r = rule.check(
      makeState({
        values: { 'panorama.import_skyline': true, 'panorama.upload': false },
      }),
    );
    expect(r).not.toBeNull();
  });

  it('fires when import is enabled but Skyline is skipped', () => {
    const r = rule.check(
      makeState({
        values: {
          'panorama.import_skyline': true,
          'panorama.upload': true,
          'skyline.skip': true,
        },
      }),
    );
    expect(r).not.toBeNull();
  });

  it('stays silent when upload+import are both on and Skyline is not skipped', () => {
    expect(
      rule.check(
        makeState({
          values: {
            'panorama.import_skyline': true,
            'panorama.upload': true,
          },
        }),
      ),
    ).toBeNull();
  });

  it('stays silent when import is off', () => {
    expect(rule.check(makeState({}))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 18. vendor-raw-engine (warning)
// ---------------------------------------------------------------------------

describe('rule: vendor-raw-engine', () => {
  const rule = ruleById('vendor-raw-engine');

  it('fires when use_vendor_raw + encyclopedia', () => {
    const r = rule.check(
      makeState({
        values: {
          ...QUANT_OK,
          use_vendor_raw: true,
          search_engine: 'encyclopedia',
        },
      }),
    );
    expect(r).not.toBeNull();
    expect(rule.severity).toBe('warning');
  });

  it('stays silent for use_vendor_raw + DIA-NN', () => {
    expect(
      rule.check(
        makeState({
          values: { ...VALID_DIANN_GENERAL, use_vendor_raw: true },
        }),
      ),
    ).toBeNull();
  });

  it('stays silent when use_vendor_raw is off', () => {
    expect(rule.check(makeState({ values: VALID_DIANN_GENERAL }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 19. qc-report-format-required
// ---------------------------------------------------------------------------

describe('rule: qc-report-format-required', () => {
  const rule = ruleById('qc-report-format-required');

  it('fires when QC runs but no format is selected', () => {
    const r = rule.check(
      makeState({ values: { 'qc_report.report_format': [] } }),
    );
    expect(r).not.toBeNull();
    expect(rule.severity).toBe('error');
  });

  it('fires when QC runs and the format value is missing entirely', () => {
    expect(rule.check(makeState({ values: {} }))).not.toBeNull();
  });

  it('stays silent when at least one format is selected', () => {
    expect(
      rule.check(makeState({ values: { 'qc_report.report_format': ['html'] } })),
    ).toBeNull();
    expect(
      rule.check(
        makeState({ values: { 'qc_report.report_format': ['html', 'pdf'] } }),
      ),
    ).toBeNull();
  });

  it('stays silent when QC reporting is skipped', () => {
    expect(
      rule.check(
        makeState({
          values: { 'qc_report.skip': true, 'qc_report.report_format': [] },
        }),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sanity: list length and unique IDs
// ---------------------------------------------------------------------------

describe('crossFieldRules list', () => {
  it('contains exactly 27 rules', () => {
    expect(crossFieldRules.length).toBe(27);
  });

  it('has unique rule IDs', () => {
    const ids = crossFieldRules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares only error or warning severity', () => {
    for (const r of crossFieldRules) {
      expect(['error', 'warning']).toContain(r.severity);
    }
  });
});

// ---------------------------------------------------------------------------
// 20-26. Metadata membership rules
// ---------------------------------------------------------------------------

const META: MetadataTable = {
  fileName: 'm.csv',
  format: 'csv',
  columns: ['Replicate', 'Batch', 'Condition'],
  rows: [
    { Replicate: 'S1', Batch: 'B1', Condition: 'Control' },
    { Replicate: 'S2', Batch: 'B2', Condition: 'Treated' },
  ],
};

function metaState(values: Record<string, unknown>, table?: MetadataTable): FormState {
  const touched: Record<string, boolean> = {};
  for (const k of Object.keys(values)) touched[k] = true;
  return { mode: 'general', values, touched, metadata: table };
}

describe('rule: metadata-color-vars-valid', () => {
  const rule = ruleById('metadata-color-vars-valid');

  it('is a no-op when no metadata is loaded', () => {
    expect(rule.check(metaState({ 'qc_report.color_vars': ['Nope'] }))).toBeNull();
  });

  it('fires when a color var is not a metadata column', () => {
    const r = rule.check(
      metaState({ 'qc_report.color_vars': ['Batch', 'Ghost'] }, META),
    );
    expect(r).not.toBeNull();
    expect(r!.fields).toContain('qc_report.color_vars');
    expect(r!.message).toContain('"Ghost"');
  });

  it('is silent when all color vars are metadata columns', () => {
    expect(
      rule.check(metaState({ 'qc_report.color_vars': ['Batch', 'Condition'] }, META)),
    ).toBeNull();
  });

  it('does not flag the Replicate column (not a variable)', () => {
    expect(
      rule.check(metaState({ 'qc_report.color_vars': ['Replicate'] }, META)),
    ).not.toBeNull();
  });

  it('is a no-op when QC is skipped', () => {
    expect(
      rule.check(
        metaState(
          { 'qc_report.skip': true, 'qc_report.color_vars': ['Ghost'] },
          META,
        ),
      ),
    ).toBeNull();
  });
});

describe('rule: metadata-exclude-replicates-valid', () => {
  const rule = ruleById('metadata-exclude-replicates-valid');

  it('fires when an excluded replicate is not a known replicate name', () => {
    const r = rule.check(
      metaState({ 'qc_report.exclude_replicates': ['S9'] }, META),
    );
    expect(r).not.toBeNull();
    expect(r!.message).toContain('"S9"');
  });

  it('is silent when all excluded replicates are known', () => {
    expect(
      rule.check(metaState({ 'qc_report.exclude_replicates': ['S1', 'S2'] }, META)),
    ).toBeNull();
  });
});

describe('rule: metadata-batch1-valid', () => {
  const rule = ruleById('metadata-batch1-valid');

  it('fires when batch1 is not a metadata column', () => {
    const r = rule.check(
      metaState({ 'batch_report.skip': false, 'batch_report.batch1': 'Ghost' }, META),
    );
    expect(r).not.toBeNull();
  });

  it('is silent for a valid column', () => {
    expect(
      rule.check(
        metaState({ 'batch_report.skip': false, 'batch_report.batch1': 'Batch' }, META),
      ),
    ).toBeNull();
  });

  it('is a no-op when the batch report is skipped', () => {
    expect(
      rule.check(
        metaState({ 'batch_report.skip': true, 'batch_report.batch1': 'Ghost' }, META),
      ),
    ).toBeNull();
  });
});

describe('rule: metadata-batch2-valid', () => {
  const rule = ruleById('metadata-batch2-valid');
  it('fires for an unknown column', () => {
    expect(
      rule.check(
        metaState({ 'batch_report.skip': false, 'batch_report.batch2': 'Ghost' }, META),
      ),
    ).not.toBeNull();
  });
  it('is silent for a valid column', () => {
    expect(
      rule.check(
        metaState({ 'batch_report.skip': false, 'batch_report.batch2': 'Condition' }, META),
      ),
    ).toBeNull();
  });
});

describe('rule: metadata-covariate-vars-valid', () => {
  const rule = ruleById('metadata-covariate-vars-valid');
  it('fires for an unknown covariate column', () => {
    expect(
      rule.check(
        metaState(
          { 'batch_report.skip': false, 'batch_report.covariate_vars': ['Ghost'] },
          META,
        ),
      ),
    ).not.toBeNull();
  });
  it('is silent for valid covariate columns', () => {
    expect(
      rule.check(
        metaState(
          { 'batch_report.skip': false, 'batch_report.covariate_vars': ['Batch'] },
          META,
        ),
      ),
    ).toBeNull();
  });
});

describe('rule: metadata-control-key-valid', () => {
  const rule = ruleById('metadata-control-key-valid');
  it('fires for an unknown control key column', () => {
    expect(
      rule.check(
        metaState({ 'batch_report.skip': false, 'batch_report.control_key': 'Ghost' }, META),
      ),
    ).not.toBeNull();
  });
  it('is silent for a valid control key column', () => {
    expect(
      rule.check(
        metaState({ 'batch_report.skip': false, 'batch_report.control_key': 'Condition' }, META),
      ),
    ).toBeNull();
  });
});

describe('rule: metadata-control-values-valid', () => {
  const rule = ruleById('metadata-control-values-valid');

  it('fires when a control value is not in the control-key column', () => {
    const r = rule.check(
      metaState(
        {
          'batch_report.skip': false,
          'batch_report.control_key': 'Condition',
          'batch_report.control_values': ['Control', 'Bogus'],
        },
        META,
      ),
    );
    expect(r).not.toBeNull();
    expect(r!.message).toContain('"Bogus"');
    expect(r!.fields).toContain('batch_report.control_key');
  });

  it('is silent when control values are present in the column', () => {
    expect(
      rule.check(
        metaState(
          {
            'batch_report.skip': false,
            'batch_report.control_key': 'Condition',
            'batch_report.control_values': ['Control', 'Treated'],
          },
          META,
        ),
      ),
    ).toBeNull();
  });

  it('is a no-op until a control key is chosen', () => {
    expect(
      rule.check(
        metaState(
          { 'batch_report.skip': false, 'batch_report.control_values': ['Anything'] },
          META,
        ),
      ),
    ).toBeNull();
  });
});
