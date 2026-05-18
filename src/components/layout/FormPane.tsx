// Renders all sections in metadata order, with the ModeToggle and the
// validation summary on top.

import { ModeToggle } from '../ModeToggle';
import { AdvancedToggle } from '../form/AdvancedToggle';
import { ValidationSummary } from '../form/ValidationSummary';
import { PreservedBlocksNotice } from '../form/PreservedBlocksNotice';
import { Section } from '../form/Section';
import { sections } from '../../params/sections';

export function FormPane() {
  return (
    <div className="w-full max-w-3xl">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <ModeToggle />
        <AdvancedToggle />
      </div>
      <ValidationSummary />
      <PreservedBlocksNotice />
      <div className="space-y-12">
        {sections.map((s) => (
          <Section key={s.id} section={s} />
        ))}
      </div>
    </div>
  );
}
