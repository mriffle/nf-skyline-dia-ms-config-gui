// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { Field } from '../form/Field';
import { useStore } from '../../state/store';
import { createDefaultState } from '../../state/formState';
import type { MetadataTable } from '../../metadata/types';

const table: MetadataTable = {
  fileName: 'm.csv',
  format: 'csv',
  columns: ['Replicate', 'Batch', 'Condition'],
  rows: [
    { Replicate: 'S1', Batch: 'B1', Condition: 'Control' },
    { Replicate: 'S2', Batch: 'B2', Condition: 'Treated' },
  ],
};

beforeEach(() => {
  localStorage.clear();
  act(() => {
    // setState merges, so explicitly clear metadata left over from a prior
    // test (same Zustand-merge gotcha as reset).
    useStore.setState({ ...createDefaultState(), metadata: undefined });
    // Make batch_report fields visible.
    useStore.getState().setValue('batch_report.skip', false);
  });
});

const loadMeta = (): void => {
  act(() => {
    useStore.getState().loadMetadata(table);
  });
};

describe('metadata-single widget (Batch variable 1)', () => {
  it('falls back to a text input when no metadata is loaded', () => {
    render(<Field path="batch_report.batch1" bypassTier />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('renders a select of non-Replicate columns when metadata is loaded', () => {
    loadMeta();
    render(<Field path="batch_report.batch1" bypassTier />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Batch' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Condition' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Replicate' })).toBeNull();
  });

  it('flags a stale value not present in the metadata', () => {
    act(() => {
      useStore.getState().setValue('batch_report.batch1', 'Ghost');
    });
    loadMeta();
    render(<Field path="batch_report.batch1" bypassTier />);
    expect(
      screen.getByRole('option', { name: /not in metadata/i }),
    ).toBeInTheDocument();
  });
});

describe('metadata-multi widget (PCA color variables)', () => {
  it('falls back to the free-text chip list when no metadata is loaded', () => {
    render(<Field path="qc_report.color_vars" bypassTier />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('renders a checkbox per non-Replicate column when metadata is loaded', () => {
    loadMeta();
    render(<Field path="qc_report.color_vars" bypassTier />);
    expect(screen.getByRole('checkbox', { name: 'Batch' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Condition' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Replicate' })).toBeNull();
  });
});

describe('control values depend on the chosen control key', () => {
  it('prompts to pick a control key when none is set', () => {
    loadMeta();
    render(<Field path="batch_report.control_values" bypassTier />);
    expect(screen.getByText(/choose a control key first/i)).toBeInTheDocument();
  });

  it('lists the control-key column values once a control key is chosen', () => {
    act(() => {
      useStore.getState().setValue('batch_report.control_key', 'Condition');
    });
    loadMeta();
    render(<Field path="batch_report.control_values" bypassTier />);
    expect(screen.getByRole('checkbox', { name: 'Control' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Treated' })).toBeInTheDocument();
  });
});
