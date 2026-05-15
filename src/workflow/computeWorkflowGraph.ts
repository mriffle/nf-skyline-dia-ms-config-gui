// Pure function: FormState -> WorkflowGraph.
//
// Mirrors the shape of emitConfig.ts (no React, no DOM, no store imports).
// Reads `state.values` directly — does NOT consult `state.touched`. The
// graph reflects the workflow that *would run* for the current values,
// regardless of whether the user has touched the underlying paths.
//
// Only nodes that will actually execute (or files that will actually be
// consumed/produced) appear in the graph. Unselected branches — e.g. the
// other search engines when DIA-NN is selected, the user spectral library
// when Carafe is supplying one, FASTA in Cascadia mode — are omitted
// entirely. Required-but-missing user inputs still appear (with red `?`)
// so the user can see what's needed.

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
// Predicates
// ---------------------------------------------------------------------------

type SearchEngine = 'diann' | 'encyclopedia' | 'cascadia' | null;

function readSearchEngine(state: FormState): SearchEngine {
  const v = state.values['search_engine'];
  if (v === null) return null;
  if (typeof v !== 'string') return 'diann'; // matches createDefaultState pre-seed
  const lower = v.toLowerCase();
  if (lower === 'diann') return 'diann';
  if (lower === 'encyclopedia') return 'encyclopedia';
  if (lower === 'cascadia') return 'cascadia';
  return 'diann';
}

const isMsconvertOnly = (s: FormState): boolean => s.values['msconvert_only'] === true;
const isCarafeEnabled = (s: FormState): boolean => s.values['use_carafe'] === true;
const isSkylineSkipped = (s: FormState): boolean => s.values['skyline.skip'] === true;
const isQcSkipped = (s: FormState): boolean => s.values['qc_report.skip'] === true;
const isBatchSkipped = (s: FormState): boolean => s.values['batch_report.skip'] === true;
const isPanoramaUpload = (s: FormState): boolean => s.values['panorama.upload'] === true;

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

export function computeWorkflowGraph(state: FormState): WorkflowGraph {
  const g: MutableGraph = { nodes: [], edges: [] };
  const engine = readSearchEngine(state);
  const msconvertOnly = isMsconvertOnly(state);
  const carafe = isCarafeEnabled(state);
  const skylineSkip = isSkylineSkipped(state);
  const qcSkip = isQcSkipped(state);
  const batchSkip = isBatchSkipped(state);
  const panorama = isPanoramaUpload(state);
  const isPdc = state.mode === 'pdc';

  // -----------------------------------------------------------------
  // Stage 0 — User-supplied input files (only those that will be used)
  // -----------------------------------------------------------------

  // Spectra source — always required.
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

  // FASTA — needed for diann/encyclopedia/no-search. Hidden in Cascadia
  // (de novo) and in msconvert-only (no search runs).
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

  // Spectral library — hidden when Carafe is supplying one, when Cascadia
  // is ignoring libraries, or in msconvert-only. For DIA-NN the library is
  // optional (can be predicted from FASTA): only shown if the user has
  // actually set one. For EncyclopeDIA / no-search the library is required:
  // always shown (red `?` if unset).
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

  // Replicate metadata — optional, general mode only. Only shown when set.
  if (!isPdc && !msconvertOnly && !skylineSkip) {
    const slot = summarizeStringPath(state.values['replicate_metadata']);
    if (slot.filled) {
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
  }

  // Skyline template — the workflow uses a built-in default when unset, so
  // it's always "active" (a template is always being used). Label switches
  // between the user file and "Default template".
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

  // Skyr report definitions — optional. Only shown when set; the Skyline
  // reports process is also gated on this being set.
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

  // Carafe input spectra — only when Carafe is enabled. Required.
  if (carafe && !msconvertOnly) {
    const source = state.values['carafe.source'];
    let slot: FileSlot = { filled: false, label: '?' };
    let formPath: string | undefined;
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

  // Narrow-window spectra — optional. Only shown when set.
  const narrow = state.values['chromatogram_library_spectra_dir'];
  const narrowRelevant =
    !msconvertOnly && (engine === 'encyclopedia' || engine === 'diann');
  if (narrowRelevant && isNonEmptyString(narrow)) {
    addNode(g, {
      id: 'input.narrow',
      kind: 'input-file',
      label: truncate(basenameOf(narrow)),
      sublabel: 'Narrow-window spectra',
      status: 'active',
      stage: 0,
      formPath: 'chromatogram_library_spectra_dir',
    });
  }

  // -----------------------------------------------------------------
  // Stage 1 — Prepare spectra (always)
  // -----------------------------------------------------------------

  addNode(g, {
    id: 'process.prepare-spectra',
    kind: 'process',
    label: 'Prepare spectra',
    sublabel: 'msconvert / unzip / fetch',
    status: 'active',
    stage: 1,
  });
  addEdge(g, 'input.spectra', 'process.prepare-spectra');

  addNode(g, {
    id: 'output.prepared-spectra',
    kind: 'output-file',
    label: 'Prepared spectra',
    sublabel: '.mzML',
    status: 'active',
    stage: 2,
  });
  addEdge(g, 'process.prepare-spectra', 'output.prepared-spectra');

  // -----------------------------------------------------------------
  // msconvert-only short-circuit
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
      addEdge(g, 'output.prepared-spectra', 'process.panorama-upload');
    }
    return { nodes: g.nodes, edges: filterDanglingEdges(g.nodes, g.edges) };
  }

  // -----------------------------------------------------------------
  // Stage 2 — Library prep (Carafe)
  // -----------------------------------------------------------------

  if (carafe) {
    addNode(g, {
      id: 'process.carafe',
      kind: 'process',
      label: 'Generate library',
      sublabel: 'Carafe',
      status: 'active',
      stage: 3,
    });
    addEdge(g, 'input.carafe-spectra', 'process.carafe');
    if (fastaRelevant) addEdge(g, 'input.fasta', 'process.carafe');

    addNode(g, {
      id: 'output.carafe-library',
      kind: 'output-file',
      label: 'Generated library',
      sublabel: '.dlib',
      status: 'active',
      stage: 4,
    });
    addEdge(g, 'process.carafe', 'output.carafe-library');
  }

  // -----------------------------------------------------------------
  // Stage 3 — Search engine (only the selected one)
  // -----------------------------------------------------------------

  const searchStage = 5;
  const searchOutputStage = 6;

  if (engine === 'diann') {
    addNode(g, {
      id: 'process.diann',
      kind: 'process',
      label: 'DIA-NN search',
      status: 'active',
      stage: searchStage,
    });
    addEdge(g, 'output.prepared-spectra', 'process.diann');
    addEdge(g, 'input.fasta', 'process.diann');
    if (carafe) addEdge(g, 'output.carafe-library', 'process.diann');
    else addEdge(g, 'input.library', 'process.diann');

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
    addEdge(g, 'output.prepared-spectra', 'process.encyclopedia');
    addEdge(g, 'input.fasta', 'process.encyclopedia');
    if (carafe) addEdge(g, 'output.carafe-library', 'process.encyclopedia');
    else addEdge(g, 'input.library', 'process.encyclopedia');

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
    addEdge(g, 'output.prepared-spectra', 'process.cascadia');

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
    // engine === null: library is passed straight through to Skyline.
    addNode(g, {
      id: 'process.no-search',
      kind: 'process',
      label: '(no search)',
      sublabel: 'library passthrough',
      status: 'active',
      stage: searchStage,
    });
    if (carafe) addEdge(g, 'output.carafe-library', 'process.no-search');
    else addEdge(g, 'input.library', 'process.no-search');
  }

  // -----------------------------------------------------------------
  // Stage 4 — Skyline document
  // -----------------------------------------------------------------

  if (!skylineSkip) {
    addNode(g, {
      id: 'process.skyline',
      kind: 'process',
      label: 'Build Skyline doc',
      status: 'active',
      stage: 7,
    });
    addEdge(g, 'output.prepared-spectra', 'process.skyline');
    if (engine === 'cascadia') {
      addEdge(g, 'output.cascadia-fasta', 'process.skyline');
    } else if (fastaRelevant) {
      addEdge(g, 'input.fasta', 'process.skyline');
    }
    if (engine === 'diann') addEdge(g, 'output.diann-results', 'process.skyline');
    else if (engine === 'encyclopedia') addEdge(g, 'output.encyclopedia-results', 'process.skyline');
    else if (engine === 'cascadia') addEdge(g, 'output.cascadia-results', 'process.skyline');
    else if (engine === null) {
      if (carafe) addEdge(g, 'output.carafe-library', 'process.skyline');
      else addEdge(g, 'input.library', 'process.skyline');
    }
    addEdge(g, 'input.skyline-template', 'process.skyline');
    if (!isPdc) addEdge(g, 'input.replicate-metadata', 'process.skyline');

    addNode(g, {
      id: 'output.skyline-doc',
      kind: 'output-file',
      label: 'Skyline document',
      sublabel: '.sky.zip',
      status: 'active',
      stage: 8,
    });
    addEdge(g, 'process.skyline', 'output.skyline-doc');

    // -----------------------------------------------------------------
    // Stage 5 — Reporting (parallel siblings)
    // -----------------------------------------------------------------

    if (skyrFilled) {
      addNode(g, {
        id: 'process.skyline-reports',
        kind: 'process',
        label: 'Skyline reports',
        status: 'active',
        stage: 9,
      });
      addEdge(g, 'output.skyline-doc', 'process.skyline-reports');
      addEdge(g, 'input.skyr', 'process.skyline-reports');
      addNode(g, {
        id: 'output.skyline-reports',
        kind: 'output-file',
        label: 'Reports',
        sublabel: 'TSV',
        status: 'active',
        stage: 10,
      });
      addEdge(g, 'process.skyline-reports', 'output.skyline-reports');
    }

    if (!qcSkip) {
      addNode(g, {
        id: 'process.qc-report',
        kind: 'process',
        label: 'QC report',
        status: 'active',
        stage: 9,
      });
      addEdge(g, 'output.skyline-doc', 'process.qc-report');
      addNode(g, {
        id: 'output.qc-report',
        kind: 'output-file',
        label: 'QC report',
        sublabel: 'HTML/PDF',
        status: 'active',
        stage: 10,
      });
      addEdge(g, 'process.qc-report', 'output.qc-report');
    }

    if (!batchSkip) {
      addNode(g, {
        id: 'process.batch-report',
        kind: 'process',
        label: 'Batch report',
        status: 'active',
        stage: 9,
      });
      addEdge(g, 'output.skyline-doc', 'process.batch-report');
      addNode(g, {
        id: 'output.batch-report',
        kind: 'output-file',
        label: 'Batch report',
        sublabel: 'HTML',
        status: 'active',
        stage: 10,
      });
      addEdge(g, 'process.batch-report', 'output.batch-report');
    }
  }

  // -----------------------------------------------------------------
  // Stage 6 — Panorama upload
  // -----------------------------------------------------------------

  if (panorama) {
    addNode(g, {
      id: 'process.panorama-upload',
      kind: 'process',
      label: 'Panorama upload',
      status: 'active',
      stage: 11,
    });
    addEdge(g, 'output.prepared-spectra', 'process.panorama-upload');
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
