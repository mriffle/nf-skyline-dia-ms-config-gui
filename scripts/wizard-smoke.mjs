// Manual smoke driver for the wizard. Walks through a happy-path
// (General → DIA-NN → Predict from FASTA → finish) and screenshots each
// screen. Used during development; not part of the test suite.
//
// Usage:  node scripts/wizard-smoke.mjs [--port 5173]
//
// Requires @playwright/test installed.

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = resolve(__dirname, '..', 'screenshots', 'wizard');

const PORT = (() => {
  const i = process.argv.indexOf('--port');
  if (i !== -1 && process.argv[i + 1]) return Number(process.argv[i + 1]);
  return 5173;
})();
const URL = `http://localhost:${PORT}/nf-skyline-dia-ms-config-gui/`;
const STORAGE_KEY = 'nf-skyline-dia-ms.config-builder.v1';

async function main() {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Forward browser console errors to stdout so we see them here.
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[browser:error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    console.log(`[browser:pageerror] ${err.message}`);
  });

  // Clear localStorage for a fresh wizard run.
  await page.goto(URL);
  await page.evaluate((k) => localStorage.removeItem(k), STORAGE_KEY);
  await page.reload();

  // 1. Header — click Start wizard…
  await page.getByRole('button', { name: 'Start wizard…' }).click();
  await page.waitForSelector('text=Where are your spectra?');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/01-mode.png`, fullPage: true });

  // General is the default, so Next.
  await page.getByRole('button', { name: 'Next' }).click();

  // 2. Input data — fill the single spectra path.
  await page.waitForSelector('text=Input data');
  await page.locator('input[type="text"]').first().fill('/data/wide.mzML');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/02-input.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next' }).click();

  // 3. Conversion-only — pick Full workflow (default).
  await page.waitForSelector('text=What do you want to do?');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/03-conversion.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next' }).click();

  // 4. Input format — detection picked mzML (.mzML extension on the input
  // path). Confirm + advance.
  await page.waitForSelector('text=Spectra file format');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/04-format.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next' }).click();

  // Vendor RAW screen is skipped for mzML.

  // 5. Search engine — DIA-NN is preselected.
  await page.waitForSelector('text=Search engine');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/05-engine.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next' }).click();

  // 6. FASTA — fill it.
  await page.waitForSelector('text=Background FASTA');
  await page.locator('input[type="text"]').first().fill('/db/human.fasta');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/06-fasta.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next' }).click();

  // 7. Library strategy — pick Predict from FASTA.
  await page.waitForSelector('text=Spectral library');
  await page.getByRole('radio', { name: /Predict from FASTA/ }).click();
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/07-library.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next' }).click();

  // 8. Empirical library — default (No).
  await page.waitForSelector('text=Empirical library');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/08-empirical.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next' }).click();

  // 9. Skyline — default (Build).
  await page.waitForSelector('text=Skyline document');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/09-skyline.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next' }).click();

  // 10. Replicate metadata — default (No).
  await page.waitForSelector('text=Replicate metadata');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/10-metadata.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next' }).click();

  // 11. Reports — defaults (QC on, Batch off).
  await page.waitForSelector('text=QC and batch reports');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/11-reports.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next' }).click();

  // 12. Panorama — default (No).
  await page.waitForSelector('text=Panorama upload');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/12-panorama.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next' }).click();

  // 13. Execution — skip.
  await page.waitForSelector('text=Execution and output');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/13-execution.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next' }).click();

  // 14. Review — confirm preview renders.
  await page.waitForSelector('text=Review your config');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/14-review.png`, fullPage: true });

  console.log(`Wrote screenshots to ${SCREENSHOTS_DIR}/`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
