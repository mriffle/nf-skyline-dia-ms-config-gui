// UX overlay for nf-skyline-dia-ms parameters. Schema facts (types, defaults,
// enums, hidden, min/max) live in schemaDerived.generated.ts; everything in
// this file is hand-authored: section, tier, label, help, widget, and
// visibility / enablement predicates.

import { schemaDerived } from './schemaDerived.generated';
import type { SchemaDerivedEntry } from './schemaTypes';

export type Mode = 'general' | 'pdc';

export interface FormState {
  readonly mode: Mode;
  readonly values: Record<string, unknown>;
  readonly touched: Record<string, boolean>;
  // Verbatim text of outer blocks captured from an uploaded config
  // (process { }, profiles { }, etc.). Appended after the generated
  // params { } block on emit. Empty / absent when nothing was uploaded
  // or after a Reset.
  readonly preservedOuterText?: string;
}

export type Widget =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'multi-enum'
  | 'file-or-url'
  | 'string-list'
  | 'glob-regex-pair'
  | 'batch-map'
  | 'spectra-source';

export type SectionId =
  | 'essentials'
  | 'input-general'
  | 'input-pdc'
  | 'search'
  | 'library'
  | 'fasta-skyline'
  | 'metadata'
  | 'msconvert'
  | 'qc-reporting'
  | 'panorama'
  | 'execution';

export interface ParamMeta {
  readonly path: string;
  readonly section: SectionId;
  readonly label: string;
  readonly help: string;
  readonly tier: 'common' | 'advanced';
  readonly widget: Widget;
  readonly visibleWhen?: (s: FormState) => boolean;
  // True when this field is conditionally required for the form to validate
  // in the given state. Used to render a required-marker on the field label
  // and set aria-required on the input. Returning false here does not weaken
  // any cross-field validation rule — it is presentation only.
  readonly requiredWhen?: (s: FormState) => boolean;
  readonly placeholder?: string;
  readonly examples?: readonly string[];
  readonly group?: string;
  readonly virtual?: boolean;
  readonly affects?: readonly string[];
  // Override the schema's default value for UI display only (placeholder +
  // "Default: X" hint). Use sparingly — only when the upstream
  // nextflow_schema.json default disagrees with the workflow's actual
  // nextflow.config default. Has no effect on emit or validation.
  readonly defaultOverride?: unknown;
  // When true, this param is emitted in the output config regardless of
  // whether the user has touched it. Used for parameters important enough
  // that the generated config should always make them explicit (e.g.
  // search_engine). The emitted value is the user's value if present, else
  // the effective default. Field UI suppresses the "Default: X" hint for
  // alwaysEmit fields since the value is always present.
  //
  // May also be a predicate to gate the always-emit behavior on form state
  // (e.g. DIA-NN-specific params only emit when search_engine === 'diann').
  // When the predicate returns false, the param falls back to the normal
  // emit-only-touched rule.
  readonly alwaysEmit?: boolean | ((s: FormState) => boolean);
}

// Infra knobs power users override in their own profile config, plus the
// deprecated top-level panorama_upload alias and the URL of the default
// Skyline template (overridden via skyline.template_file when needed).
export const IGNORED_PARAM_PATHS: ReadonlySet<string> = new Set([
  'aws.batch.cliPath',
  'aws.batch.logsGroup',
  'aws.batch.maxConnections',
  'aws.batch.connectionTimeout',
  'aws.batch.uploadStorageClass',
  'aws.batch.storageEncryption',
  'aws.batch.retryMode',
  'aws.region',
  'panorama.domain',
  'panorama.public.key',
  'default_skyline_template_file',
  // Legacy / deprecated aliases not surfaced in the UI. The schema does not
  // mark these hidden, but the workflow treats them as legacy.
  'panorama_upload',
]);

// --- Visibility predicate helpers ---------------------------------------

const inGeneral = (s: FormState) => s.mode === 'general';
const inPdc = (s: FormState) => s.mode === 'pdc';

function searchEngineIs(...engines: readonly string[]) {
  const set = new Set(engines.map((e) => e.toLowerCase()));
  return (s: FormState) => {
    const raw = s.values['search_engine'];
    if (typeof raw !== 'string') return false;
    return set.has(raw.toLowerCase());
  };
}

const carafeEnabled = (s: FormState) => s.values['use_carafe'] === true;

function carafeSourceIs(value: string) {
  return (s: FormState) => carafeEnabled(s) && s.values['carafe.source'] === value;
}

const skylineNotSkipped = (s: FormState) => s.values['skyline.skip'] !== true;

// --- Metadata ------------------------------------------------------------
//
// Order: by section, then by intra-section logical order.

export const paramMetadata: readonly ParamMeta[] = [
  // =====================================================================
  // essentials
  // =====================================================================
  {
    path: 'fasta',
    section: 'essentials',
    label: 'Background FASTA',
    help: 'Protein sequence database (.fasta / .fa). Required for DIA-NN and EncyclopeDIA. Cascadia generates its own FASTA from identifications.',
    tier: 'common',
    widget: 'file-or-url',
    placeholder: '/path/to/proteins.fasta',
    requiredWhen: searchEngineIs('diann', 'encyclopedia'),
  },

  // =====================================================================
  // input-general
  // =====================================================================
  {
    path: 'quant_spectra_dir',
    section: 'input-general',
    label: 'Quantitative spectra',
    help: 'Wide-window DIA spectra to quantify. Accepts a single path, a list of paths, or a named batch map. Local paths and Panorama WebDAV URLs are supported.',
    tier: 'common',
    widget: 'spectra-source',
    virtual: true,
    affects: ['quant_spectra_dir'],
    visibleWhen: inGeneral,
    requiredWhen: inGeneral,
  },
  {
    path: 'quant_spectra_files',
    section: 'input-general',
    label: 'Quant spectra file matching',
    help: 'Restrict which files inside each quant path are used. Provide a glob (e.g. *.raw) or a regex.',
    tier: 'common',
    widget: 'glob-regex-pair',
    virtual: true,
    affects: ['quant_spectra_glob', 'quant_spectra_regex'],
    visibleWhen: inGeneral,
  },
  {
    path: 'chromatogram_library_spectra_dir',
    section: 'input-general',
    label: 'Empirical-library spectra',
    help: 'Optional spectra used to build an empirical library before the main quantitative search. Typically narrow-window GPF acquisitions, pooled samples, or a subset of the files to be quantified. Single path or list. Supported by EncyclopeDIA (builds a chromatogram library / .elib) and DIA-NN (runs a subset search to refine the library).',
    tier: 'common',
    widget: 'file-or-url',
    placeholder: '/path/to/empirical-library-spectra or https://panorama.../WebDAV/...',
    visibleWhen: inGeneral,
  },
  {
    path: 'chromatogram_library_files',
    section: 'input-general',
    label: 'Empirical-library file matching',
    help: 'Glob or regex applied inside the empirical-library spectra path.',
    tier: 'common',
    widget: 'glob-regex-pair',
    virtual: true,
    affects: ['chromatogram_library_spectra_glob', 'chromatogram_library_spectra_regex'],
    visibleWhen: inGeneral,
  },
  {
    path: 'use_vendor_raw',
    section: 'input-general',
    label: 'Use vendor RAW directly',
    help: 'Skip msconvert and feed vendor RAW files straight to the search engine. Only supported by DIA-NN.',
    tier: 'common',
    widget: 'boolean',
  },
  {
    path: 'vendor_raw_copy',
    section: 'input-general',
    label: 'Copy vendor RAW files',
    help: 'When using vendor RAW, copy rather than hard-link them into the work directory. Required on filesystems that do not support hard links.',
    tier: 'advanced',
    widget: 'boolean',
    visibleWhen: (s) => s.values['use_vendor_raw'] === true,
  },
  {
    path: 'files_per_quant_batch',
    section: 'input-general',
    label: 'Files per quant batch (random sample)',
    help: 'If set, randomly sample this many quant spectra files per batch instead of using all of them. Intended for testing the workflow without having to download every file at the given location. Seed comes from the random-file seed.',
    tier: 'advanced',
    widget: 'number',
    visibleWhen: inGeneral,
  },
  {
    path: 'files_per_chrom_lib',
    section: 'input-general',
    label: 'Files per empirical library (random sample)',
    help: 'If set, randomly sample this many empirical-library spectra files instead of using all of them. Intended for testing the workflow without having to download every file at the given location. Seed comes from the random-file seed.',
    tier: 'advanced',
    widget: 'number',
    visibleWhen: inGeneral,
  },

  // =====================================================================
  // input-pdc
  // =====================================================================
  {
    path: 'pdc.study_id',
    section: 'input-pdc',
    label: 'PDC study ID',
    help: 'NCI Proteomic Data Commons study identifier. When set, the workflow downloads spectra and metadata directly from PDC and bypasses the general spectra inputs.',
    tier: 'common',
    widget: 'text',
    placeholder: 'PDC000000',
    visibleWhen: inPdc,
    requiredWhen: inPdc,
  },
  {
    path: 'pdc.n_raw_files',
    section: 'input-pdc',
    label: 'Number of RAW files',
    help: 'Limit the download to the first N RAW files in the study. Intended for testing the workflow without downloading the entire dataset; leave unset for production runs.',
    tier: 'advanced',
    widget: 'number',
    visibleWhen: inPdc,
  },
  {
    path: 'pdc.study_name',
    section: 'input-pdc',
    label: 'Study name override',
    help: 'Override the Skyline document name used when the default of "final" is otherwise replaced by the PDC study name.',
    tier: 'advanced',
    widget: 'text',
    visibleWhen: inPdc,
  },
  {
    path: 'pdc.metadata_tsv',
    section: 'input-pdc',
    label: 'Metadata TSV',
    help: 'Optional pre-fetched PDC metadata TSV (or JSON). Skips the PDC metadata query.',
    tier: 'advanced',
    widget: 'file-or-url',
    visibleWhen: inPdc,
  },
  {
    path: 'pdc.batch_file',
    section: 'input-pdc',
    label: 'PDC batch file',
    help: 'TSV with file_name and batch columns assigning each downloaded PDC file to a named batch. Activates per-batch Skyline documents.',
    tier: 'advanced',
    widget: 'text',
    visibleWhen: inPdc,
  },
  {
    path: 'pdc.gene_level_data',
    section: 'input-pdc',
    label: 'Gene-level data',
    help: 'Path to PDC gene-level data; when set the workflow exports gene-level QC reports if QC generation is enabled.',
    tier: 'advanced',
    widget: 'text',
    visibleWhen: inPdc,
  },
  {
    path: 'pdc.s3_download',
    section: 'input-pdc',
    label: 'Download via S3',
    help: 'Pull PDC files from S3 instead of the default HTTPS endpoints. Faster on AWS Batch with network access.',
    tier: 'advanced',
    widget: 'boolean',
    visibleWhen: inPdc,
  },
  {
    path: 'pdc.client_args',
    section: 'input-pdc',
    label: 'PDC client extra args',
    help: 'Extra arguments passed verbatim to the PDC client. Used for niche client options.',
    tier: 'advanced',
    widget: 'text',
    visibleWhen: inPdc,
  },

  // =====================================================================
  // search
  // =====================================================================
  {
    path: 'search_engine',
    section: 'search',
    label: 'Search engine',
    help: 'Which search engine to run. PDC mode requires DIA-NN. Always written to the generated config — this is a load-bearing parameter so we keep it explicit.',
    tier: 'common',
    widget: 'enum',
    // The workflow schema declares 'encyclopedia' as the default; the
    // builder UI exposes DIA-NN as the default because it is the more
    // common starting point and is required for PDC mode.
    defaultOverride: 'diann',
    alwaysEmit: true,
  },
  {
    path: 'diann.search_params',
    section: 'search',
    label: 'DIA-NN search parameters',
    help: 'Command-line flags appended to DIA-NN search invocations.',
    tier: 'advanced',
    widget: 'text',
    visibleWhen: searchEngineIs('diann', 'DiaNN'),
    // Surfaced in every DIA-NN config so users see exactly which flags ran.
    alwaysEmit: searchEngineIs('diann', 'DiaNN'),
    group: 'DIA-NN',
  },
  {
    path: 'diann.fasta_digest_params',
    section: 'search',
    label: 'DIA-NN FASTA digest parameters',
    help: 'Flags used when DIA-NN predicts a library from the FASTA. Controls enzyme, missed cleavages, peptide-length and charge bounds.',
    tier: 'advanced',
    widget: 'text',
    visibleWhen: searchEngineIs('diann', 'DiaNN'),
    alwaysEmit: searchEngineIs('diann', 'DiaNN'),
    group: 'DIA-NN',
  },
  {
    path: 'encyclopedia.quant.params',
    section: 'search',
    label: 'EncyclopeDIA quant parameters',
    help: 'Flags for the wide-window quantification step.',
    tier: 'advanced',
    widget: 'text',
    visibleWhen: searchEngineIs('encyclopedia', 'EncyclopeDIA'),
    alwaysEmit: searchEngineIs('encyclopedia', 'EncyclopeDIA'),
    group: 'EncyclopeDIA',
  },
  {
    path: 'encyclopedia.chromatogram.params',
    section: 'search',
    label: 'EncyclopeDIA empirical-library parameters',
    help: 'Flags for the EncyclopeDIA empirical-library build (the "chromatogram" step that emits the .elib).',
    tier: 'advanced',
    widget: 'text',
    visibleWhen: searchEngineIs('encyclopedia', 'EncyclopeDIA'),
    alwaysEmit: searchEngineIs('encyclopedia', 'EncyclopeDIA'),
    group: 'EncyclopeDIA',
  },
  {
    path: 'encyclopedia.save_output',
    section: 'search',
    label: 'Save per-file EncyclopeDIA outputs',
    help: 'Persist .dia / .features.txt outputs per input file. Disable to save disk space; the empirical library is always retained.',
    tier: 'advanced',
    widget: 'boolean',
    visibleWhen: searchEngineIs('encyclopedia', 'EncyclopeDIA'),
    group: 'EncyclopeDIA',
  },
  {
    path: 'cascadia.use_gpu',
    section: 'search',
    label: 'Cascadia: use GPU',
    help: 'Enable GPU acceleration for Cascadia. Requires a CUDA-capable device in the execution environment.',
    tier: 'advanced',
    widget: 'boolean',
    visibleWhen: searchEngineIs('cascadia', 'CascaDIA', 'Cascadia'),
    alwaysEmit: searchEngineIs('cascadia', 'CascaDIA', 'Cascadia'),
    group: 'Cascadia',
  },
  {
    path: 'cascadia.score_threshold',
    section: 'search',
    label: 'Cascadia: score threshold',
    help: 'Minimum prediction score retained after Cascadia inference. Value between 0 and 1.',
    tier: 'advanced',
    widget: 'number',
    visibleWhen: searchEngineIs('cascadia', 'CascaDIA', 'Cascadia'),
    alwaysEmit: searchEngineIs('cascadia', 'CascaDIA', 'Cascadia'),
    group: 'Cascadia',
  },

  // =====================================================================
  // library (spectral library + Carafe)
  // =====================================================================
  {
    path: 'spectral_library',
    section: 'library',
    label: 'Spectral library',
    help: 'Pre-built spectral library to feed the search engine. Accepts .blib, .dlib, or .elib. Required for no-search mode.',
    tier: 'common',
    widget: 'file-or-url',
    placeholder: '/path/to/library.dlib',
    requiredWhen: (s) =>
      s.values['search_engine'] === null ||
      (searchEngineIs('encyclopedia')(s) && !carafeEnabled(s)),
  },
  {
    path: 'use_carafe',
    section: 'library',
    label: 'Generate a library with Carafe',
    help: 'Run Carafe to generate a spectral library before search. When enabled, the Carafe-generated library overrides the user-supplied library.',
    tier: 'common',
    widget: 'boolean',
    virtual: true,
    affects: [
      'carafe.spectra_file',
      'carafe.spectra_dir',
      'carafe.spectra_glob',
      'carafe.spectra_regex',
      'carafe.pdc_files',
      'carafe.pdc_n_files',
      'carafe.peptide_results_file',
      'carafe.carafe_fasta',
      'carafe.diann_fasta',
      'carafe.cli_options',
      'carafe.include_phosphorylation',
      'carafe.include_oxidized_methionine',
      'carafe.max_mod_option',
    ],
  },
  {
    path: 'carafe.source',
    section: 'library',
    label: 'Carafe input source',
    help: 'Which Carafe input mode to use: a single spectra file, a directory of spectra, an explicit PDC file list, or a random PDC sample. The four modes are mutually exclusive.',
    tier: 'common',
    widget: 'enum',
    virtual: true,
    visibleWhen: carafeEnabled,
    requiredWhen: carafeEnabled,
    group: 'Carafe input',
  },
  {
    path: 'carafe.spectra_file',
    section: 'library',
    label: 'Carafe: single spectra file',
    help: 'A single .mzML, .raw, or Bruker .d.zip file. Local path or authenticated Panorama URL.',
    tier: 'common',
    widget: 'file-or-url',
    visibleWhen: (s) => carafeEnabled(s) && carafeSourceIs('file')(s),
    requiredWhen: carafeSourceIs('file'),
    group: 'Carafe input',
  },
  {
    path: 'carafe.spectra_dir',
    section: 'library',
    label: 'Carafe: spectra directory',
    help: 'Directory of spectra. Local, authenticated Panorama, or Panorama Public. Filtered with the glob/regex below.',
    tier: 'common',
    widget: 'file-or-url',
    visibleWhen: (s) => carafeEnabled(s) && carafeSourceIs('dir')(s),
    requiredWhen: carafeSourceIs('dir'),
    group: 'Carafe input',
  },
  {
    path: 'carafe.spectra_files',
    section: 'library',
    label: 'Carafe: spectra file matching',
    help: 'Glob or regex applied inside the Carafe spectra directory. Only used when the input source is a directory.',
    tier: 'advanced',
    widget: 'glob-regex-pair',
    virtual: true,
    affects: ['carafe.spectra_glob', 'carafe.spectra_regex'],
    visibleWhen: (s) => carafeEnabled(s) && carafeSourceIs('dir')(s),
    group: 'Carafe input',
  },
  {
    path: 'carafe.pdc_files',
    section: 'library',
    label: 'Carafe: explicit PDC file list',
    help: 'List of PDC file names to feed Carafe. Requires PDC mode. Files outside the main quant subset are downloaded additionally for Carafe only.',
    tier: 'advanced',
    widget: 'string-list',
    visibleWhen: (s) => carafeEnabled(s) && inPdc(s) && carafeSourceIs('pdc-files')(s),
    requiredWhen: carafeSourceIs('pdc-files'),
    group: 'Carafe input',
  },
  {
    path: 'carafe.pdc_n_files',
    section: 'library',
    label: 'Carafe: PDC random sample size',
    help: 'Randomly sample this many files from the main PDC quant set as Carafe input. Subset of the main quant set, so no extra downloads occur. Requires PDC mode.',
    tier: 'advanced',
    widget: 'number',
    visibleWhen: (s) => carafeEnabled(s) && inPdc(s) && carafeSourceIs('pdc-sample')(s),
    requiredWhen: carafeSourceIs('pdc-sample'),
    group: 'Carafe input',
  },
  {
    path: 'carafe.peptide_results_file',
    section: 'library',
    label: 'Carafe: peptide results file',
    help: 'Pre-computed peptide-results input for Carafe. If omitted, a DIA-NN build-lib + search step generates it.',
    tier: 'advanced',
    widget: 'file-or-url',
    visibleWhen: carafeEnabled,
    group: 'Carafe inputs (optional)',
  },
  {
    path: 'carafe.carafe_fasta',
    section: 'library',
    label: 'Carafe FASTA',
    help: 'Override the FASTA used by Carafe itself. Falls back to the main FASTA when unset.',
    tier: 'advanced',
    widget: 'file-or-url',
    visibleWhen: carafeEnabled,
    group: 'Carafe inputs (optional)',
  },
  {
    path: 'carafe.diann_fasta',
    section: 'library',
    label: 'Carafe DIA-NN FASTA',
    help: 'Override the FASTA used by the internal DIA-NN build-lib step when generating peptide results. Falls back to the main FASTA when unset.',
    tier: 'advanced',
    widget: 'file-or-url',
    visibleWhen: carafeEnabled,
    group: 'Carafe inputs (optional)',
  },
  {
    path: 'carafe.cli_options',
    section: 'library',
    label: 'Carafe CLI options',
    help: 'Extra Carafe command-line options. Do not set -mode, -varMod, -maxVar, -ms, -db, -i, -se, -lf_type, or -device here; the workflow manages those.',
    tier: 'advanced',
    widget: 'textarea',
    visibleWhen: carafeEnabled,
    // Upstream nextflow_schema.json has default: "" but the workflow's
    // nextflow.config sets a long real default. Override here for UI hint
    // and placeholder only.
    defaultOverride:
      '-fdr 0.01 -ptm_site_prob 0.75 -ptm_site_qvalue 0.01 -itol 20 -itolu ppm -rf -rf_rt_win auto -cor 0.8 -min_mz 200 -n_ion_min 2 -c_ion_min 2 -enzyme 2 -miss_c 1 -fixMod 1 -clip_n_m -minLength 7 -maxLength 35 -min_pep_mz 300 -max_pep_mz 1800 -min_pep_charge 2 -max_pep_charge 4 -lf_frag_mz_min 200 -lf_frag_mz_max 1800 -lf_top_n_frag 20 -lf_min_n_frag 2 -lf_frag_n_min 2 -tf all -nm -nf 4 -min_n 4 -valid -na 0 -ez -fast',
    // Surfaced in every Carafe-enabled config so users see exactly which
    // flags ran (and have a copy of the long default in front of them).
    alwaysEmit: carafeEnabled,
    group: 'Carafe options',
  },
  {
    path: 'carafe.include_phosphorylation',
    section: 'library',
    label: 'Include phosphorylation',
    help: 'Add phosphorylation as a variable modification in the generated library.',
    tier: 'advanced',
    widget: 'boolean',
    visibleWhen: carafeEnabled,
    group: 'Carafe options',
  },
  {
    path: 'carafe.include_oxidized_methionine',
    section: 'library',
    label: 'Include oxidized methionine',
    help: 'Add oxidized methionine as a variable modification in the generated library.',
    tier: 'advanced',
    widget: 'boolean',
    visibleWhen: carafeEnabled,
    group: 'Carafe options',
  },
  {
    path: 'carafe.max_mod_option',
    section: 'library',
    label: 'Carafe max-modification option',
    help: 'Override the per-peptide variable-modification cap (e.g. -maxVar 1). Ignored when no variable modifications are included.',
    tier: 'advanced',
    widget: 'text',
    visibleWhen: (s) =>
      carafeEnabled(s) &&
      (s.values['carafe.include_phosphorylation'] === true ||
        s.values['carafe.include_oxidized_methionine'] === true),
    group: 'Carafe options',
  },

  // =====================================================================
  // fasta-skyline (Skyline only — Background FASTA lives in essentials)
  // =====================================================================
  {
    path: 'skyline.template_file',
    section: 'fasta-skyline',
    label: 'Skyline template',
    help: 'Skyline document template (.sky.zip). If unset, the default template at default_skyline_template_file is fetched from GitHub.',
    tier: 'advanced',
    widget: 'file-or-url',
  },
  {
    path: 'skyline.document_name',
    section: 'fasta-skyline',
    label: 'Skyline document name',
    help: 'Basename of the final Skyline document. In PDC mode, the default of "final" is automatically replaced with the study name.',
    tier: 'common',
    widget: 'text',
  },
  {
    path: 'skyline.skip',
    section: 'fasta-skyline',
    label: 'Skip Skyline document',
    help: 'Skip Skyline document creation entirely. Not compatible with no-search mode.',
    tier: 'advanced',
    widget: 'boolean',
  },
  {
    path: 'skyline.fasta',
    section: 'fasta-skyline',
    label: 'Skyline FASTA override',
    help: 'Optional FASTA imported into the Skyline document instead of the main FASTA. Falls back to the main FASTA when unset.',
    tier: 'advanced',
    widget: 'file-or-url',
    visibleWhen: (s) => s.values['skyline.skip'] !== true,
  },
  {
    path: 'skyline.skyr_file',
    section: 'fasta-skyline',
    label: 'Skyline .skyr report files',
    help: 'One or more Skyline report-template (.skyr) files to apply at the end of the workflow. Local path or authenticated Panorama URL.',
    tier: 'advanced',
    widget: 'string-list',
    visibleWhen: (s) => s.values['skyline.skip'] !== true,
  },
  {
    path: 'skyline.minimize',
    section: 'fasta-skyline',
    label: 'Minimize Skyline document',
    help: 'Run the Skyline minimize step on the final document to shrink its size.',
    tier: 'advanced',
    widget: 'boolean',
    visibleWhen: (s) => s.values['skyline.skip'] !== true,
  },
  {
    path: 'skyline.group_proteins',
    section: 'fasta-skyline',
    label: 'Group proteins',
    help: 'Enable Skyline protein grouping.',
    tier: 'advanced',
    widget: 'boolean',
    visibleWhen: skylineNotSkipped,
    // Schema default is false; builder ships a "group by default" stance.
    defaultOverride: true,
    // Surfaced in every Skyline-running config so the protein-grouping stance
    // is explicit in the generated file.
    alwaysEmit: skylineNotSkipped,
  },
  {
    path: 'skyline.group_by_gene',
    section: 'fasta-skyline',
    label: 'Group by gene',
    help: 'Group Skyline proteins by gene name.',
    tier: 'advanced',
    widget: 'boolean',
    visibleWhen: skylineNotSkipped,
    alwaysEmit: skylineNotSkipped,
  },
  {
    path: 'skyline.protein_parsimony',
    section: 'fasta-skyline',
    label: 'Protein parsimony',
    help: 'Apply Skyline protein parsimony to remove redundant protein assignments.',
    tier: 'advanced',
    widget: 'boolean',
    visibleWhen: skylineNotSkipped,
    alwaysEmit: skylineNotSkipped,
  },
  {
    path: 'skyline.use_hardlinks',
    section: 'fasta-skyline',
    label: 'Use hardlinks',
    help: 'Use hard links when staging files into the Skyline work directory. Disable on filesystems that do not support hard links.',
    tier: 'advanced',
    widget: 'boolean',
    visibleWhen: (s) => s.values['skyline.skip'] !== true,
  },

  // =====================================================================
  // metadata
  // =====================================================================
  {
    path: 'replicate_metadata',
    section: 'metadata',
    label: 'Replicate metadata',
    help: 'Per-replicate annotations applied to the Skyline document. TSV or CSV; local path, authenticated Panorama, or Panorama Public.',
    tier: 'common',
    widget: 'file-or-url',
    visibleWhen: inGeneral,
  },

  // =====================================================================
  // msconvert
  // =====================================================================
  {
    path: 'msconvert_only',
    section: 'msconvert',
    label: 'msconvert-only mode',
    help: 'Convert spectra with msconvert and exit before search, Skyline, QC, and Panorama upload of analysis outputs.',
    tier: 'advanced',
    widget: 'boolean',
  },
  {
    path: 'msconvert.do_demultiplex',
    section: 'msconvert',
    label: 'Demultiplex',
    help: 'Set to true if the raw file needs to be demultiplexed (the DIA windows overlap).',
    tier: 'common',
    widget: 'boolean',
  },
  {
    path: 'msconvert.do_simasspectra',
    section: 'msconvert',
    label: 'simAsSpectra',
    help: 'Treat SIM scans as spectra during msconvert conversion.',
    tier: 'advanced',
    widget: 'boolean',
  },
  {
    path: 'msconvert.mz_shift_ppm',
    section: 'msconvert',
    label: 'm/z shift (ppm)',
    help: 'Apply a fixed m/z shift in ppm to every spectrum during conversion. Leave unset for no shift.',
    tier: 'advanced',
    widget: 'number',
  },

  // =====================================================================
  // qc-reporting
  // =====================================================================
  {
    path: 'qc_report.skip',
    section: 'qc-reporting',
    label: 'Skip QC report',
    help: 'Skip QC-report generation. The builder defaults this to off so QC runs unless you opt out.',
    tier: 'common',
    widget: 'boolean',
    group: 'QC report',
    // The upstream schema defaults this to `true` (skip), but the builder
    // ships a friendlier "run QC by default" stance. Paired with alwaysEmit
    // so the override is written explicitly to the generated config.
    defaultOverride: false,
    alwaysEmit: true,
  },
  {
    path: 'qc_report.report_format',
    section: 'qc-reporting',
    label: 'QC report format',
    help: 'Which QC report formats to render. Pick one or both of HTML and PDF.',
    tier: 'advanced',
    widget: 'multi-enum',
    visibleWhen: (s) => s.values['qc_report.skip'] !== true,
    group: 'QC report',
  },
  {
    path: 'qc_report.normalization_method',
    section: 'qc-reporting',
    label: 'Normalization method',
    help: 'Normalization applied to quantitative values shown in the QC report. Default is median; set DirectLFQ for DirectLFQ.',
    tier: 'advanced',
    widget: 'enum',
    visibleWhen: (s) => s.values['qc_report.skip'] !== true,
    group: 'QC report',
  },
  {
    path: 'qc_report.imputation_method',
    section: 'qc-reporting',
    label: 'Imputation method',
    help: 'Imputation strategy for missing values in the QC report. Currently only KNN is supported.',
    tier: 'advanced',
    widget: 'enum',
    visibleWhen: (s) => s.values['qc_report.skip'] !== true,
    group: 'QC report',
  },
  {
    path: 'qc_report.exclude_replicates',
    section: 'qc-reporting',
    label: 'Exclude replicates',
    help: 'Replicate names to exclude from normalization and batch correction.',
    tier: 'advanced',
    widget: 'string-list',
    visibleWhen: (s) => s.values['qc_report.skip'] !== true,
    group: 'QC report',
  },
  {
    path: 'qc_report.exclude_projects',
    section: 'qc-reporting',
    label: 'Exclude projects',
    help: 'Project / batch names to exclude from normalization and batch correction.',
    tier: 'advanced',
    widget: 'string-list',
    visibleWhen: (s) => s.values['qc_report.skip'] !== true,
    group: 'QC report',
  },
  {
    path: 'qc_report.standard_proteins',
    section: 'qc-reporting',
    label: 'Standard proteins',
    help: 'Protein names whose retention times are plotted in the QC report.',
    tier: 'advanced',
    widget: 'string-list',
    visibleWhen: (s) => s.values['qc_report.skip'] !== true,
    group: 'QC report',
  },
  {
    path: 'qc_report.color_vars',
    section: 'qc-reporting',
    label: 'PCA color variables',
    help: 'Replicate-metadata column names used to color the QC PCA plot.',
    tier: 'advanced',
    widget: 'string-list',
    visibleWhen: (s) => s.values['qc_report.skip'] !== true,
    group: 'QC report',
  },
  {
    path: 'qc_report.export_tables',
    section: 'qc-reporting',
    label: 'Export QC tables',
    help: 'Export normalized precursor and protein quantity matrices alongside the rendered QC report.',
    tier: 'advanced',
    widget: 'boolean',
    visibleWhen: (s) => s.values['qc_report.skip'] !== true,
    group: 'QC report',
  },
  {
    path: 'qc_report.precursor_report_template',
    section: 'qc-reporting',
    label: 'Precursor report template',
    help: 'Skyline .skyr template used to export precursor-quality data for the QC report.',
    tier: 'advanced',
    widget: 'file-or-url',
    visibleWhen: (s) => s.values['qc_report.skip'] !== true,
    group: 'QC report',
  },
  {
    path: 'qc_report.replicate_report_template',
    section: 'qc-reporting',
    label: 'Replicate report template',
    help: 'Skyline .skyr template used to export replicate-quality data for the QC report.',
    tier: 'advanced',
    widget: 'file-or-url',
    visibleWhen: (s) => s.values['qc_report.skip'] !== true,
    group: 'QC report',
  },
  {
    path: 'batch_report.skip',
    section: 'qc-reporting',
    label: 'Skip batch report',
    help: 'Skip the separate batch-effect / covariate report. Defaults to true.',
    tier: 'common',
    widget: 'boolean',
    group: 'Batch report',
  },
  {
    path: 'batch_report.batch1',
    section: 'qc-reporting',
    label: 'Batch variable 1',
    help: 'Replicate-metadata key for the first batch level. Falls back to the project name when unset.',
    tier: 'advanced',
    widget: 'text',
    visibleWhen: (s) => s.values['batch_report.skip'] !== true,
    group: 'Batch report',
  },
  {
    path: 'batch_report.batch2',
    section: 'qc-reporting',
    label: 'Batch variable 2',
    help: 'Replicate-metadata key for the second batch level.',
    tier: 'advanced',
    widget: 'text',
    visibleWhen: (s) => s.values['batch_report.skip'] !== true,
    group: 'Batch report',
  },
  {
    path: 'batch_report.covariate_vars',
    section: 'qc-reporting',
    label: 'Covariate variables',
    help: 'Replicate-metadata keys used as covariates for batch correction.',
    tier: 'advanced',
    widget: 'string-list',
    visibleWhen: (s) => s.values['batch_report.skip'] !== true,
    group: 'Batch report',
  },
  {
    path: 'batch_report.control_key',
    section: 'qc-reporting',
    label: 'Control key',
    help: 'Replicate-metadata key indicating control replicates for CV-distribution plots.',
    tier: 'advanced',
    widget: 'text',
    visibleWhen: (s) => s.values['batch_report.skip'] !== true,
    group: 'Batch report',
  },
  {
    path: 'batch_report.control_values',
    section: 'qc-reporting',
    label: 'Control values',
    help: 'Values of the control key marking a replicate as a control.',
    tier: 'advanced',
    widget: 'string-list',
    visibleWhen: (s) => s.values['batch_report.skip'] !== true,
    group: 'Batch report',
  },
  {
    path: 'batch_report.plot_ext',
    section: 'qc-reporting',
    label: 'Standalone plot extension',
    help: 'File extension for standalone plots. Leave unset to skip standalone-plot output.',
    tier: 'advanced',
    widget: 'text',
    visibleWhen: (s) => s.values['batch_report.skip'] !== true,
    group: 'Batch report',
  },

  // =====================================================================
  // panorama
  // =====================================================================
  {
    path: 'panorama.upload',
    section: 'panorama',
    label: 'Upload to Panorama',
    help: 'Upload converted spectra, search outputs, FASTA, library, Skyline documents, and reports to PanoramaWeb at the end of the run.',
    tier: 'common',
    widget: 'boolean',
  },
  {
    path: 'panorama.upload_url',
    section: 'panorama',
    label: 'Panorama upload URL',
    help: 'WebDAV URL of the Panorama folder that will receive uploaded files.',
    tier: 'common',
    widget: 'text',
    requiredWhen: (s) => s.values['panorama.upload'] === true,
    placeholder: 'https://panoramaweb.org/_webdav/.../%40files/',
    visibleWhen: (s) => s.values['panorama.upload'] === true,
  },
  {
    path: 'panorama.import_skyline',
    section: 'panorama',
    label: 'Import Skyline into Panorama',
    help: 'After files upload, trigger Panorama to import the Skyline document into its internal database. Requires upload enabled and Skyline not skipped.',
    tier: 'advanced',
    widget: 'boolean',
    visibleWhen: (s) =>
      s.values['panorama.upload'] === true && s.values['skyline.skip'] !== true,
  },
  {
    path: 'email',
    section: 'panorama',
    label: 'Notification email',
    help: 'Email address to notify on workflow completion. Requires the executor to be configured for mail; leave blank to disable.',
    tier: 'advanced',
    widget: 'text',
    group: 'Notifications',
  },

  // =====================================================================
  // execution
  // =====================================================================
  {
    path: 'result_dir',
    section: 'execution',
    label: 'Results directory',
    help: 'Where workflow results are written, relative to the Nextflow launch directory unless absolute.',
    tier: 'advanced',
    widget: 'text',
  },
  {
    path: 'report_dir',
    section: 'execution',
    label: 'Report directory',
    help: 'Where Nextflow timeline, report, and trace files are written.',
    tier: 'advanced',
    widget: 'text',
  },
  {
    path: 'max_cpus',
    section: 'execution',
    label: 'Maximum CPUs per task',
    help: 'Upper bound on CPUs requested by any process. Profiles set sensible defaults (8 for standard/slurm, 32 for AWS Batch).',
    tier: 'advanced',
    widget: 'number',
  },
  {
    path: 'max_memory',
    section: 'execution',
    label: 'Maximum memory per task',
    help: 'Upper bound on memory requested by any process. Nextflow memory-spec string, e.g. 12.GB or 250.GB.',
    tier: 'advanced',
    widget: 'text',
  },
  {
    path: 'max_time',
    section: 'execution',
    label: 'Maximum walltime per task',
    help: 'Upper bound on time requested by any process. Nextflow time-spec string, e.g. 240.h.',
    tier: 'advanced',
    widget: 'text',
  },
  {
    path: 'random_file_seed',
    section: 'execution',
    label: 'Random-file sampling seed',
    help: 'Seed for files_per_quant_batch / files_per_chrom_lib / carafe.pdc_n_files random sampling. Pin for reproducibility.',
    tier: 'advanced',
    widget: 'number',
  },
  {
    path: 'mzml_cache_directory',
    section: 'execution',
    label: 'mzML cache directory',
    help: 'Where msconvert-produced mzMLs are cached across runs. Profiles set sensible defaults; override only when needed.',
    tier: 'advanced',
    widget: 'text',
  },
  {
    path: 'panorama_cache_directory',
    section: 'execution',
    label: 'Panorama download cache directory',
    help: 'Where downloaded Panorama files are cached across runs. Profiles set sensible defaults; override only when needed.',
    tier: 'advanced',
    widget: 'text',
  },
];

// --- Indices --------------------------------------------------------------

export const paramMetadataByPath: Readonly<Record<string, ParamMeta>> = Object.freeze(
  paramMetadata.reduce<Record<string, ParamMeta>>((acc, meta) => {
    acc[meta.path] = meta;
    return acc;
  }, {}),
);

export function getSchemaEntry(path: string): SchemaDerivedEntry | undefined {
  return schemaDerived[path];
}

// Resolves the effective default for UI presentation:
// 1. `meta.defaultOverride` if set (used when the upstream schema is out of
//    sync with the workflow's runtime config default).
// 2. `schemaDerived[meta.path].defaultValue` otherwise.
// Returns undefined if neither yields a value.
export function getEffectiveDefault(meta: ParamMeta): unknown {
  if (meta.defaultOverride !== undefined) return meta.defaultOverride;
  if (meta.virtual) return undefined;
  return schemaDerived[meta.path]?.defaultValue;
}

// Resolves whether a param is currently in always-emit mode given form state.
// Boolean flags answer directly; predicates are evaluated against the state.
export function isAlwaysEmit(meta: ParamMeta, state: FormState): boolean {
  const ae = meta.alwaysEmit;
  if (ae === true) return true;
  if (typeof ae === 'function') return ae(state);
  return false;
}
