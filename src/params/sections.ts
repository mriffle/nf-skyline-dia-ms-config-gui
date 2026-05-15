// Ordered list of UI sections for the config-builder form. Section IDs are
// referenced by paramMetadata entries and the form renderer; the order here
// is the order shown in the UI.

import type { SectionId } from './paramMetadata';

export interface Section {
  readonly id: SectionId;
  readonly title: string;
  readonly blurb: string;
}

export const sections: readonly Section[] = [
  {
    id: 'essentials',
    title: 'Essentials',
    blurb:
      'Background protein database used by the search engines. Required for DIA-NN and EncyclopeDIA; Cascadia generates its own.',
  },
  {
    id: 'input-general',
    title: 'Input data (general)',
    blurb:
      'Quantitative spectra, optional empirical-library spectra (narrow-window GPF, pooled samples, or a subset of the search files), vendor RAW handling, and random sampling for the standard (non-PDC) input path.',
  },
  {
    id: 'input-pdc',
    title: 'Input data (PDC)',
    blurb:
      'Study, file count, metadata, and optional batch assignments for runs that pull spectra from the NCI Proteomic Data Commons.',
  },
  {
    id: 'search',
    title: 'Search engine',
    blurb:
      'Search-engine selection (EncyclopeDIA, DIA-NN, Cascadia, or none) plus engine-specific parameters.',
  },
  {
    id: 'library',
    title: 'Spectral library',
    blurb:
      'Either a user-supplied spectral library or an optional Carafe library-generation step performed before search.',
  },
  {
    id: 'fasta-skyline',
    title: 'Skyline document',
    blurb: 'Skyline document, template, report, and protein-grouping options. (Background FASTA lives in Essentials at the top of the form.)',
  },
  {
    id: 'metadata',
    title: 'Replicate metadata',
    blurb:
      'Per-replicate annotations applied to the Skyline document (general-mode only; PDC supplies its own annotations).',
  },
  {
    id: 'msconvert',
    title: 'msconvert',
    blurb:
      'ProteoWizard msconvert behavior and the msconvert-only early-exit mode that skips search, Skyline, and QC.',
  },
  {
    id: 'qc-reporting',
    title: 'QC and batch reports',
    blurb:
      'QC-report content and normalization plus the separate batch-effect / covariate report.',
  },
  {
    id: 'panorama',
    title: 'Panorama upload',
    blurb:
      'Upload converted spectra, search outputs, FASTA, library, and Skyline documents to PanoramaWeb.',
  },
  {
    id: 'execution',
    title: 'Execution and output',
    blurb:
      'Resource caps, result and report directories, cache locations, and the random-sampling seed.',
  },
];
