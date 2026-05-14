// Hook: subscribe to a single param path's value + touched flag.

import { useStore } from '../state/store';

export interface FieldValue {
  readonly value: unknown;
  readonly touched: boolean;
  readonly hasValue: boolean;
}

export function useFieldValue(path: string): FieldValue {
  const value = useStore((s) => s.values[path]);
  const touched = useStore((s) => s.touched[path] === true);
  const hasValue = useStore((s) => path in s.values);
  return { value, touched, hasValue };
}
