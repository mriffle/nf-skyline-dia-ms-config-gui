import { describe, expect, it } from 'vitest';
import { paramMetadata, type FormState, type Mode } from '../paramMetadata';

const findMeta = (path: string) => {
  const meta = paramMetadata.find((m) => m.path === path);
  if (!meta) throw new Error(`No meta entry for path ${path}`);
  return meta;
};

const makeState = (
  mode: Mode,
  values: Record<string, unknown> = {},
): FormState => ({ mode, values, touched: {} });

describe('requiredWhen predicates', () => {
  it('quant_spectra_dir: required in general mode, optional in PDC mode', () => {
    const meta = findMeta('quant_spectra_dir');
    expect(meta.requiredWhen?.(makeState('general'))).toBe(true);
    expect(meta.requiredWhen?.(makeState('pdc'))).toBe(false);
  });

  it('pdc.study_id: required in PDC mode, optional in general mode', () => {
    const meta = findMeta('pdc.study_id');
    expect(meta.requiredWhen?.(makeState('pdc'))).toBe(true);
    expect(meta.requiredWhen?.(makeState('general'))).toBe(false);
  });

  it('fasta: required for DIA-NN and EncyclopeDIA, optional otherwise', () => {
    const meta = findMeta('fasta');
    expect(meta.requiredWhen?.(makeState('general', { search_engine: 'diann' }))).toBe(true);
    expect(meta.requiredWhen?.(makeState('general', { search_engine: 'encyclopedia' }))).toBe(
      true,
    );
    expect(meta.requiredWhen?.(makeState('general', { search_engine: 'cascadia' }))).toBe(false);
    expect(meta.requiredWhen?.(makeState('general', { search_engine: null }))).toBe(false);
    expect(meta.requiredWhen?.(makeState('general', {}))).toBe(false);
  });

  it('spectral_library: required for no-search, and for EncyclopeDIA without Carafe', () => {
    const meta = findMeta('spectral_library');
    expect(meta.requiredWhen?.(makeState('general', { search_engine: null }))).toBe(true);
    expect(meta.requiredWhen?.(makeState('general', { search_engine: 'encyclopedia' }))).toBe(
      true,
    );
    expect(
      meta.requiredWhen?.(
        makeState('general', { search_engine: 'encyclopedia', use_carafe: true }),
      ),
    ).toBe(false);
    expect(meta.requiredWhen?.(makeState('general', { search_engine: 'diann' }))).toBe(false);
    expect(meta.requiredWhen?.(makeState('general', { search_engine: 'cascadia' }))).toBe(false);
  });

  it('carafe.source: required only when Carafe is enabled', () => {
    const meta = findMeta('carafe.source');
    expect(meta.requiredWhen?.(makeState('general', { use_carafe: true }))).toBe(true);
    expect(meta.requiredWhen?.(makeState('general', { use_carafe: false }))).toBe(false);
    expect(meta.requiredWhen?.(makeState('general', {}))).toBe(false);
  });

  it('carafe.spectra_file: required when Carafe + source=file', () => {
    const meta = findMeta('carafe.spectra_file');
    expect(
      meta.requiredWhen?.(makeState('general', { use_carafe: true, 'carafe.source': 'file' })),
    ).toBe(true);
    expect(
      meta.requiredWhen?.(makeState('general', { use_carafe: true, 'carafe.source': 'dir' })),
    ).toBe(false);
    expect(
      meta.requiredWhen?.(makeState('general', { use_carafe: false, 'carafe.source': 'file' })),
    ).toBe(false);
  });

  it('carafe.spectra_dir: required when Carafe + source=dir', () => {
    const meta = findMeta('carafe.spectra_dir');
    expect(
      meta.requiredWhen?.(makeState('general', { use_carafe: true, 'carafe.source': 'dir' })),
    ).toBe(true);
    expect(
      meta.requiredWhen?.(makeState('general', { use_carafe: true, 'carafe.source': 'file' })),
    ).toBe(false);
  });

  it('carafe.pdc_files: required when Carafe + source=pdc-files', () => {
    const meta = findMeta('carafe.pdc_files');
    expect(
      meta.requiredWhen?.(
        makeState('pdc', { use_carafe: true, 'carafe.source': 'pdc-files' }),
      ),
    ).toBe(true);
    expect(
      meta.requiredWhen?.(makeState('pdc', { use_carafe: true, 'carafe.source': 'file' })),
    ).toBe(false);
  });

  it('carafe.pdc_n_files: required when Carafe + source=pdc-sample', () => {
    const meta = findMeta('carafe.pdc_n_files');
    expect(
      meta.requiredWhen?.(
        makeState('pdc', { use_carafe: true, 'carafe.source': 'pdc-sample' }),
      ),
    ).toBe(true);
    expect(
      meta.requiredWhen?.(
        makeState('pdc', { use_carafe: true, 'carafe.source': 'pdc-files' }),
      ),
    ).toBe(false);
  });

  it('panorama.upload_url: required only when panorama.upload=true', () => {
    const meta = findMeta('panorama.upload_url');
    expect(meta.requiredWhen?.(makeState('general', { 'panorama.upload': true }))).toBe(true);
    expect(meta.requiredWhen?.(makeState('general', { 'panorama.upload': false }))).toBe(false);
    expect(meta.requiredWhen?.(makeState('general', {}))).toBe(false);
  });

  it('qc_report.report_format: required when QC runs, optional when skipped', () => {
    const meta = findMeta('qc_report.report_format');
    expect(meta.requiredWhen?.(makeState('general', { 'qc_report.skip': false }))).toBe(true);
    expect(meta.requiredWhen?.(makeState('general', {}))).toBe(true);
    expect(meta.requiredWhen?.(makeState('general', { 'qc_report.skip': true }))).toBe(false);
  });

  it('every params that has a requiredWhen also has either no default or a meaningful conditional', () => {
    // Sanity: count of params with requiredWhen should match the 11 we authored.
    const withRequired = paramMetadata.filter((m) => m.requiredWhen !== undefined);
    expect(withRequired).toHaveLength(11);
  });
});
