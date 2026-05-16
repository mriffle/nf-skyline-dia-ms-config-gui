// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UploadControl } from '../UploadControl';
import { useStore } from '../../../state/store';
import { createDefaultState } from '../../../state/formState';

beforeEach(() => {
  localStorage.clear();
  useStore.setState(createDefaultState());
});

function makeFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/plain' });
}

const VALID_CONFIG = `
params {
  fasta = '/db.fasta'
  quant_spectra_dir = '/data/wide'
  search_engine = 'diann'
}
`;

const VALID_PDC_CONFIG = `
params {
  pdc.study_id = 'PDC000123'
  search_engine = 'diann'
  fasta = '/db.fasta'
}
`;

const NOT_A_CONFIG = `
process {
  cpus = 4
}
`;

const TYPE_MISMATCH_CONFIG = `
params {
  fasta = '/db.fasta'
  max_cpus = 'not-a-number'
}
`;

describe('UploadControl — button', () => {
  it('renders the Load config button', () => {
    render(<UploadControl />);
    expect(screen.getByRole('button', { name: /load config/i })).toBeInTheDocument();
  });

  it('does not render any dialog initially', () => {
    render(<UploadControl />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('UploadControl — successful upload', () => {
  it('opens the preview dialog after a valid file is selected', async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();

    await user.upload(input, makeFile('pipeline.config', VALID_CONFIG));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByText(/pipeline\.config/)).toBeInTheDocument();
    expect(screen.getByText(/Mode:/)).toBeInTheDocument();
  });

  it('Cancel closes the dialog without changing store state', async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makeFile('pipeline.config', VALID_CONFIG));
    await waitFor(() => screen.getByRole('dialog'));

    const before = useStore.getState();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const after = useStore.getState();
    expect(after.values).toEqual(before.values);
    expect(after.touched).toEqual(before.touched);
  });

  it('Load commits the parsed state and closes the dialog', async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makeFile('pipeline.config', VALID_CONFIG));
    await waitFor(() => screen.getByRole('dialog'));

    await user.click(screen.getByRole('button', { name: /^load$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const s = useStore.getState();
    expect(s.values['fasta']).toBe('/db.fasta');
    expect(s.values['quant_spectra_dir']).toEqual({
      kind: 'single',
      path: '/data/wide',
    });
    expect(s.touched['fasta']).toBe(true);
    expect(s.mode).toBe('general');
  });

  it('switches to PDC mode for a PDC file', async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makeFile('pdc.config', VALID_PDC_CONFIG));
    await waitFor(() => screen.getByRole('dialog'));
    await user.click(screen.getByRole('button', { name: /^load$/i }));

    await waitFor(() => {
      expect(useStore.getState().mode).toBe('pdc');
    });
    expect(useStore.getState().values['pdc.study_id']).toBe('PDC000123');
  });

  it('Escape cancels the dialog', async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makeFile('pipeline.config', VALID_CONFIG));
    await waitFor(() => screen.getByRole('dialog'));

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('UploadControl — replace warning', () => {
  it('shows a replace warning when the current form has touched values', async () => {
    const user = userEvent.setup();
    act(() => {
      useStore.getState().setValue('fasta', '/old.fasta');
    });
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makeFile('pipeline.config', VALID_CONFIG));
    await waitFor(() => screen.getByRole('dialog'));

    expect(screen.getByText(/replace your current form values/i)).toBeInTheDocument();
  });

  it('does not show the replace warning when no values are touched', async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makeFile('pipeline.config', VALID_CONFIG));
    await waitFor(() => screen.getByRole('dialog'));

    expect(
      screen.queryByText(/replace your current form values/i),
    ).not.toBeInTheDocument();
  });
});

describe('UploadControl — error path', () => {
  it('shows the parse-error dialog when the file has no params block', async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makeFile('not-a-config.nf', NOT_A_CONFIG));

    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /couldn.?t load/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/might not be a pipeline\.config/i),
    ).toBeInTheDocument();
  });

  it('Close button dismisses the parse-error dialog', async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makeFile('bad.config', NOT_A_CONFIG));
    await waitFor(() =>
      screen.getByRole('dialog', { name: /couldn.?t load/i }),
    );

    await user.click(screen.getByRole('button', { name: /^close$/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('UploadControl — issue surfacing', () => {
  it('lists discarded entries in the preview', async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(
      input,
      makeFile('mixed.config', TYPE_MISMATCH_CONFIG),
    );
    await waitFor(() => screen.getByRole('dialog'));

    // The discarded group should appear with our type-mismatch entry.
    expect(screen.getByText(/discarded/i)).toBeInTheDocument();
    expect(screen.getByText(/max_cpus/)).toBeInTheDocument();
  });
});

describe('UploadControl — file picker plumbing', () => {
  it('clears the input value so the same file can be re-selected', async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, makeFile('a.config', VALID_CONFIG));
    await waitFor(() => screen.getByRole('dialog'));
    expect(input.value).toBe('');

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Same file should re-open the dialog.
    await user.upload(input, makeFile('a.config', VALID_CONFIG));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});

describe('UploadControl — silent file dialog cancel', () => {
  it('does nothing when the picker reports no file (user cancelled OS dialog)', async () => {
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    // Simulate the OS dialog being cancelled by firing change with no files.
    const evt = new Event('change', { bubbles: true });
    Object.defineProperty(input, 'files', {
      value: [],
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(evt);
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

// Suppress async logs from `act` warnings that React Testing Library
// occasionally surfaces during file-upload async flows.
vi.spyOn(console, 'error').mockImplementation(() => {});
