// End-to-end smoke for the Load-config feature. Drives a running dev
// server through several upload scenarios and reports pass/fail.
//
// Usage:  node scripts/upload-smoke.mjs [--port 5174]
//
// Requires `@playwright/test` installed (browsers via `npx playwright install chromium`).
// Assumes `npm run dev` is already running on the chosen port.

import { chromium } from '@playwright/test';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const GOLDEN_DIR = resolve(REPO_ROOT, 'src/emit/__tests__/golden');

const PORT = (() => {
  const i = process.argv.indexOf('--port');
  if (i !== -1 && process.argv[i + 1]) return Number(process.argv[i + 1]);
  return 5174;
})();
const URL = `http://localhost:${PORT}/nf-skyline-dia-ms-config-gui/`;
const STORAGE_KEY = 'nf-skyline-dia-ms.config-builder.v1';

let passed = 0;
let failed = 0;
const failures = [];

function pass(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name, err) {
  failed++;
  failures.push({ name, err: err?.message ?? String(err) });
  console.log(`  ✗ ${name}\n      ${err?.message ?? err}`);
}

async function withFreshPage(browser, scenario, fn) {
  console.log(`\n${scenario}`);
  // A fresh context starts with empty localStorage — no init script needed.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.getByRole('button', { name: /^Load config…$/i }).waitFor();
  try {
    await fn(page);
  } finally {
    await ctx.close();
  }
}

async function uploadFile(page, filePath) {
  // The file input is hidden but already in the DOM.
  const input = await page.locator('input[type="file"]').first();
  await input.setInputFiles(filePath);
}

async function expectDialogVisible(page, namePattern = /./) {
  const dialog = page.getByRole('dialog', { name: namePattern });
  await dialog.waitFor({ state: 'visible', timeout: 3000 });
  return dialog;
}

async function expectNoDialog(page) {
  // Wait a tick to let any pending state settle.
  await page.waitForTimeout(150);
  const count = await page.getByRole('dialog').count();
  if (count !== 0) throw new Error(`Expected no dialog, found ${count}`);
}

async function readStoreValue(page, path) {
  return await page.evaluate((p) => {
    const raw = window.localStorage.getItem(
      'nf-skyline-dia-ms.config-builder.v1',
    );
    if (!raw) return undefined;
    return JSON.parse(raw).state.values[p];
  }, path);
}

async function readStoreMode(page) {
  return await page.evaluate(() => {
    const raw = window.localStorage.getItem(
      'nf-skyline-dia-ms.config-builder.v1',
    );
    if (!raw) return undefined;
    return JSON.parse(raw).state.mode;
  });
}

async function main() {
  const browser = await chromium.launch();
  let tmpDir;
  try {
    tmpDir = await mkdtemp(join(tmpdir(), 'upload-smoke-'));

    // -------------------------------------------------------------------
    // Scenario A: load a valid general DIA-NN config
    // -------------------------------------------------------------------
    await withFreshPage(browser, 'A. general-diann-minimal.config (happy path)', async (page) => {
      try {
        await uploadFile(page, join(GOLDEN_DIR, 'general-diann-minimal.config'));
        const dialog = await expectDialogVisible(page, /load configuration/i);
        const text = await dialog.textContent();
        if (!/10 parameters? ready to load/.test(text)) {
          throw new Error(`Summary text wrong: ${text?.slice(0, 200)}`);
        }
        if (!/Mode:\s*General/.test(text)) throw new Error('Mode not "General"');
        if (!/Carafe:\s*disabled/.test(text)) throw new Error('Carafe not "disabled"');
        pass('preview dialog summary matches (10 params, General, Carafe disabled)');

        await page.getByRole('button', { name: /^Load$/ }).click();
        await expectNoDialog(page);
        pass('Load closes the dialog');

        const fasta = await readStoreValue(page, 'fasta');
        if (fasta !== '/db.fasta') throw new Error(`fasta = ${JSON.stringify(fasta)}`);
        pass('store has fasta = /db.fasta');

        const spectra = await readStoreValue(page, 'quant_spectra_dir');
        if (spectra?.kind !== 'single' || spectra.path !== '/data/wide') {
          throw new Error(`quant_spectra_dir = ${JSON.stringify(spectra)}`);
        }
        pass('quant_spectra_dir tagged as single with correct path');
      } catch (e) {
        fail('A. general-diann-minimal scenario', e);
      }
    });

    // -------------------------------------------------------------------
    // Scenario B: PDC config switches mode and infers Carafe
    // -------------------------------------------------------------------
    await withFreshPage(browser, 'B. pdc-carafe-sample.config (PDC + Carafe inference)', async (page) => {
      try {
        await uploadFile(page, join(GOLDEN_DIR, 'pdc-carafe-sample.config'));
        const dialog = await expectDialogVisible(page, /load configuration/i);
        const text = await dialog.textContent();
        if (!/Mode:\s*PDC/.test(text)) throw new Error(`Mode not "PDC": ${text?.slice(0, 200)}`);
        if (!/Carafe:\s*enabled\s*\(pdc-sample\)/.test(text)) {
          throw new Error(`Carafe inference wrong: ${text?.slice(0, 200)}`);
        }
        pass('detects Mode: PDC and Carafe: enabled (pdc-sample)');

        await page.getByRole('button', { name: /^Load$/ }).click();
        await expectNoDialog(page);

        const mode = await readStoreMode(page);
        if (mode !== 'pdc') throw new Error(`mode = ${mode}`);
        pass('store mode is pdc after Load');

        const studyId = await readStoreValue(page, 'pdc.study_id');
        if (studyId !== 'PDC000504') throw new Error(`pdc.study_id = ${studyId}`);
        pass('store has pdc.study_id = PDC000504');

        const useCarafe = await readStoreValue(page, 'use_carafe');
        if (useCarafe !== true) throw new Error(`use_carafe = ${useCarafe}`);
        pass('use_carafe inferred as true');
      } catch (e) {
        fail('B. pdc-carafe-sample scenario', e);
      }
    });

    // -------------------------------------------------------------------
    // Scenario C: parse-error dialog for a non-config file
    // -------------------------------------------------------------------
    await withFreshPage(browser, 'C. process { } only file → parse-error dialog', async (page) => {
      try {
        const badPath = join(tmpDir, 'bad.config');
        await writeFile(badPath, 'process { cpus = 4 }\n');
        await uploadFile(page, badPath);
        const dialog = await expectDialogVisible(page, /couldn.?t load/i);
        const text = await dialog.textContent();
        if (!/might not be a pipeline\.config/i.test(text)) {
          throw new Error(`Error message missing: ${text?.slice(0, 200)}`);
        }
        pass('error dialog appears with "might not be a pipeline.config"');

        await page.getByRole('button', { name: /^Close$/ }).click();
        await expectNoDialog(page);
        pass('Close dismisses the error dialog');
      } catch (e) {
        fail('C. parse-error scenario', e);
      }
    });

    // -------------------------------------------------------------------
    // Scenario D: replace warning shown when current state is touched
    // -------------------------------------------------------------------
    await withFreshPage(browser, 'D. replace warning when current form has touched values', async (page) => {
      try {
        // Pre-seed a touched value via localStorage envelope.
        await page.evaluate(() => {
          const env = {
            state: {
              mode: 'general',
              values: { fasta: '/preexisting.fasta', use_carafe: true, search_engine: 'diann' },
              touched: { fasta: true },
              showAdvanced: false,
              activeSection: null,
              storeVersion: 5,
            },
            version: 5,
          };
          window.localStorage.setItem(
            'nf-skyline-dia-ms.config-builder.v1',
            JSON.stringify(env),
          );
        });
        await page.reload();
        await page.getByRole('button', { name: /^Load config…$/i }).waitFor();

        await uploadFile(page, join(GOLDEN_DIR, 'general-diann-minimal.config'));
        const dialog = await expectDialogVisible(page, /load configuration/i);
        const text = await dialog.textContent();
        if (!/replace your current form values/i.test(text)) {
          throw new Error(`Replace warning missing: ${text?.slice(0, 200)}`);
        }
        pass('amber replace warning shown');

        await page.getByRole('button', { name: /^Cancel$/ }).click();
        await expectNoDialog(page);
        const fasta = await readStoreValue(page, 'fasta');
        if (fasta !== '/preexisting.fasta') {
          throw new Error(`Cancel modified fasta: ${fasta}`);
        }
        pass('Cancel preserves the existing value');
      } catch (e) {
        fail('D. replace warning scenario', e);
      }
    });

    // -------------------------------------------------------------------
    // Scenario E: discarded issues surfaced for type-mismatch + unknown
    // -------------------------------------------------------------------
    await withFreshPage(browser, 'E. discarded issues surfaced (type-mismatch + unknown)', async (page) => {
      try {
        const issuesPath = join(tmpDir, 'issues.config');
        await writeFile(
          issuesPath,
          `params {
  fasta = '/db.fasta'
  max_cpus = 'not-a-number'
  foo.unknown_param = 'whatever'
}
`,
        );
        await uploadFile(page, issuesPath);
        const dialog = await expectDialogVisible(page, /load configuration/i);
        const text = await dialog.textContent();
        if (!/discarded/i.test(text)) {
          throw new Error(`No discarded group: ${text?.slice(0, 300)}`);
        }
        if (!/max_cpus/.test(text)) throw new Error('max_cpus not in dialog');
        if (!/foo\.unknown_param/.test(text)) {
          throw new Error('foo.unknown_param not in dialog');
        }
        pass('dialog lists max_cpus (type-mismatch) and foo.unknown_param (unknown)');
      } catch (e) {
        fail('E. issue surfacing scenario', e);
      }
    });

    // -------------------------------------------------------------------
    // Scenario F: mode-ambiguity warning
    // -------------------------------------------------------------------
    await withFreshPage(browser, 'F. mode ambiguity (PDC + general inputs both present)', async (page) => {
      try {
        const ambigPath = join(tmpDir, 'ambig.config');
        await writeFile(
          ambigPath,
          `params {
  pdc.study_id = 'PDC000999'
  quant_spectra_dir = '/data/wide'
  search_engine = 'diann'
}
`,
        );
        await uploadFile(page, ambigPath);
        const dialog = await expectDialogVisible(page, /load configuration/i);
        const text = await dialog.textContent();
        if (!/picked PDC/i.test(text)) {
          throw new Error(`No mode-ambiguity note: ${text?.slice(0, 300)}`);
        }
        pass('amber "(file mixes both — picked PDC)" shown next to mode');
      } catch (e) {
        fail('F. mode ambiguity scenario', e);
      }
    });

    // -------------------------------------------------------------------
    // Scenario G: Escape closes the dialog
    // -------------------------------------------------------------------
    await withFreshPage(browser, 'G. Escape cancels the preview dialog', async (page) => {
      try {
        await uploadFile(page, join(GOLDEN_DIR, 'empty.config'));
        await expectDialogVisible(page, /load configuration/i);
        await page.keyboard.press('Escape');
        await expectNoDialog(page);
        pass('Escape closes the preview dialog');
      } catch (e) {
        fail('G. Escape scenario', e);
      }
    });
  } finally {
    await browser.close();
  }

  console.log('');
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.name}: ${f.err}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Smoke runner crashed:', err);
  process.exit(2);
});
