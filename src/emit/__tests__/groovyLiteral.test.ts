import { describe, expect, it } from 'vitest';
import { toGroovyLiteral } from '../groovyLiteral';

describe('toGroovyLiteral — scalars', () => {
  it('null', () => {
    expect(toGroovyLiteral(null, 0)).toBe('null');
  });

  it('true / false', () => {
    expect(toGroovyLiteral(true, 0)).toBe('true');
    expect(toGroovyLiteral(false, 0)).toBe('false');
  });

  it('integer', () => {
    expect(toGroovyLiteral(0, 0)).toBe('0');
    expect(toGroovyLiteral(12, 0)).toBe('12');
    expect(toGroovyLiteral(-3, 0)).toBe('-3');
  });

  it('non-integer number', () => {
    expect(toGroovyLiteral(0.8, 0)).toBe('0.8');
    expect(toGroovyLiteral(1.5, 0)).toBe('1.5');
  });

  it('throws on NaN / Infinity', () => {
    expect(() => toGroovyLiteral(NaN, 0)).toThrow();
    expect(() => toGroovyLiteral(Infinity, 0)).toThrow();
  });
});

describe('toGroovyLiteral — strings', () => {
  it('plain string', () => {
    expect(toGroovyLiteral('hello', 0)).toBe("'hello'");
    expect(toGroovyLiteral('/path/to/db.fasta', 0)).toBe("'/path/to/db.fasta'");
  });

  it('string with single quote', () => {
    expect(toGroovyLiteral("don't", 0)).toBe("'don\\'t'");
  });

  it('string with backslash', () => {
    // input has one backslash; output must escape it to two
    expect(toGroovyLiteral('a\\b', 0)).toBe("'a\\\\b'");
  });

  it('escape order: backslash before quote', () => {
    // Input: a\'b   (i.e. backslash then apostrophe)
    // After escaping backslash first: a\\'b
    // After escaping quote next:      a\\\'b
    // Wrapped:                        'a\\\'b'
    expect(toGroovyLiteral("a\\'b", 0)).toBe("'a\\\\\\'b'");
  });

  it('string with newline / tab / carriage return', () => {
    expect(toGroovyLiteral('a\nb', 0)).toBe("'a\\nb'");
    expect(toGroovyLiteral('a\tb', 0)).toBe("'a\\tb'");
    expect(toGroovyLiteral('a\rb', 0)).toBe("'a\\rb'");
  });

  it('empty string', () => {
    expect(toGroovyLiteral('', 0)).toBe("''");
  });
});

describe('toGroovyLiteral — arrays', () => {
  it('empty array', () => {
    expect(toGroovyLiteral([], 0)).toBe('[]');
  });

  it('array of strings on one line when short', () => {
    expect(toGroovyLiteral(['a', 'b'], 0)).toBe("['a', 'b']");
  });

  it('array of strings wraps when long', () => {
    const long = [
      'some/very/long/path/to/file_one.mzML',
      'some/very/long/path/to/file_two.mzML',
      'some/very/long/path/to/file_three.mzML',
    ];
    const out = toGroovyLiteral(long, 0);
    expect(out.includes('\n')).toBe(true);
    expect(out.startsWith('[\n')).toBe(true);
    expect(out.endsWith('\n]')).toBe(true);
  });
});

describe('toGroovyLiteral — maps (Groovy [:] form)', () => {
  it('empty object renders as [:]', () => {
    expect(toGroovyLiteral({}, 0)).toBe('[:]');
  });

  it('one-entry map renders multi-line', () => {
    const out = toGroovyLiteral({ Plate1: 'path/one' }, 0);
    expect(out).toBe("[\n    'Plate1': 'path/one'\n]");
  });

  it('two-entry map renders multi-line, comma-separated', () => {
    const out = toGroovyLiteral({ Plate1: 'path/one', Plate2: 'path/two' }, 0);
    expect(out).toBe("[\n    'Plate1': 'path/one',\n    'Plate2': 'path/two'\n]");
  });

  it('map with single quote in key or value escapes correctly', () => {
    const out = toGroovyLiteral({ "it's": "'quoted'" }, 0);
    expect(out).toBe("[\n    'it\\'s': '\\'quoted\\''\n]");
  });

  it('map at deeper indent', () => {
    const out = toGroovyLiteral({ A: 'x' }, 4);
    expect(out).toBe("[\n        'A': 'x'\n    ]");
  });
});

describe('toGroovyLiteral — error cases', () => {
  it('throws on undefined', () => {
    expect(() => toGroovyLiteral(undefined, 0)).toThrow(/undefined/);
  });

  it('throws on function', () => {
    expect(() => toGroovyLiteral(() => 1, 0)).toThrow(/function/);
  });
});
