import { describe, expect, it } from 'vitest';
import { lex, type Token } from '../groovyLexer';

function kinds(toks: readonly Token[]): string[] {
  return toks.map((t) => t.kind);
}

function values(toks: readonly Token[]): unknown[] {
  return toks.map((t) => t.value);
}

describe('lex — punctuation and structure', () => {
  it('emits an EOF token even for empty input', () => {
    const r = lex('');
    expect(r.errors).toEqual([]);
    expect(kinds(r.tokens)).toEqual(['EOF']);
  });

  it('skips whitespace and tracks line/col', () => {
    const r = lex('  \n\n  foo\n');
    expect(r.errors).toEqual([]);
    const ident = r.tokens.find((t) => t.kind === 'IDENT');
    expect(ident).toBeDefined();
    expect(ident?.line).toBe(3);
    expect(ident?.col).toBe(3);
  });

  it('tokenizes braces, brackets, equals, colon, comma, dot', () => {
    const r = lex('{ } [ ] = : , .');
    expect(r.errors).toEqual([]);
    expect(kinds(r.tokens)).toEqual([
      'LBRACE',
      'RBRACE',
      'LBRACKET',
      'RBRACKET',
      'EQ',
      'COLON',
      'COMMA',
      'DOT',
      'EOF',
    ]);
  });

  it('skips // line comments and /* block comments */', () => {
    const r = lex(`
      // comment
      foo /* mid */ = /* gap */ 1
    `);
    expect(r.errors).toEqual([]);
    expect(kinds(r.tokens)).toEqual(['IDENT', 'EQ', 'NUMBER', 'EOF']);
  });

  it('reports unterminated block comment', () => {
    const r = lex('/* never closed');
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]?.message).toMatch(/Unterminated/);
  });
});

describe('lex — keywords', () => {
  it('recognizes true / false / null', () => {
    const r = lex('true false null');
    expect(r.errors).toEqual([]);
    expect(kinds(r.tokens)).toEqual(['BOOL', 'BOOL', 'NULL', 'EOF']);
    expect(values(r.tokens.slice(0, 3))).toEqual([true, false, null]);
  });
});

describe('lex — strings', () => {
  it('decodes single-quoted strings', () => {
    const r = lex(`'hello world'`);
    expect(r.errors).toEqual([]);
    expect(r.tokens[0]?.kind).toBe('STRING');
    expect(r.tokens[0]?.value).toBe('hello world');
  });

  it('decodes double-quoted strings (no GString)', () => {
    const r = lex(`"plain double"`);
    expect(r.errors).toEqual([]);
    expect(r.tokens[0]?.value).toBe('plain double');
  });

  it('decodes triple single-quoted strings preserving newlines', () => {
    const r = lex(`'''line one\nline two'''`);
    expect(r.errors).toEqual([]);
    expect(r.tokens[0]?.value).toBe('line one\nline two');
  });

  it('decodes triple double-quoted strings', () => {
    const r = lex(`"""raw"""`);
    expect(r.errors).toEqual([]);
    expect(r.tokens[0]?.value).toBe('raw');
  });

  it('decodes \\\\ \\\' \\n \\r \\t escapes in single-quoted strings', () => {
    const r = lex(`'a\\\\b\\'c\\nd\\re\\tf'`);
    expect(r.errors).toEqual([]);
    expect(r.tokens[0]?.value).toBe('a\\b\'c\nd\re\tf');
  });

  it('round-trips the emitter\'s tricky escape sample', () => {
    // From golden/escape-edges.config:
    //   diann.fasta_digest_params = '--cut \'K*,R*,!*P\' --bs\\path'
    const r = lex(`'--cut \\'K*,R*,!*P\\' --bs\\\\path'`);
    expect(r.errors).toEqual([]);
    expect(r.tokens[0]?.value).toBe(`--cut 'K*,R*,!*P' --bs\\path`);
  });

  it('rejects GString interpolation in double-quoted strings', () => {
    const r = lex(`"hello \${name}"`);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]?.message).toMatch(/GString interpolation/);
  });

  it('reports an unterminated single-quoted string', () => {
    const r = lex(`'never closes`);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]?.message).toMatch(/Unterminated/);
  });

  it('treats newline inside a non-triple string as termination + error', () => {
    const r = lex(`'line one\nline two'`);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('decodes empty string', () => {
    const r = lex(`''`);
    expect(r.errors).toEqual([]);
    expect(r.tokens[0]?.value).toBe('');
  });
});

describe('lex — numbers', () => {
  it('integer', () => {
    const r = lex('42');
    expect(r.errors).toEqual([]);
    expect(r.tokens[0]?.value).toBe(42);
  });

  it('negative integer', () => {
    const r = lex('-3');
    expect(r.errors).toEqual([]);
    expect(r.tokens[0]?.value).toBe(-3);
  });

  it('decimal', () => {
    const r = lex('1.5');
    expect(r.errors).toEqual([]);
    expect(r.tokens[0]?.value).toBe(1.5);
  });

  it('negative decimal with leading dot', () => {
    const r = lex('-.25');
    expect(r.errors).toEqual([]);
    expect(r.tokens[0]?.value).toBe(-0.25);
  });

  it('scientific notation', () => {
    const r = lex('1.5e10');
    expect(r.errors).toEqual([]);
    expect(r.tokens[0]?.value).toBeCloseTo(1.5e10);
  });

  it('scientific notation with negative exponent', () => {
    const r = lex('1.5E-3');
    expect(r.errors).toEqual([]);
    expect(r.tokens[0]?.value).toBeCloseTo(0.0015);
  });

  it('strips _ digit separators', () => {
    const r = lex('1_000_000');
    expect(r.errors).toEqual([]);
    expect(r.tokens[0]?.value).toBe(1_000_000);
  });

  it('strips type suffixes (L G F D I)', () => {
    expect(lex('100L').tokens[0]?.value).toBe(100);
    expect(lex('1.5G').tokens[0]?.value).toBe(1.5);
    expect(lex('2.0f').tokens[0]?.value).toBe(2.0);
    expect(lex('3.0d').tokens[0]?.value).toBe(3.0);
  });
});

describe('lex — identifiers', () => {
  it('plain ident', () => {
    const r = lex('study_id');
    expect(r.errors).toEqual([]);
    expect(r.tokens[0]?.kind).toBe('IDENT');
    expect(r.tokens[0]?.text).toBe('study_id');
  });

  it('dotted name produces IDENT DOT IDENT tokens', () => {
    const r = lex('pdc.study_id');
    expect(r.errors).toEqual([]);
    expect(kinds(r.tokens)).toEqual(['IDENT', 'DOT', 'IDENT', 'EOF']);
  });
});

describe('lex — error positions', () => {
  it('records line/col on unexpected character', () => {
    const r = lex('foo\n  @bar');
    const err = r.errors[0];
    expect(err).toBeDefined();
    expect(err?.line).toBe(2);
    expect(err?.col).toBe(3);
  });
});
