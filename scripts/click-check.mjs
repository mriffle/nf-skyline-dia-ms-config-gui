// One-off verification that clicking a workflow-graph file node
// scrolls + focuses the corresponding form field.
import { chromium } from '@playwright/test';

const URL = 'http://localhost:5173/nf-skyline-dia-ms-config-gui/';
const STORE_KEY = 'nf-skyline-dia-ms.config-builder.v1';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

// Seed an empty default state (no spectra/fasta set; carafe default off so
// the FASTA node appears).
await page.addInitScript(({ key }) => {
  localStorage.setItem(
    key,
    JSON.stringify({
      state: {
        mode: 'general',
        values: { use_carafe: false, search_engine: 'diann' },
        touched: { use_carafe: true, search_engine: true },
        showAdvanced: false,
        activeSection: null,
        storeVersion: 3,
      },
      version: 0,
    }),
  );
}, { key: STORE_KEY });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.getByRole('tab', { name: 'Workflow graph' }).click();

// Find the FASTA node ("FASTA database" sublabel) and click it.
const fastaNode = page.locator('g[role="button"][aria-label*="FASTA database"]');
await fastaNode.first().waitFor({ state: 'visible' });

// Capture pre-click state of #field-fasta — should be scrolled to viewport top
// or below depending on initial position.
const beforeRect = await page.locator('#field-fasta').boundingBox();
console.log('field-fasta y before click:', beforeRect?.y);

await fastaNode.first().click();

// Wait for the smooth scroll to settle, then re-measure.
await page.waitForTimeout(700);

const afterRect = await page.locator('#field-fasta').boundingBox();
console.log('field-fasta y after click:', afterRect?.y);

// Check the input itself is focused.
const focusedTagInsideField = await page.evaluate(() => {
  const f = document.activeElement;
  if (!f) return null;
  const closestField = f.closest('[id^="field-"]');
  return closestField ? closestField.id : null;
});
console.log('focused field-* container:', focusedTagInsideField);

// Confirm the flash class was applied (it should still be active for ~1100ms).
const hasFlash = await page.locator('#field-fasta.wf-field-flash').count();
console.log('flash class present (during animation):', hasFlash > 0);

// Screenshot the post-click state for visual confirmation.
await page.screenshot({ path: 'screenshots/click-check.png', fullPage: false });

await browser.close();
console.log('\nDone — see screenshots/click-check.png');
