import type { FormState } from '../../../params/paramMetadata';
import { Field } from '../../form/Field';

export function FastaScreen() {
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Both DIA-NN and EncyclopeDIA search against a background protein
        database. Provide a local FASTA path or a Panorama URL.
      </p>
      <Field path="fasta" />
    </div>
  );
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

export function fastaCanAdvance(state: FormState): boolean {
  return isNonEmptyString(state.values['fasta']);
}
