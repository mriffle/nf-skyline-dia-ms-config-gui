// "Load metadata…" header button + hidden file input + dialog lifecycle.
// Reads a CSV/TSV in the browser, validates + cleans it (validateMetadata),
// then shows either the confirm dialog (success) or the error dialog
// (structural / parse problems). On confirm the cleaned table is committed
// to the store and `onLoaded` fires so the shell can switch to the Metadata
// tab.

import { useRef, useState, type ChangeEvent } from 'react';
import { useStore } from '../../state/store';
import { validateMetadata } from '../../metadata/validateMetadata';
import type { MetadataError, MetadataTable, MetadataWarning } from '../../metadata/types';
import { MetadataUploadDialog } from './MetadataUploadDialog';
import { MetadataErrorDialog } from './MetadataErrorDialog';

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === 'string') resolve(r);
      else reject(new Error('Unexpected FileReader result type'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
    reader.readAsText(file);
  });
}

interface PendingPreview {
  readonly fileName: string;
  readonly table: MetadataTable;
  readonly warnings: readonly MetadataWarning[];
  readonly confirmReplace: boolean;
}

interface PendingError {
  readonly fileName: string;
  readonly errors: readonly MetadataError[];
}

function MetadataIcon() {
  // Small grid/table glyph.
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
      <rect x="3" y="4" width="14" height="12" rx="1.2" />
      <path d="M3 8h14" />
      <path d="M8 8v8" />
    </svg>
  );
}

interface UploadMetadataControlProps {
  readonly disabled?: boolean;
  // Fired after the user confirms a load, so the shell can reveal the
  // Metadata tab.
  readonly onLoaded?: () => void;
}

export function UploadMetadataControl({
  disabled = false,
  onLoaded,
}: UploadMetadataControlProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PendingPreview | null>(null);
  const [error, setError] = useState<PendingError | null>(null);

  const loadMetadata = useStore((s) => s.loadMetadata);

  const triggerPicker = (): void => {
    inputRef.current?.click();
  };

  const onFileSelected = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
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
            message:
              readErr instanceof Error ? readErr.message : 'Could not read file.',
          },
        ],
      });
      return;
    }

    const result = validateMetadata(file.name, text);
    if (result.errors.length > 0 || !result.table) {
      setError({ fileName: file.name, errors: result.errors });
      return;
    }
    const confirmReplace = useStore.getState().metadata !== undefined;
    setPreview({
      fileName: file.name,
      table: result.table,
      warnings: result.warnings,
      confirmReplace,
    });
  };

  const onConfirm = (): void => {
    if (!preview) return;
    loadMetadata(preview.table);
    setPreview(null);
    onLoaded?.();
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.tab,.txt,text/csv,text/tab-separated-values,text/plain"
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
        disabled={disabled}
        title={disabled ? 'Finish editing the config text first' : undefined}
        className={[
          'inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700',
          'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent-500',
          'disabled:cursor-not-allowed disabled:opacity-50',
        ].join(' ')}
      >
        <MetadataIcon />
        Load metadata…
      </button>

      {preview ? (
        <MetadataUploadDialog
          fileName={preview.fileName}
          table={preview.table}
          warnings={preview.warnings}
          confirmReplace={preview.confirmReplace}
          onCancel={() => setPreview(null)}
          onConfirm={onConfirm}
        />
      ) : null}

      {error ? (
        <MetadataErrorDialog
          fileName={error.fileName}
          errors={error.errors}
          onClose={() => setError(null)}
        />
      ) : null}
    </>
  );
}
