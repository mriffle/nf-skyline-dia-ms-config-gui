// Public types for the validation engine.
//
// The validation report is consumed by:
//   * the inline error UI (Phase 5) — `fieldErrors[path]` is the message
//     to show next to the field; `crossFieldIssues` are rendered as a
//     dedicated panel with severity colors and field-target chips.
//   * the download-enabled gate (Phase 6) — `isDownloadable` mirrors
//     `isValid` and gates the "download .config" button.
//
// Field-level errors are only produced for *touched* fields. Untouched
// missing-but-required fields are surfaced exclusively via cross-field
// rules so the user never sees red text for a field they have not yet
// interacted with.

export interface FieldError {
  readonly path: string;
  readonly message: string;
}

export interface CrossFieldIssue {
  readonly ruleId: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  // Real-or-virtual param paths the UI can scroll to / highlight when
  // the user clicks the issue in the panel.
  readonly fields: readonly string[];
}

export interface ValidationReport {
  // Map of param path -> error message. Only includes paths with a
  // current error. Lookups for non-erroring paths return undefined.
  readonly fieldErrors: Readonly<Record<string, string | undefined>>;
  readonly crossFieldIssues: readonly CrossFieldIssue[];
  // True iff there are no field errors AND no error-severity cross-field
  // issues. Warnings do not block downloadability.
  readonly isValid: boolean;
  // Currently a strict mirror of isValid; kept as a separate field so
  // the Phase 6 download gate can evolve independently of the
  // form-validity surface (e.g. additional "safe to emit" checks).
  readonly isDownloadable: boolean;
}
