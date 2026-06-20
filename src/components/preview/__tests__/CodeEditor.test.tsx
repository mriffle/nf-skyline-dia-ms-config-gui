// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CodeEditor } from '../CodeEditor';

describe('CodeEditor — overlay editor', () => {
  it('renders the textarea bound to value and an aria-hidden highlight layer', () => {
    const { container } = render(
      <CodeEditor ariaLabel="Edit config text" value={"params {\n  fasta = '/db'\n}"} onChange={() => {}} />,
    );
    const ta = screen.getByLabelText('Edit config text') as HTMLTextAreaElement;
    expect(ta.value).toContain('fasta');

    // The highlight layer is a decorative <pre> with colored token spans.
    const pre = container.querySelector('pre[aria-hidden="true"]');
    expect(pre).not.toBeNull();
    // 'params' is a keyword → gets the accent token class.
    expect(pre?.querySelector('.text-accent-300')?.textContent).toBe('params');
    // The quoted string is rendered as a string token.
    expect(pre?.querySelector('.text-emerald-300')?.textContent).toContain("'/db'");
  });

  it('reports edits through onChange', () => {
    const onChange = vi.fn();
    render(<CodeEditor ariaLabel="Edit config text" value="params { }" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Edit config text'), {
      target: { value: 'params { x = 1 }' },
    });
    expect(onChange).toHaveBeenCalledWith('params { x = 1 }');
  });

  it('keeps the highlight layer in sync with the value it is given', () => {
    const { container, rerender } = render(
      <CodeEditor ariaLabel="Edit config text" value="params { }" onChange={() => {}} />,
    );
    rerender(
      <CodeEditor ariaLabel="Edit config text" value="search_engine = 'diann'" onChange={() => {}} />,
    );
    const pre = container.querySelector('pre[aria-hidden="true"]');
    expect(pre?.textContent).toContain("'diann'");
    expect(pre?.textContent).not.toContain('params');
  });
});
