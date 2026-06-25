import { describe, expect, it } from 'vitest';
import { mapToState, type UploadIssue } from '../mapToState';
import type { ParsedEntry, ParsedValue } from '../types';

function e(path: string, value: ParsedValue, line = 1): ParsedEntry {
  return { path, value, line, col: 1 };
}

function issueKinds(issues: readonly UploadIssue[]): string[] {
  return issues.map((i) => i.kind);
}

function findIssue<K extends UploadIssue['kind']>(
  issues: readonly UploadIssue[],
  kind: K,
): Extract<UploadIssue, { kind: K }> | undefined {
  return issues.find((i) => i.kind === kind) as
    | Extract<UploadIssue, { kind: K }>
    | undefined;
}

describe('mapToState — happy paths', () => {
  it('loads a minimal general-mode config', () => {
    const r = mapToState([
      e('fasta', '/db.fasta'),
      e('quant_spectra_dir', '/data/wide'),
      e('search_engine', 'diann'),
    ]);
    expect(r.report.issues).toEqual([]);
    expect(r.state.mode).toBe('general');
    expect(r.state.values['fasta']).toBe('/db.fasta');
    expect(r.state.values['quant_spectra_dir']).toEqual({
      kind: 'single',
      path: '/data/wide',
    });
    expect(r.state.values['search_engine']).toBe('diann');
    expect(r.state.touched['fasta']).toBe(true);
    expect(r.state.touched['search_engine']).toBe(true);
    // use_carafe inferred false (no carafe.* in file).
    expect(r.state.values['use_carafe']).toBe(false);
    expect(r.state.touched['use_carafe']).toBe(true);
    expect(r.report.loadedCount).toBe(3);
  });

  it('loads a list-form quant_spectra_dir', () => {
    const r = mapToState([e('quant_spectra_dir', ['/a', '/b'])]);
    expect(r.report.issues).toEqual([]);
    expect(r.state.values['quant_spectra_dir']).toEqual({
      kind: 'list',
      paths: ['/a', '/b'],
    });
  });

  it('loads a batch-map quant_spectra_dir', () => {
    const r = mapToState([
      e('quant_spectra_dir', { PlateA: '/data/A', PlateB: '/data/B' }),
    ]);
    expect(r.report.issues).toEqual([]);
    expect(r.state.values['quant_spectra_dir']).toEqual({
      kind: 'batch-map',
      entries: [
        { name: 'PlateA', path: '/data/A' },
        { name: 'PlateB', path: '/data/B' },
      ],
    });
  });

  it('loads booleans, integers, numbers, strings, null', () => {
    const r = mapToState([
      e('qc_report.skip', false),
      e('max_cpus', 16),
      e('cascadia.score_threshold', 0.7),
      e('email', 'me@example.com'),
      e('search_engine', null),
    ]);
    expect(r.report.issues).toEqual([]);
    expect(r.state.values['qc_report.skip']).toBe(false);
    expect(r.state.values['max_cpus']).toBe(16);
    expect(r.state.values['cascadia.score_threshold']).toBe(0.7);
    expect(r.state.values['email']).toBe('me@example.com');
    expect(r.state.values['search_engine']).toBe(null);
  });
});

describe('mapToState — path classification', () => {
  it('reports IGNORED_PARAM_PATHS entries as ignored-param', () => {
    const r = mapToState([e('aws.region', 'us-east-1')]);
    expect(issueKinds(r.report.issues)).toContain('ignored-param');
    expect(r.state.values['aws.region']).toBeUndefined();
  });

  it('loads schema-hidden entries and reports hidden-param-preserved', () => {
    const r = mapToState([e('images.proteowizard', 'custom/pwiz:1.0')]);
    const hit = findIssue(r.report.issues, 'hidden-param-preserved');
    expect(hit).toBeDefined();
    expect(hit?.path).toBe('images.proteowizard');
    // The hidden param IS loaded into state so it round-trips into the
    // generated config — power users with custom image pins shouldn't
    // lose them on download.
    expect(r.state.values['images.proteowizard']).toBe('custom/pwiz:1.0');
    expect(r.state.touched['images.proteowizard']).toBe(true);
  });

  it('loads surfaceHidden ParamMeta entries through the regular UI path', () => {
    // images.diann is hidden in the schema but ParamMeta opts in via
    // surfaceHidden so the value populates the form field and is NOT
    // flagged as hidden-preserved.
    const r = mapToState([e('images.diann', 'quay.io/user/diann:2.0')]);
    expect(issueKinds(r.report.issues)).not.toContain('hidden-param-preserved');
    expect(r.state.values['images.diann']).toBe('quay.io/user/diann:2.0');
    expect(r.state.touched['images.diann']).toBe(true);
  });

  it('reports paths not in schema as unknown-param', () => {
    const r = mapToState([e('not.a.real.path', 'whatever')]);
    const hit = findIssue(r.report.issues, 'unknown-param');
    expect(hit).toBeDefined();
    expect(hit?.path).toBe('not.a.real.path');
    expect(hit?.rawValue).toBe('whatever');
    expect(r.state.values['not.a.real.path']).toBeUndefined();
  });

  it('loads glob/regex paths exposed only via a virtual parent (no direct ParamMeta)', () => {
    // quant_spectra_glob, chromatogram_library_spectra_glob, and the carafe
    // glob/regex pair are reachable through the glob-regex-pair widgets'
    // `affects` lists, not as their own ParamMeta entries. Without the
    // virtual-parent fallback in classify(), upload would flag these as
    // unknown-param and silently drop user-set glob values.
    const r = mapToState([
      e('quant_spectra_glob', '*.mzML'),
      e('chromatogram_library_spectra_glob', '*.raw'),
      e('carafe.spectra_glob', '*.d.zip'),
    ]);
    expect(r.report.issues).toEqual([]);
    expect(r.state.values['quant_spectra_glob']).toBe('*.mzML');
    expect(r.state.values['chromatogram_library_spectra_glob']).toBe('*.raw');
    expect(r.state.values['carafe.spectra_glob']).toBe('*.d.zip');
    expect(r.state.touched['quant_spectra_glob']).toBe(true);
  });
});

describe('mapToState — type / enum / range', () => {
  it('reports type-mismatch for boolean field given a string', () => {
    const r = mapToState([e('qc_report.skip', 'yes')]);
    const hit = findIssue(r.report.issues, 'type-mismatch');
    expect(hit).toBeDefined();
    expect(hit?.path).toBe('qc_report.skip');
    expect(hit?.gotType).toBe('string');
    expect(r.state.values['qc_report.skip']).toBeUndefined();
  });

  it('reports type-mismatch for integer field given a decimal', () => {
    const r = mapToState([e('max_cpus', 1.5)]);
    expect(issueKinds(r.report.issues)).toContain('type-mismatch');
    expect(r.state.values['max_cpus']).toBeUndefined();
  });

  it('reports enum-mismatch for unknown enum value', () => {
    const r = mapToState([e('search_engine', 'mascot')]);
    const hit = findIssue(r.report.issues, 'enum-mismatch');
    expect(hit).toBeDefined();
    expect(hit?.allowed.length).toBeGreaterThan(0);
  });

  it('reports range-violation for value below minimum but keeps the value', () => {
    const r = mapToState([e('carafe.pdc_n_files', 0)]);
    const hit = findIssue(r.report.issues, 'range-violation');
    expect(hit).toBeDefined();
    expect(hit?.value).toBe(0);
    // Range violations are non-fatal — value still loads so the form's
    // validator can take over.
    expect(r.state.values['carafe.pdc_n_files']).toBe(0);
  });

  it('reports range-violation for value above maximum', () => {
    const r = mapToState([e('cascadia.score_threshold', 1.5)]);
    const hit = findIssue(r.report.issues, 'range-violation');
    expect(hit).toBeDefined();
    expect(hit?.max).toBe(1);
  });
});

describe('mapToState — string-or-list coercion', () => {
  it('keeps a single string for a file-or-url widget (carafe.spectra_dir)', () => {
    const r = mapToState([e('carafe.spectra_dir', '/dir/of/spectra')]);
    expect(r.report.issues).toEqual([]);
    expect(r.state.values['carafe.spectra_dir']).toBe('/dir/of/spectra');
  });

  it('truncates a list to its first element when the widget is single-string', () => {
    const r = mapToState([
      e('chromatogram_library_spectra_dir', ['/one', '/two', '/three']),
    ]);
    const hit = findIssue(r.report.issues, 'list-truncated-to-string');
    expect(hit).toBeDefined();
    expect(hit?.kept).toBe('/one');
    expect(r.state.values['chromatogram_library_spectra_dir']).toBe('/one');
  });

  it('wraps a single string into a list for a string-list widget (carafe.pdc_files)', () => {
    const r = mapToState([e('carafe.pdc_files', 'just-one.raw')]);
    const hit = findIssue(r.report.issues, 'string-coerced-to-list');
    expect(hit).toBeDefined();
    expect(r.state.values['carafe.pdc_files']).toEqual(['just-one.raw']);
  });

  it('keeps an array for a string-list widget unchanged', () => {
    const r = mapToState([e('carafe.pdc_files', ['a.raw', 'b.raw'])]);
    expect(r.report.issues).toEqual([]);
    expect(r.state.values['carafe.pdc_files']).toEqual(['a.raw', 'b.raw']);
  });

  it('keeps an array for a multi-enum widget (qc_report.report_format)', () => {
    const r = mapToState([e('qc_report.report_format', ['html', 'pdf'])]);
    expect(r.report.issues).toEqual([]);
    expect(r.state.values['qc_report.report_format']).toEqual(['html', 'pdf']);
  });

  it('wraps a scalar string into a list for a multi-enum widget', () => {
    const r = mapToState([e('qc_report.report_format', 'html')]);
    const hit = findIssue(r.report.issues, 'string-coerced-to-list');
    expect(hit).toBeDefined();
    expect(r.state.values['qc_report.report_format']).toEqual(['html']);
  });
});

describe('mapToState — mode inference', () => {
  it('detects general mode by default', () => {
    const r = mapToState([e('fasta', '/db.fasta')]);
    expect(r.state.mode).toBe('general');
    expect(r.report.modeAmbiguous).toBe(false);
  });

  it('detects PDC mode when pdc.study_id is set', () => {
    const r = mapToState([
      e('pdc.study_id', 'PDC000001'),
      e('search_engine', 'diann'),
    ]);
    expect(r.state.mode).toBe('pdc');
    expect(r.report.modeAmbiguous).toBe(false);
  });

  it('reports mode-ambiguity when both PDC and general inputs are present', () => {
    const r = mapToState([
      e('pdc.study_id', 'PDC000001'),
      e('quant_spectra_dir', '/data/wide'),
      e('search_engine', 'diann'),
    ]);
    expect(r.state.mode).toBe('pdc');
    expect(r.report.modeAmbiguous).toBe(true);
    const hit = findIssue(r.report.issues, 'mode-ambiguity');
    expect(hit).toBeDefined();
    expect(hit?.pdcPaths).toContain('pdc.study_id');
    expect(hit?.generalPaths).toContain('quant_spectra_dir');
  });

  it('does not flag pdc.* without study_id as PDC mode', () => {
    // pdc.s3_download alone (no study_id) shouldn't flip the mode —
    // we treat the study_id as the canonical PDC signal.
    const r = mapToState([
      e('pdc.s3_download', true),
      e('quant_spectra_dir', '/data/wide'),
    ]);
    expect(r.state.mode).toBe('general');
  });
});

describe('mapToState — carafe inference', () => {
  it('infers use_carafe=false when no carafe.* paths are present', () => {
    const r = mapToState([e('fasta', '/db.fasta')]);
    expect(r.report.inferredCarafeEnabled).toBe(false);
    expect(r.state.values['use_carafe']).toBe(false);
    expect(r.report.inferredCarafeSource).toBe(null);
  });

  it('infers use_carafe=true when any carafe.* path is present', () => {
    const r = mapToState([
      e('carafe.cli_options', '-fdr 0.01'),
      e('search_engine', 'diann'),
    ]);
    expect(r.report.inferredCarafeEnabled).toBe(true);
    expect(r.state.values['use_carafe']).toBe(true);
  });

  it('infers carafe.source from carafe.spectra_file', () => {
    const r = mapToState([
      e('carafe.spectra_file', '/in.raw'),
      e('search_engine', 'diann'),
    ]);
    expect(r.report.inferredCarafeSource).toBe('file');
    expect(r.state.values['carafe.source']).toBe('file');
  });

  it('infers carafe.source from carafe.spectra_dir', () => {
    const r = mapToState([
      e('carafe.spectra_dir', '/dir'),
      e('search_engine', 'diann'),
    ]);
    expect(r.report.inferredCarafeSource).toBe('dir');
    expect(r.state.values['carafe.source']).toBe('dir');
  });

  it('infers carafe.source from carafe.pdc_files', () => {
    const r = mapToState([
      e('pdc.study_id', 'PDC1'),
      e('carafe.pdc_files', ['a.raw', 'b.raw']),
      e('search_engine', 'diann'),
    ]);
    expect(r.report.inferredCarafeSource).toBe('pdc-files');
  });

  it('infers carafe.source from carafe.pdc_n_files', () => {
    const r = mapToState([
      e('pdc.study_id', 'PDC1'),
      e('carafe.pdc_n_files', 5),
      e('search_engine', 'diann'),
    ]);
    expect(r.report.inferredCarafeSource).toBe('pdc-sample');
  });

  it('uses an explicit carafe.source over inference', () => {
    const r = mapToState([
      e('carafe.source', 'dir'),
      e('carafe.spectra_dir', '/dir'),
      e('search_engine', 'diann'),
    ]);
    expect(r.state.values['carafe.source']).toBe('dir');
  });

  it('reports carafe-source-mismatch when explicit source contradicts the data', () => {
    const r = mapToState([
      e('carafe.source', 'file'),
      e('carafe.spectra_dir', '/dir'),
      e('search_engine', 'diann'),
    ]);
    const hit = findIssue(r.report.issues, 'carafe-source-mismatch');
    expect(hit).toBeDefined();
    expect(hit?.sourceFromFile).toBe('file');
    expect(hit?.sourceInferred).toBe('dir');
    // The explicit value wins in state.
    expect(r.state.values['carafe.source']).toBe('file');
  });
});

describe('mapToState — preserved outer blocks', () => {
  it('leaves state.preservedOuterText absent when no outer blocks were passed', () => {
    const r = mapToState([e('fasta', '/db.fasta')]);
    expect(r.state.preservedOuterText).toBeUndefined();
    expect(r.report.preservedOuterBlockNames).toEqual([]);
  });

  it('concatenates outer-block text in the order received', () => {
    const r = mapToState(
      [e('fasta', '/db.fasta')],
      [
        { name: 'process', text: 'process { cpus = 4 }', line: 1, col: 1 },
        { name: 'docker', text: 'docker { enabled = true }', line: 3, col: 1 },
      ],
    );
    expect(r.state.preservedOuterText).toBe(
      'process { cpus = 4 }\n\ndocker { enabled = true }',
    );
    expect(r.report.preservedOuterBlockNames).toEqual(['process', 'docker']);
  });
});

describe('mapToState — touched semantics', () => {
  it('marks every loaded path touched', () => {
    const r = mapToState([
      e('fasta', '/db.fasta'),
      e('search_engine', 'diann'),
      e('max_cpus', 8),
    ]);
    expect(r.state.touched).toEqual({
      fasta: true,
      search_engine: true,
      max_cpus: true,
      use_carafe: true,
    });
  });
});
