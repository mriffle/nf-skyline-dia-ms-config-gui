// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { AppShell } from '../layout/AppShell';
import { useStore } from '../../state/store';
import { createDefaultState } from '../../state/formState';

beforeEach(() => {
  localStorage.clear();
  useStore.setState(createDefaultState());
});

const setValue = (path: string, value: unknown): void => {
  act(() => {
    useStore.getState().setValue(path, value);
  });
};

const findDownloadButton = (): HTMLButtonElement => {
  const buttons = screen.getAllByRole('button', { name: /^download$/i });
  return buttons[0]! as HTMLButtonElement;
};

describe('happy-path integration', () => {
  it('disables Download until a minimal valid config is set; enables it once valid', () => {
    render(<AppShell />);
    expect(findDownloadButton()).toBeDisabled();

    // Carafe defaults to enabled; turn it off for this user-supplied-library
    // scenario so the test exercises only the minimum DIA-NN inputs.
    setValue('use_carafe', false);
    setValue('quant_spectra_dir', { kind: 'single', path: '/data/wide' });
    setValue('search_engine', 'diann');
    setValue('fasta', '/db.fasta');
    setValue('spectral_library', '/lib.dlib');

    expect(findDownloadButton()).not.toBeDisabled();
  });

  it('shows a validation summary when fields are missing', () => {
    render(<AppShell />);
    setValue('search_engine', 'diann');

    // ValidationSummary renders a "{N} error(s)" header when issues are present.
    expect(screen.getByText(/\d+\s+errors?/i)).toBeInTheDocument();
    expect(findDownloadButton()).toBeDisabled();
  });

  it('renders preview content and a byte/line label', () => {
    render(<AppShell />);
    setValue('search_engine', 'diann');
    setValue('fasta', '/db.fasta');

    expect(screen.getByText(/bytes ·/i)).toBeInTheDocument();
  });

  it('supports PDC mode via the store directly (UI toggle covered separately)', () => {
    render(<AppShell />);

    act(() => {
      useStore.getState().setMode('pdc');
    });
    setValue('use_carafe', false);
    setValue('pdc.study_id', 'PDC000504');
    setValue('search_engine', 'diann');
    setValue('fasta', '/db.fasta');

    expect(findDownloadButton()).not.toBeDisabled();
  });
});
