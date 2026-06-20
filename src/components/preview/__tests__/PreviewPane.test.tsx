// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreviewPane } from '../PreviewPane';
import { useStore } from '../../../state/store';
import { createDefaultState } from '../../../state/formState';

beforeEach(() => {
  localStorage.clear();
  useStore.setState(createDefaultState());
});

function setTextarea(value: string): void {
  const ta = screen.getByLabelText('Edit config text') as HTMLTextAreaElement;
  fireEvent.change(ta, { target: { value } });
}

// No outer blocks / unknown params → applies silently (no confirm dialog).
const CLEAN_CONFIG = `params {
  fasta = '/new.fasta'
  quant_spectra_dir = '/data/wide'
  search_engine = 'diann'
}
`;

// Carries a process { } block → preserved verbatim → confirm dialog.
const CONFIG_WITH_NOTICES = `params {
  fasta = '/new.fasta'
  search_engine = 'diann'
}
process {
  cpus = 4
}
`;

const SYNTAX_ERROR_CONFIG = `params {
  fasta = 'unterminated
}
`;

describe('PreviewPane — entering / leaving edit mode', () => {
  it('shows the Edit button and read-only preview by default', () => {
    render(<PreviewPane />);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Edit config text')).not.toBeInTheDocument();
  });

  it('Edit opens a textarea seeded with the current config and swaps the toolbar', async () => {
    const user = userEvent.setup();
    render(<PreviewPane />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const ta = screen.getByLabelText('Edit config text') as HTMLTextAreaElement;
    expect(ta.value).toContain('params {');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('Cancel discards the buffer and restores the read-only view', async () => {
    const user = userEvent.setup();
    render(<PreviewPane />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    setTextarea('params { fasta = "/junk.fasta" }');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Edit config text')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    // The discarded edit never reached the store.
    expect(useStore.getState().values['fasta']).toBeUndefined();
  });

  it('notifies onEditingChange when toggling edit mode', async () => {
    const user = userEvent.setup();
    const onEditingChange = vi.fn();
    render(<PreviewPane onEditingChange={onEditingChange} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEditingChange).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });
});

describe('PreviewPane — applying edits', () => {
  it('applies a clean edit directly into the store without a confirm dialog', async () => {
    const user = userEvent.setup();
    const onEditingChange = vi.fn();
    render(<PreviewPane onEditingChange={onEditingChange} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    setTextarea(CLEAN_CONFIG);
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useStore.getState().values['fasta']).toBe('/new.fasta');
    expect(screen.queryByLabelText('Edit config text')).not.toBeInTheDocument();
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });

  it('shows a confirm dialog when the edit carries notices, then commits on Apply', async () => {
    const user = userEvent.setup();
    render(<PreviewPane />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    setTextarea(CONFIG_WITH_NOTICES);
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Apply edited configuration\?/)).toBeInTheDocument();
    // Not committed yet.
    expect(useStore.getState().values['fasta']).toBeUndefined();

    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(useStore.getState().values['fasta']).toBe('/new.fasta');
    expect(useStore.getState().preservedOuterText).toContain('process');
    expect(screen.queryByLabelText('Edit config text')).not.toBeInTheDocument();
  });

  it('keeps editing when the confirm dialog is cancelled', async () => {
    const user = userEvent.setup();
    render(<PreviewPane />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    setTextarea(CONFIG_WITH_NOTICES);
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Edit config text')).toBeInTheDocument();
    expect(useStore.getState().values['fasta']).toBeUndefined();
  });

  it('rejects a syntactically invalid edit and stays in edit mode', async () => {
    const user = userEvent.setup();
    render(<PreviewPane />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    setTextarea(SYNTAX_ERROR_CONFIG);
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Syntax errors/i)).toBeInTheDocument();
    expect(useStore.getState().values['fasta']).toBeUndefined();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    // Still editing — the buffer is preserved so the user can fix it.
    expect(screen.getByLabelText('Edit config text')).toBeInTheDocument();
  });
});
