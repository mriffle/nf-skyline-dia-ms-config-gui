// Branch smoke for the wizard. Runs three scenarios past the engine screen
// to confirm shouldShow predicates skip / show the right screens:
//   A. PDC mode  → engine auto-locked to DIA-NN, vendor-RAW skipped,
//                  replicate-metadata skipped.
//   B. Cascadia  → FASTA, Library, Carafe, Empirical-library all skipped.
//   C. Carafe    → Carafe-input screen appears.
//
// Saves screenshots under screenshots/wizard-branches/.

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = resolve(__dirname, '..', 'screenshots', 'wizard-branches');

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

async function logScreens(page, label) {
  // Read all visible step labels in the progress strip.
  const labels = await page.locator('ol li button').evaluateAll((els) =>
    els.map((e) => e.textContent?.trim() ?? ''),
  );
  console.log(`[${label}] screens: ${labels.join(' | ')}`);
}

async function main() {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[browser:error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    console.log(`[browser:pageerror] ${err.message}`);
  });

  // ----- A. PDC — Vendor RAW screen appears once format=raw is picked.
  await fresh(page);
  await page.getByRole('radio', { name: /NCI Proteomic Data Commons/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForSelector('text=Input data');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/A-pdc-input.png`, fullPage: true });

  // Fill study id and advance through Workflow scope + Input format (pick Raw).
  await page.locator('input[type="text"]').first().fill('PDC000123');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForSelector('text=Spectra file format');
  await page.getByRole('radio', { name: /Thermo \.raw/ }).click();
  await logScreens(page, 'A.PDC+Raw');
  await page.getByRole('button', { name: 'Next' }).click();

  // Should land on Vendor RAW now that PDC + raw was chosen.
  await page.waitForSelector('text=Vendor RAW handling');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/A-pdc-vendor-raw.png`, fullPage: true });

  // ----- B. Cascadia -----
  await fresh(page);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('input[type="text"]').first().fill('/data/wide.mzML');
  await page.getByRole('button', { name: 'Next' }).click();
  // Conversion-only — keep default.
  await page.getByRole('button', { name: 'Next' }).click();
  // Input format — detection picked mzML; advance.
  await page.waitForSelector('text=Spectra file format');
  await page.getByRole('button', { name: 'Next' }).click();
  // Vendor RAW skipped for mzML → land on Engine.
  await page.waitForSelector('text=Search engine');
  await page.getByRole('radio', { name: /Cascadia/ }).click();
  await logScreens(page, 'B.Cascadia');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/B-cascadia-engine.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next' }).click();
  // Should land directly on Skyline (FASTA + Library + Empirical-lib skipped).
  await page.waitForSelector('text=Skyline document');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/B-cascadia-skyline.png`, fullPage: true });

  // ----- C. Carafe (DIA-NN) on mzML inputs -----
  await fresh(page);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('input[type="text"]').first().fill('/data/wide.mzML');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  // Input format — detected mzML.
  await page.getByRole('button', { name: 'Next' }).click();
  // Engine — DIA-NN preselected.
  await page.getByRole('button', { name: 'Next' }).click();
  // FASTA.
  await page.locator('input[type="text"]').first().fill('/db/human.fasta');
  await page.getByRole('button', { name: 'Next' }).click();
  // Library — pick Carafe.
  await page.waitForSelector('text=Spectral library');
  await page.getByRole('radio', { name: /Generate with Carafe/ }).click();
  await logScreens(page, 'C.Carafe');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/C-carafe-library.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next' }).click();
  // Should land on Carafe input.
  await page.waitForSelector('text=Carafe input');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/C-carafe-input.png`, fullPage: true });

  // ----- D. Raw + Direct + Carafe → demultiplex stays on the Vendor RAW screen -----
  await fresh(page);
  await page.getByRole('button', { name: 'Next' }).click();
  // Inputs: a .raw file path so detection picks Thermo Raw.
  await page.locator('input[type="text"]').first().fill('/data/wide.raw');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  // Input format — detected raw.
  await page.waitForSelector('text=Spectra file format');
  await page.getByRole('button', { name: 'Next' }).click();
  // Vendor RAW — pick Direct.
  await page.waitForSelector('text=Vendor RAW handling');
  await page.getByRole('radio', { name: /Feed RAW directly to DIA-NN/ }).click();
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/D-vendor-raw-direct.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next' }).click();
  // Engine — DIA-NN locked.
  await page.getByRole('button', { name: 'Next' }).click();
  // FASTA.
  await page.locator('input[type="text"]').first().fill('/db/human.fasta');
  await page.getByRole('button', { name: 'Next' }).click();
  // Library — pick Carafe.
  await page.getByRole('radio', { name: /Generate with Carafe/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  // Carafe input — the demultiplex block should NOT be present here any more.
  await page.waitForSelector('text=Carafe input');
  await logScreens(page, 'D.Direct+Carafe');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/D-carafe-no-demultiplex.png`, fullPage: true });

  // ----- E. PDC + Carafe + Explicit PDC file list -----
  await fresh(page);
  await page.getByRole('radio', { name: /NCI Proteomic Data Commons/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('input[type="text"]').first().fill('PDC000777');
  await page.getByRole('button', { name: 'Next' }).click();
  // Workflow scope — full.
  await page.getByRole('button', { name: 'Next' }).click();
  // Input format — pick mzML so the Vendor RAW screen is skipped.
  await page.waitForSelector('text=Spectra file format');
  await page.getByRole('radio', { name: /^mzML/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  // Engine — DIA-NN locked (PDC).
  await page.getByRole('button', { name: 'Next' }).click();
  // FASTA.
  await page.locator('input[type="text"]').first().fill('/db/human.fasta');
  await page.getByRole('button', { name: 'Next' }).click();
  // Library — Carafe.
  await page.getByRole('radio', { name: /Generate with Carafe/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  // Carafe input — source select, pick pdc-files.
  await page.waitForSelector('text=Carafe input');
  await page
    .locator('select')
    .first()
    .selectOption('pdc-files');
  // The carafe.pdc_files field should appear (a StringListInput).
  // Find its input by aria-label / nearby label text, then add two items.
  const labelField = page.locator('text=Carafe: explicit PDC file list');
  await labelField.waitFor({ state: 'visible', timeout: 2000 });
  // The string-list adds items on Enter — wire that up.
  const listInput = page
    .locator('div', { has: page.locator('text=Carafe: explicit PDC file list') })
    .locator('input[type="text"]')
    .last();
  await listInput.fill('study_file_1.raw');
  await listInput.press('Enter');
  await listInput.fill('study_file_2.raw');
  await listInput.press('Enter');
  await logScreens(page, 'E.PDC+Carafe+PdcFiles');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/E-pdc-carafe-pdc-files.png`, fullPage: true });

  console.log(`Wrote screenshots to ${SCREENSHOTS_DIR}/`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
