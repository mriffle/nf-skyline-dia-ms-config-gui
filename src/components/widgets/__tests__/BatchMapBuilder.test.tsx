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
      { name: 'b1', paths: ['/a'] },
      { name: 'b2', paths: ['/b'] },
    ]);
    expect(screen.getByLabelText('Batch 1 name')).toHaveValue('b1');
    expect(screen.getByLabelText('Batch 2 path')).toHaveValue('/b');
  });

  it('typing in the name field calls onChange with the patched row', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([{ name: '', paths: [''] }]);
    await user.type(screen.getByLabelText('Batch 1 name'), 'x');
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last).toEqual([{ name: 'x', paths: [''] }]);
  });

  it('clicking Add batch appends an empty row', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([{ name: 'b1', paths: ['/a'] }]);
    await user.click(screen.getByRole('button', { name: /add batch/i }));
    expect(onChange).toHaveBeenCalledWith([
      { name: 'b1', paths: ['/a'] },
      { name: '', paths: [''] },
    ]);
  });

  it('renders one input per path and labels them when there are several', () => {
    setup([{ name: 'b1', paths: ['/a', '/b'] }]);
    expect(screen.getByLabelText('Batch 1 path 1')).toHaveValue('/a');
    expect(screen.getByLabelText('Batch 1 path 2')).toHaveValue('/b');
  });

  it('clicking Add path appends an empty path to that batch only', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([
      { name: 'b1', paths: ['/a'] },
      { name: 'b2', paths: ['/b'] },
    ]);
    await user.click(screen.getByRole('button', { name: /add path to batch 1/i }));
    expect(onChange).toHaveBeenCalledWith([
      { name: 'b1', paths: ['/a', ''] },
      { name: 'b2', paths: ['/b'] },
    ]);
  });

  it('removes a single path without removing the batch', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([{ name: 'b1', paths: ['/a', '/b'] }]);
    await user.click(screen.getByRole('button', { name: /remove batch 1 path 2/i }));
    expect(onChange).toHaveBeenCalledWith([{ name: 'b1', paths: ['/a'] }]);
  });

  it('offers no per-path remove button when a batch has one path', () => {
    setup([{ name: 'b1', paths: ['/a'] }]);
    expect(screen.queryByRole('button', { name: /remove batch 1 path/i })).toBeNull();
  });

  it('clicking the remove button removes the row', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([
      { name: 'b1', paths: ['/a'] },
      { name: 'b2', paths: ['/b'] },
    ]);
    await user.click(screen.getByRole('button', { name: /remove batch 1/i }));
    expect(onChange).toHaveBeenCalledWith([{ name: 'b2', paths: ['/b'] }]);
  });
});
