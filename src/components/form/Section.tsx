// Renders a section: title + blurb + all of its fields, grouped by
// optional sub-group label. Returns null when all fields are hidden by
// visibility or by tier.

import { Fragment } from 'react';
import { paramMetadata, type ParamMeta } from '../../params/paramMetadata';
import type { Section as SectionDef } from '../../params/sections';
import { useStore } from '../../state/store';
import { useFormState } from '../../hooks/useValidation';
import { Field } from './Field';

interface SectionProps {
  readonly section: SectionDef;
}

function isRenderable(meta: ParamMeta, state: ReturnType<typeof useFormState>, showAdvanced: boolean): boolean {
  if (meta.visibleWhen && !meta.visibleWhen(state)) return false;
  if (meta.tier === 'advanced' && !showAdvanced) return false;
  return true;
}

export function Section({ section }: SectionProps) {
  const state = useFormState();
  const showAdvanced = useStore((s) => s.showAdvanced);

  const fields = paramMetadata.filter((m) => m.section === section.id);
  const visible = fields.filter((m) => isRenderable(m, state, showAdvanced));
  if (visible.length === 0) return null;

  // Group by `group` (or null/undefined) preserving original metadata order.
  const groups: { group: string | undefined; items: ParamMeta[] }[] = [];
  for (const f of visible) {
    const last = groups[groups.length - 1];
    if (last && last.group === f.group) {
      last.items.push(f);
    } else {
      groups.push({ group: f.group, items: [f] });
    }
  }

  return (
    <section id={`section-${section.id}`} aria-labelledby={`section-${section.id}-title`}>
      <h2
        id={`section-${section.id}-title`}
        className="text-[18px] font-semibold text-slate-900"
      >
        {section.title}
      </h2>
      <p className="mt-1 text-[13px] text-slate-600">{section.blurb}</p>
      <div className="mt-6 space-y-6">
        {groups.map((g, gi) => (
          <Fragment key={gi}>
            {g.group ? (
              <h3 className="text-[12px] font-medium uppercase tracking-wide text-slate-500">
                {g.group}
              </h3>
            ) : null}
            {g.items.map((m) => (
              <Field key={m.path} path={m.path} />
            ))}
          </Fragment>
        ))}
      </div>
    </section>
  );
}
