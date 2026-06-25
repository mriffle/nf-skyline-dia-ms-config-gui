// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UploadMetadataControl } from '../UploadMetadataControl';
import { useStore } from '../../../state/store';
import { createDefaultState } from '../../../state/formState';

beforeEach(() => {
  localStorage.clear();
  // setState merges — clear any metadata left from a prior test.
  useStore.setState({ ...createDefaultState(), metadata: undefined });
});

function makeFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/plain' });
}

const fileInput = (): HTMLInputElement =>
  document.querySelector('input[type="file"]') as HTMLInputElement;

describe('UploadMetadataControl', () => {
  it('renders the Load metadata button and no dialog initially', () => {
    render(<UploadMetadataControl />);
    expect(
      screen.getByRole('button', { name: /load metadata/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the confirm dialog for a valid file and loads it on confirm', async () => {
    const user = userEvent.setup();
    const onLoaded = vi.fn();
    render(<UploadMetadataControl onLoaded={onLoaded} />);

    await user.upload(
      fileInput(),
      makeFile('meta.csv', 'Replicate,Batch\nS1,B1\nS2,B2\n'),
    );

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    // Summary lists the parsed columns.
    expect(screen.getByText('Batch')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^load metadata$/i }));

    expect(useStore.getState().metadata).toBeDefined();
    expect(useStore.getState().metadata!.columns).toEqual(['Replicate', 'Batch']);
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it('surfaces cleaning adjustments in the confirm dialog', async () => {
    const user = userEvent.setup();
    render(<UploadMetadataControl />);

    await user.upload(
      fileInput(),
      makeFile('meta.csv', 'Batch,Replicate\nB1,S1\n'),
    );

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByText(/moved the/i)).toBeInTheDocument();
  });

  it('shows the error dialog for a file with no Replicate column', async () => {
    const user = userEvent.setup();
    render(<UploadMetadataControl />);

    await user.upload(fileInput(), makeFile('meta.csv', 'Sample,Batch\nS1,B1\n'));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
    expect(screen.getByText(/no "Replicate" column/i)).toBeInTheDocument();
    expect(useStore.getState().metadata).toBeUndefined();
  });

  it('cancel discards the upload', async () => {
    const user = userEvent.setup();
    render(<UploadMetadataControl />);

    await user.upload(fileInput(), makeFile('meta.csv', 'Replicate,Batch\nS1,B1\n'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useStore.getState().metadata).toBeUndefined();
  });
});
