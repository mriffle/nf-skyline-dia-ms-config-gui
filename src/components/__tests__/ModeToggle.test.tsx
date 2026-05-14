// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModeToggle } from '../ModeToggle';
import { useStore } from '../../state/store';
import { createDefaultState } from '../../state/formState';

beforeEach(() => {
  localStorage.clear();
  useStore.setState(createDefaultState());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ModeToggle', () => {
  it('renders both options with general selected by default', () => {
    render(<ModeToggle />);
    const general = screen.getByRole('radio', { name: /general usage/i });
    const pdc = screen.getByRole('radio', { name: /pdc study/i });
    expect(general).toHaveAttribute('aria-checked', 'true');
    expect(pdc).toHaveAttribute('aria-checked', 'false');
  });

  it('switches to PDC mode without confirmation when no values would clear', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ModeToggle />);
    await user.click(screen.getByRole('radio', { name: /pdc study/i }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(useStore.getState().mode).toBe('pdc');
  });

  it('prompts before switching when a general-only value is set', async () => {
    const user = userEvent.setup();
    useStore.setState({
      values: { quant_spectra_dir: { kind: 'single', path: '/x' } },
      touched: { quant_spectra_dir: true },
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ModeToggle />);
    await user.click(screen.getByRole('radio', { name: /pdc study/i }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(useStore.getState().mode).toBe('pdc');
    expect(useStore.getState().values['quant_spectra_dir']).toBeUndefined();
  });

  it('aborts the switch when the user cancels confirmation', async () => {
    const user = userEvent.setup();
    useStore.setState({
      values: { quant_spectra_dir: { kind: 'single', path: '/x' } },
      touched: { quant_spectra_dir: true },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ModeToggle />);
    await user.click(screen.getByRole('radio', { name: /pdc study/i }));
    expect(useStore.getState().mode).toBe('general');
    expect(useStore.getState().values['quant_spectra_dir']).toEqual({
      kind: 'single',
      path: '/x',
    });
  });

  it('clicking the active mode is a no-op', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');
    render(<ModeToggle />);
    await user.click(screen.getByRole('radio', { name: /general usage/i }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(useStore.getState().mode).toBe('general');
  });
});
