// Hand-rolled cross-field rule list. Rules are evaluated in numbered
// order; each returns either null (no issue) or { message, fields } for
// the issue panel.
//
// Order matters only for stable presentation; rules do not depend on
// each other to short-circuit. The fields[] array on each issue lists
// the param paths (real or virtual UI ids) the UI uses to scroll to /
// highlight context when the user clicks the issue.

import type { FormState } from '../params/paramMetadata';

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
        const obj = e as { name?: unknown; path?: unknown };
        return isNonEmptyString(obj.name) && isNonEmptyString(obj.path);
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
      'Chromatogram-library file matching',
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
      message: 'Cascadia does not use narrow-window / chromatogram-library spectra.',
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
  rulePanoramaUploadRequiresUrl,
  rulePanoramaImportPrereqs,
  ruleVendorRawEngine,
]);
