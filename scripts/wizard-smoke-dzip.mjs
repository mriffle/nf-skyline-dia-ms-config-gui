// Verify Bruker .d.zip locks the engine to DIA-NN in both General and PDC
// paths. Saves a screenshot of each engine screen so the amber notice
// can be visually confirmed.

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = resolve(__dirname, '..', 'screenshots', 'wizard-dzip');

const PORT = (() => {
  const i = process.argv.indexOf('--port');
  if (i !== -1 && process.argv[i + 1]) return Number(process.argv[i + 1]);
  return 5173;
})();
const URL = `http://localhost:${PORT}/nf-skyline-dia-ms-config-gui/`;
const STORAGE_KEY = 'nf-skyline-dia-ms.config-builder.v1';

async function fresh(page) {
  await page.goto(URL);
  await page.evaluate((k) => localStorage.removeItem(k), STORAGE_KEY);
  await page.reload();
  await page.getByRole('button', { name: 'Start wizard…' }).click();
  await page.waitForSelector('text=Where are your spectra?');
}

async function main() {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`[browser:error] ${m.text()}`);
  });
  page.on('pageerror', (err) => console.log(`[browser:pageerror] ${err.message}`));

  // --- A. General + .d.zip ---
  await fresh(page);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('input[type="text"]').first().fill('/data/spectra/');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click(); // Workflow scope
  await page.waitForSelector('text=Spectra file format');
  await page.getByRole('radio', { name: /Bruker \.d\.zip/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForSelector('text=Search engine');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/general-dzip-engine.png`, fullPage: true });

  // --- B. PDC + .d.zip ---
  await fresh(page);
  await page.getByRole('radio', { name: /NCI Proteomic Data Commons/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('input[type="text"]').first().fill('PDC000999');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click(); // Workflow scope
  await page.waitForSelector('text=Spectra file format');
  await page.getByRole('radio', { name: /Bruker \.d\.zip/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForSelector('text=Search engine');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/pdc-dzip-engine.png`, fullPage: true });

  console.log(`Wrote screenshots to ${SCREENSHOTS_DIR}/`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
