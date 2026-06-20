import { memo, type ReactElement } from 'react';

type TokenType =
  | 'comment'
  | 'keyword'
  | 'string'
  | 'number'
  | 'ident'
  | 'punct'
  | 'space'
  | 'newline';

interface Token {
  readonly type: TokenType;
  readonly text: string;
}

const KEYWORDS = new Set(['params', 'true', 'false', 'null']);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trimStart().startsWith('//')) {
      tokens.push({ type: 'comment', text: line });
    } else {
      tokenizeLine(line, tokens);
    }
    if (i < lines.length - 1) tokens.push({ type: 'newline', text: '\n' });
  }
  return tokens;
}

function tokenizeLine(line: string, out: Token[]): void {
  let i = 0;
  while (i < line.length) {
    const ch = line[i]!;
    if (ch === ' ' || ch === '\t') {
      const start = i;
      while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
      out.push({ type: 'space', text: line.slice(start, i) });
      continue;
    }
    if (ch === "'") {
      const start = i;
      i++;
      while (i < line.length) {
        if (line[i] === '\\' && i + 1 < line.length) {
          i += 2;
          continue;
        }
        if (line[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      out.push({ type: 'string', text: line.slice(start, i) });
      continue;
    }
    if (isDigit(ch) || (ch === '-' && i + 1 < line.length && isDigit(line[i + 1]!))) {
      const start = i;
      if (ch === '-') i++;
      while (i < line.length && (isDigit(line[i]!) || line[i] === '.')) i++;
      out.push({ type: 'number', text: line.slice(start, i) });
      continue;
    }
    if (isIdentStart(ch)) {
      const start = i;
      while (i < line.length && isIdentPart(line[i]!)) i++;
      const text = line.slice(start, i);
      out.push({ type: KEYWORDS.has(text) ? 'keyword' : 'ident', text });
      continue;
    }
    out.push({ type: 'punct', text: ch });
    i++;
  }
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch) || ch === '.';
}

const CLASS_BY_TYPE: Record<TokenType, string> = {
  comment: 'text-slate-500 italic',
  keyword: 'text-accent-300 font-medium',
  string: 'text-emerald-300',
  number: 'text-amber-300',
  ident: 'text-slate-100',
  punct: 'text-slate-400',
  space: '',
  newline: '',
};

// Shared font metrics — MUST be identical in the read-only <pre> and the
// editor overlay (CodeEditor) or the textarea caret drifts off the glyphs.
export const HIGHLIGHT_FONT_CLASSES = 'font-mono text-[12.5px] leading-[1.55]';

// Token → colored <span>s. Reused by the read-only highlighter and by the
// CodeEditor overlay so both layers render byte-identical glyphs.
export function highlightTokens(source: string): ReactElement[] {
  return tokenize(source).map((t, i) =>
    t.type === 'newline' || t.type === 'space' ? (
      <span key={i}>{t.text}</span>
    ) : (
      <span key={i} className={CLASS_BY_TYPE[t.type]}>
        {t.text}
      </span>
    ),
  );
}

export const GroovyHighlighter = memo(function GroovyHighlighter({
  source,
}: {
  source: string;
}) {
  return (
    <pre className={`overflow-auto ${HIGHLIGHT_FONT_CLASSES} text-slate-100`}>
      <code>{highlightTokens(source)}</code>
    </pre>
  );
});

export const __test__ = { tokenize };
