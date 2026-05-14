// Left-side navigation: a list of sections with the active one highlighted.
// On medium screens it collapses to a horizontal scroll; on small screens
// it becomes a select dropdown.

import { sections } from '../../params/sections';
import { paramMetadata, type ParamMeta, type SectionId } from '../../params/paramMetadata';
import { useStore } from '../../state/store';
import { useFormState } from '../../hooks/useValidation';

function isRenderable(
  meta: ParamMeta,
  state: ReturnType<typeof useFormState>,
  showAdvanced: boolean,
): boolean {
  if (meta.visibleWhen && !meta.visibleWhen(state)) return false;
  if (meta.tier === 'advanced' && !showAdvanced) return false;
  return true;
}

function useVisibleSectionIds(): readonly SectionId[] {
  const state = useFormState();
  const showAdvanced = useStore((s) => s.showAdvanced);
  const ids: SectionId[] = [];
  for (const s of sections) {
    const has = paramMetadata.some(
      (m) => m.section === s.id && isRenderable(m, state, showAdvanced),
    );
    if (has) ids.push(s.id);
  }
  return ids;
}

function scrollToSection(id: SectionId): void {
  const el = document.getElementById(`section-${id}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function SectionNav() {
  const activeSection = useStore((s) => s.activeSection);
  const setActiveSection = useStore((s) => s.setActiveSection);
  const visible = useVisibleSectionIds();
  const visibleSections = sections.filter((s) => visible.includes(s.id));

  const onClick = (id: SectionId): void => {
    setActiveSection(id);
    scrollToSection(id);
  };

  return (
    <>
      {/* Small screens: select dropdown */}
      <div className="sm:hidden">
        <label htmlFor="section-select" className="sr-only">
          Jump to section
        </label>
        <select
          id="section-select"
          className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          value={activeSection ?? ''}
          onChange={(e) => {
            const id = e.target.value as SectionId;
            if (id) onClick(id);
          }}
        >
          <option value="" disabled>
            Jump to section
          </option>
          {visibleSections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>

      {/* Medium screens: horizontal scrollable pill list */}
      <nav
        aria-label="Sections"
        className="hidden overflow-x-auto sm:block lg:hidden"
      >
        <ul className="flex gap-1 whitespace-nowrap pb-1">
          {visibleSections.map((s) => {
            const active = s.id === activeSection;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onClick(s.id)}
                  className={[
                    'rounded-md px-3 py-1.5 text-sm font-medium',
                    'focus:outline-none focus:ring-2 focus:ring-accent-500',
                    active
                      ? 'bg-accent-50 text-accent-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  ].join(' ')}
                >
                  {s.title}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Large screens: sticky sidebar list */}
      <nav
        aria-label="Sections"
        className="hidden lg:block lg:sticky lg:top-6"
      >
        <ul className="space-y-1">
          {visibleSections.map((s) => {
            const active = s.id === activeSection;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onClick(s.id)}
                  className={[
                    'block w-full rounded-md px-3 py-1.5 text-left text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-accent-500',
                    active
                      ? 'bg-accent-50 font-semibold text-accent-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  ].join(' ')}
                >
                  {s.title}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
