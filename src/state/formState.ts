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
export const CURRENT_STORE_VERSION = 3;

export const createDefaultState = (): StoreState => ({
  mode: 'general',
  // Carafe is the recommended path; default it to enabled. The user can turn
  // it off via the "Generate a library with Carafe" toggle.
  //
  // search_engine is pre-seeded so the validator and required-field logic
  // see a real value from first render (rather than undefined). The
  // matching ParamMeta has `alwaysEmit: true`, so this value is also
  // written to the generated config even if the user never touches it.
  values: { use_carafe: true, search_engine: 'diann' },
  touched: {},
  showAdvanced: false,
  activeSection: null,
  storeVersion: CURRENT_STORE_VERSION,
});

export type { Mode };
