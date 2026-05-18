// Wizard flow definitions. Each screen declares its identity, whether it
// applies given the current state (shouldShow), and whether the user can
// advance from it (canAdvance). The wizard container computes the active
// subset of screens by filtering on shouldShow.
//
// Screens that don't apply to the user's choices (e.g. the FASTA screen
// for Cascadia, the Carafe-input screen when Carafe is off) drop out of
// the flow entirely — they are not shown, not counted in the progress
// strip, and clicking Back/Next skips them.

import type { ComponentType } from 'react';
import type { FormState } from '../../params/paramMetadata';
import { ModeScreen, modeCanAdvance } from './screens/ModeScreen';
import { InputDataScreen, inputDataCanAdvance } from './screens/InputDataScreen';
import { ConversionOnlyScreen } from './screens/ConversionOnlyScreen';
import {
  InputFormatScreen,
  inputFormatCanAdvance,
} from './screens/InputFormatScreen';
import { VendorRawScreen } from './screens/VendorRawScreen';
import { SearchEngineScreen, searchEngineCanAdvance } from './screens/SearchEngineScreen';
import { FastaScreen, fastaCanAdvance } from './screens/FastaScreen';
import {
  LibraryStrategyScreen,
  libraryStrategyCanAdvance,
} from './screens/LibraryStrategyScreen';
import {
  CarafeInputScreen,
  carafeInputCanAdvance,
} from './screens/CarafeInputScreen';
import { EmpiricalLibraryScreen } from './screens/EmpiricalLibraryScreen';
import { SkylineScreen } from './screens/SkylineScreen';
import { ReplicateMetadataScreen } from './screens/ReplicateMetadataScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { PanoramaScreen, panoramaCanAdvance } from './screens/PanoramaScreen';
import { ExecutionScreen } from './screens/ExecutionScreen';
import { ReviewScreen } from './screens/ReviewScreen';

export type WizardScreenId =
  | 'mode'
  | 'input'
  | 'conversion-only'
  | 'input-format'
  | 'vendor-raw'
  | 'engine'
  | 'fasta'
  | 'library-strategy'
  | 'carafe-input'
  | 'empirical-library'
  | 'skyline'
  | 'replicate-metadata'
  | 'reports'
  | 'panorama'
  | 'execution'
  | 'review';

export interface WizardScreen {
  readonly id: WizardScreenId;
  readonly title: string;
  // Short label for the progress strip.
  readonly shortLabel: string;
  // Whether this screen is part of the active flow given the user's state.
  readonly shouldShow: (state: FormState) => boolean;
  // Whether the user can advance from this screen given the current state.
  // Undefined = always advanceable.
  readonly canAdvance?: (state: FormState) => boolean;
  readonly Component: ComponentType;
}

// --- Predicate helpers ---------------------------------------------------

const isGeneral = (s: FormState): boolean => s.mode === 'general';
const isPdc = (s: FormState): boolean => s.mode === 'pdc';
const isMsconvertOnly = (s: FormState): boolean => s.values['msconvert_only'] === true;
const isCarafeEnabled = (s: FormState): boolean => s.values['use_carafe'] === true;
const isSkylineSkipped = (s: FormState): boolean => s.values['skyline.skip'] === true;

function readSearchEngine(state: FormState): string | null {
  const v = state.values['search_engine'];
  if (v === null) return null;
  if (typeof v !== 'string') return null;
  return v.toLowerCase();
}

const isCascadia = (s: FormState): boolean => readSearchEngine(s) === 'cascadia';

const isRawFormat = (s: FormState): boolean =>
  s.values['quant_input_format'] === 'raw';

// --- Screen catalog ------------------------------------------------------

export const wizardScreens: readonly WizardScreen[] = [
  {
    id: 'mode',
    title: 'Where are your spectra?',
    shortLabel: 'Mode',
    shouldShow: () => true,
    canAdvance: modeCanAdvance,
    Component: ModeScreen,
  },
  {
    id: 'input',
    title: 'Input data',
    shortLabel: 'Inputs',
    shouldShow: () => true,
    canAdvance: inputDataCanAdvance,
    Component: InputDataScreen,
  },
  {
    id: 'conversion-only',
    title: 'What do you want to do?',
    shortLabel: 'Workflow scope',
    shouldShow: () => true,
    Component: ConversionOnlyScreen,
  },
  {
    id: 'input-format',
    title: 'Spectra file format',
    shortLabel: 'File format',
    shouldShow: () => true,
    canAdvance: inputFormatCanAdvance,
    Component: InputFormatScreen,
  },
  {
    id: 'vendor-raw',
    title: 'Vendor RAW handling',
    shortLabel: 'Vendor RAW',
    // Only shown for Thermo .raw inputs. .d.zip is unzipped (no msconvert),
    // mzML is used as-is.
    shouldShow: (s) => !isMsconvertOnly(s) && isRawFormat(s),
    Component: VendorRawScreen,
  },
  {
    id: 'engine',
    title: 'Search engine',
    shortLabel: 'Engine',
    shouldShow: (s) => !isMsconvertOnly(s),
    canAdvance: searchEngineCanAdvance,
    Component: SearchEngineScreen,
  },
  {
    id: 'fasta',
    title: 'Background FASTA',
    shortLabel: 'FASTA',
    shouldShow: (s) => !isMsconvertOnly(s) && !isCascadia(s),
    canAdvance: fastaCanAdvance,
    Component: FastaScreen,
  },
  {
    id: 'library-strategy',
    title: 'Spectral library',
    shortLabel: 'Library',
    shouldShow: (s) => !isMsconvertOnly(s) && !isCascadia(s),
    canAdvance: libraryStrategyCanAdvance,
    Component: LibraryStrategyScreen,
  },
  {
    id: 'carafe-input',
    title: 'Carafe input',
    shortLabel: 'Carafe input',
    shouldShow: (s) => !isMsconvertOnly(s) && !isCascadia(s) && isCarafeEnabled(s),
    canAdvance: carafeInputCanAdvance,
    Component: CarafeInputScreen,
  },
  {
    id: 'empirical-library',
    title: 'Empirical library',
    shortLabel: 'Empirical lib',
    // Cascadia ignores empirical-library spectra; PDC mode doesn't expose
    // narrow inputs in the form today.
    shouldShow: (s) =>
      !isMsconvertOnly(s) && !isCascadia(s) && isGeneral(s),
    Component: EmpiricalLibraryScreen,
  },
  {
    id: 'skyline',
    title: 'Skyline document',
    shortLabel: 'Skyline',
    shouldShow: (s) => !isMsconvertOnly(s),
    Component: SkylineScreen,
  },
  {
    id: 'replicate-metadata',
    title: 'Replicate metadata',
    shortLabel: 'Metadata',
    shouldShow: (s) =>
      !isMsconvertOnly(s) && !isSkylineSkipped(s) && isGeneral(s),
    Component: ReplicateMetadataScreen,
  },
  {
    id: 'reports',
    title: 'QC and batch reports',
    shortLabel: 'Reports',
    shouldShow: (s) => !isMsconvertOnly(s) && !isSkylineSkipped(s),
    Component: ReportsScreen,
  },
  {
    id: 'panorama',
    title: 'Panorama upload',
    shortLabel: 'Panorama',
    shouldShow: () => true,
    canAdvance: panoramaCanAdvance,
    Component: PanoramaScreen,
  },
  {
    id: 'execution',
    title: 'Execution and output',
    shortLabel: 'Execution',
    shouldShow: () => true,
    Component: ExecutionScreen,
  },
  {
    id: 'review',
    title: 'Review your config',
    shortLabel: 'Review',
    shouldShow: () => true,
    Component: ReviewScreen,
  },
];

// Excludes review from "configuration screens"; review is terminal.
export const visibleWizardScreens = (state: FormState): readonly WizardScreen[] =>
  wizardScreens.filter((s) => s.shouldShow(state));

// Convenience predicates exported so screens can match the flow's logic.
export const wizardPredicates = {
  isGeneral,
  isPdc,
  isMsconvertOnly,
  isCarafeEnabled,
  isSkylineSkipped,
  isCascadia,
  isRawFormat,
  readSearchEngine,
};
