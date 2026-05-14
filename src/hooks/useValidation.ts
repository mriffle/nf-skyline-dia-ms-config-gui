// Hook: memoized validation report derived from store state.

import { useMemo } from 'react';
import { useStore } from '../state/store';
import { runValidation } from '../validation/runValidation';
import type { ValidationReport } from '../validation/types';

export function useValidation(): ValidationReport {
  const mode = useStore((s) => s.mode);
  const values = useStore((s) => s.values);
  const touched = useStore((s) => s.touched);
  return useMemo(
    () => runValidation({ mode, values, touched }),
    [mode, values, touched],
  );
}

export function useFormState(): {
  readonly mode: ReturnType<typeof useStore.getState>['mode'];
  readonly values: Record<string, unknown>;
  readonly touched: Record<string, boolean>;
} {
  const mode = useStore((s) => s.mode);
  const values = useStore((s) => s.values);
  const touched = useStore((s) => s.touched);
  return { mode, values, touched };
}
