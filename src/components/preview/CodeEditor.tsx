// Syntax-highlighting plain-text editor (the "overlay" technique).
//
// A transparent-text <textarea> sits exactly on top of a highlighted
// <pre>; the user edits the textarea and sees the colored <pre> through
// it. Both layers are full-content-size inside ONE scrolling parent, so
// they scroll together with NO JS scroll-sync. The key invariants:
//
//   - Both layers share HIGHLIGHT_FONT_CLASSES + identical padding, so
//     the caret lands on the glyphs.
//   - The <pre> is in-flow and supplies the height/width; the <textarea>
//     is absolutely positioned over it (inset-0). The <pre> therefore
//     drives the box, exactly like the read-only view drives the pane
//     height — no collapse.
//   - The outer div is the sole scroller (matches the read-only
//     container). The textarea is overflow-hidden so it never adds a
//     second scrollbar.

import { useMemo } from 'react';
import { highlightTokens, HIGHLIGHT_FONT_CLASSES } from './GroovyHighlighter';

interface CodeEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly ariaLabel: string;
}

export function CodeEditor({ value, onChange, ariaLabel }: CodeEditorProps) {
  // A textarea reserves a blank final line when its value ends in "\n"
  // (and one line when empty). A trailing newline in a white-space:pre
  // block has no height, so append a zero-width space to give that final
  // line height — otherwise the highlight layer ends up one line shorter
  // than the textarea and the bottom drifts.
  const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
  const highlightSource =
    value.endsWith('\n') || value === ''
      ? value + ZERO_WIDTH_SPACE
      : value;
  const spans = useMemo(() => highlightTokens(highlightSource), [highlightSource]);

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-slate-900">
      <div className="relative w-max min-w-full">
        <pre
          aria-hidden="true"
          className={`pointer-events-none m-0 block whitespace-pre px-3 py-3 ${HIGHLIGHT_FONT_CLASSES} text-slate-100`}
        >
          {spans}
        </pre>
        <textarea
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          wrap="off"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          className={`absolute inset-0 m-0 block resize-none overflow-hidden border-0 bg-transparent px-3 py-3 ${HIGHLIGHT_FONT_CLASSES} text-transparent caret-slate-100 outline-none`}
        />
      </div>
    </div>
  );
}
