// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchMapBuilder, type BatchEntry } from '../BatchMapBuilder';

function setup(entries: readonly BatchEntry[] = []) {
  const onChange = vi.fn<(entries: readonly BatchEntry[]) => void>();
  render(
    <BatchMapBuilder
      entries={entries}
      onChange={onChange}
      idPrefix="batch"
    />,
  );
  return { onChange };
}

describe('BatchMapBuilder', () => {
  it('renders an empty row when entries is empty', () => {
    setup([]);
    const nameInput = screen.getByLabelText('Batch 1 name');
    const pathInput = screen.getByLabelText('Batch 1 path');
    expect(nameInput).toHaveValue('');
    expect(pathInput).toHaveValue('');
  });

  it('renders existing rows', () => {
    setup([
      { name: 'b1', path: '/a' },
      { name: 'b2', path: '/b' },
    ]);
    expect(screen.getByLabelText('Batch 1 name')).toHaveValue('b1');
    expect(screen.getByLabelText('Batch 2 path')).toHaveValue('/b');
  });

  it('typing in the name field calls onChange with the patched row', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([{ name: '', path: '' }]);
    await user.type(screen.getByLabelText('Batch 1 name'), 'x');
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last).toEqual([{ name: 'x', path: '' }]);
  });

  it('clicking Add batch appends an empty row', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([{ name: 'b1', path: '/a' }]);
    await user.click(screen.getByRole('button', { name: /add batch/i }));
    expect(onChange).toHaveBeenCalledWith([
      { name: 'b1', path: '/a' },
      { name: '', path: '' },
    ]);
  });

  it('clicking the remove button removes the row', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([
      { name: 'b1', path: '/a' },
      { name: 'b2', path: '/b' },
    ]);
    await user.click(screen.getByRole('button', { name: /remove batch 1/i }));
    expect(onChange).toHaveBeenCalledWith([{ name: 'b2', path: '/b' }]);
  });
});
