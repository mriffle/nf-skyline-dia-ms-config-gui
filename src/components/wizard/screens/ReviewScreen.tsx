import { PreviewPane } from '../../preview/PreviewPane';
import { ValidationSummary } from '../../form/ValidationSummary';

export function ReviewScreen() {
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Here is the generated <code className="rounded bg-slate-100 px-1 font-mono text-[12px]">pipeline.config</code>.
        Use the buttons in the preview to copy or download it. If you want to
        adjust anything else, click Finish to drop into the full form view —
        your inputs are preserved.
      </p>
      <ValidationSummary />
      <div className="h-[60vh] min-h-[400px]">
        <PreviewPane />
      </div>
    </div>
  );
}
