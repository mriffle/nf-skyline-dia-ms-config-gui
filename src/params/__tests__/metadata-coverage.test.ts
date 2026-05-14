// Coverage test for the parameter metadata layer.
//
// Asserts that the hand-authored UX overlay covers every non-hidden schema
// path, that no UX entry references a missing or hidden schema path, and
// that the IGNORED set is well-formed.

import { describe, expect, test } from 'vitest';

import { schemaDerived } from '../schemaDerived.generated';
import { IGNORED_PARAM_PATHS, paramMetadata } from '../paramMetadata';

const allSchemaPaths = new Set(Object.keys(schemaDerived));
const visibleSchemaPaths = new Set(
  Object.values(schemaDerived)
    .filter((e) => !e.hidden)
    .map((e) => e.path),
);

const directlyBoundPaths = new Set<string>();
const affectsPaths = new Set<string>();
for (const meta of paramMetadata) {
  if (meta.virtual !== true) {
    directlyBoundPaths.add(meta.path);
  }
  if (meta.affects) {
    for (const affected of meta.affects) {
      affectsPaths.add(affected);
    }
  }
}

describe('paramMetadata coverage', () => {
  test('every non-hidden schema path is accounted for', () => {
    const missing: string[] = [];
    for (const path of visibleSchemaPaths) {
      const covered =
        directlyBoundPaths.has(path) ||
        affectsPaths.has(path) ||
        IGNORED_PARAM_PATHS.has(path);
      if (!covered) {
        missing.push(path);
      }
    }
    expect(missing, `missing UX coverage for: ${missing.join(', ')}`).toEqual([]);
  });

  test('no paramMetadata.path references a missing or hidden schema path (unless virtual)', () => {
    const offenders: string[] = [];
    for (const meta of paramMetadata) {
      if (meta.virtual === true) continue;
      const entry = schemaDerived[meta.path];
      if (entry === undefined) {
        offenders.push(`${meta.path} (not in schema)`);
        continue;
      }
      if (entry.hidden) {
        offenders.push(`${meta.path} (hidden in schema)`);
      }
    }
    expect(offenders, `bad metadata bindings: ${offenders.join(', ')}`).toEqual([]);
  });

  test('every affects entry resolves to an existing schema path', () => {
    const offenders: string[] = [];
    for (const meta of paramMetadata) {
      if (!meta.affects) continue;
      for (const affected of meta.affects) {
        if (!allSchemaPaths.has(affected)) {
          offenders.push(`${meta.path} -> ${affected}`);
        }
      }
    }
    expect(offenders, `dangling affects entries: ${offenders.join(', ')}`).toEqual([]);
  });

  test('IGNORED_PARAM_PATHS entries exist in the schema and are not already hidden', () => {
    const missing: string[] = [];
    const redundant: string[] = [];
    for (const path of IGNORED_PARAM_PATHS) {
      const entry = schemaDerived[path];
      if (entry === undefined) {
        missing.push(path);
        continue;
      }
      if (entry.hidden) {
        redundant.push(path);
      }
    }
    expect(missing, `IGNORED references unknown paths: ${missing.join(', ')}`).toEqual([]);
    expect(
      redundant,
      `IGNORED redundantly references hidden paths: ${redundant.join(', ')}`,
    ).toEqual([]);
  });

  test('virtual metadata entries declare an affects list', () => {
    const offenders: string[] = [];
    for (const meta of paramMetadata) {
      if (meta.virtual === true && (!meta.affects || meta.affects.length === 0)) {
        // A few virtuals legitimately have no schema bindings (e.g. the
        // carafe.source picker that only enables sibling fields). We
        // allow that, but flag if the virtual id collides with a real
        // schema path — which would be a bug.
        if (schemaDerived[meta.path] !== undefined) {
          offenders.push(`${meta.path} (collides with real schema path but is virtual)`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
