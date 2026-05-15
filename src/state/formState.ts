import type { FormState, Mode } from '../params/paramMetadata';
import type { SectionId } from '../params/paramMetadata';

export interface StoreState extends FormState {
  readonly showAdvanced: boolean;
  readonly activeSection: SectionId | null;
  readonly storeVersion: number;
}

// Bump when the default-state shape changes in a way that should reset
// existing persisted drafts.
//   v2: Carafe defaults to enabled.
//   v3: search_engine pre-seeded to 'diann' (paired with alwaysEmit).
//   v4: qc_report.skip / batch_report.skip pre-seeded so the toggles reflect
//       their effective defaults from first render.
//   v5: skyline.group_proteins pre-seeded to true to match the new
//       defaultOverride (builder ships a "group by default" stance).
export const CURRENT_STORE_VERSION = 5;

export const createDefaultState = (): StoreState => ({
  mode: 'general',
  // Carafe is the recommended path; default it to enabled. The user can turn
  // it off via the "Generate a library with Carafe" toggle.
  //
  // search_engine is pre-seeded so the validator and required-field logic
  // see a real value from first render (rather than undefined). The
  // matching ParamMeta has `alwaysEmit: true`, so this value is also
  // written to the generated config even if the user never touches it.
  //
  // qc_report.skip is pre-seeded to false (and alwaysEmit) so the builder
  // ships a "run QC by default" stance that overrides the upstream schema
  // default of true. batch_report.skip is pre-seeded to true to match the
  // upstream default — the seed only exists so the toggle and dependent
  // enabledWhen predicates reflect that default on first render.
  values: {
    use_carafe: true,
    search_engine: 'diann',
    'qc_report.skip': false,
    'batch_report.skip': true,
    'skyline.group_proteins': true,
  },
  touched: {},
  showAdvanced: false,
  activeSection: null,
  storeVersion: CURRENT_STORE_VERSION,
});

export type { Mode };
