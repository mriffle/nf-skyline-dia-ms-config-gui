import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Mode, SectionId } from '../params/paramMetadata';
import { paramMetadata, type FormState } from '../params/paramMetadata';
import {
  CURRENT_STORE_VERSION,
  createDefaultState,
  type StoreState,
} from './formState';

export const STORAGE_KEY = 'nf-skyline-dia-ms.config-builder.v1';

export interface StoreActions {
  setValue: (path: string, value: unknown) => void;
  clearValue: (path: string) => void;
  setMode: (mode: Mode) => void;
  toggleAdvanced: () => void;
  setShowAdvanced: (show: boolean) => void;
  setActiveSection: (id: SectionId | null) => void;
  reset: () => void;
  // Replace form state with the result of an upload. Bypasses setMode's
  // mode-change clearing because the loaded state is already coherent
  // for its target mode. Layers loaded values on top of createDefaultState
  // seeds so paths the file doesn't mention still read as defaults.
  loadFromConfig: (loaded: FormState) => void;
}

export type Store = StoreState & StoreActions;

const isVisible = (
  meta: (typeof paramMetadata)[number],
  state: FormState
): boolean => (meta.visibleWhen ? meta.visibleWhen(state) : true);

const collectClearTargets = (oldState: FormState, newState: FormState): string[] => {
  const targets = new Set<string>();
  for (const meta of paramMetadata) {
    if (!isVisible(meta, oldState)) continue;
    if (isVisible(meta, newState)) continue;
    if (meta.virtual && meta.affects) {
      for (const path of meta.affects) targets.add(path);
      targets.add(meta.path);
    } else {
      targets.add(meta.path);
    }
  }
  return [...targets];
};

const withoutKeys = <T,>(obj: Record<string, T>, keys: string[]): Record<string, T> => {
  if (keys.length === 0) return obj;
  const next = { ...obj };
  for (const k of keys) delete next[k];
  return next;
};

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...createDefaultState(),

      setValue: (path, value) =>
        set((s) => ({
          values: { ...s.values, [path]: value },
          touched: { ...s.touched, [path]: true },
        })),

      clearValue: (path) =>
        set((s) => ({
          values: withoutKeys(s.values, [path]),
          touched: withoutKeys(s.touched, [path]),
        })),

      setMode: (mode) => {
        const current = get();
        if (current.mode === mode) return;
        const oldState: FormState = {
          mode: current.mode,
          values: current.values,
          touched: current.touched,
        };
        const trialState: FormState = { ...oldState, mode };
        const toClear = [...collectClearTargets(oldState, trialState)];
        // carafe.source stays visible across modes, but its PDC-only options
        // (pdc-files / pdc-sample) are not rendered in general mode. Drop the
        // selected value if it would no longer be available.
        if (mode === 'general') {
          const src = current.values['carafe.source'];
          if (src === 'pdc-files' || src === 'pdc-sample') {
            toClear.push('carafe.source');
          }
        }
        set({
          mode,
          values: withoutKeys(current.values, toClear),
          touched: withoutKeys(current.touched, toClear),
        });
      },

      toggleAdvanced: () => set((s) => ({ showAdvanced: !s.showAdvanced })),
      setShowAdvanced: (show) => set({ showAdvanced: show }),
      setActiveSection: (id) => set({ activeSection: id }),

      // Zustand's set merges with current state, so we must explicitly
      // clear preservedOuterText (which isn't a field on createDefaultState)
      // to ensure an uploaded outer-block bundle gets wiped on Reset.
      reset: () => set({ ...createDefaultState(), preservedOuterText: undefined }),

      loadFromConfig: (loaded) => {
        const baseline = createDefaultState();
        set({
          mode: loaded.mode,
          values: { ...baseline.values, ...loaded.values },
          touched: loaded.touched,
          preservedOuterText: loaded.preservedOuterText,
          // Reset transient navigation so the form scrolls to the top.
          // showAdvanced is intentionally preserved — it's a UI density
          // preference, not config state.
          activeSection: null,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      version: CURRENT_STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        mode: s.mode,
        values: s.values,
        touched: s.touched,
        preservedOuterText: s.preservedOuterText,
        showAdvanced: s.showAdvanced,
        activeSection: s.activeSection,
        storeVersion: s.storeVersion,
      }),
      migrate: (persisted, version) => {
        if (version !== CURRENT_STORE_VERSION) {
          return createDefaultState();
        }
        return persisted as StoreState;
      },
    }
  )
);

export const previewClearTargetsForModeChange = (
  current: FormState,
  newMode: Mode
): string[] => {
  if (current.mode === newMode) return [];
  return collectClearTargets(current, { ...current, mode: newMode });
};
