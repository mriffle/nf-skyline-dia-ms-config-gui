// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from '../clipboard';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copyToClipboard', () => {
  it('uses navigator.clipboard.writeText when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const ok = await copyToClipboard('hello');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('returns false when both async and legacy paths fail', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
    });
    const origExec = document.execCommand;
    document.execCommand = vi.fn().mockReturnValue(false);
    try {
      const ok = await copyToClipboard('hello');
      expect(ok).toBe(false);
    } finally {
      document.execCommand = origExec;
    }
  });
});
