// Top-level validation entry point. Combines the per-field schema
// checks (only on touched, visible fields) with the cross-field rule
// list to produce a single ValidationReport.

import type { FormState } from '../params/paramMetadata';
import { paramMetadata, IGNORED_PARAM_PATHS } from '../params/paramMetadata';
import { validateField } from './fieldSchemas';
import { crossFieldRules } from './crossFieldRules';
import type { CrossFieldIssue, ValidationReport } from './types';

function isVisible(
  meta: (typeof paramMetadata)[number],
  s: FormState,
): boolean {
  return meta.visibleWhen ? meta.visibleWhen(s) : true;
}

export function runValidation(state: FormState): ValidationReport {
  // --- Per-field --------------------------------------------------------
  const fieldErrors: Record<string, string | undefined> = {};
  for (const meta of paramMetadata) {
    if (IGNORED_PARAM_PATHS.has(meta.path)) continue;
    if (!isVisible(meta, state)) continue;
    if (state.touched[meta.path] !== true) continue;
    if (!(meta.path in state.values)) continue;
    const msg = validateField(meta, state.values[meta.path]);
    if (msg !== undefined) {
      fieldErrors[meta.path] = msg;
    }
  }

  // --- Cross-field ------------------------------------------------------
  const crossFieldIssues: CrossFieldIssue[] = [];
  for (const rule of crossFieldRules) {
    const result = rule.check(state);
    if (result === null) continue;
    crossFieldIssues.push({
      ruleId: rule.id,
      severity: rule.severity,
      message: result.message,
      fields: result.fields,
    });
  }

  // --- Aggregate --------------------------------------------------------
  const hasFieldError = Object.keys(fieldErrors).length > 0;
  const hasCrossFieldError = crossFieldIssues.some((i) => i.severity === 'error');
  const isValid = !hasFieldError && !hasCrossFieldError;
  const isDownloadable = isValid;

  return {
    fieldErrors,
    crossFieldIssues,
    isValid,
    isDownloadable,
  };
}
