// Hand-rolled cross-field rule list. Rules are evaluated in numbered
// order; each returns either null (no issue) or { message, fields } for
// the issue panel.
//
// Order matters only for stable presentation; rules do not depend on
// each other to short-circuit. The fields[] array on each issue lists
// the param paths (real or virtual UI ids) the UI uses to scroll to /
// highlight context when the user clicks the issue.

import type { FormState } from '../params/paramMetadata';
import type { MetadataTable } from '../metadata/types';
import { columnValues, variableColumns, replicateNames } from '../metadata/options';

export interface CrossFieldRule {
  readonly id: string;
  readonly severity: 'error' | 'warning';
  readonly check: (s: FormState) => null | {
    readonly message: string;
    readonly fields: readonly string[];
  };
}

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.length > 0;
}

function isNonEmptyArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

function isStringOrNonEmptyArray(v: unknown): boolean {
  return isNonEmptyString(v) || isNonEmptyArray(v);
}

// True if the (touched, value) for `path` exists AND has a non-empty
// string value. Defaults / unset / empty -> false.
function hasNonEmptyString(s: FormState, path: string): boolean {
  return s.touched[path] === true && isNonEmptyString(s.values[path]);
}

function isQuantSpectraSet(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const v = value as {
    kind?: unknown;
    path?: unknown;
    paths?: unknown;
    entries?: unknown;
  };
  if (v.kind === 'single') return isNonEmptyString(v.path);
  if (v.kind === 'list') {
    return Array.isArray(v.paths) && v.paths.some(isNonEmptyString);
  }
  if (v.kind === 'batch-map') {
    return (
      Array.isArray(v.entries) &&
      v.entries.some((e): boolean => {
        if (e === null || typeof e !== 'object') return false;
        const obj = e as { name?: unknown; paths?: unknown };
        return (
          isNonEmptyString(obj.name) &&
          Array.isArray(obj.paths) &&
          obj.paths.some(isNonEmptyString)
        );
      })
    );
  }
  return false;
}

function quantSpectraKind(value: unknown): 'single' | 'list' | 'batch-map' | null {
  if (value === null || typeof value !== 'object') return null;
  const k = (value as { kind?: unknown }).kind;
  if (k === 'single' || k === 'list' || k === 'batch-map') return k;
  return null;
}

const CARAFE_SOURCES = new Set(['file', 'dir', 'pdc-files', 'pdc-sample']);

// ---------------------------------------------------------------------------
// Reusable glob-xor-regex check
// ---------------------------------------------------------------------------

function globRegexXor(
  s: FormState,
  dirPath: string,
  globPath: string,
  regexPath: string,
  virtualPairId: string,
  label: string,
): ReturnType<CrossFieldRule['check']> {
  // Only relevant if the spectra dir is set (or in the quant case, has
  // a tagged-union value). The caller decides "dir is set" — we test
  // both forms here.
  let dirSet = false;
  const dirVal = s.values[dirPath];
  if (dirPath === 'quant_spectra_dir') {
    dirSet = isQuantSpectraSet(dirVal);
  } else {
    dirSet = isNonEmptyString(dirVal) || isNonEmptyArray(dirVal);
  }
  if (!dirSet) return null;
  const globSet = hasNonEmptyString(s, globPath);
  const regexSet = hasNonEmptyString(s, regexPath);
  if (globSet && regexSet) {
    return {
      message: `${label}: set either a glob or a regex, not both.`,
      fields: [virtualPairId, globPath, regexPath],
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

// 1. input-required
const ruleInputRequired: CrossFieldRule = {
  id: 'input-required',
  severity: 'error',
  check: (s) => {
    if (s.mode === 'pdc') {
      if (!isNonEmptyString(s.values['pdc.study_id'])) {
        return {
          message: 'PDC mode requires a study ID.',
          fields: ['pdc.study_id'],
        };
      }
      return null;
    }
    // general mode
    if (!isQuantSpectraSet(s.values['quant_spectra_dir'])) {
      return {
        message: 'Set the quantitative spectra input.',
        fields: ['quant_spectra_dir'],
      };
    }
    return null;
  },
};

// 2. glob-xor-regex-quant
const ruleGlobXorRegexQuant: CrossFieldRule = {
  id: 'glob-xor-regex-quant',
  severity: 'error',
  check: (s) => {
    if (s.mode !== 'general') return null;
    return globRegexXor(
      s,
      'quant_spectra_dir',
      'quant_spectra_glob',
      'quant_spectra_regex',
      'quant_spectra_files',
      'Quant spectra file matching',
    );
  },
};

// 3. glob-xor-regex-chrom
const ruleGlobXorRegexChrom: CrossFieldRule = {
  id: 'glob-xor-regex-chrom',
  severity: 'error',
  check: (s) => {
    if (s.mode !== 'general') return null;
    return globRegexXor(
      s,
      'chromatogram_library_spectra_dir',
      'chromatogram_library_spectra_glob',
      'chromatogram_library_spectra_regex',
      'chromatogram_library_files',
      'Empirical-library file matching',
    );
  },
};

// 4. glob-xor-regex-carafe
const ruleGlobXorRegexCarafe: CrossFieldRule = {
  id: 'glob-xor-regex-carafe',
  severity: 'error',
  check: (s) => {
    if (s.values['use_carafe'] !== true) return null;
    if (s.values['carafe.source'] !== 'dir') return null;
    return globRegexXor(
      s,
      'carafe.spectra_dir',
      'carafe.spectra_glob',
      'carafe.spectra_regex',
      'carafe.spectra_files',
      'Carafe file matching',
    );
  },
};

// 5. pdc-forces-diann
const rulePdcForcesDiann: CrossFieldRule = {
  id: 'pdc-forces-diann',
  severity: 'error',
  check: (s) => {
    if (s.mode !== 'pdc') return null;
    if (s.values['msconvert_only'] === true) return null;
    const engine = s.values['search_engine'];
    if (engine === 'diann' || engine === 'DiaNN') return null;
    return {
      message: 'PDC mode requires the DIA-NN search engine.',
      fields: ['search_engine'],
    };
  },
};

// 6. carafe-source-required
const ruleCarafeSourceRequired: CrossFieldRule = {
  id: 'carafe-source-required',
  severity: 'error',
  check: (s) => {
    if (s.values['use_carafe'] !== true) return null;
    const src = s.values['carafe.source'];
    if (typeof src === 'string' && CARAFE_SOURCES.has(src)) return null;
    return {
      message: 'Pick a Carafe input source (file, dir, PDC files, or PDC sample).',
      fields: ['use_carafe', 'carafe.source'],
    };
  },
};

// 7. carafe-input-matches-source
const ruleCarafeInputMatchesSource: CrossFieldRule = {
  id: 'carafe-input-matches-source',
  severity: 'error',
  check: (s) => {
    if (s.values['use_carafe'] !== true) return null;
    const src = s.values['carafe.source'];
    switch (src) {
      case 'file': {
        if (isNonEmptyString(s.values['carafe.spectra_file'])) return null;
        return {
          message: 'Carafe input file is required.',
          fields: ['carafe.source', 'carafe.spectra_file'],
        };
      }
      case 'dir': {
        if (isNonEmptyString(s.values['carafe.spectra_dir'])) return null;
        return {
          message: 'Carafe input directory is required.',
          fields: ['carafe.source', 'carafe.spectra_dir'],
        };
      }
      case 'pdc-files': {
        if (isStringOrNonEmptyArray(s.values['carafe.pdc_files'])) return null;
        return {
          message: 'Carafe PDC file list is required.',
          fields: ['carafe.source', 'carafe.pdc_files'],
        };
      }
      case 'pdc-sample': {
        const v = s.values['carafe.pdc_n_files'];
        if (typeof v === 'number' && Number.isInteger(v) && v >= 1) return null;
        return {
          message: 'Carafe PDC random sample size must be an integer ≥ 1.',
          fields: ['carafe.source', 'carafe.pdc_n_files'],
        };
      }
      default:
        // No source set yet — rule 6 handles that case.
        return null;
    }
  },
};

// 8. carafe-pdc-requires-study
const ruleCarafePdcRequiresStudy: CrossFieldRule = {
  id: 'carafe-pdc-requires-study',
  severity: 'error',
  check: (s) => {
    if (s.values['use_carafe'] !== true) return null;
    const src = s.values['carafe.source'];
    if (src !== 'pdc-files' && src !== 'pdc-sample') return null;
    if (s.mode !== 'pdc') {
      return {
        message: 'Carafe PDC input requires PDC mode.',
        fields: ['carafe.source'],
      };
    }
    if (!isNonEmptyString(s.values['pdc.study_id'])) {
      return {
        message: 'Carafe PDC input requires a PDC study ID.',
        fields: ['carafe.source', 'pdc.study_id'],
      };
    }
    return null;
  },
};

// 9. carafe-pdc-n-files-bound
const ruleCarafePdcNFilesBound: CrossFieldRule = {
  id: 'carafe-pdc-n-files-bound',
  severity: 'error',
  check: (s) => {
    const n = s.values['carafe.pdc_n_files'];
    const total = s.values['pdc.n_raw_files'];
    if (typeof n !== 'number' || typeof total !== 'number') return null;
    if (n > total) {
      return {
        message:
          'Carafe PDC random sample size cannot exceed the total number of RAW files.',
        fields: ['carafe.pdc_n_files', 'pdc.n_raw_files'],
      };
    }
    return null;
  },
};

// 10. no-search-requires-library
const ruleNoSearchRequiresLibrary: CrossFieldRule = {
  id: 'no-search-requires-library',
  severity: 'error',
  check: (s) => {
    if (s.values['search_engine'] !== null) return null;
    const libSet = isNonEmptyString(s.values['spectral_library']);
    const skylineSkipped = s.values['skyline.skip'] === true;
    if (!libSet || skylineSkipped) {
      return {
        message:
          'No-search mode requires a spectral library and the Skyline document cannot be skipped.',
        fields: ['search_engine', 'spectral_library', 'skyline.skip'],
      };
    }
    return null;
  },
};

// 11. fasta-required-when-searching
const ruleFastaRequiredWhenSearching: CrossFieldRule = {
  id: 'fasta-required-when-searching',
  severity: 'error',
  check: (s) => {
    const engine = s.values['search_engine'];
    const wantsFasta =
      engine === 'diann' ||
      engine === 'DiaNN' ||
      engine === 'encyclopedia' ||
      engine === 'EncyclopeDIA';
    if (!wantsFasta) return null;
    if (isNonEmptyString(s.values['fasta'])) return null;
    return {
      message: 'A background FASTA is required for DIA-NN and EncyclopeDIA.',
      fields: ['fasta', 'search_engine'],
    };
  },
};

// 12. encyclopedia-requires-library
const ruleEncyclopediaRequiresLibrary: CrossFieldRule = {
  id: 'encyclopedia-requires-library',
  severity: 'error',
  check: (s) => {
    const engine = s.values['search_engine'];
    if (engine !== 'encyclopedia' && engine !== 'EncyclopeDIA') return null;
    const libSet = isNonEmptyString(s.values['spectral_library']);
    const carafe = s.values['use_carafe'] === true;
    if (libSet || carafe) return null;
    return {
      message: 'EncyclopeDIA requires a spectral library or a Carafe-generated library.',
      fields: ['search_engine', 'spectral_library', 'use_carafe'],
    };
  },
};

// 13. cascadia-no-chrom (warning)
const ruleCascadiaNoChrom: CrossFieldRule = {
  id: 'cascadia-no-chrom',
  severity: 'warning',
  check: (s) => {
    const engine = s.values['search_engine'];
    const isCascadia =
      engine === 'cascadia' || engine === 'CascaDIA' || engine === 'Cascadia';
    if (!isCascadia) return null;
    const chromSet =
      isNonEmptyString(s.values['chromatogram_library_spectra_dir']) ||
      isNonEmptyArray(s.values['chromatogram_library_spectra_dir']);
    if (!chromSet) return null;
    return {
      message: 'Cascadia does not use empirical-library spectra.',
      fields: ['search_engine', 'chromatogram_library_spectra_dir'],
    };
  },
};

// 14. cascadia-no-library (warning)
const ruleCascadiaNoLibrary: CrossFieldRule = {
  id: 'cascadia-no-library',
  severity: 'warning',
  check: (s) => {
    const engine = s.values['search_engine'];
    const isCascadia =
      engine === 'cascadia' || engine === 'CascaDIA' || engine === 'Cascadia';
    if (!isCascadia) return null;
    const libSet = isNonEmptyString(s.values['spectral_library']);
    const carafe = s.values['use_carafe'] === true;
    if (!libSet && !carafe) return null;
    return {
      message: 'Cascadia ignores spectral libraries; library inputs will not be used.',
      fields: ['search_engine', 'spectral_library', 'use_carafe'],
    };
  },
};

// 15. batch-mode-engine
const ruleBatchModeEngine: CrossFieldRule = {
  id: 'batch-mode-engine',
  severity: 'error',
  check: (s) => {
    const engine = s.values['search_engine'];
    const isDiann = engine === 'diann' || engine === 'DiaNN';
    if (s.mode === 'general') {
      const kind = quantSpectraKind(s.values['quant_spectra_dir']);
      if (kind !== 'batch-map') return null;
      if (isDiann) return null;
      return {
        message: 'Batch-map quant input requires the DIA-NN search engine.',
        fields: ['quant_spectra_dir', 'search_engine'],
      };
    }
    // PDC mode
    if (!isNonEmptyString(s.values['pdc.batch_file'])) return null;
    if (isDiann) return null;
    return {
      message: 'PDC batch file requires the DIA-NN search engine.',
      fields: ['pdc.batch_file', 'search_engine'],
    };
  },
};

// 15b. batch-names-valid
//
// Mirrors normalize_batch_map() + validate_batch_names() in the workflow's
// modules/utils.nf. Surrounding whitespace is trimmed rather than rejected (by the
// workflow and by the emitter), so names are compared trimmed: 'PlateA' and 'PlateA '
// are the same batch. Uniqueness matters more here than in the workflow -- a Groovy Map
// cannot hold duplicate keys, but this entry list can, and the emitter's name->path map
// would silently keep only the last one, so a user could download a config analyzing the
// wrong data.
const BATCH_NAME_SEPARATORS = /[/\\]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function batchEntryNames(value: unknown): readonly string[] {
  if (quantSpectraKind(value) !== 'batch-map') return [];
  const entries = (value as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return [];
  const out: string[] = [];
  for (const e of entries) {
    if (e === null || typeof e !== 'object') continue;
    const name = (e as { name?: unknown }).name;
    if (typeof name === 'string') out.push(name);
  }
  return out;
}

const ruleBatchNamesValid: CrossFieldRule = {
  id: 'batch-names-valid',
  severity: 'error',
  check: (s) => {
    const raw = batchEntryNames(s.values['quant_spectra_dir']);
    if (raw.length === 0) return null;
    // Compare trimmed, matching the workflow: surrounding whitespace is not significant.
    const names = raw.map((n) => n.trim()).filter((n) => n !== '');

    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const n of names) {
      if (seen.has(n)) duplicates.add(n);
      seen.add(n);
    }
    if (duplicates.size > 0) {
      const shown = [...duplicates].map((n) => `'${n}'`).join(', ');
      return {
        message: `Batch names must be unique; repeated: ${shown}. Names are compared after trimming, so 'x' and 'x ' are the same batch.`,
        fields: ['quant_spectra_dir'],
      };
    }

    for (const n of names) {
      if (BATCH_NAME_SEPARATORS.test(n)) {
        return {
          message: `Batch name '${n}' cannot contain '/' or '\\' — batch names become part of a file name.`,
          fields: ['quant_spectra_dir'],
        };
      }
      if (CONTROL_CHARS.test(n)) {
        return {
          message: `Batch name '${n}' contains control characters.`,
          fields: ['quant_spectra_dir'],
        };
      }
    }
    return null;
  },
};

// 16. panorama-upload-requires-url
const rulePanoramaUploadRequiresUrl: CrossFieldRule = {
  id: 'panorama-upload-requires-url',
  severity: 'error',
  check: (s) => {
    if (s.values['panorama.upload'] !== true) return null;
    if (isNonEmptyString(s.values['panorama.upload_url'])) return null;
    return {
      message: 'A Panorama upload URL is required when upload is enabled.',
      fields: ['panorama.upload', 'panorama.upload_url'],
    };
  },
};

// 17. panorama-import-prereqs
const rulePanoramaImportPrereqs: CrossFieldRule = {
  id: 'panorama-import-prereqs',
  severity: 'error',
  check: (s) => {
    if (s.values['panorama.import_skyline'] !== true) return null;
    const uploadOn = s.values['panorama.upload'] === true;
    const skylineSkipped = s.values['skyline.skip'] === true;
    if (uploadOn && !skylineSkipped) return null;
    return {
      message:
        'Panorama Skyline import requires upload to be enabled and Skyline not skipped.',
      fields: ['panorama.import_skyline', 'panorama.upload', 'skyline.skip'],
    };
  },
};

// 18. vendor-raw-engine (warning)
const ruleVendorRawEngine: CrossFieldRule = {
  id: 'vendor-raw-engine',
  severity: 'warning',
  check: (s) => {
    if (s.values['use_vendor_raw'] !== true) return null;
    const engine = s.values['search_engine'];
    if (engine === 'diann' || engine === 'DiaNN') return null;
    return {
      message: 'Only DIA-NN consumes vendor RAW directly; other engines need conversion.',
      fields: ['use_vendor_raw', 'search_engine'],
    };
  },
};

// 18b. vendor-raw-demultiplex
//
// Demultiplexing is done by msconvert, which vendor RAW skips. Deliberately not
// gated on quant_input_format: that key is wizard-only, so a rule that depended on
// it would go silent for form-mode users and for imported configs -- the cases where
// this combination is most likely to arrive.
const ruleVendorRawDemultiplex: CrossFieldRule = {
  id: 'vendor-raw-demultiplex',
  severity: 'error',
  check: (s) => {
    if (s.values['use_vendor_raw'] !== true) return null;
    if (s.values['msconvert.do_demultiplex'] !== true) return null;
    return {
      message:
        'Demultiplexing requires msconvert, but reading vendor RAW directly skips it. ' +
        'Turn off vendor RAW if your DIA windows overlap, or turn off demultiplex if they do not.',
      fields: ['use_vendor_raw', 'msconvert.do_demultiplex'],
    };
  },
};

// 18c. msconvert-only-vendor-raw
const ruleMsconvertOnlyVendorRaw: CrossFieldRule = {
  id: 'msconvert-only-vendor-raw',
  severity: 'error',
  check: (s) => {
    if (s.values['msconvert_only'] !== true) return null;
    if (s.values['use_vendor_raw'] !== true) return null;
    return {
      message:
        'msconvert-only mode has nothing to convert when vendor RAW files are read directly.',
      fields: ['use_vendor_raw', 'msconvert_only'],
    };
  },
};

// 19. qc-report-format-required
const ruleQcReportFormatRequired: CrossFieldRule = {
  id: 'qc-report-format-required',
  severity: 'error',
  check: (s) => {
    if (s.values['qc_report.skip'] === true) return null;
    const fmt = s.values['qc_report.report_format'];
    const has = (v: unknown): boolean => v === 'html' || v === 'pdf';
    const ok = Array.isArray(fmt) ? fmt.some(has) : has(fmt);
    if (ok) return null;
    return {
      message: 'Select at least one QC report format (HTML or PDF).',
      fields: ['qc_report.report_format'],
    };
  },
};

// ---------------------------------------------------------------------------
// Metadata membership rules
// ---------------------------------------------------------------------------
//
// These only fire when a sample-metadata table is loaded. Each verifies that
// a field's selected value(s) still correspond to something in the metadata —
// a column name, a replicate name, or a value of the control-key column. The
// picker widgets make valid selection trivial, so in practice these catch
// stale values carried in from an uploaded config that predates the metadata.

function metadataSelections(value: unknown): string[] {
  if (typeof value === 'string') return value === '' ? [] : [value];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v !== '');
  }
  return [];
}

interface MembershipRuleSpec {
  readonly id: string;
  readonly path: string;
  readonly label: string;
  // Whether the field is active (mirrors its visibleWhen skip gate).
  readonly active: (s: FormState) => boolean;
  // The allowed value set given the table + current state.
  readonly allowed: (table: MetadataTable, s: FormState) => readonly string[];
  // Extra field ids to highlight alongside `path` when the rule fires.
  readonly extraFields?: readonly string[];
}

function membershipRule(spec: MembershipRuleSpec): CrossFieldRule {
  return {
    id: spec.id,
    severity: 'error',
    check: (s) => {
      const table = s.metadata;
      if (!table) return null;
      if (!spec.active(s)) return null;
      const selected = metadataSelections(s.values[spec.path]);
      if (selected.length === 0) return null;
      const allowed = new Set(spec.allowed(table, s));
      const bad = selected.filter((v) => !allowed.has(v));
      if (bad.length === 0) return null;
      const quoted = bad.map((b) => `"${b}"`).join(', ');
      return {
        message: `${spec.label}: ${quoted} ${
          bad.length === 1 ? 'is' : 'are'
        } not present in the uploaded metadata.`,
        fields: [spec.path, ...(spec.extraFields ?? [])],
      };
    },
  };
}

const qcActive = (s: FormState): boolean => s.values['qc_report.skip'] !== true;
const batchActive = (s: FormState): boolean => s.values['batch_report.skip'] !== true;

// 20-26. Metadata membership rules.
const ruleMetadataColorVars = membershipRule({
  id: 'metadata-color-vars-valid',
  path: 'qc_report.color_vars',
  label: 'PCA color variables',
  active: qcActive,
  allowed: (t) => variableColumns(t),
});

const ruleMetadataExcludeReplicates = membershipRule({
  id: 'metadata-exclude-replicates-valid',
  path: 'qc_report.exclude_replicates',
  label: 'Exclude replicates',
  active: qcActive,
  allowed: (t) => replicateNames(t),
});

const ruleMetadataBatch1 = membershipRule({
  id: 'metadata-batch1-valid',
  path: 'batch_report.batch1',
  label: 'Batch variable 1',
  active: batchActive,
  allowed: (t) => variableColumns(t),
});

const ruleMetadataBatch2 = membershipRule({
  id: 'metadata-batch2-valid',
  path: 'batch_report.batch2',
  label: 'Batch variable 2',
  active: batchActive,
  allowed: (t) => variableColumns(t),
});

const ruleMetadataCovariateVars = membershipRule({
  id: 'metadata-covariate-vars-valid',
  path: 'batch_report.covariate_vars',
  label: 'Covariate variables',
  active: batchActive,
  allowed: (t) => variableColumns(t),
});

const ruleMetadataControlKey = membershipRule({
  id: 'metadata-control-key-valid',
  path: 'batch_report.control_key',
  label: 'Control key',
  active: batchActive,
  allowed: (t) => variableColumns(t),
});

// Control values are checked against the values of the control-key column.
// When the control key isn't a valid column, the control-key rule reports
// that; here we simply skip (empty allowed set short-circuits via active).
const ruleMetadataControlValues = membershipRule({
  id: 'metadata-control-values-valid',
  path: 'batch_report.control_values',
  label: 'Control values',
  active: (s) => {
    if (!batchActive(s)) return false;
    const key = s.values['batch_report.control_key'];
    return typeof key === 'string' && key !== '';
  },
  allowed: (t, s) => columnValues(t, s.values['batch_report.control_key'] as string),
  extraFields: ['batch_report.control_key'],
});

// ---------------------------------------------------------------------------
// Ordered rule list
// ---------------------------------------------------------------------------

export const crossFieldRules: readonly CrossFieldRule[] = Object.freeze([
  ruleInputRequired,
  ruleGlobXorRegexQuant,
  ruleGlobXorRegexChrom,
  ruleGlobXorRegexCarafe,
  rulePdcForcesDiann,
  ruleCarafeSourceRequired,
  ruleCarafeInputMatchesSource,
  ruleCarafePdcRequiresStudy,
  ruleCarafePdcNFilesBound,
  ruleNoSearchRequiresLibrary,
  ruleFastaRequiredWhenSearching,
  ruleEncyclopediaRequiresLibrary,
  ruleCascadiaNoChrom,
  ruleCascadiaNoLibrary,
  ruleBatchModeEngine,
  ruleBatchNamesValid,
  rulePanoramaUploadRequiresUrl,
  rulePanoramaImportPrereqs,
  ruleVendorRawEngine,
  ruleVendorRawDemultiplex,
  ruleMsconvertOnlyVendorRaw,
  ruleQcReportFormatRequired,
  ruleMetadataColorVars,
  ruleMetadataExcludeReplicates,
  ruleMetadataBatch1,
  ruleMetadataBatch2,
  ruleMetadataCovariateVars,
  ruleMetadataControlKey,
  ruleMetadataControlValues,
]);
