// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { previewClearTargetsForModeChange, useStore } from '../store';
import { createDefaultState } from '../formState';

beforeEach(() => {
  localStorage.clear();
  useStore.setState(createDefaultState());
});

describe('store basics', () => {
  it('starts in general mode with Carafe enabled, search_engine pre-seeded, qc/batch skip seeded', () => {
    const s = useStore.getState();
    expect(s.mode).toBe('general');
    expect(s.values).toEqual({
      use_carafe: true,
      search_engine: 'diann',
      'qc_report.skip': false,
      'batch_report.skip': true,
      'skyline.group_proteins': true,
    });
    expect(s.touched).toEqual({});
    expect(s.showAdvanced).toBe(false);
  });

  it('setValue marks the path touched and stores the value', () => {
    useStore.getState().setValue('fasta', '/path/to/db.fasta');
    const s = useStore.getState();
    expect(s.values['fasta']).toBe('/path/to/db.fasta');
    expect(s.touched['fasta']).toBe(true);
  });

  it('clearValue removes both the value and the touched flag', () => {
    const { setValue, clearValue } = useStore.getState();
    setValue('fasta', '/x.fasta');
    clearValue('fasta');
    const s = useStore.getState();
    expect(s.values['fasta']).toBeUndefined();
    expect(s.touched['fasta']).toBeUndefined();
  });

  it('toggleAdvanced flips the advanced flag', () => {
    useStore.getState().toggleAdvanced();
    expect(useStore.getState().showAdvanced).toBe(true);
    useStore.getState().toggleAdvanced();
    expect(useStore.getState().showAdvanced).toBe(false);
  });

  it('reset restores defaults', () => {
    const { setValue, toggleAdvanced, reset } = useStore.getState();
    setValue('fasta', '/x.fasta');
    toggleAdvanced();
    reset();
    const s = useStore.getState();
    expect(s.values).toEqual({
      use_carafe: true,
      search_engine: 'diann',
      'qc_report.skip': false,
      'batch_report.skip': true,
      'skyline.group_proteins': true,
    });
    expect(s.touched).toEqual({});
    expect(s.showAdvanced).toBe(false);
    expect(s.mode).toBe('general');
  });
});

describe('mode switch clears the now-invisible branch', () => {
  it('switching general -> pdc clears any general-only values that were set', () => {
    const { setValue, setMode } = useStore.getState();
    setValue('quant_spectra_dir', { kind: 'single', path: '/data' });
    setValue('replicate_metadata', '/m.csv');
    setValue('fasta', '/db.fasta');

    setMode('pdc');
    const s = useStore.getState();

    expect(s.mode).toBe('pdc');
    expect(s.values['quant_spectra_dir']).toBeUndefined();
    expect(s.values['replicate_metadata']).toBeUndefined();
    expect(s.values['fasta']).toBe('/db.fasta');
    expect(s.touched['fasta']).toBe(true);
    expect(s.touched['quant_spectra_dir']).toBeUndefined();
  });

  it('switching pdc -> general clears pdc.* values', () => {
    const { setValue, setMode } = useStore.getState();
    setMode('pdc');
    setValue('pdc.study_id', 'PDC000504');
    setValue('pdc.n_raw_files', 10);
    setValue('fasta', '/db.fasta');

    setMode('general');
    const s = useStore.getState();

    expect(s.mode).toBe('general');
    expect(s.values['pdc.study_id']).toBeUndefined();
    expect(s.values['pdc.n_raw_files']).toBeUndefined();
    expect(s.values['fasta']).toBe('/db.fasta');
  });

  it('previewClearTargetsForModeChange surfaces what would be cleared without mutating state', () => {
    const { setValue, setMode } = useStore.getState();
    setValue('quant_spectra_dir', { kind: 'single', path: '/x' });
    setValue('fasta', '/db.fasta');

    const targets = previewClearTargetsForModeChange(useStore.getState(), 'pdc');
    expect(targets).toContain('quant_spectra_dir');
    expect(targets).not.toContain('fasta');
    expect(useStore.getState().mode).toBe('general');

    setMode('pdc');
    expect(useStore.getState().values['quant_spectra_dir']).toBeUndefined();
  });

  it('no-op when target mode equals current mode', () => {
    const { setValue, setMode } = useStore.getState();
    setValue('quant_spectra_dir', { kind: 'single', path: '/x' });
    setMode('general');
    expect(useStore.getState().values['quant_spectra_dir']).toEqual({
      kind: 'single',
      path: '/x',
    });
  });

  it('clears carafe.source when its PDC-only value is invalid in general mode', () => {
    const { setValue, setMode } = useStore.getState();
    setMode('pdc');
    setValue('carafe.source', 'pdc-sample');
    setValue('carafe.pdc_n_files', 3);

    setMode('general');
    const s = useStore.getState();
    expect(s.values['carafe.source']).toBeUndefined();
    expect(s.touched['carafe.source']).toBeUndefined();
  });

  it('preserves carafe.source when the value is still valid (file/dir) after switching to general', () => {
    const { setValue, setMode } = useStore.getState();
    setMode('pdc');
    setValue('carafe.source', 'dir');

    setMode('general');
    expect(useStore.getState().values['carafe.source']).toBe('dir');
  });
});

describe('loadFromConfig (upload)', () => {
  it('replaces form state and marks loaded paths touched', () => {
    const { setValue, loadFromConfig } = useStore.getState();
    setValue('fasta', '/old.fasta');
    setValue('email', 'old@example.com');

    loadFromConfig({
      mode: 'general',
      values: {
        fasta: '/new.fasta',
        quant_spectra_dir: { kind: 'single', path: '/data' },
      },
      touched: { fasta: true, quant_spectra_dir: true },
    });

    const s = useStore.getState();
    expect(s.values['fasta']).toBe('/new.fasta');
    expect(s.values['quant_spectra_dir']).toEqual({ kind: 'single', path: '/data' });
    // The previously-touched email is gone — replace, not merge.
    expect(s.values['email']).toBeUndefined();
    expect(s.touched).toEqual({ fasta: true, quant_spectra_dir: true });
  });

  it('preserves the createDefaultState seeds when the file does not mention them', () => {
    const { loadFromConfig } = useStore.getState();
    loadFromConfig({
      mode: 'general',
      values: { fasta: '/db.fasta' },
      touched: { fasta: true },
    });
    const s = useStore.getState();
    // Seeds remain available so the form reads sensible defaults.
    expect(s.values['use_carafe']).toBe(true);
    expect(s.values['search_engine']).toBe('diann');
    expect(s.values['qc_report.skip']).toBe(false);
    expect(s.values['skyline.group_proteins']).toBe(true);
    // Seeds are not marked touched — only the loaded path is.
    expect(s.touched).toEqual({ fasta: true });
  });

  it('loaded values override seeds where they overlap', () => {
    const { loadFromConfig } = useStore.getState();
    loadFromConfig({
      mode: 'general',
      values: {
        search_engine: 'encyclopedia',
        use_carafe: false,
      },
      touched: { search_engine: true, use_carafe: true },
    });
    const s = useStore.getState();
    expect(s.values['search_engine']).toBe('encyclopedia');
    expect(s.values['use_carafe']).toBe(false);
  });

  it('switches mode without firing setMode\'s clearing logic', () => {
    const { loadFromConfig } = useStore.getState();
    // A loaded PDC config shouldn't trigger general-mode clearing of
    // its own pdc.* values.
    loadFromConfig({
      mode: 'pdc',
      values: { 'pdc.study_id': 'PDC1', 'pdc.n_raw_files': 5 },
      touched: { 'pdc.study_id': true, 'pdc.n_raw_files': true },
    });
    const s = useStore.getState();
    expect(s.mode).toBe('pdc');
    expect(s.values['pdc.study_id']).toBe('PDC1');
    expect(s.values['pdc.n_raw_files']).toBe(5);
  });

  it('resets activeSection but preserves showAdvanced', () => {
    const { setActiveSection, setShowAdvanced, loadFromConfig } = useStore.getState();
    setActiveSection('search');
    setShowAdvanced(true);

    loadFromConfig({
      mode: 'general',
      values: { fasta: '/x.fasta' },
      touched: { fasta: true },
    });

    const s = useStore.getState();
    expect(s.activeSection).toBe(null);
    expect(s.showAdvanced).toBe(true);
  });

  it('loads preservedOuterText from the upload', () => {
    const { loadFromConfig } = useStore.getState();
    loadFromConfig({
      mode: 'general',
      values: { fasta: '/db.fasta' },
      touched: { fasta: true },
      preservedOuterText: 'process { cpus = 4 }',
    });
    expect(useStore.getState().preservedOuterText).toBe('process { cpus = 4 }');
  });

  it('reset clears preservedOuterText', () => {
    const { loadFromConfig, reset } = useStore.getState();
    loadFromConfig({
      mode: 'general',
      values: { fasta: '/db.fasta' },
      touched: { fasta: true },
      preservedOuterText: 'process { cpus = 4 }',
    });
    expect(useStore.getState().preservedOuterText).toBe('process { cpus = 4 }');
    reset();
    expect(useStore.getState().preservedOuterText).toBeUndefined();
  });
});

describe('localStorage persistence', () => {
  it('persists state to localStorage on changes', async () => {
    useStore.getState().setValue('fasta', '/persisted.fasta');
    await new Promise((r) => setTimeout(r, 0));
    const raw = localStorage.getItem('nf-skyline-dia-ms.config-builder.v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.values.fasta).toBe('/persisted.fasta');
    expect(parsed.version).toBe(6);
  });
});
