// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpectraSourceRadio } from '../SpectraSourceRadio';
import type { ParamMeta } from '../../../params/paramMetadata';

const META: ParamMeta = {
  path: 'quant_spectra_dir',
  section: 'input-general',
  label: 'Quantitative spectra',
  help: 'h',
  tier: 'common',
  widget: 'spectra-source',
  virtual: true,
  affects: ['quant_spectra_dir'],
};

function setup(value: unknown) {
  const onChange = vi.fn<(v: unknown) => void>();
  render(
    <SpectraSourceRadio
      meta={META}
      value={value}
      onChange={onChange}
      inputId="ss"
    />,
  );
  return { onChange };
}

describe('SpectraSourceRadio', () => {
  it('defaults to Single directory when value is undefined', () => {
    setup(undefined);
    expect(screen.getByRole('radio', { name: /single directory/i })).toBeChecked();
    // Single mode shows a path text input bound to inputId
    expect(document.getElementById('ss')).toBeInTheDocument();
  });

  it('typing in the single-path input emits a single tagged-union value', async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ kind: 'single', path: '' });
    const input = document.getElementById('ss') as HTMLInputElement;
    expect(input).not.toBeNull();
    await user.type(input, '/x');
    // Last call value should be { kind: 'single', path: ... }
    const last = onChange.mock.calls.at(-1)?.[0] as { kind: string; path: string };
    expect(last.kind).toBe('single');
    expect(typeof last.path).toBe('string');
  });

  it('switching to Multiple directories emits a list value', async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ kind: 'single', path: '/x' });
    await user.click(screen.getByRole('radio', { name: /multiple directories/i }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'list', paths: [] });
  });

  it('switching to Named batches emits a batch-map value', async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ kind: 'single', path: '/x' });
    await user.click(screen.getByRole('radio', { name: /named batches/i }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'batch-map', entries: [] });
  });

  it('reads existing list values when kind is list', () => {
    setup({ kind: 'list', paths: ['/a', '/b'] });
    expect(screen.getByRole('radio', { name: /multiple directories/i })).toBeChecked();
    // Chips for /a and /b
    expect(screen.getByText('/a')).toBeInTheDocument();
    expect(screen.getByText('/b')).toBeInTheDocument();
  });

  it('reads existing batch-map entries when kind is batch-map', () => {
    setup({
      kind: 'batch-map',
      entries: [{ name: 'b1', path: '/a' }],
    });
    expect(screen.getByRole('radio', { name: /named batches/i })).toBeChecked();
    expect(screen.getByLabelText('Batch 1 name')).toHaveValue('b1');
    expect(screen.getByLabelText('Batch 1 path')).toHaveValue('/a');
  });
});
