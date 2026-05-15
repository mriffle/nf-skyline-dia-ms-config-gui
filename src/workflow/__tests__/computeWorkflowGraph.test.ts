import { describe, expect, it } from 'vitest';

import type { FormState, Mode } from '../../params/paramMetadata';
import { computeWorkflowGraph } from '../computeWorkflowGraph';
import type { GraphNode, WorkflowGraph } from '../types';

interface MakeStateInput {
  readonly mode?: Mode;
  readonly values?: Record<string, unknown>;
}

function makeState(input: MakeStateInput = {}): FormState {
  const baseValues: Record<string, unknown> = {
    use_carafe: true,
    search_engine: 'diann',
  };
  const values = { ...baseValues, ...(input.values ?? {}) };
  const touched: Record<string, boolean> = {};
  for (const k of Object.keys(values)) touched[k] = true;
  return { mode: input.mode ?? 'general', values, touched };
}

function nodeById(g: WorkflowGraph, id: string): GraphNode | undefined {
  return g.nodes.find((n) => n.id === id);
}

function hasEdge(g: WorkflowGraph, from: string, to: string): boolean {
  return g.edges.some((e) => e.from === from && e.to === to);
}

// ---------------------------------------------------------------------------
// Spectra preparation — msconvert / unzip conditionals
// ---------------------------------------------------------------------------

describe('computeWorkflowGraph — spectra preparation', () => {
  it('all-mzml input runs neither msconvert nor unzip', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          fasta: '/db.fasta',
          quant_spectra_dir: { kind: 'single', path: '/data/wide.mzML' },
        },
      }),
    );
    expect(nodeById(g, 'process.msconvert')).toBeUndefined();
    expect(nodeById(g, 'process.unzip')).toBeUndefined();
    expect(nodeById(g, 'output.wide-prepared')).toBeUndefined();
    // Search consumes the input directly when no prep happened.
    expect(hasEdge(g, 'input.spectra', 'process.diann')).toBe(true);
  });

  it('raw input runs msconvert (DIA-NN, vendor-raw off)', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          fasta: '/db.fasta',
          quant_spectra_dir: { kind: 'single', path: '/data/wide.raw' },
        },
      }),
    );
    expect(nodeById(g, 'process.msconvert')?.status).toBe('active');
    expect(nodeById(g, 'output.wide-prepared')).toBeDefined();
    expect(hasEdge(g, 'input.spectra', 'process.msconvert')).toBe(true);
    expect(hasEdge(g, 'output.wide-prepared', 'process.diann')).toBe(true);
  });

  it('use_vendor_raw=true + DIA-NN + raw skips msconvert', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          search_engine: 'diann',
          use_vendor_raw: true,
          fasta: '/db.fasta',
          quant_spectra_dir: { kind: 'single', path: '/data/wide.raw' },
        },
      }),
    );
    expect(nodeById(g, 'process.msconvert')).toBeUndefined();
    // No prepared output node — search consumes input directly.
    expect(nodeById(g, 'output.wide-prepared')).toBeUndefined();
    expect(hasEdge(g, 'input.spectra', 'process.diann')).toBe(true);
  });

  it('use_vendor_raw=true does NOT skip msconvert for EncyclopeDIA', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          search_engine: 'encyclopedia',
          use_vendor_raw: true,
          fasta: '/db.fasta',
          spectral_library: '/lib.dlib',
          quant_spectra_dir: { kind: 'single', path: '/data/wide.raw' },
        },
      }),
    );
    expect(nodeById(g, 'process.msconvert')?.status).toBe('active');
  });

  it('.d.zip input runs unzip but not msconvert', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          fasta: '/db.fasta',
          quant_spectra_dir: { kind: 'single', path: '/data/wide.d.zip' },
        },
      }),
    );
    expect(nodeById(g, 'process.unzip')?.status).toBe('active');
    expect(nodeById(g, 'process.msconvert')).toBeUndefined();
    expect(hasEdge(g, 'input.spectra', 'process.unzip')).toBe(true);
  });

  it('mixed .raw + .d.zip input runs both', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          fasta: '/db.fasta',
          quant_spectra_dir: {
            kind: 'list',
            paths: ['/data/a.raw', '/data/b.d.zip'],
          },
        },
      }),
    );
    expect(nodeById(g, 'process.msconvert')?.status).toBe('active');
    expect(nodeById(g, 'process.unzip')?.status).toBe('active');
  });

  it('PDC mode triggers msconvert (PDC files are vendor RAW)', () => {
    const g = computeWorkflowGraph(
      makeState({
        mode: 'pdc',
        values: {
          use_carafe: false,
          fasta: '/db.fasta',
          'pdc.study_id': 'PDC000123',
        },
      }),
    );
    expect(nodeById(g, 'process.msconvert')?.status).toBe('active');
  });

  it('PDC mode + use_vendor_raw + DIA-NN skips msconvert', () => {
    const g = computeWorkflowGraph(
      makeState({
        mode: 'pdc',
        values: {
          use_carafe: false,
          search_engine: 'diann',
          use_vendor_raw: true,
          fasta: '/db.fasta',
          'pdc.study_id': 'PDC000123',
        },
      }),
    );
    expect(nodeById(g, 'process.msconvert')).toBeUndefined();
  });

  it('directory input (uncertain types) shows msconvert conservatively', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          fasta: '/db.fasta',
          quant_spectra_dir: { kind: 'single', path: '/data/spectra' },
        },
      }),
    );
    expect(nodeById(g, 'process.msconvert')?.status).toBe('active');
  });

  it('msconvert_only mode renders msconvert unconditionally', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          msconvert_only: true,
          quant_spectra_dir: { kind: 'single', path: '/data/wide.mzML' },
        },
      }),
    );
    expect(nodeById(g, 'process.msconvert')?.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// Carafe spectra preparation
// ---------------------------------------------------------------------------

describe('computeWorkflowGraph — Carafe spectra prep', () => {
  it('Carafe spectra always need msconvert when RAW (vendor RAW does not help)', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: true,
          search_engine: 'diann',
          use_vendor_raw: true,
          'carafe.source': 'file',
          'carafe.spectra_file': '/dda/dda.raw',
          fasta: '/db.fasta',
          quant_spectra_dir: { kind: 'single', path: '/wide.raw' },
        },
      }),
    );
    // Wide flow skips msconvert (DIA-NN + vendor RAW). But Carafe spectra
    // still need conversion → msconvert is rendered to serve the Carafe
    // stream. The output for the wide stream remains absent.
    expect(nodeById(g, 'process.msconvert')?.status).toBe('active');
    expect(nodeById(g, 'output.wide-prepared')).toBeUndefined();
    expect(nodeById(g, 'output.carafe-prepared')?.status).toBe('active');
    expect(hasEdge(g, 'input.carafe-spectra', 'process.msconvert')).toBe(true);
  });

  it('Carafe with all-mzML input does not run msconvert', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: true,
          'carafe.source': 'file',
          'carafe.spectra_file': '/dda/dda.mzML',
          fasta: '/db.fasta',
          quant_spectra_dir: { kind: 'single', path: '/wide.mzML' },
        },
      }),
    );
    expect(nodeById(g, 'process.msconvert')).toBeUndefined();
    expect(hasEdge(g, 'input.carafe-spectra', 'process.carafe')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Library prep — DIANN_BUILD_LIB and conversions
// ---------------------------------------------------------------------------

describe('computeWorkflowGraph — DIA-NN library prediction', () => {
  it('DIA-NN with no library and no Carafe predicts library from FASTA', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          search_engine: 'diann',
          fasta: '/db.fasta',
          quant_spectra_dir: { kind: 'single', path: '/wide.mzML' },
        },
      }),
    );
    expect(nodeById(g, 'process.diann-build-lib')?.status).toBe('active');
    expect(nodeById(g, 'output.predicted-library')?.status).toBe('active');
    expect(hasEdge(g, 'input.fasta', 'process.diann-build-lib')).toBe(true);
    expect(hasEdge(g, 'output.predicted-library', 'process.diann')).toBe(true);
    // input.library should be hidden entirely (not required, not set).
    expect(nodeById(g, 'input.library')).toBeUndefined();
  });

  it('DIA-NN with user library skips prediction', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          search_engine: 'diann',
          fasta: '/db.fasta',
          spectral_library: '/lib.tsv',
          quant_spectra_dir: { kind: 'single', path: '/wide.mzML' },
        },
      }),
    );
    expect(nodeById(g, 'process.diann-build-lib')).toBeUndefined();
    expect(hasEdge(g, 'input.library', 'process.diann')).toBe(true);
  });

  it('DIA-NN with Carafe skips prediction (Carafe supplies the library)', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: true,
          'carafe.source': 'file',
          'carafe.spectra_file': '/dda.mzML',
          search_engine: 'diann',
          fasta: '/db.fasta',
          quant_spectra_dir: { kind: 'single', path: '/wide.mzML' },
        },
      }),
    );
    expect(nodeById(g, 'process.diann-build-lib')).toBeUndefined();
    expect(hasEdge(g, 'output.carafe-library', 'process.diann')).toBe(true);
  });
});

describe('computeWorkflowGraph — library format conversions', () => {
  it('user .blib + EncyclopeDIA runs blib-to-dlib (no further conversion)', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          search_engine: 'encyclopedia',
          fasta: '/db.fasta',
          spectral_library: '/user.blib',
          quant_spectra_dir: { kind: 'single', path: '/wide.mzML' },
        },
      }),
    );
    expect(nodeById(g, 'process.blib-to-dlib')?.status).toBe('active');
    expect(nodeById(g, 'output.converted-dlib')?.status).toBe('active');
    expect(nodeById(g, 'process.dlib-to-tsv')).toBeUndefined();
    expect(hasEdge(g, 'output.converted-dlib', 'process.encyclopedia')).toBe(true);
  });

  it('user .blib + DIA-NN runs both blib-to-dlib and dlib-to-tsv', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          search_engine: 'diann',
          fasta: '/db.fasta',
          spectral_library: '/user.blib',
          quant_spectra_dir: { kind: 'single', path: '/wide.mzML' },
        },
      }),
    );
    expect(nodeById(g, 'process.blib-to-dlib')?.status).toBe('active');
    expect(nodeById(g, 'process.dlib-to-tsv')?.status).toBe('active');
    expect(nodeById(g, 'output.tsv-library')?.status).toBe('active');
    expect(hasEdge(g, 'output.converted-dlib', 'process.dlib-to-tsv')).toBe(true);
    expect(hasEdge(g, 'output.tsv-library', 'process.diann')).toBe(true);
  });

  it('user .dlib + DIA-NN runs only dlib-to-tsv', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          search_engine: 'diann',
          fasta: '/db.fasta',
          spectral_library: '/user.dlib',
          quant_spectra_dir: { kind: 'single', path: '/wide.mzML' },
        },
      }),
    );
    expect(nodeById(g, 'process.blib-to-dlib')).toBeUndefined();
    expect(nodeById(g, 'process.dlib-to-tsv')?.status).toBe('active');
    expect(hasEdge(g, 'input.library', 'process.dlib-to-tsv')).toBe(true);
  });

  it('user .tsv + DIA-NN runs no conversions', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          search_engine: 'diann',
          fasta: '/db.fasta',
          spectral_library: '/user.tsv',
          quant_spectra_dir: { kind: 'single', path: '/wide.mzML' },
        },
      }),
    );
    expect(nodeById(g, 'process.blib-to-dlib')).toBeUndefined();
    expect(nodeById(g, 'process.dlib-to-tsv')).toBeUndefined();
    expect(hasEdge(g, 'input.library', 'process.diann')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Narrow-window pre-search
// ---------------------------------------------------------------------------

describe('computeWorkflowGraph — narrow-window pre-search', () => {
  it('EncyclopeDIA + narrow runs Build chrom. library; wide consumes the .elib', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          search_engine: 'encyclopedia',
          fasta: '/db.fasta',
          spectral_library: '/user.dlib',
          quant_spectra_dir: { kind: 'single', path: '/wide.mzML' },
          chromatogram_library_spectra_dir: '/data/narrow.mzML',
        },
      }),
    );
    expect(nodeById(g, 'process.narrow-elib')?.status).toBe('active');
    expect(nodeById(g, 'output.chrom-library')?.status).toBe('active');
    expect(hasEdge(g, 'output.chrom-library', 'process.encyclopedia')).toBe(true);
  });

  it('DIA-NN + narrow runs DIA-NN narrow search; wide consumes refined library', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          search_engine: 'diann',
          fasta: '/db.fasta',
          spectral_library: '/user.tsv',
          quant_spectra_dir: { kind: 'single', path: '/wide.mzML' },
          chromatogram_library_spectra_dir: '/data/narrow.mzML',
        },
      }),
    );
    expect(nodeById(g, 'process.diann-narrow')?.status).toBe('active');
    expect(nodeById(g, 'output.narrow-library')?.status).toBe('active');
    expect(hasEdge(g, 'output.narrow-library', 'process.diann')).toBe(true);
  });

  it('Cascadia ignores narrow-window spectra (no narrow node, no input.narrow)', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          search_engine: 'cascadia',
          quant_spectra_dir: { kind: 'single', path: '/wide.mzML' },
          chromatogram_library_spectra_dir: '/data/narrow.mzML',
        },
      }),
    );
    expect(nodeById(g, 'process.narrow-elib')).toBeUndefined();
    expect(nodeById(g, 'process.diann-narrow')).toBeUndefined();
    expect(nodeById(g, 'input.narrow')).toBeUndefined();
  });

  it('narrow .raw input runs msconvert before narrow search', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          search_engine: 'encyclopedia',
          fasta: '/db.fasta',
          spectral_library: '/user.dlib',
          quant_spectra_dir: { kind: 'single', path: '/wide.mzML' },
          chromatogram_library_spectra_dir: '/data/narrow.raw',
        },
      }),
    );
    expect(nodeById(g, 'process.msconvert')?.status).toBe('active');
    expect(nodeById(g, 'output.narrow-prepared')?.status).toBe('active');
    expect(hasEdge(g, 'input.narrow', 'process.msconvert')).toBe(true);
    expect(hasEdge(g, 'output.narrow-prepared', 'process.narrow-elib')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Search engine selection
// ---------------------------------------------------------------------------

describe('computeWorkflowGraph — search engine selection', () => {
  it('only the selected DIA-NN engine appears; other engines are omitted', () => {
    const g = computeWorkflowGraph(makeState({ values: { use_carafe: false } }));
    expect(nodeById(g, 'process.diann')?.status).toBe('active');
    expect(nodeById(g, 'process.encyclopedia')).toBeUndefined();
    expect(nodeById(g, 'process.cascadia')).toBeUndefined();
  });

  it('EncyclopeDIA: library is required-missing when unset', () => {
    const g = computeWorkflowGraph(
      makeState({ values: { use_carafe: false, search_engine: 'encyclopedia' } }),
    );
    expect(nodeById(g, 'input.library')?.status).toBe('required-missing');
    expect(nodeById(g, 'process.encyclopedia')?.status).toBe('active');
    expect(nodeById(g, 'process.diann')).toBeUndefined();
  });

  it('Cascadia: FASTA hidden, library hidden, generated FASTA appears', () => {
    const g = computeWorkflowGraph(
      makeState({ values: { use_carafe: false, search_engine: 'cascadia' } }),
    );
    expect(nodeById(g, 'input.fasta')).toBeUndefined();
    expect(nodeById(g, 'input.library')).toBeUndefined();
    expect(nodeById(g, 'process.cascadia')?.status).toBe('active');
    expect(nodeById(g, 'output.cascadia-fasta')?.status).toBe('active');
    expect(hasEdge(g, 'output.cascadia-fasta', 'process.skyline')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PDC mode
// ---------------------------------------------------------------------------

describe('computeWorkflowGraph — PDC mode', () => {
  it('spectra source uses pdc.study_id; replicate metadata node is hidden', () => {
    const g = computeWorkflowGraph(
      makeState({ mode: 'pdc', values: { use_carafe: false, 'pdc.study_id': 'PDC000123' } }),
    );
    expect(nodeById(g, 'input.spectra')?.formPath).toBe('pdc.study_id');
    expect(nodeById(g, 'input.spectra')?.status).toBe('active');
    expect(nodeById(g, 'input.replicate-metadata')).toBeUndefined();
  });

  it('empty PDC study id leaves spectra as required-missing', () => {
    const g = computeWorkflowGraph(makeState({ mode: 'pdc', values: { use_carafe: false } }));
    expect(nodeById(g, 'input.spectra')?.status).toBe('required-missing');
  });

  it('PDC mode runs Skyline Annotate (PDC supplies metadata)', () => {
    const g = computeWorkflowGraph(
      makeState({
        mode: 'pdc',
        values: { use_carafe: false, 'pdc.study_id': 'PDC000123', fasta: '/db.fasta' },
      }),
    );
    expect(nodeById(g, 'process.skyline-annotate')?.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// Carafe enabled
// ---------------------------------------------------------------------------

describe('computeWorkflowGraph — Carafe enabled', () => {
  it('Carafe runs and supplies the library; user-library node is omitted', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: true,
          'carafe.source': 'file',
          'carafe.spectra_file': '/data/dda.mzML',
        },
      }),
    );
    expect(nodeById(g, 'process.carafe')?.status).toBe('active');
    expect(nodeById(g, 'output.carafe-library')?.status).toBe('active');
    expect(nodeById(g, 'input.library')).toBeUndefined();
    expect(hasEdge(g, 'output.carafe-library', 'process.diann')).toBe(true);
  });

  it('Carafe input not set → required-missing', () => {
    const g = computeWorkflowGraph(
      makeState({ values: { use_carafe: true, 'carafe.source': 'file' } }),
    );
    expect(nodeById(g, 'input.carafe-spectra')?.status).toBe('required-missing');
  });
});

// ---------------------------------------------------------------------------
// Replicate metadata / skyr report
// ---------------------------------------------------------------------------

describe('computeWorkflowGraph — replicate metadata', () => {
  it('hidden when unset', () => {
    const g = computeWorkflowGraph(makeState({ values: { use_carafe: false } }));
    expect(nodeById(g, 'input.replicate-metadata')).toBeUndefined();
    expect(nodeById(g, 'process.skyline-annotate')).toBeUndefined();
  });

  it('appears as active when set, and Annotate process runs', () => {
    const g = computeWorkflowGraph(
      makeState({ values: { use_carafe: false, replicate_metadata: '/meta.tsv' } }),
    );
    expect(nodeById(g, 'input.replicate-metadata')?.status).toBe('active');
    expect(nodeById(g, 'process.skyline-annotate')?.status).toBe('active');
    expect(hasEdge(g, 'input.replicate-metadata', 'process.skyline-annotate')).toBe(true);
  });
});

describe('computeWorkflowGraph — skyr report definitions', () => {
  it('hidden when unset', () => {
    const g = computeWorkflowGraph(makeState({ values: { use_carafe: false } }));
    expect(nodeById(g, 'input.skyr')).toBeUndefined();
    expect(nodeById(g, 'process.skyline-reports')).toBeUndefined();
  });

  it('both appear when skyr is set', () => {
    const g = computeWorkflowGraph(
      makeState({ values: { use_carafe: false, 'skyline.skyr_file': '/r.skyr' } }),
    );
    expect(nodeById(g, 'input.skyr')?.status).toBe('active');
    expect(nodeById(g, 'process.skyline-reports')?.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// Skyline minimize
// ---------------------------------------------------------------------------

describe('computeWorkflowGraph — Skyline minimize', () => {
  it('hidden by default', () => {
    const g = computeWorkflowGraph(makeState({ values: { use_carafe: false } }));
    expect(nodeById(g, 'process.skyline-minimize')).toBeUndefined();
  });

  it('appears when skyline.minimize=true', () => {
    const g = computeWorkflowGraph(
      makeState({ values: { use_carafe: false, 'skyline.minimize': true } }),
    );
    expect(nodeById(g, 'process.skyline-minimize')?.status).toBe('active');
    expect(nodeById(g, 'output.skyline-minimized')?.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// msconvert_only / skyline.skip / panorama
// ---------------------------------------------------------------------------

describe('computeWorkflowGraph — msconvert_only', () => {
  it('only spectra prep nodes remain; everything downstream gone', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          msconvert_only: true,
          quant_spectra_dir: { kind: 'single', path: '/data/wide.raw' },
        },
      }),
    );
    expect(nodeById(g, 'input.spectra')?.status).toBe('active');
    expect(nodeById(g, 'process.msconvert')?.status).toBe('active');
    expect(nodeById(g, 'output.wide-prepared')?.status).toBe('active');
    expect(nodeById(g, 'process.diann')).toBeUndefined();
    expect(nodeById(g, 'process.skyline')).toBeUndefined();
    expect(nodeById(g, 'process.qc-report')).toBeUndefined();
    expect(nodeById(g, 'input.fasta')).toBeUndefined();
    expect(nodeById(g, 'input.skyline-template')).toBeUndefined();
  });

  it('panorama upload still attaches when enabled', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          msconvert_only: true,
          'panorama.upload': true,
          quant_spectra_dir: { kind: 'single', path: '/data/wide.raw' },
        },
      }),
    );
    expect(nodeById(g, 'process.panorama-upload')?.status).toBe('active');
    expect(hasEdge(g, 'output.wide-prepared', 'process.panorama-upload')).toBe(true);
  });
});

describe('computeWorkflowGraph — skyline.skip', () => {
  it('removes Skyline document, all reports, and Skyline-only inputs', () => {
    const g = computeWorkflowGraph(
      makeState({ values: { use_carafe: false, 'skyline.skip': true } }),
    );
    expect(nodeById(g, 'process.skyline')).toBeUndefined();
    expect(nodeById(g, 'output.skyline-doc')).toBeUndefined();
    expect(nodeById(g, 'process.skyline-annotate')).toBeUndefined();
    expect(nodeById(g, 'process.skyline-minimize')).toBeUndefined();
    expect(nodeById(g, 'process.qc-report')).toBeUndefined();
    expect(nodeById(g, 'process.batch-report')).toBeUndefined();
    expect(nodeById(g, 'input.skyline-template')).toBeUndefined();
  });
});

describe('computeWorkflowGraph — panorama upload', () => {
  it('aggregates from prepared spectra (when present), search results, Skyline doc', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          search_engine: 'diann',
          'panorama.upload': true,
          fasta: '/db.fasta',
          quant_spectra_dir: { kind: 'single', path: '/data/wide.raw' },
        },
      }),
    );
    expect(nodeById(g, 'process.panorama-upload')?.status).toBe('active');
    expect(hasEdge(g, 'output.wide-prepared', 'process.panorama-upload')).toBe(true);
    expect(hasEdge(g, 'output.diann-results', 'process.panorama-upload')).toBe(true);
    expect(hasEdge(g, 'output.skyline-doc', 'process.panorama-upload')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

describe('computeWorkflowGraph — node-status invariant', () => {
  it('every node is either "active" or "required-missing"', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: true,
          'carafe.source': 'dir',
          'carafe.spectra_dir': '/dda',
          fasta: '/db.fasta',
          quant_spectra_dir: { kind: 'single', path: '/wide.raw' },
          'panorama.upload': true,
        },
      }),
    );
    for (const n of g.nodes) {
      expect(['active', 'required-missing']).toContain(n.status);
    }
  });
});

describe('computeWorkflowGraph — edge integrity', () => {
  it('every edge endpoint resolves to a node (complex scenario)', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          search_engine: 'diann',
          fasta: '/db.fasta',
          spectral_library: '/user.blib',
          quant_spectra_dir: { kind: 'single', path: '/wide.raw' },
          chromatogram_library_spectra_dir: '/data/narrow.raw',
          replicate_metadata: '/m.tsv',
          'skyline.minimize': true,
          'skyline.skyr_file': '/r.skyr',
          'panorama.upload': true,
        },
      }),
    );
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) {
      expect(ids.has(e.from)).toBe(true);
      expect(ids.has(e.to)).toBe(true);
    }
  });
});
