// "Load config…" header button + hidden file input + the dialog
// lifecycle. Reads the file in the browser, runs parse → map, then
// either shows the preview dialog (success path) or the error dialog
// (no params block / hard parse failure).

import { useRef, useState, type ChangeEvent } from 'react';
import { useStore } from '../../state/store';
import { mapToState, type MapResult } from '../../parse/mapToState';
import { parseConfig } from '../../parse/parseConfig';
import type { ParseError, ParseResult } from '../../parse/types';
import { UploadDialog } from './UploadDialog';
import { UploadErrorDialog } from './UploadErrorDialog';

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
  readonly errors: readonly ParseError[];
  readonly hadParamsBlock: boolean;
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
        hadParamsBlock: false,
      });
      return;
    }

    const parsed = parseConfig(text);
    if (!parsed.hadParamsBlock || parsed.entries.length === 0) {
      setError({
        fileName: file.name,
        errors:
          parsed.errors.length > 0
            ? parsed.errors
            : [
                {
                  line: 0,
                  col: 0,
                  message: parsed.hadParamsBlock
                    ? 'The params { } block contained no parameters.'
                    : "No params { } block was found.",
                },
              ],
        hadParamsBlock: parsed.hadParamsBlock,
      });
      return;
    }
    const mapped = mapToState(parsed.entries);
    const current = useStore.getState();
    const confirmReplace = Object.values(current.touched).some((v) => v === true);
    setPreview({ fileName: file.name, parsed, mapped, confirmReplace });
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
          errors={error.errors}
          hadParamsBlock={error.hadParamsBlock}
          onClose={onCloseError}
        />
      ) : null}
    </>
  );
}
