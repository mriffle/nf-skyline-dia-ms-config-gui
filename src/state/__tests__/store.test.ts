// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { previewClearTargetsForModeChange, useStore } from '../store';
import { createDefaultState } from '../formState';

beforeEach(() => {
  localStorage.clear();
  useStore.setState(createDefaultState());
});

describe('store basics', () => {
  it('starts in general mode with Carafe enabled and search_engine pre-seeded', () => {
    const s = useStore.getState();
    expect(s.mode).toBe('general');
    expect(s.values).toEqual({ use_carafe: true, search_engine: 'diann' });
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
    expect(s.values).toEqual({ use_carafe: true, search_engine: 'diann' });
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

describe('localStorage persistence', () => {
  it('persists state to localStorage on changes', async () => {
    useStore.getState().setValue('fasta', '/persisted.fasta');
    await new Promise((r) => setTimeout(r, 0));
    const raw = localStorage.getItem('nf-skyline-dia-ms.config-builder.v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.values.fasta).toBe('/persisted.fasta');
    expect(parsed.version).toBe(3);
  });
});
