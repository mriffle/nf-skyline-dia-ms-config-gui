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

// Files that are syntactically broken (well-formedness check fails) get
// rejected outright. No state gets loaded; the user is shown the offending
// lines so they can fix the source.
describe('UploadControl — syntax-error rejection', () => {
  const UNTERMINATED_STRING = [
    'params {',
    "  fasta = '/db.fasta",
    "  search_engine = 'diann'",
    '}',
  ].join('\n');

  const COMMENTED_LIST_OPENER = [
    'params {',
    "  // pdc.batch_files = ['/a'",
    "    '/b']",
    "  pdc.study_id = 'PDC0001'",
    '}',
  ].join('\n');

  const MISMATCHED_CLOSER = [
    'params {',
    '  list = [1, 2, 3}',
    '}',
  ].join('\n');

  it("shows the syntax-error dialog (not the parse-error dialog) for an unterminated string", async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(
      input,
      makeFile('broken.config', UNTERMINATED_STRING),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /syntax errors/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/syntactically valid/i)).toBeInTheDocument();
    expect(screen.getByText(/Unterminated/i)).toBeInTheDocument();
  });

  it('renders a snippet with the offending source line', async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(
      input,
      makeFile('broken.config', UNTERMINATED_STRING),
    );

    await waitFor(() =>
      screen.getByRole('dialog', { name: /syntax errors/i }),
    );

    // The pre containing the snippet should include the malformed line.
    // We don't pin layout; just confirm the source content appears.
    expect(screen.getByText(/fasta = '\/db\.fasta/)).toBeInTheDocument();
  });

  it('does not load anything into the store when rejected', async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const before = useStore.getState();
    await user.upload(
      input,
      makeFile('broken.config', UNTERMINATED_STRING),
    );
    await waitFor(() =>
      screen.getByRole('dialog', { name: /syntax errors/i }),
    );
    const after = useStore.getState();
    expect(after.values).toEqual(before.values);
    expect(after.touched).toEqual(before.touched);
    expect(after.mode).toBe(before.mode);
  });

  it("flags the user's commented-multiline-list scenario", async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(
      input,
      makeFile('broken.config', COMMENTED_LIST_OPENER),
    );

    await waitFor(() =>
      screen.getByRole('dialog', { name: /syntax errors/i }),
    );
    // The orphan `]` makes well-formedness fail. The exact wording can
    // shift; we just verify the dialog is in the syntax-error variant.
    expect(screen.getByText(/syntactically valid/i)).toBeInTheDocument();
  });

  it('flags a mismatched closer (} where ] was expected)', async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makeFile('broken.config', MISMATCHED_CLOSER));

    await waitFor(() =>
      screen.getByRole('dialog', { name: /syntax errors/i }),
    );
    // The mismatched `}` shows up in at least one of the syntax-issue
    // messages (e.g. "Mismatched '}' — expected ']' …").
    expect(screen.getAllByText(/Mismatched/).length).toBeGreaterThan(0);
  });

  it('Close button dismisses the syntax-error dialog', async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(
      input,
      makeFile('broken.config', UNTERMINATED_STRING),
    );
    await waitFor(() =>
      screen.getByRole('dialog', { name: /syntax errors/i }),
    );

    await user.click(screen.getByRole('button', { name: /^close$/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

// The well-formedness gate has a known weakness: any false positive in
// our checker would otherwise be a hard block. The "Import" button on
// the syntax-errors dialog lets the user override the gate at their
// own risk.
describe('UploadControl — Import bypass', () => {
  // A file the checker would flag as malformed but whose params block
  // still contains a salvageable entry. The unterminated string DOES
  // load with a truncated value because the lexer treats the newline as
  // the terminator — that's fine; the user has been warned.
  const MALFORMED_BUT_RECOVERABLE = [
    'params {',
    "  fasta = '/db.fasta",
    "  search_engine = 'diann'",
    '}',
  ].join('\n');

  // A malformed file with NO params block — the bypass should still
  // fall through to the no-params-block error dialog rather than load.
  const MALFORMED_AND_NO_PARAMS = [
    'process {',
    "  withName:X { memory = '24.GB",  // unterm string AND no params
    '  }',
    '}',
  ].join('\n');

  it('shows the "Import" button on the syntax-errors dialog', async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(
      input,
      makeFile('broken.config', MALFORMED_BUT_RECOVERABLE),
    );

    await waitFor(() =>
      screen.getByRole('dialog', { name: /syntax errors/i }),
    );
    expect(
      screen.getByRole('button', { name: /^import$/i }),
    ).toBeInTheDocument();
  });

  it("shows warning copy explaining the bypass is risky", async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(
      input,
      makeFile('broken.config', MALFORMED_BUT_RECOVERABLE),
    );
    await waitFor(() =>
      screen.getByRole('dialog', { name: /syntax errors/i }),
    );

    // The warning should make clear the risk in plain language.
    expect(
      screen.getByText(/partial or incorrect data may load/i),
    ).toBeInTheDocument();
  });

  it("does NOT show the bypass button on the no-params-block dialog", async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    // NOT_A_CONFIG is `process { cpus = 4 }` — well-formed but has no
    // params block. Hits the no-params variant.
    await user.upload(input, makeFile('bad.config', NOT_A_CONFIG));

    await waitFor(() =>
      screen.getByRole('dialog', { name: /couldn.?t load/i }),
    );
    expect(
      screen.queryByRole('button', { name: /^import$/i }),
    ).not.toBeInTheDocument();
  });

  it('clicking "Import" advances to the preview dialog', async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(
      input,
      makeFile('broken.config', MALFORMED_BUT_RECOVERABLE),
    );
    await waitFor(() =>
      screen.getByRole('dialog', { name: /syntax errors/i }),
    );

    await user.click(
      screen.getByRole('button', { name: /^import$/i }),
    );

    // The preview dialog uses the "Load" affirmative button name.
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /^load$/i }),
      ).toBeInTheDocument();
    });
    // The syntax-error dialog should be gone.
    expect(
      screen.queryByRole('dialog', { name: /syntax errors/i }),
    ).not.toBeInTheDocument();
  });

  it('clicking Load from the preview after a bypass commits to the store', async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(
      input,
      makeFile('broken.config', MALFORMED_BUT_RECOVERABLE),
    );
    await waitFor(() =>
      screen.getByRole('dialog', { name: /syntax errors/i }),
    );

    await user.click(
      screen.getByRole('button', { name: /^import$/i }),
    );
    await waitFor(() =>
      screen.getByRole('button', { name: /^load$/i }),
    );
    await user.click(screen.getByRole('button', { name: /^load$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    // At minimum, the well-formed entry from the file loaded.
    expect(useStore.getState().values['search_engine']).toBe('diann');
  });

  it("bypass falls through to the no-params-block error when there's nothing to load", async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(
      input,
      makeFile('broken.config', MALFORMED_AND_NO_PARAMS),
    );
    await waitFor(() =>
      screen.getByRole('dialog', { name: /syntax errors/i }),
    );

    await user.click(
      screen.getByRole('button', { name: /^import$/i }),
    );

    // The syntax dialog is replaced by the no-params dialog (same
    // component, different variant).
    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /couldn.?t load/i }),
      ).toBeInTheDocument();
    });
    // No bypass button on the no-params variant.
    expect(
      screen.queryByRole('button', { name: /^import$/i }),
    ).not.toBeInTheDocument();
  });

  it("clicking Close after a bypass does NOT load anything", async () => {
    const user = userEvent.setup();
    render(<UploadControl />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const before = useStore.getState();
    await user.upload(
      input,
      makeFile('broken.config', MALFORMED_BUT_RECOVERABLE),
    );
    await waitFor(() =>
      screen.getByRole('dialog', { name: /syntax errors/i }),
    );

    // User just hits Close — bypass is NOT triggered.
    await user.click(screen.getByRole('button', { name: /^close$/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const after = useStore.getState();
    expect(after.values).toEqual(before.values);
    expect(after.touched).toEqual(before.touched);
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
