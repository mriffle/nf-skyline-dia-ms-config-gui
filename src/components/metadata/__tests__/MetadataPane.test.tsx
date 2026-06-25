// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetadataPane } from '../MetadataPane';
import { useStore } from '../../../state/store';
import { createDefaultState } from '../../../state/formState';
import type { MetadataTable } from '../../../metadata/types';
import * as download from '../../../lib/download';

const table: MetadataTable = {
  fileName: 'meta.csv',
  format: 'csv',
  columns: ['Replicate', 'Batch', 'Condition'],
  rows: [
    { Replicate: 'S1', Batch: 'B1', Condition: 'Control' },
    { Replicate: 'S2', Batch: 'B2', Condition: 'Treated' },
  ],
};

beforeEach(() => {
  localStorage.clear();
  useStore.setState({ ...createDefaultState(), metadata: undefined });
});

describe('MetadataPane', () => {
  it('shows the empty state when no metadata is loaded', () => {
    render(<MetadataPane />);
    expect(screen.getByText(/no metadata loaded/i)).toBeInTheDocument();
  });

  it('renders a spreadsheet of the loaded table', () => {
    act(() => useStore.getState().loadMetadata(table));
    render(<MetadataPane />);
    expect(screen.getByText('2 samples · 3 fields')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Replicate' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Condition' })).toBeInTheDocument();
    expect(screen.getByText('S1')).toBeInTheDocument();
    expect(screen.getByText('Treated')).toBeInTheDocument();
  });

  it('downloads the cleaned table in its original format', async () => {
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    act(() => useStore.getState().loadMetadata(table));
    render(<MetadataPane />);

    await userEvent.click(screen.getByRole('button', { name: /download/i }));
    expect(spy).toHaveBeenCalledTimes(1);
    const [content, name] = spy.mock.calls[0]!;
    expect(name).toBe('meta.csv');
    expect(content).toBe('Replicate,Batch,Condition\nS1,B1,Control\nS2,B2,Treated\n');
    spy.mockRestore();
  });

  it('clears the metadata after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    act(() => useStore.getState().loadMetadata(table));
    render(<MetadataPane />);

    await userEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(useStore.getState().metadata).toBeUndefined();
    vi.restoreAllMocks();
  });
});
