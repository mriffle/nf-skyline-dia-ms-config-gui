// "Load config…" header button + hidden file input + the dialog
// lifecycle. Reads the file in the browser, runs:
//   well-formedness check → parse → map
// then either shows the preview dialog (success path) or the error dialog
// (well-formedness failure / no params block / hard parse failure).
//
// The well-formedness check is a hard gate: if any syntactic issue is
// reported, we DO NOT attempt to load partial state. Letting a recovered
// parse through would silently drop whatever the lexer/parser couldn't
// reach past, leaving the user with a half-loaded form and no signal that
// anything went wrong.

import { useRef, useState, type ChangeEvent } from 'react';
import { useStore } from '../../state/store';
import { mapToState, type MapResult } from '../../parse/mapToState';
import { parseConfig } from '../../parse/parseConfig';
import type { ParseResult } from '../../parse/types';
import { checkWellFormedness } from '../../parse/wellFormedness';
import { UploadDialog } from './UploadDialog';
import { UploadErrorDialog, type UploadErrorVariant } from './UploadErrorDialog';

// Read a File as text using FileReader. We use FileReader rather than
// File.prototype.text() because the latter isn't available in older
// browsers — and in jsdom across the test runner versions we support.
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === 'string') resolve(r);
      else reject(new Error('Unexpected FileReader result type'));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error('File read failed'));
    reader.readAsText(file);
  });
}

interface PendingPreview {
  readonly fileName: string;
  readonly parsed: ParseResult;
  readonly mapped: MapResult;
  readonly confirmReplace: boolean;
}

interface PendingError {
  readonly fileName: string;
  readonly variant: UploadErrorVariant;
  // Stash the file text alongside the error so the "Import" bypass on
  // the syntax-errors variant can re-run the rest of the pipeline
  // without re-reading the file from disk. undefined when the error
  // came from a file-read failure (nothing to resume from).
  readonly sourceText?: string;
}

function LoadIcon() {
  // Document with up-arrow — load a file from disk into the app.
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 2.75h6.25L15 6.5v10.75a.75.75 0 0 1-.75.75H5.75a.75.75 0 0 1-.75-.75V3.5a.75.75 0 0 1 .75-.75Z" />
      <path d="M11 2.75V6.5H15" />
      <path d="M10 14.25V9" />
      <path d="M7.75 11.25 10 9l2.25 2.25" />
    </svg>
  );
}

export function UploadControl() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PendingPreview | null>(null);
  const [error, setError] = useState<PendingError | null>(null);

  const loadFromConfig = useStore((s) => s.loadFromConfig);

  const triggerPicker = (): void => {
    inputRef.current?.click();
  };

  const onFileSelected = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected if the user cancels.
    e.target.value = '';
    if (!file) return;

    let text: string;
    try {
      text = await readFileAsText(file);
    } catch (readErr) {
      setError({
        fileName: file.name,
        variant: {
          kind: 'no-params-block',
          hadParamsBlock: false,
          errors: [
            {
              line: 0,
              col: 0,
              message:
                readErr instanceof Error
                  ? readErr.message
                  : 'Could not read file.',
            },
          ],
        },
      });
      return;
    }

    // Pre-flight: gate the upload on syntactic well-formedness. Partial
    // parses (where the lexer or parser recovers from a typo and
    // silently drops the surrounding context) would otherwise load only
    // the salvageable entries — and the user would never know the rest
    // of the file was eaten by recovery. The dialog offers an "Import"
    // bypass so a false positive in our checker isn't a hard block;
    // see runParseAndPreview below.
    const wf = checkWellFormedness(text);
    if (!wf.isWellFormed) {
      setError({
        fileName: file.name,
        variant: { kind: 'syntax-errors', issues: wf.issues },
        sourceText: text,
      });
      return;
    }

    runParseAndPreview(file.name, text);
  };

  // Post-gate pipeline. Extracted so the "Import" bypass can resume
  // from here using the stashed file text without re-reading the file
  // (which would also re-fire the well-formedness check).
  const runParseAndPreview = (fileName: string, text: string): void => {
    const parsed = parseConfig(text);
    if (!parsed.hadParamsBlock || parsed.entries.length === 0) {
      setError({
        fileName,
        variant: {
          kind: 'no-params-block',
          hadParamsBlock: parsed.hadParamsBlock,
          errors:
            parsed.errors.length > 0
              ? parsed.errors
              : [
                  {
                    line: 0,
                    col: 0,
                    message: parsed.hadParamsBlock
                      ? 'The params { } block contained no parameters.'
                      : 'No params { } block was found.',
                  },
                ],
        },
      });
      return;
    }
    const mapped = mapToState(parsed.entries, parsed.preservedOuterBlocks);
    const current = useStore.getState();
    const confirmReplace = Object.values(current.touched).some((v) => v === true);
    setPreview({ fileName, parsed, mapped, confirmReplace });
  };

  const onConfirm = (): void => {
    if (!preview) return;
    loadFromConfig(preview.mapped.state);
    setPreview(null);
  };

  const onCancel = (): void => {
    setPreview(null);
  };

  const onCloseError = (): void => {
    setError(null);
  };

  // Bypass for the syntax-errors variant: resume the upload pipeline
  // against the stashed file text. Useful when the well-formedness
  // check has a false positive on a file the user knows is correct.
  const onProceedAnyway = (): void => {
    if (!error || error.variant.kind !== 'syntax-errors' || !error.sourceText) {
      return;
    }
    const { fileName, sourceText } = error;
    setError(null);
    runParseAndPreview(fileName, sourceText);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".config,.txt,.nf,text/plain"
        className="sr-only"
        onChange={(e) => {
          void onFileSelected(e);
        }}
        aria-hidden="true"
        tabIndex={-1}
      />
      <button
        type="button"
        onClick={triggerPicker}
        className={[
          'inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700',
          'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent-500',
        ].join(' ')}
      >
        <LoadIcon />
        Load config…
      </button>

      {preview ? (
        <UploadDialog
          fileName={preview.fileName}
          parsed={preview.parsed}
          report={preview.mapped.report}
          confirmReplace={preview.confirmReplace}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      ) : null}

      {error ? (
        <UploadErrorDialog
          fileName={error.fileName}
          variant={error.variant}
          onClose={onCloseError}
          {...(error.variant.kind === 'syntax-errors' && error.sourceText
            ? { onProceedAnyway }
            : {})}
        />
      ) : null}
    </>
  );
}
