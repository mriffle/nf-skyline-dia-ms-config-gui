// One-off verification that clicking workflow-graph file nodes scrolls
// + focuses the corresponding form field.
import { chromium } from '@playwright/test';

const URL = 'http://localhost:5173/nf-skyline-dia-ms-config-gui/';
const STORE_KEY = 'nf-skyline-dia-ms.config-builder.v1';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

// Seed state: carafe enabled, source NOT set → Carafe input node should
// fall back to carafe.source as the formPath target.
await page.addInitScript(({ key }) => {
  localStorage.setItem(
    key,
    JSON.stringify({
      state: {
        mode: 'general',
        values: { use_carafe: true, search_engine: 'diann' },
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

const carafeNode = page.locator('g[role="button"][aria-label*="Carafe input"]');
await carafeNode.first().waitFor({ state: 'visible' });

const beforeRect = await page.locator('#field-carafe\\.source').boundingBox();
console.log('field-carafe.source y before click:', beforeRect?.y);

await carafeNode.first().click();
await page.waitForTimeout(700);

const afterRect = await page.locator('#field-carafe\\.source').boundingBox();
console.log('field-carafe.source y after click:', afterRect?.y);

const focusedField = await page.evaluate(() => {
  const f = document.activeElement;
  if (!f) return null;
  const closestField = f.closest('[id^="field-"]');
  return closestField ? closestField.id : null;
});
console.log('focused field-* container:', focusedField);

await page.screenshot({ path: 'screenshots/click-carafe-fallback.png', fullPage: false });

await browser.close();
console.log('\nDone — see screenshots/click-carafe-fallback.png');
