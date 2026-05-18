// Helpers for classifying the format of spectra inputs based on their
// paths (and optional glob filters). Used by both the workflow-graph
// builder and the wizard's Input format screen.
//
// "uncertain" means a path we couldn't classify (e.g. a directory path
// with no glob/regex). Downstream code that wants to be safe should
// treat uncertain as "might be raw" since RAW is the case that triggers
// msconvert.

export type SpectraExt = 'raw' | 'mzml' | 'dzip';

export interface SpectraTypeFacts {
  readonly hasRaw: boolean;
  readonly hasMzml: boolean;
  readonly hasDzip: boolean;
  readonly uncertain: boolean;
  readonly empty: boolean;
}

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

export function detectExt(path: string): SpectraExt | null {
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

export function classifyPath(
  path: string,
  fallbackGlob: unknown,
): SpectraExt | 'uncertain' {
  const direct = detectExt(path);
  if (direct) return direct;
  const isFileLike = looksLikePath(path) && /\.[a-z0-9]+$/i.test(path);
  if (isFileLike) return 'uncertain';
  const fromGlob = detectFromGlob(fallbackGlob);
  return fromGlob ?? 'uncertain';
}

export function emptyFacts(): SpectraTypeFacts {
  return {
    hasRaw: false,
    hasMzml: false,
    hasDzip: false,
    uncertain: false,
    empty: true,
  };
}

export function factsFromPaths(
  paths: readonly string[],
  fallbackGlob: unknown,
): SpectraTypeFacts {
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

// Read the (possibly tagged-union) quant_spectra_dir value and produce
// facts. Mirrors the wizard's quant-spectra widget exactly.
export function factsForQuantSpectra(
  quantSpectraDir: unknown,
  quantSpectraGlob: unknown,
): SpectraTypeFacts {
  if (quantSpectraDir === null || typeof quantSpectraDir !== 'object') {
    return emptyFacts();
  }
  const u = quantSpectraDir as {
    kind?: unknown;
    path?: unknown;
    paths?: unknown;
    entries?: unknown;
  };
  if (u.kind === 'single' && isNonEmptyString(u.path)) {
    return factsFromPaths([u.path], quantSpectraGlob);
  }
  if (u.kind === 'list' && Array.isArray(u.paths)) {
    const paths = u.paths.filter(
      (p): p is string => typeof p === 'string' && p.length > 0,
    );
    return factsFromPaths(paths, quantSpectraGlob);
  }
  if (u.kind === 'batch-map' && Array.isArray(u.entries)) {
    const paths = u.entries
      .map((e): string | null => {
        if (e === null || typeof e !== 'object') return null;
        const r = e as { path?: unknown };
        return isNonEmptyString(r.path) ? r.path : null;
      })
      .filter((p): p is string => p !== null);
    return factsFromPaths(paths, quantSpectraGlob);
  }
  return emptyFacts();
}

// Pick the single dominant format from facts (if any). Returns null when
// facts are empty, mixed, or fully uncertain — callers should ask the
// user to choose in those cases.
export function dominantFormat(facts: SpectraTypeFacts): SpectraExt | null {
  if (facts.empty) return null;
  const set: SpectraExt[] = [];
  if (facts.hasRaw) set.push('raw');
  if (facts.hasMzml) set.push('mzml');
  if (facts.hasDzip) set.push('dzip');
  if (set.length !== 1) return null;
  if (facts.uncertain) return null;
  return set[0] ?? null;
}
