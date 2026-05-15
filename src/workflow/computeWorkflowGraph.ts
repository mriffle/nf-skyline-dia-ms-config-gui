// Pure function: FormState -> WorkflowGraph.
//
// Mirrors the shape of emitConfig.ts (no React, no DOM, no store imports).
// Reads `state.values` directly — does NOT consult `state.touched`. The
// graph reflects the workflow that *would run* for the current values.
//
// Only nodes that will actually execute (or files that will actually be
// consumed/produced) appear in the graph. Conditional sub-processes are
// modeled granularly: msconvert only when RAW files are present and the
// engine doesn't ingest vendor RAW directly; unzip only when `.d.zip`
// is present; DIA-NN library prediction only when DIA-NN runs without
// a library and without Carafe; library conversions when applicable.

import type { FormState } from '../params/paramMetadata';
import type { GraphEdge, GraphNode, WorkflowGraph } from './types';

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const lastSegment = (s: string): string => {
  const cleaned = s.replace(/[\\/]+$/, '');
  const slash = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf('\\'));
  return slash === -1 ? cleaned : cleaned.slice(slash + 1);
};

const basenameOf = (s: string): string => {
  const last = lastSegment(s);
  return last.length > 0 ? last : s;
};

const truncate = (s: string, max = 28): string =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s;

interface FileSlot {
  readonly filled: boolean;
  readonly label: string;
}

function summarizeQuantSpectra(value: unknown): FileSlot {
  if (value === null || typeof value !== 'object') {
    return { filled: false, label: '?' };
  }
  const v = value as { kind?: unknown; path?: unknown; paths?: unknown; entries?: unknown };
  if (v.kind === 'single' && isNonEmptyString(v.path)) {
    return { filled: true, label: truncate(basenameOf(v.path)) };
  }
  if (v.kind === 'list' && Array.isArray(v.paths)) {
    const paths = v.paths.filter((p): p is string => typeof p === 'string' && p.length > 0);
    if (paths.length === 0) return { filled: false, label: '?' };
    if (paths.length === 1) return { filled: true, label: truncate(basenameOf(paths[0]!)) };
    return { filled: true, label: `${paths.length} paths` };
  }
  if (v.kind === 'batch-map' && Array.isArray(v.entries)) {
    const valid = v.entries.filter((e): e is { name: string; path: string } => {
      if (e === null || typeof e !== 'object') return false;
      const r = e as { name?: unknown; path?: unknown };
      return isNonEmptyString(r.name) && isNonEmptyString(r.path);
    });
    if (valid.length === 0) return { filled: false, label: '?' };
    return { filled: true, label: `${valid.length} batch${valid.length === 1 ? '' : 'es'}` };
  }
  return { filled: false, label: '?' };
}

function summarizeStringPath(value: unknown): FileSlot {
  if (!isNonEmptyString(value)) return { filled: false, label: '?' };
  return { filled: true, label: truncate(basenameOf(value)) };
}

function summarizeStringList(value: unknown): FileSlot {
  if (Array.isArray(value)) {
    const items = value.filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (items.length === 0) return { filled: false, label: '?' };
    if (items.length === 1) return { filled: true, label: truncate(basenameOf(items[0]!)) };
    return { filled: true, label: `${items.length} files` };
  }
  if (isNonEmptyString(value)) {
    return { filled: true, label: truncate(basenameOf(value)) };
  }
  return { filled: false, label: '?' };
}

// ---------------------------------------------------------------------------
// File-type detection — used to gate msconvert / unzip / library conversions
// ---------------------------------------------------------------------------

type SpectraExt = 'raw' | 'mzml' | 'dzip';

interface SpectraTypeFacts {
  readonly hasRaw: boolean;
  readonly hasMzml: boolean;
  readonly hasDzip: boolean;
  // True when at least one path's type couldn't be determined (e.g. directory
  // without a glob, or non-string entries). Implies "could be any of the above".
  readonly uncertain: boolean;
  // True when there are no paths to examine at all (e.g. spectra source unset).
  readonly empty: boolean;
}

function detectExt(path: string): SpectraExt | null {
  const lower = path.toLowerCase().trim();
  if (lower.endsWith('.d.zip')) return 'dzip';
  if (lower.endsWith('.mzml')) return 'mzml';
  if (lower.endsWith('.raw')) return 'raw';
  return null;
}

function detectFromGlob(glob: unknown): SpectraExt | null {
  if (!isNonEmptyString(glob)) return null;
  return detectExt(glob);
}

function looksLikePath(s: string): boolean {
  return s.includes('/') || s.includes('\\') || /\.[a-z0-9]+/i.test(s);
}

function classifyPath(path: string, fallbackGlob: unknown): SpectraExt | 'uncertain' {
  const direct = detectExt(path);
  if (direct) return direct;
  const isFileLike = looksLikePath(path) && /\.[a-z0-9]+$/i.test(path);
  if (isFileLike) return 'uncertain'; // unknown extension
  // Otherwise treat as directory — try the glob.
  const fromGlob = detectFromGlob(fallbackGlob);
  return fromGlob ?? 'uncertain';
}

function emptyFacts(): SpectraTypeFacts {
  return { hasRaw: false, hasMzml: false, hasDzip: false, uncertain: false, empty: true };
}

function factsFromPaths(paths: readonly string[], fallbackGlob: unknown): SpectraTypeFacts {
  if (paths.length === 0) return emptyFacts();
  let hasRaw = false;
  let hasMzml = false;
  let hasDzip = false;
  let uncertain = false;
  for (const p of paths) {
    const c = classifyPath(p, fallbackGlob);
    if (c === 'raw') hasRaw = true;
    else if (c === 'mzml') hasMzml = true;
    else if (c === 'dzip') hasDzip = true;
    else uncertain = true;
  }
  return { hasRaw, hasMzml, hasDzip, uncertain, empty: false };
}

function factsForQuantSpectra(state: FormState): SpectraTypeFacts {
  const v = state.values['quant_spectra_dir'];
  const glob = state.values['quant_spectra_glob'];
  if (v === null || typeof v !== 'object') return emptyFacts();
  const u = v as { kind?: unknown; path?: unknown; paths?: unknown; entries?: unknown };
  if (u.kind === 'single' && isNonEmptyString(u.path)) {
    return factsFromPaths([u.path], glob);
  }
  if (u.kind === 'list' && Array.isArray(u.paths)) {
    const paths = u.paths.filter((p): p is string => typeof p === 'string' && p.length > 0);
    return factsFromPaths(paths, glob);
  }
  if (u.kind === 'batch-map' && Array.isArray(u.entries)) {
    const paths = u.entries
      .map((e): string | null => {
        if (e === null || typeof e !== 'object') return null;
        const r = e as { path?: unknown };
        return isNonEmptyString(r.path) ? r.path : null;
      })
      .filter((p): p is string => p !== null);
    return factsFromPaths(paths, glob);
  }
  return emptyFacts();
}

function factsForNarrowSpectra(state: FormState): SpectraTypeFacts {
  const v = state.values['chromatogram_library_spectra_dir'];
  const glob = state.values['chromatogram_library_spectra_glob'];
  if (Array.isArray(v)) {
    const paths = v.filter((p): p is string => typeof p === 'string' && p.length > 0);
    return factsFromPaths(paths, glob);
  }
  if (isNonEmptyString(v)) return factsFromPaths([v], glob);
  return emptyFacts();
}

function factsForCarafeSpectra(state: FormState): SpectraTypeFacts {
  const source = state.values['carafe.source'];
  if (source === 'file') {
    const p = state.values['carafe.spectra_file'];
    if (isNonEmptyString(p)) return factsFromPaths([p], null);
    return emptyFacts();
  }
  if (source === 'dir') {
    const p = state.values['carafe.spectra_dir'];
    const glob = state.values['carafe.spectra_glob'];
    if (isNonEmptyString(p)) return factsFromPaths([p], glob);
    return emptyFacts();
  }
  if (source === 'pdc-files' || source === 'pdc-sample') {
    // PDC files are vendor RAW.
    return { hasRaw: true, hasMzml: false, hasDzip: false, uncertain: false, empty: false };
  }
  return emptyFacts();
}

// PDC downloads always yield vendor RAW files.
function pdcFacts(): SpectraTypeFacts {
  return { hasRaw: true, hasMzml: false, hasDzip: false, uncertain: false, empty: false };
}

// ---------------------------------------------------------------------------
// Library extension detection
// ---------------------------------------------------------------------------

type LibraryExt = 'blib' | 'dlib' | 'tsv' | 'unknown';

function detectLibraryExt(value: unknown): LibraryExt {
  if (!isNonEmptyString(value)) return 'unknown';
  const lower = value.toLowerCase().trim();
  if (lower.endsWith('.blib')) return 'blib';
  if (lower.endsWith('.dlib')) return 'dlib';
  if (lower.endsWith('.tsv') || lower.endsWith('.tsv.gz')) return 'tsv';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Engine + flag predicates
// ---------------------------------------------------------------------------

type SearchEngine = 'diann' | 'encyclopedia' | 'cascadia' | null;

function readSearchEngine(state: FormState): SearchEngine {
  const v = state.values['search_engine'];
  if (v === null) return null;
  if (typeof v !== 'string') return 'diann';
  const lower = v.toLowerCase();
  if (lower === 'diann') return 'diann';
  if (lower === 'encyclopedia') return 'encyclopedia';
  if (lower === 'cascadia') return 'cascadia';
  return 'diann';
}

const isMsconvertOnly = (s: FormState): boolean => s.values['msconvert_only'] === true;
const isCarafeEnabled = (s: FormState): boolean => s.values['use_carafe'] === true;
const isUseVendorRaw = (s: FormState): boolean => s.values['use_vendor_raw'] === true;
const isSkylineSkipped = (s: FormState): boolean => s.values['skyline.skip'] === true;
const isQcSkipped = (s: FormState): boolean => s.values['qc_report.skip'] === true;
const isBatchSkipped = (s: FormState): boolean => s.values['batch_report.skip'] === true;
const isPanoramaUpload = (s: FormState): boolean => s.values['panorama.upload'] === true;
const isSkylineMinimize = (s: FormState): boolean => s.values['skyline.minimize'] === true;
const hasReplicateMetadata = (s: FormState): boolean =>
  isNonEmptyString(s.values['replicate_metadata']);

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

interface MutableGraph {
  readonly nodes: GraphNode[];
  readonly edges: GraphEdge[];
}

function addNode(g: MutableGraph, n: GraphNode): void {
  g.nodes.push(n);
}

function addEdge(g: MutableGraph, from: string, to: string): void {
  g.edges.push({ from, to });
}

// Whether a stream of spectra would trigger msconvert. RAW files go through
// msconvert unless the engine is DIA-NN AND use_vendor_raw is set. Uncertain
// inputs (directories without globs) conservatively assume RAW may be present.
function streamNeedsMsconvert(
  facts: SpectraTypeFacts,
  engine: SearchEngine,
  useVendorRaw: boolean,
  isCarafeStream: boolean,
): boolean {
  if (facts.empty) return false;
  const couldHaveRaw = facts.hasRaw || facts.uncertain;
  if (!couldHaveRaw) return false;
  // Carafe always needs mzML, regardless of use_vendor_raw.
  if (isCarafeStream) return true;
  // For DIA-NN with vendor RAW, msconvert is skipped on the main quant flow.
  if (engine === 'diann' && useVendorRaw) return false;
  return true;
}

function streamNeedsUnzip(facts: SpectraTypeFacts, engine: SearchEngine): boolean {
  if (facts.empty) return false;
  // EncyclopeDIA and Cascadia reject .d.zip outright at validation; if such
  // files are present with those engines the workflow errors. We still render
  // the unzip node when DIA-NN or no-search is active.
  if (engine === 'encyclopedia' || engine === 'cascadia') return false;
  return facts.hasDzip; // uncertain doesn't trigger; .d.zip is conspicuous
}

export function computeWorkflowGraph(state: FormState): WorkflowGraph {
  const g: MutableGraph = { nodes: [], edges: [] };
  const engine = readSearchEngine(state);
  const msconvertOnly = isMsconvertOnly(state);
  const carafe = isCarafeEnabled(state);
  const useVendorRaw = isUseVendorRaw(state);
  const skylineSkip = isSkylineSkipped(state);
  const qcSkip = isQcSkipped(state);
  const batchSkip = isBatchSkipped(state);
  const panorama = isPanoramaUpload(state);
  const skylineMinimize = isSkylineMinimize(state);
  const isPdc = state.mode === 'pdc';

  // For msconvert-only mode the workflow short-circuits; we always show
  // msconvert in that mode (it's the whole point).
  const wideFacts = isPdc ? pdcFacts() : factsForQuantSpectra(state);
  const narrowFacts = factsForNarrowSpectra(state);
  const carafeFacts = factsForCarafeSpectra(state);

  // -----------------------------------------------------------------
  // Stage 0 — User-supplied input files
  // -----------------------------------------------------------------

  if (isPdc) {
    const studyId = state.values['pdc.study_id'];
    const filled = isNonEmptyString(studyId);
    addNode(g, {
      id: 'input.spectra',
      kind: 'input-file',
      label: filled ? truncate(String(studyId)) : '?',
      sublabel: 'PDC study',
      status: filled ? 'active' : 'required-missing',
      stage: 0,
      formPath: 'pdc.study_id',
    });
  } else {
    const summary = summarizeQuantSpectra(state.values['quant_spectra_dir']);
    addNode(g, {
      id: 'input.spectra',
      kind: 'input-file',
      label: summary.filled ? summary.label : '?',
      sublabel: 'Spectra files',
      status: summary.filled ? 'active' : 'required-missing',
      stage: 0,
      formPath: 'quant_spectra_dir',
    });
  }

  const fastaRelevant = !msconvertOnly && engine !== 'cascadia';
  if (fastaRelevant) {
    const slot = summarizeStringPath(state.values['fasta']);
    addNode(g, {
      id: 'input.fasta',
      kind: 'input-file',
      label: slot.filled ? slot.label : '?',
      sublabel: 'FASTA database',
      status: slot.filled ? 'active' : 'required-missing',
      stage: 0,
      formPath: 'fasta',
    });
  }

  const librarySlot = summarizeStringPath(state.values['spectral_library']);
  const libraryRelevant = !msconvertOnly && engine !== 'cascadia' && !carafe;
  const libraryRequired = engine === 'encyclopedia' || engine === null;
  if (libraryRelevant && (librarySlot.filled || libraryRequired)) {
    addNode(g, {
      id: 'input.library',
      kind: 'input-file',
      label: librarySlot.filled ? librarySlot.label : '?',
      sublabel: 'Spectral library',
      status: librarySlot.filled ? 'active' : 'required-missing',
      stage: 0,
      formPath: 'spectral_library',
    });
  }

  if (!isPdc && !msconvertOnly && !skylineSkip && hasReplicateMetadata(state)) {
    const slot = summarizeStringPath(state.values['replicate_metadata']);
    addNode(g, {
      id: 'input.replicate-metadata',
      kind: 'input-file',
      label: slot.label,
      sublabel: 'Replicate metadata',
      status: 'active',
      stage: 0,
      formPath: 'replicate_metadata',
    });
  }

  if (!skylineSkip && !msconvertOnly) {
    const slot = summarizeStringPath(state.values['skyline.template_file']);
    addNode(g, {
      id: 'input.skyline-template',
      kind: 'input-file',
      label: slot.filled ? slot.label : 'Default template',
      sublabel: 'Skyline template',
      status: 'active',
      stage: 0,
      formPath: 'skyline.template_file',
    });
  }

  const skyrSlot = summarizeStringPath(state.values['skyline.skyr_file']);
  const skyrFilled = skyrSlot.filled;
  if (!skylineSkip && !msconvertOnly && skyrFilled) {
    addNode(g, {
      id: 'input.skyr',
      kind: 'input-file',
      label: skyrSlot.label,
      sublabel: 'Skyline reports',
      status: 'active',
      stage: 0,
      formPath: 'skyline.skyr_file',
    });
  }

  if (carafe && !msconvertOnly) {
    const source = state.values['carafe.source'];
    let slot: FileSlot = { filled: false, label: '?' };
    // Prefer the specific source-value field when source is set; fall back
    // to the source-selector field so the node is always clickable.
    let formPath: string = 'carafe.source';
    if (source === 'file') {
      slot = summarizeStringPath(state.values['carafe.spectra_file']);
      formPath = 'carafe.spectra_file';
    } else if (source === 'dir') {
      slot = summarizeStringPath(state.values['carafe.spectra_dir']);
      formPath = 'carafe.spectra_dir';
    } else if (source === 'pdc-files') {
      slot = summarizeStringList(state.values['carafe.pdc_files']);
      formPath = 'carafe.pdc_files';
    } else if (source === 'pdc-sample') {
      const n = state.values['carafe.pdc_n_files'];
      const filled = typeof n === 'number' && Number.isFinite(n) && n > 0;
      slot = { filled, label: filled ? `${n} PDC files` : '?' };
      formPath = 'carafe.pdc_n_files';
    }
    addNode(g, {
      id: 'input.carafe-spectra',
      kind: 'input-file',
      label: slot.filled ? slot.label : '?',
      sublabel: 'Carafe input',
      status: slot.filled ? 'active' : 'required-missing',
      stage: 0,
      formPath,
    });
  }

  const narrow = state.values['chromatogram_library_spectra_dir'];
  const narrowRelevant =
    !msconvertOnly && (engine === 'encyclopedia' || engine === 'diann');
  const narrowSet = isNonEmptyString(narrow) || (Array.isArray(narrow) && narrow.length > 0);
  if (narrowRelevant && narrowSet) {
    const slot = summarizeStringPath(narrow);
    addNode(g, {
      id: 'input.narrow',
      kind: 'input-file',
      label: slot.filled ? slot.label : truncate(String(narrow)),
      sublabel: 'Empirical-library spectra',
      status: 'active',
      stage: 0,
      formPath: 'chromatogram_library_spectra_dir',
    });
  }

  // -----------------------------------------------------------------
  // Stage 1 — Spectra preparation (conditional)
  // -----------------------------------------------------------------

  // For msconvert-only mode the user has explicitly opted in to running
  // msconvert; render it unconditionally so the graph reflects the mode.
  // Otherwise gate on what file types are present.
  const wideNeedsMsconvert =
    msconvertOnly || streamNeedsMsconvert(wideFacts, engine, useVendorRaw, false);
  const wideNeedsUnzip = msconvertOnly
    ? wideFacts.hasDzip
    : streamNeedsUnzip(wideFacts, engine);
  const narrowNeedsMsconvert =
    narrowRelevant && narrowSet && streamNeedsMsconvert(narrowFacts, engine, useVendorRaw, false);
  const narrowNeedsUnzip =
    narrowRelevant && narrowSet && streamNeedsUnzip(narrowFacts, engine);
  const carafeNeedsMsconvert =
    carafe && !msconvertOnly && streamNeedsMsconvert(carafeFacts, engine, useVendorRaw, true);
  const carafeNeedsUnzip = carafe && !msconvertOnly && carafeFacts.hasDzip;

  const anyNeedsMsconvert = wideNeedsMsconvert || narrowNeedsMsconvert || carafeNeedsMsconvert;
  const anyNeedsUnzip = wideNeedsUnzip || narrowNeedsUnzip || carafeNeedsUnzip;
  const widePreparedExists = wideNeedsMsconvert || wideNeedsUnzip;
  const narrowPreparedExists = narrowNeedsMsconvert || narrowNeedsUnzip;
  const carafePreparedExists = carafeNeedsMsconvert || carafeNeedsUnzip;

  if (anyNeedsUnzip) {
    addNode(g, {
      id: 'process.unzip',
      kind: 'process',
      label: 'Extract Bruker',
      sublabel: '.d.zip → .d',
      status: 'active',
      stage: 1,
    });
  }
  if (anyNeedsMsconvert) {
    addNode(g, {
      id: 'process.msconvert',
      kind: 'process',
      label: 'Convert to mzML',
      sublabel: 'msconvert',
      status: 'active',
      stage: 1,
    });
  }

  // Prepared-spectra outputs only exist when at least one prep step ran on
  // the corresponding stream. For each stream, downstream processes consume
  // the prepared output if it exists, else the raw input directly.
  if (widePreparedExists) {
    addNode(g, {
      id: 'output.wide-prepared',
      kind: 'output-file',
      label: 'Prepared spectra',
      sublabel: '.mzML',
      status: 'active',
      stage: 2,
    });
    if (wideNeedsUnzip) {
      addEdge(g, 'input.spectra', 'process.unzip');
      addEdge(g, 'process.unzip', 'output.wide-prepared');
    }
    if (wideNeedsMsconvert) {
      addEdge(g, 'input.spectra', 'process.msconvert');
      addEdge(g, 'process.msconvert', 'output.wide-prepared');
    }
  }
  if (narrowPreparedExists) {
    addNode(g, {
      id: 'output.narrow-prepared',
      kind: 'output-file',
      label: 'Prepared empirical',
      sublabel: '.mzML',
      status: 'active',
      stage: 2,
    });
    if (narrowNeedsUnzip) {
      addEdge(g, 'input.narrow', 'process.unzip');
      addEdge(g, 'process.unzip', 'output.narrow-prepared');
    }
    if (narrowNeedsMsconvert) {
      addEdge(g, 'input.narrow', 'process.msconvert');
      addEdge(g, 'process.msconvert', 'output.narrow-prepared');
    }
  }
  if (carafePreparedExists) {
    addNode(g, {
      id: 'output.carafe-prepared',
      kind: 'output-file',
      label: 'Prepared Carafe',
      sublabel: '.mzML',
      status: 'active',
      stage: 2,
    });
    if (carafeNeedsUnzip) {
      addEdge(g, 'input.carafe-spectra', 'process.unzip');
      addEdge(g, 'process.unzip', 'output.carafe-prepared');
    }
    if (carafeNeedsMsconvert) {
      addEdge(g, 'input.carafe-spectra', 'process.msconvert');
      addEdge(g, 'process.msconvert', 'output.carafe-prepared');
    }
  }

  // Resolve "where wide spectra come from for downstream consumers".
  const wideSpectraSource = widePreparedExists ? 'output.wide-prepared' : 'input.spectra';
  const narrowSpectraSource = narrowPreparedExists
    ? 'output.narrow-prepared'
    : narrowSet
      ? 'input.narrow'
      : null;
  const carafeSpectraSource = carafePreparedExists
    ? 'output.carafe-prepared'
    : carafe
      ? 'input.carafe-spectra'
      : null;

  // -----------------------------------------------------------------
  // msconvert-only short-circuit — no search/skyline/etc.
  // -----------------------------------------------------------------

  if (msconvertOnly) {
    if (panorama) {
      addNode(g, {
        id: 'process.panorama-upload',
        kind: 'process',
        label: 'Panorama upload',
        status: 'active',
        stage: 3,
      });
      addEdge(g, wideSpectraSource, 'process.panorama-upload');
    }
    return { nodes: g.nodes, edges: filterDanglingEdges(g.nodes, g.edges) };
  }

  // -----------------------------------------------------------------
  // Stage 3 — Library preparation
  // -----------------------------------------------------------------

  // Track which node provides the library that gets fed to wide-window
  // search (or to the narrow-window sub-search if narrow runs first).
  let libraryForSearch: string | null = null;

  if (carafe) {
    addNode(g, {
      id: 'process.carafe',
      kind: 'process',
      label: 'Generate library',
      sublabel: 'Carafe',
      status: 'active',
      stage: 3,
    });
    if (carafeSpectraSource) addEdge(g, carafeSpectraSource, 'process.carafe');
    if (fastaRelevant) addEdge(g, 'input.fasta', 'process.carafe');

    addNode(g, {
      id: 'output.carafe-library',
      kind: 'output-file',
      label: 'Generated library',
      sublabel: '.tsv',
      status: 'active',
      stage: 4,
    });
    addEdge(g, 'process.carafe', 'output.carafe-library');
    libraryForSearch = 'output.carafe-library';
  } else if (engine === 'diann' && !librarySlot.filled) {
    // DIA-NN predicts a library from the FASTA when none is supplied.
    addNode(g, {
      id: 'process.diann-build-lib',
      kind: 'process',
      label: 'Predict library',
      sublabel: 'DIA-NN',
      status: 'active',
      stage: 3,
    });
    addEdge(g, 'input.fasta', 'process.diann-build-lib');

    addNode(g, {
      id: 'output.predicted-library',
      kind: 'output-file',
      label: 'Predicted library',
      sublabel: '.tsv',
      status: 'active',
      stage: 4,
    });
    addEdge(g, 'process.diann-build-lib', 'output.predicted-library');
    libraryForSearch = 'output.predicted-library';
  } else if (libraryRelevant && librarySlot.filled) {
    // User library — may need format conversion before it reaches the engine.
    const ext = detectLibraryExt(state.values['spectral_library']);
    if (ext === 'blib' && (engine === 'diann' || engine === 'encyclopedia')) {
      addNode(g, {
        id: 'process.blib-to-dlib',
        kind: 'process',
        label: 'Convert .blib → .dlib',
        sublabel: 'EncyclopeDIA',
        status: 'active',
        stage: 3,
      });
      addEdge(g, 'input.library', 'process.blib-to-dlib');
      addEdge(g, 'input.fasta', 'process.blib-to-dlib');

      addNode(g, {
        id: 'output.converted-dlib',
        kind: 'output-file',
        label: 'Converted library',
        sublabel: '.dlib',
        status: 'active',
        stage: 4,
      });
      addEdge(g, 'process.blib-to-dlib', 'output.converted-dlib');
      libraryForSearch = 'output.converted-dlib';
    } else {
      libraryForSearch = 'input.library';
    }

    // DIA-NN can't read .dlib directly — convert to TSV if we ended up with
    // a .dlib (either user-supplied or just-converted from .blib).
    if (engine === 'diann') {
      const endsAsDlib =
        ext === 'dlib' || libraryForSearch === 'output.converted-dlib';
      if (endsAsDlib) {
        addNode(g, {
          id: 'process.dlib-to-tsv',
          kind: 'process',
          label: 'Convert .dlib → TSV',
          sublabel: 'EncyclopeDIA',
          status: 'active',
          stage: 3,
        });
        addEdge(g, libraryForSearch ?? 'input.library', 'process.dlib-to-tsv');

        addNode(g, {
          id: 'output.tsv-library',
          kind: 'output-file',
          label: 'TSV library',
          sublabel: 'DIA-NN',
          status: 'active',
          stage: 4,
        });
        addEdge(g, 'process.dlib-to-tsv', 'output.tsv-library');
        libraryForSearch = 'output.tsv-library';
      }
    }
  } else if (libraryRelevant) {
    // Library is required but not filled — the input.library node already
    // shows the red "?" — feed it to search to flag the missing-input edge.
    libraryForSearch = 'input.library';
  }

  // -----------------------------------------------------------------
  // Stage 5 — Empirical-library build (optional)
  // -----------------------------------------------------------------

  // When empirical-library spectra (narrow-window GPF, pooled samples, or a
  // subset of the quant files) are configured and the engine supports them,
  // a pre-search runs that produces an empirical library used for the wide
  // search.
  let wideSearchLibrary = libraryForSearch;
  if (narrowSet && narrowSpectraSource) {
    if (engine === 'encyclopedia') {
      addNode(g, {
        id: 'process.narrow-elib',
        kind: 'process',
        label: 'Build empirical library',
        sublabel: 'EncyclopeDIA',
        status: 'active',
        stage: 5,
      });
      addEdge(g, narrowSpectraSource, 'process.narrow-elib');
      addEdge(g, 'input.fasta', 'process.narrow-elib');
      if (libraryForSearch) addEdge(g, libraryForSearch, 'process.narrow-elib');

      addNode(g, {
        id: 'output.chrom-library',
        kind: 'output-file',
        label: 'Empirical library',
        sublabel: '.elib',
        status: 'active',
        stage: 6,
      });
      addEdge(g, 'process.narrow-elib', 'output.chrom-library');
      wideSearchLibrary = 'output.chrom-library';
    } else if (engine === 'diann') {
      addNode(g, {
        id: 'process.diann-narrow',
        kind: 'process',
        label: 'Build empirical library',
        sublabel: 'DIA-NN (subset search)',
        status: 'active',
        stage: 5,
      });
      addEdge(g, narrowSpectraSource, 'process.diann-narrow');
      addEdge(g, 'input.fasta', 'process.diann-narrow');
      if (libraryForSearch) addEdge(g, libraryForSearch, 'process.diann-narrow');

      addNode(g, {
        id: 'output.narrow-library',
        kind: 'output-file',
        label: 'Empirical library',
        sublabel: '.tsv',
        status: 'active',
        stage: 6,
      });
      addEdge(g, 'process.diann-narrow', 'output.narrow-library');
      wideSearchLibrary = 'output.narrow-library';
    }
  }

  // -----------------------------------------------------------------
  // Stage 7 — Wide-window search (only the selected one)
  // -----------------------------------------------------------------

  const searchStage = 7;
  const searchOutputStage = 8;

  if (engine === 'diann') {
    addNode(g, {
      id: 'process.diann',
      kind: 'process',
      label: 'DIA-NN search',
      status: 'active',
      stage: searchStage,
    });
    addEdge(g, wideSpectraSource, 'process.diann');
    addEdge(g, 'input.fasta', 'process.diann');
    if (wideSearchLibrary) addEdge(g, wideSearchLibrary, 'process.diann');

    addNode(g, {
      id: 'output.diann-results',
      kind: 'output-file',
      label: 'Search results',
      sublabel: 'DIA-NN',
      status: 'active',
      stage: searchOutputStage,
    });
    addEdge(g, 'process.diann', 'output.diann-results');
  } else if (engine === 'encyclopedia') {
    addNode(g, {
      id: 'process.encyclopedia',
      kind: 'process',
      label: 'EncyclopeDIA search',
      status: 'active',
      stage: searchStage,
    });
    addEdge(g, wideSpectraSource, 'process.encyclopedia');
    addEdge(g, 'input.fasta', 'process.encyclopedia');
    if (wideSearchLibrary) addEdge(g, wideSearchLibrary, 'process.encyclopedia');

    addNode(g, {
      id: 'output.encyclopedia-results',
      kind: 'output-file',
      label: 'Search results',
      sublabel: 'EncyclopeDIA',
      status: 'active',
      stage: searchOutputStage,
    });
    addEdge(g, 'process.encyclopedia', 'output.encyclopedia-results');
  } else if (engine === 'cascadia') {
    addNode(g, {
      id: 'process.cascadia',
      kind: 'process',
      label: 'Cascadia search',
      status: 'active',
      stage: searchStage,
    });
    addEdge(g, wideSpectraSource, 'process.cascadia');

    addNode(g, {
      id: 'output.cascadia-results',
      kind: 'output-file',
      label: 'Search results',
      sublabel: 'Cascadia',
      status: 'active',
      stage: searchOutputStage,
    });
    addEdge(g, 'process.cascadia', 'output.cascadia-results');

    addNode(g, {
      id: 'output.cascadia-fasta',
      kind: 'output-file',
      label: 'Generated FASTA',
      sublabel: 'Cascadia',
      status: 'active',
      stage: searchOutputStage,
    });
    addEdge(g, 'process.cascadia', 'output.cascadia-fasta');
  } else {
    addNode(g, {
      id: 'process.no-search',
      kind: 'process',
      label: '(no search)',
      sublabel: 'library passthrough',
      status: 'active',
      stage: searchStage,
    });
    if (wideSearchLibrary) addEdge(g, wideSearchLibrary, 'process.no-search');
  }

  // -----------------------------------------------------------------
  // Stage 9 — Skyline document
  // -----------------------------------------------------------------

  if (!skylineSkip) {
    addNode(g, {
      id: 'process.skyline',
      kind: 'process',
      label: 'Build Skyline doc',
      status: 'active',
      stage: 9,
    });
    addEdge(g, wideSpectraSource, 'process.skyline');
    if (engine === 'cascadia') {
      addEdge(g, 'output.cascadia-fasta', 'process.skyline');
    } else if (fastaRelevant) {
      addEdge(g, 'input.fasta', 'process.skyline');
    }
    if (engine === 'diann') addEdge(g, 'output.diann-results', 'process.skyline');
    else if (engine === 'encyclopedia') addEdge(g, 'output.encyclopedia-results', 'process.skyline');
    else if (engine === 'cascadia') addEdge(g, 'output.cascadia-results', 'process.skyline');
    else if (engine === null && wideSearchLibrary) addEdge(g, wideSearchLibrary, 'process.skyline');
    addEdge(g, 'input.skyline-template', 'process.skyline');

    let skylineDoc = 'output.skyline-doc';
    addNode(g, {
      id: 'output.skyline-doc',
      kind: 'output-file',
      label: 'Skyline document',
      sublabel: '.sky.zip',
      status: 'active',
      stage: 10,
    });
    addEdge(g, 'process.skyline', 'output.skyline-doc');

    // Annotate — only when metadata is available (general mode + replicate
    // metadata, OR PDC mode which provides annotations from study metadata).
    if (hasReplicateMetadata(state) || isPdc) {
      addNode(g, {
        id: 'process.skyline-annotate',
        kind: 'process',
        label: 'Annotate doc',
        sublabel: 'metadata',
        status: 'active',
        stage: 11,
      });
      addEdge(g, skylineDoc, 'process.skyline-annotate');
      if (!isPdc) addEdge(g, 'input.replicate-metadata', 'process.skyline-annotate');

      addNode(g, {
        id: 'output.skyline-annotated',
        kind: 'output-file',
        label: 'Annotated doc',
        sublabel: '.sky.zip',
        status: 'active',
        stage: 12,
      });
      addEdge(g, 'process.skyline-annotate', 'output.skyline-annotated');
      skylineDoc = 'output.skyline-annotated';
    }

    // Minimize — gated on params.skyline.minimize (default false).
    if (skylineMinimize) {
      addNode(g, {
        id: 'process.skyline-minimize',
        kind: 'process',
        label: 'Minimize doc',
        status: 'active',
        stage: 13,
      });
      addEdge(g, skylineDoc, 'process.skyline-minimize');

      addNode(g, {
        id: 'output.skyline-minimized',
        kind: 'output-file',
        label: 'Minimized doc',
        sublabel: '.sky.zip',
        status: 'active',
        stage: 14,
      });
      addEdge(g, 'process.skyline-minimize', 'output.skyline-minimized');
      skylineDoc = 'output.skyline-minimized';
    }

    // -----------------------------------------------------------------
    // Stage 15 — Reporting (parallel siblings)
    // -----------------------------------------------------------------

    if (skyrFilled) {
      addNode(g, {
        id: 'process.skyline-reports',
        kind: 'process',
        label: 'Skyline reports',
        status: 'active',
        stage: 15,
      });
      addEdge(g, skylineDoc, 'process.skyline-reports');
      addEdge(g, 'input.skyr', 'process.skyline-reports');
      addNode(g, {
        id: 'output.skyline-reports',
        kind: 'output-file',
        label: 'Reports',
        sublabel: 'TSV',
        status: 'active',
        stage: 16,
      });
      addEdge(g, 'process.skyline-reports', 'output.skyline-reports');
    }

    if (!qcSkip) {
      addNode(g, {
        id: 'process.qc-report',
        kind: 'process',
        label: 'QC report',
        status: 'active',
        stage: 15,
      });
      addEdge(g, skylineDoc, 'process.qc-report');
      addNode(g, {
        id: 'output.qc-report',
        kind: 'output-file',
        label: 'QC report',
        sublabel: 'HTML/PDF',
        status: 'active',
        stage: 16,
      });
      addEdge(g, 'process.qc-report', 'output.qc-report');
    }

    if (!batchSkip) {
      addNode(g, {
        id: 'process.batch-report',
        kind: 'process',
        label: 'Batch report',
        status: 'active',
        stage: 15,
      });
      addEdge(g, skylineDoc, 'process.batch-report');
      addNode(g, {
        id: 'output.batch-report',
        kind: 'output-file',
        label: 'Batch report',
        sublabel: 'HTML',
        status: 'active',
        stage: 16,
      });
      addEdge(g, 'process.batch-report', 'output.batch-report');
    }
  }

  // -----------------------------------------------------------------
  // Stage 17 — Panorama upload
  // -----------------------------------------------------------------

  if (panorama) {
    addNode(g, {
      id: 'process.panorama-upload',
      kind: 'process',
      label: 'Panorama upload',
      status: 'active',
      stage: 17,
    });
    addEdge(g, wideSpectraSource, 'process.panorama-upload');
    if (engine === 'diann') addEdge(g, 'output.diann-results', 'process.panorama-upload');
    if (engine === 'encyclopedia') addEdge(g, 'output.encyclopedia-results', 'process.panorama-upload');
    if (engine === 'cascadia') {
      addEdge(g, 'output.cascadia-results', 'process.panorama-upload');
      addEdge(g, 'output.cascadia-fasta', 'process.panorama-upload');
    }
    if (carafe) addEdge(g, 'output.carafe-library', 'process.panorama-upload');
    if (!skylineSkip) addEdge(g, 'output.skyline-doc', 'process.panorama-upload');
  }

  return { nodes: g.nodes, edges: filterDanglingEdges(g.nodes, g.edges) };
}

function filterDanglingEdges(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): GraphEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  return edges.filter((e) => ids.has(e.from) && ids.has(e.to));
}
