import { describe, expect, it } from 'vitest';

import type { FormState, Mode } from '../../params/paramMetadata';
import { computeWorkflowGraph } from '../computeWorkflowGraph';
import type { GraphNode, WorkflowGraph } from '../types';

interface MakeStateInput {
  readonly mode?: Mode;
  readonly values?: Record<string, unknown>;
}

// Mirrors the runtime default: createDefaultState seeds search_engine and
// use_carafe. Tests that exercise specific scenarios should pass overrides
// in `values`.
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

describe('computeWorkflowGraph — empty initial state (general mode)', () => {
  // The default state pre-seeds use_carafe = true, so empty initial state
  // also requires Carafe input.
  it('spectra is required-missing and FASTA is required-missing', () => {
    const g = computeWorkflowGraph(makeState({ values: { use_carafe: false } }));
    expect(nodeById(g, 'input.spectra')?.status).toBe('required-missing');
    expect(nodeById(g, 'input.fasta')?.status).toBe('required-missing');
  });

  it('all three search engine processes are present; only DIA-NN is active', () => {
    const g = computeWorkflowGraph(makeState({ values: { use_carafe: false } }));
    expect(nodeById(g, 'process.diann')?.status).toBe('active');
    expect(nodeById(g, 'process.encyclopedia')?.status).toBe('inactive');
    expect(nodeById(g, 'process.cascadia')?.status).toBe('inactive');
  });

  it('always includes prepare-spectra, prepared-spectra output, and Skyline build', () => {
    const g = computeWorkflowGraph(makeState({ values: { use_carafe: false } }));
    expect(nodeById(g, 'process.prepare-spectra')).toBeDefined();
    expect(nodeById(g, 'output.prepared-spectra')).toBeDefined();
    expect(nodeById(g, 'process.skyline')).toBeDefined();
  });
});

describe('computeWorkflowGraph — DIA-NN scenarios', () => {
  it('with FASTA and spectra filled, both inputs become active', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          fasta: '/db.fasta',
          quant_spectra_dir: { kind: 'single', path: '/data/wide.mzML' },
        },
      }),
    );
    expect(nodeById(g, 'input.fasta')?.status).toBe('active');
    expect(nodeById(g, 'input.spectra')?.status).toBe('active');
  });

  it('library is optional-missing for DIA-NN (not required)', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          fasta: '/db.fasta',
          quant_spectra_dir: { kind: 'single', path: '/data/wide.mzML' },
        },
      }),
    );
    expect(nodeById(g, 'input.library')?.status).toBe('optional-missing');
  });
});

describe('computeWorkflowGraph — EncyclopeDIA selected', () => {
  it('library flips to required-missing; encyclopedia process active, diann inactive', () => {
    const g = computeWorkflowGraph(
      makeState({ values: { use_carafe: false, search_engine: 'encyclopedia' } }),
    );
    expect(nodeById(g, 'input.library')?.status).toBe('required-missing');
    expect(nodeById(g, 'process.encyclopedia')?.status).toBe('active');
    expect(nodeById(g, 'process.diann')?.status).toBe('inactive');
    expect(nodeById(g, 'process.cascadia')?.status).toBe('inactive');
  });
});

describe('computeWorkflowGraph — Cascadia selected', () => {
  it('FASTA optional, library inactive, Cascadia active, generated FASTA appears', () => {
    const g = computeWorkflowGraph(
      makeState({ values: { use_carafe: false, search_engine: 'cascadia' } }),
    );
    expect(nodeById(g, 'input.fasta')?.status).toBe('optional-missing');
    expect(nodeById(g, 'input.library')?.status).toBe('inactive');
    expect(nodeById(g, 'process.cascadia')?.status).toBe('active');
    expect(nodeById(g, 'output.cascadia-fasta')?.status).toBe('active');
  });

  it('Skyline takes Cascadia FASTA, not user FASTA', () => {
    const g = computeWorkflowGraph(
      makeState({ values: { use_carafe: false, search_engine: 'cascadia' } }),
    );
    expect(hasEdge(g, 'output.cascadia-fasta', 'process.skyline')).toBe(true);
    expect(hasEdge(g, 'input.fasta', 'process.skyline')).toBe(false);
  });
});

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
});

describe('computeWorkflowGraph — Carafe enabled', () => {
  it('Carafe process and input nodes appear; generated library replaces user library edge', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: true,
          'carafe.source': 'file',
        },
      }),
    );
    expect(nodeById(g, 'process.carafe')?.status).toBe('active');
    expect(nodeById(g, 'input.carafe-spectra')?.status).toBe('required-missing');
    expect(nodeById(g, 'output.carafe-library')?.status).toBe('active');
    expect(hasEdge(g, 'output.carafe-library', 'process.diann')).toBe(true);
    expect(hasEdge(g, 'input.library', 'process.diann')).toBe(false);
  });

  it('Carafe input becomes active when source=file and spectra_file set', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: true,
          'carafe.source': 'file',
          'carafe.spectra_file': '/data/dda.mzML',
        },
      }),
    );
    expect(nodeById(g, 'input.carafe-spectra')?.status).toBe('active');
  });

  it('omits the user spectral library node entirely when Carafe is enabled', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: true,
          'carafe.source': 'file',
          'carafe.spectra_file': '/data/dda.mzML',
        },
      }),
    );
    // User library is overridden by the Carafe-generated library at runtime,
    // so showing the user-library slot would be misleading.
    expect(nodeById(g, 'input.library')).toBeUndefined();
    // The Carafe pipeline + generated library output should still be present.
    expect(nodeById(g, 'input.carafe-spectra')).toBeDefined();
    expect(nodeById(g, 'process.carafe')).toBeDefined();
    expect(nodeById(g, 'output.carafe-library')).toBeDefined();
    // No edge should reference the missing user-library node.
    expect(g.edges.some((e) => e.from === 'input.library' || e.to === 'input.library')).toBe(false);
  });
});

describe('computeWorkflowGraph — msconvert_only', () => {
  it('only spectra → prepare → prepared-spectra remain; search/Skyline gone', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          msconvert_only: true,
          quant_spectra_dir: { kind: 'single', path: '/data/wide.raw' },
        },
      }),
    );
    expect(nodeById(g, 'input.spectra')?.status).toBe('active');
    expect(nodeById(g, 'process.prepare-spectra')?.status).toBe('active');
    expect(nodeById(g, 'output.prepared-spectra')?.status).toBe('active');
    expect(nodeById(g, 'process.diann')).toBeUndefined();
    expect(nodeById(g, 'process.encyclopedia')).toBeUndefined();
    expect(nodeById(g, 'process.cascadia')).toBeUndefined();
    expect(nodeById(g, 'process.skyline')).toBeUndefined();
    expect(nodeById(g, 'process.qc-report')).toBeUndefined();
  });

  it('FASTA is shown but not required in msconvert-only mode', () => {
    const g = computeWorkflowGraph(makeState({ values: { msconvert_only: true } }));
    expect(nodeById(g, 'input.fasta')?.status).toBe('inactive');
  });

  it('panorama upload still attaches when enabled', () => {
    const g = computeWorkflowGraph(
      makeState({ values: { msconvert_only: true, 'panorama.upload': true } }),
    );
    expect(nodeById(g, 'process.panorama-upload')?.status).toBe('active');
    expect(hasEdge(g, 'output.prepared-spectra', 'process.panorama-upload')).toBe(true);
  });
});

describe('computeWorkflowGraph — skyline.skip', () => {
  it('removes Skyline document and all reports', () => {
    const g = computeWorkflowGraph(
      makeState({ values: { use_carafe: false, 'skyline.skip': true } }),
    );
    expect(nodeById(g, 'process.skyline')).toBeUndefined();
    expect(nodeById(g, 'output.skyline-doc')).toBeUndefined();
    expect(nodeById(g, 'process.qc-report')).toBeUndefined();
    expect(nodeById(g, 'process.batch-report')).toBeUndefined();
    expect(nodeById(g, 'process.skyline-reports')).toBeUndefined();
  });

  it('hides skyline template and skyr input nodes', () => {
    const g = computeWorkflowGraph(
      makeState({ values: { use_carafe: false, 'skyline.skip': true } }),
    );
    expect(nodeById(g, 'input.skyline-template')).toBeUndefined();
    expect(nodeById(g, 'input.skyr')).toBeUndefined();
  });
});

describe('computeWorkflowGraph — panorama upload', () => {
  it('node appears and aggregates from prepared spectra, search results, Skyline doc', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          'panorama.upload': true,
          fasta: '/db.fasta',
          quant_spectra_dir: { kind: 'single', path: '/data/wide.mzML' },
        },
      }),
    );
    expect(nodeById(g, 'process.panorama-upload')?.status).toBe('active');
    expect(hasEdge(g, 'output.prepared-spectra', 'process.panorama-upload')).toBe(true);
    expect(hasEdge(g, 'output.diann-results', 'process.panorama-upload')).toBe(true);
    expect(hasEdge(g, 'output.skyline-doc', 'process.panorama-upload')).toBe(true);
  });
});

describe('computeWorkflowGraph — narrow-window spectra', () => {
  it('shown when set and search engine is encyclopedia or diann', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          search_engine: 'encyclopedia',
          chromatogram_library_spectra_dir: '/data/narrow',
        },
      }),
    );
    expect(nodeById(g, 'input.narrow')?.status).toBe('active');
  });

  it('hidden when not set', () => {
    const g = computeWorkflowGraph(makeState({ values: { use_carafe: false } }));
    expect(nodeById(g, 'input.narrow')).toBeUndefined();
  });
});

describe('computeWorkflowGraph — edge integrity', () => {
  it('every edge endpoint resolves to a node', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: true,
          'carafe.source': 'dir',
          'carafe.spectra_dir': '/dda',
          fasta: '/db.fasta',
          quant_spectra_dir: { kind: 'single', path: '/wide.mzML' },
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
