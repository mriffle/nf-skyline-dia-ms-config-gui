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
  it('spectra is required-missing and FASTA is required-missing', () => {
    const g = computeWorkflowGraph(makeState({ values: { use_carafe: false } }));
    expect(nodeById(g, 'input.spectra')?.status).toBe('required-missing');
    expect(nodeById(g, 'input.fasta')?.status).toBe('required-missing');
  });

  it('only the selected DIA-NN engine appears; other engines are omitted', () => {
    const g = computeWorkflowGraph(makeState({ values: { use_carafe: false } }));
    expect(nodeById(g, 'process.diann')?.status).toBe('active');
    expect(nodeById(g, 'process.encyclopedia')).toBeUndefined();
    expect(nodeById(g, 'process.cascadia')).toBeUndefined();
    expect(nodeById(g, 'output.encyclopedia-results')).toBeUndefined();
    expect(nodeById(g, 'output.cascadia-results')).toBeUndefined();
    expect(nodeById(g, 'output.cascadia-fasta')).toBeUndefined();
  });

  it('always includes prepare-spectra, prepared-spectra output, and Skyline build', () => {
    const g = computeWorkflowGraph(makeState({ values: { use_carafe: false } }));
    expect(nodeById(g, 'process.prepare-spectra')).toBeDefined();
    expect(nodeById(g, 'output.prepared-spectra')).toBeDefined();
    expect(nodeById(g, 'process.skyline')).toBeDefined();
  });

  it('Skyline template appears as active with "Default template" label when unset', () => {
    const g = computeWorkflowGraph(makeState({ values: { use_carafe: false } }));
    const tmpl = nodeById(g, 'input.skyline-template');
    expect(tmpl?.status).toBe('active');
    expect(tmpl?.label).toBe('Default template');
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

  it('library is omitted entirely for DIA-NN when unset (it is optional)', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          fasta: '/db.fasta',
          quant_spectra_dir: { kind: 'single', path: '/data/wide.mzML' },
        },
      }),
    );
    expect(nodeById(g, 'input.library')).toBeUndefined();
  });

  it('library appears as active for DIA-NN when user has set one', () => {
    const g = computeWorkflowGraph(
      makeState({
        values: {
          use_carafe: false,
          spectral_library: '/libs/human.dlib',
        },
      }),
    );
    expect(nodeById(g, 'input.library')?.status).toBe('active');
  });
});

describe('computeWorkflowGraph — EncyclopeDIA selected', () => {
  it('library required-missing; only encyclopedia process present', () => {
    const g = computeWorkflowGraph(
      makeState({ values: { use_carafe: false, search_engine: 'encyclopedia' } }),
    );
    expect(nodeById(g, 'input.library')?.status).toBe('required-missing');
    expect(nodeById(g, 'process.encyclopedia')?.status).toBe('active');
    expect(nodeById(g, 'process.diann')).toBeUndefined();
    expect(nodeById(g, 'process.cascadia')).toBeUndefined();
  });
});

describe('computeWorkflowGraph — Cascadia selected', () => {
  it('FASTA hidden, library hidden, only Cascadia present, generated FASTA output present', () => {
    const g = computeWorkflowGraph(
      makeState({ values: { use_carafe: false, search_engine: 'cascadia' } }),
    );
    expect(nodeById(g, 'input.fasta')).toBeUndefined();
    expect(nodeById(g, 'input.library')).toBeUndefined();
    expect(nodeById(g, 'process.cascadia')?.status).toBe('active');
    expect(nodeById(g, 'process.diann')).toBeUndefined();
    expect(nodeById(g, 'process.encyclopedia')).toBeUndefined();
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
  it('Carafe process and input nodes appear; user-library node is omitted', () => {
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
    expect(nodeById(g, 'input.library')).toBeUndefined();
    expect(hasEdge(g, 'output.carafe-library', 'process.diann')).toBe(true);
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
});

describe('computeWorkflowGraph — replicate metadata', () => {
  it('hidden when unset', () => {
    const g = computeWorkflowGraph(makeState({ values: { use_carafe: false } }));
    expect(nodeById(g, 'input.replicate-metadata')).toBeUndefined();
  });

  it('appears as active when set', () => {
    const g = computeWorkflowGraph(
      makeState({ values: { use_carafe: false, replicate_metadata: '/meta.tsv' } }),
    );
    expect(nodeById(g, 'input.replicate-metadata')?.status).toBe('active');
  });
});

describe('computeWorkflowGraph — skyr report definitions', () => {
  it('skyr input and Skyline-reports process are both hidden when skyr unset', () => {
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

describe('computeWorkflowGraph — msconvert_only', () => {
  it('only spectra → prepare → prepared-spectra remain; everything else gone', () => {
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
    expect(nodeById(g, 'input.fasta')).toBeUndefined();
    expect(nodeById(g, 'input.library')).toBeUndefined();
    expect(nodeById(g, 'input.skyline-template')).toBeUndefined();
    expect(nodeById(g, 'process.diann')).toBeUndefined();
    expect(nodeById(g, 'process.encyclopedia')).toBeUndefined();
    expect(nodeById(g, 'process.cascadia')).toBeUndefined();
    expect(nodeById(g, 'process.skyline')).toBeUndefined();
    expect(nodeById(g, 'process.qc-report')).toBeUndefined();
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
  it('removes Skyline document, all reports, and Skyline-only inputs', () => {
    const g = computeWorkflowGraph(
      makeState({ values: { use_carafe: false, 'skyline.skip': true } }),
    );
    expect(nodeById(g, 'process.skyline')).toBeUndefined();
    expect(nodeById(g, 'output.skyline-doc')).toBeUndefined();
    expect(nodeById(g, 'process.qc-report')).toBeUndefined();
    expect(nodeById(g, 'process.batch-report')).toBeUndefined();
    expect(nodeById(g, 'process.skyline-reports')).toBeUndefined();
    expect(nodeById(g, 'input.skyline-template')).toBeUndefined();
    expect(nodeById(g, 'input.skyr')).toBeUndefined();
    expect(nodeById(g, 'input.replicate-metadata')).toBeUndefined();
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

describe('computeWorkflowGraph — node-status invariant', () => {
  it('every node is either "active" or "required-missing"', () => {
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
    for (const n of g.nodes) {
      expect(['active', 'required-missing']).toContain(n.status);
    }
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
