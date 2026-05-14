import { useEffect, useRef, useState } from 'react';

interface HelpPopoverProps {
  readonly content: string;
  readonly label: string;
}

export function HelpPopover({ content, label }: HelpPopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      if (!wrapperRef.current) return;
      if (e.target instanceof Node && wrapperRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        aria-label={`Help: ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={[
          'inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-semibold text-slate-500',
          'hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent-500',
        ].join(' ')}
      >
        ?
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={`Help: ${label}`}
          className={[
            'absolute z-20 mt-1 w-72 rounded-md border border-slate-200 bg-white p-3 shadow-lg',
            'left-0 sm:left-auto sm:right-0',
            'text-[13px] leading-relaxed text-slate-700',
          ].join(' ')}
        >
          {content}
        </div>
      ) : null}
    </div>
  );
}
