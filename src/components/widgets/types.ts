// Shared widget prop contract. Every concrete widget component accepts
// the same shape so Field.tsx can dispatch generically.

import type { ParamMeta } from '../../params/paramMetadata';

export interface WidgetProps {
  readonly meta: ParamMeta;
  readonly value: unknown;
  readonly onChange: (v: unknown) => void;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly error?: string;
  readonly inputId: string;
}

export const inputClass =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm ' +
  'text-slate-900 placeholder:text-slate-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500 ' +
  'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed';

export const errorInputClass =
  'block w-full rounded-md border border-red-400 bg-white px-3 py-2 text-sm ' +
  'text-slate-900 placeholder:text-slate-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 ' +
  'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed';

export function inputClassFor(error?: string): string {
  return error ? errorInputClass : inputClass;
}
