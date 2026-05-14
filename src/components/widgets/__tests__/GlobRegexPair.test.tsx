// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GlobRegexPair } from '../GlobRegexPair';
import { useStore } from '../../../state/store';
import { createDefaultState } from '../../../state/formState';
import type { ParamMeta } from '../../../params/paramMetadata';

const META: ParamMeta = {
  path: 'quant_spectra_files',
  section: 'input-general',
  label: 'Quant spectra file matching',
  help: 'help',
  tier: 'common',
  widget: 'glob-regex-pair',
  virtual: true,
  affects: ['quant_spectra_glob', 'quant_spectra_regex'],
};

beforeEach(() => {
  localStorage.clear();
  useStore.setState(createDefaultState());
});

function renderWidget() {
  return render(
    <GlobRegexPair
      meta={META}
      value={undefined}
      onChange={() => {}}
      inputId="gr"
    />,
  );
}

describe('GlobRegexPair', () => {
  it('defaults to glob mode with the regex input disabled', () => {
    renderWidget();
    const globInput = screen.getByLabelText(/^glob$/i);
    const regexInput = screen.getByLabelText(/^regex$/i);
    expect(globInput).not.toBeDisabled();
    expect(regexInput).toBeDisabled();
    const radio = screen.getByRole('radio', { name: /use glob/i });
    expect(radio).toBeChecked();
  });

  it('starts in regex mode when only the regex value is set', () => {
    useStore.setState({ values: { quant_spectra_regex: '^.+$' } });
    renderWidget();
    expect(screen.getByLabelText(/^regex$/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/^glob$/i)).toBeDisabled();
    expect(screen.getByRole('radio', { name: /use regex/i })).toBeChecked();
  });

  it('writes the glob value into the store on input', async () => {
    const user = userEvent.setup();
    renderWidget();
    await user.type(screen.getByLabelText(/^glob$/i), '*.mzML');
    expect(useStore.getState().values['quant_spectra_glob']).toBe('*.mzML');
    expect(useStore.getState().touched['quant_spectra_glob']).toBe(true);
  });

  it('switching to regex mode clears the existing glob value', async () => {
    const user = userEvent.setup();
    useStore.setState({
      values: { quant_spectra_glob: '*.raw' },
      touched: { quant_spectra_glob: true },
    });
    renderWidget();
    await user.click(screen.getByRole('radio', { name: /use regex/i }));
    expect(useStore.getState().values['quant_spectra_glob']).toBeUndefined();
  });

  it('switching back to glob mode clears the regex value', async () => {
    const user = userEvent.setup();
    useStore.setState({
      values: { quant_spectra_regex: '^.+$' },
      touched: { quant_spectra_regex: true },
    });
    renderWidget();
    await user.click(screen.getByRole('radio', { name: /use glob/i }));
    expect(useStore.getState().values['quant_spectra_regex']).toBeUndefined();
  });
});
