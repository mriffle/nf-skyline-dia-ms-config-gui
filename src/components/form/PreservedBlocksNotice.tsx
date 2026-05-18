// Informational banner shown above the form when the current state
// carries content that the user uploaded but the form doesn't surface:
// (a) verbatim outer blocks like process { } / profiles { } appended
//     after params { }, and / or
// (b) hidden / infrastructure params (e.g. images.*) loaded into
//     state.values and re-emitted into params { } verbatim but without
//     a UI control.
// Both kinds clear on Reset.

import { useState } from 'react';
import { useStore } from '../../state/store';
import { schemaDerived } from '../../params/schemaDerived.generated';
import { paramMetadataByPath } from '../../params/paramMetadata';

export function PreservedBlocksNotice() {
  const preservedOuterText = useStore((s) => s.preservedOuterText);
  const values = useStore((s) => s.values);
  const touched = useStore((s) => s.touched);
  const [expanded, setExpanded] = useState(false);

  const hasOuterText =
    preservedOuterText !== undefined && preservedOuterText.length > 0;
  const preservedHiddenPaths = collectPreservedHiddenPaths(values, touched);

  if (!hasOuterText && preservedHiddenPaths.length === 0) {
    return null;
  }

  const blockNames = hasOuterText ? collectBlockNames(preservedOuterText) : [];

  return (
    <div className="mb-6 rounded-md border border-sky-200 bg-sky-50/70 px-3 py-2">
      <p className="text-sm font-semibold text-sky-800">
        Preserved from uploaded config
      </p>
      {hasOuterText ? (
        <p className="mt-1 text-[13px] text-sky-900">
          {blockNames.length > 0 ? (
            <>
              Outer block{blockNames.length === 1 ? '' : 's'}{' '}
              {blockNames.map((n, i) => (
                <span key={n}>
                  <code className="rounded bg-sky-100 px-1 font-mono text-[12px]">{n}</code>
                  {i < blockNames.length - 1 ? ', ' : ''}
                </span>
              ))}{' '}
              will be appended to the generated config verbatim.
            </>
          ) : (
            <>Content from the uploaded config will be appended to the generated config verbatim.</>
          )}
        </p>
      ) : null}
      {preservedHiddenPaths.length > 0 ? (
        <p className={`${hasOuterText ? 'mt-1' : 'mt-1'} text-[13px] text-sky-900`}>
          Hidden parameter{preservedHiddenPaths.length === 1 ? '' : 's'}{' '}
          {preservedHiddenPaths.map((n, i) => (
            <span key={n}>
              <code className="rounded bg-sky-100 px-1 font-mono text-[12px]">{n}</code>
              {i < preservedHiddenPaths.length - 1 ? ', ' : ''}
            </span>
          ))}{' '}
          loaded into <code className="font-mono text-[12px]">params { }</code> verbatim
          (not editable in the form).
        </p>
      ) : null}
      <p className="mt-1 text-[12px] text-sky-800">Use Reset to remove.</p>
      {hasOuterText ? (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={[
              'mt-1 text-[12px] font-medium text-sky-700 underline-offset-2 hover:underline',
              'focus:outline-none focus:ring-2 focus:ring-sky-400 rounded',
            ].join(' ')}
            aria-expanded={expanded}
          >
            {expanded ? 'Hide outer-block content' : 'Show outer-block content'}
          </button>
          {expanded ? (
            <pre className="mt-2 max-h-72 overflow-auto rounded border border-sky-200 bg-white p-2 text-[12px] leading-snug text-slate-800">
              {preservedOuterText}
            </pre>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// Paths the user uploaded that the schema marks hidden and the form
// doesn't render. They're still emitted into params { } verbatim — see
// the "preserved" sub-block in emitConfig.
function collectPreservedHiddenPaths(
  values: Record<string, unknown>,
  touched: Record<string, boolean>,
): string[] {
  const out: string[] = [];
  for (const path of Object.keys(values)) {
    if (touched[path] !== true) continue;
    if (paramMetadataByPath[path]) continue;
    const schema = schemaDerived[path];
    if (!schema || !schema.hidden) continue;
    out.push(path);
  }
  return out.sort();
}

// Pull the leading identifier off each top-level block in the preserved
// text so we can show a short summary. Best-effort — anything we can't
// classify is silently skipped.
function collectBlockNames(text: string): string[] {
  const names: string[] = [];
  const re = /(^|\n)\s*([A-Za-z_$][A-Za-z0-9_$.]*)\s*\{/g;
  let depth = 0;
  let lastIndex = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) {
        const slice = text.slice(lastIndex, i + 1);
        re.lastIndex = 0;
        const m = re.exec(slice);
        if (m && m[2]) names.push(m[2]);
      }
      depth++;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
      if (depth === 0) lastIndex = i + 1;
    }
  }
  return names;
}
