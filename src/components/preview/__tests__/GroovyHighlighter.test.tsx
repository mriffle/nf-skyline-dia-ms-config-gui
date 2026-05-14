// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { GroovyHighlighter, __test__ } from '../GroovyHighlighter';

const { tokenize } = __test__;

describe('tokenize', () => {
  it('treats lines starting with // as comment tokens', () => {
    const tokens = tokenize('// hello\nparams { }');
    expect(tokens[0]).toEqual({ type: 'comment', text: '// hello' });
    expect(tokens.find((t) => t.type === 'keyword' && t.text === 'params')).toBeDefined();
  });

  it('classifies keywords (true, false, null, params)', () => {
    const tokens = tokenize('foo = true\nbar = false\nbaz = null');
    const kw = tokens.filter((t) => t.type === 'keyword').map((t) => t.text);
    expect(kw).toEqual(['true', 'false', 'null']);
  });

  it('lexes single-quoted strings with escapes', () => {
    const tokens = tokenize("x = 'a\\'b\\\\c'");
    const strings = tokens.filter((t) => t.type === 'string');
    expect(strings).toHaveLength(1);
    expect(strings[0]!.text).toBe("'a\\'b\\\\c'");
  });

  it('lexes integers and decimals as number tokens', () => {
    const tokens = tokenize('a = 12\nb = 0.85');
    const nums = tokens.filter((t) => t.type === 'number').map((t) => t.text);
    expect(nums).toEqual(['12', '0.85']);
  });

  it('lexes negative numbers', () => {
    const tokens = tokenize('x = -3.5');
    const nums = tokens.filter((t) => t.type === 'number').map((t) => t.text);
    expect(nums).toEqual(['-3.5']);
  });

  it('treats dotted identifiers as a single ident token', () => {
    const tokens = tokenize('pdc.study_id = 1');
    const idents = tokens.filter((t) => t.type === 'ident').map((t) => t.text);
    expect(idents).toContain('pdc.study_id');
  });

  it('emits punct tokens for braces, equals, brackets', () => {
    const tokens = tokenize('a = { }');
    const punct = tokens.filter((t) => t.type === 'punct').map((t) => t.text);
    expect(punct).toEqual(['=', '{', '}']);
  });

  it('preserves newlines as newline tokens', () => {
    const tokens = tokenize('a\nb');
    expect(tokens.filter((t) => t.type === 'newline')).toHaveLength(1);
  });
});

describe('GroovyHighlighter component', () => {
  it('renders the source text faithfully', () => {
    const src = "// header\nparams {\n    fasta = '/x.fasta'\n}\n";
    const { container } = render(<GroovyHighlighter source={src} />);
    expect(container.textContent).toBe(src);
  });
});
