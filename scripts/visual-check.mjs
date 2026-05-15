// Visual regression / verification script for the new Workflow graph tab.
//
// Drives the running dev server (on :5174) through 10 scenarios and saves
// full-page screenshots to ../screenshots/. For each scenario we pre-seed
// localStorage with a Zustand-persist envelope BEFORE navigation, so the
// app boots into the desired state.
//
// Usage:  node scripts/visual-check.mjs [--port 5174]
//
// Requires `@playwright/test` installed (browsers via `npx playwright install chromium`).

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = resolve(__dirname, '..', 'screenshots');

const PORT = (() => {
  const i = process.argv.indexOf('--port');
  if (i !== -1 && process.argv[i + 1]) return Number(process.argv[i + 1]);
  return 5174;
})();
const URL = `http://localhost:${PORT}/nf-skyline-dia-ms-config-gui/`;
const STORAGE_KEY = 'nf-skyline-dia-ms.config-builder.v1';
const STORE_VERSION = 3;

/** Build the persist envelope Zustand expects. */
function envelope({ mode = 'general', values = {}, touched }) {
  const touchedMap =
    touched ??
    Object.fromEntries(Object.keys(values).map((k) => [k, true]));
  return {
    state: {
      mode,
      values,
      touched: touchedMap,
      showAdvanced: false,
      activeSection: null,
      storeVersion: STORE_VERSION,
    },
    version: STORE_VERSION,
  };
}

/** Each scenario seeds a fresh localStorage value before navigation. */
const scenarios = [
  {
    name: '01-empty-default',
    desc: 'Pristine state — only pre-seeded defaults (use_carafe + diann)',
    seed: null, // no localStorage; let createDefaultState run
    tab: 'graph',
  },
  {
    name: '02-diann-no-carafe',
    desc: 'DIA-NN, no Carafe, fasta + spectra filled, library blank',
    seed: envelope({
      mode: 'general',
      values: {
        use_carafe: false,
        search_engine: 'diann',
        fasta: '/db/human.fasta',
        quant_spectra_dir: { kind: 'single', path: '/data/wide.mzML' },
      },
    }),
    tab: 'graph',
  },
  {
    name: '03-encyclopedia',
    desc: 'EncyclopeDIA, no carafe, fasta + spectra filled, library blank (red)',
    seed: envelope({
      mode: 'general',
      values: {
        use_carafe: false,
        search_engine: 'encyclopedia',
        fasta: '/db/human.fasta',
        quant_spectra_dir: { kind: 'single', path: '/data/wide.mzML' },
      },
    }),
    tab: 'graph',
  },
  {
    name: '04-cascadia',
    desc: 'Cascadia: spectra filled, no FASTA needed; FASTA inactive; gen-fasta output node',
    seed: envelope({
      mode: 'general',
      values: {
        use_carafe: false,
        search_engine: 'cascadia',
        quant_spectra_dir: { kind: 'single', path: '/data/wide.mzML' },
      },
    }),
    tab: 'graph',
  },
  {
    name: '05-pdc-mode',
    desc: 'PDC mode: pdc.study_id set, fasta set, diann',
    seed: envelope({
      mode: 'pdc',
      values: {
        use_carafe: false,
        search_engine: 'diann',
        'pdc.study_id': 'PDC000123',
        fasta: '/db/human.fasta',
      },
    }),
    tab: 'graph',
  },
  {
    name: '06-carafe-enabled',
    desc: 'Carafe enabled with file source; full DIA-NN',
    seed: envelope({
      mode: 'general',
      values: {
        use_carafe: true,
        search_engine: 'diann',
        'carafe.source': 'file',
        'carafe.spectra_file': '/data/dda.mzML',
        fasta: '/db/human.fasta',
        quant_spectra_dir: { kind: 'single', path: '/data/wide.mzML' },
      },
    }),
    tab: 'graph',
  },
  {
    name: '07-msconvert-only',
    desc: 'msconvert_only=true — only spectra prep nodes active',
    seed: envelope({
      mode: 'general',
      values: {
        msconvert_only: true,
        use_carafe: false,
        search_engine: 'diann',
        quant_spectra_dir: { kind: 'single', path: '/data/wide.mzML' },
      },
    }),
    tab: 'graph',
  },
  {
    name: '08-skyline-skipped',
    desc: 'skyline.skip=true — no skyline doc / reports',
    seed: envelope({
      mode: 'general',
      values: {
        use_carafe: false,
        search_engine: 'diann',
        fasta: '/db/human.fasta',
        quant_spectra_dir: { kind: 'single', path: '/data/wide.mzML' },
        'skyline.skip': true,
      },
    }),
    tab: 'graph',
  },
  {
    name: '09-panorama-upload',
    desc: 'panorama.upload=true — Panorama node at end',
    seed: envelope({
      mode: 'general',
      values: {
        use_carafe: false,
        search_engine: 'diann',
        fasta: '/db/human.fasta',
        quant_spectra_dir: { kind: 'single', path: '/data/wide.mzML' },
        'panorama.upload': true,
      },
    }),
    tab: 'graph',
  },
  {
    name: '10-config-preview-regression',
    desc: 'Config preview tab regression check — DIA-NN scenario',
    seed: envelope({
      mode: 'general',
      values: {
        use_carafe: false,
        search_engine: 'diann',
        fasta: '/db/human.fasta',
        quant_spectra_dir: { kind: 'single', path: '/data/wide.mzML' },
      },
    }),
    tab: 'preview',
  },
];

async function run() {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  for (const scenario of scenarios) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      deviceScaleFactor: 1.5,
    });

    // Seed localStorage before page scripts run.
    await ctx.addInitScript(
      ({ key, payload }) => {
        try {
          if (payload === null) {
            window.localStorage.removeItem(key);
          } else {
            window.localStorage.setItem(key, JSON.stringify(payload));
          }
        } catch {
          /* ignore */
        }
      },
      { key: STORAGE_KEY, payload: scenario.seed }
    );

    const page = await ctx.newPage();
    page.on('pageerror', (err) => console.error(`[${scenario.name}] pageerror:`, err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error(`[${scenario.name}] console.error:`, msg.text());
    });

    await page.goto(URL, { waitUntil: 'networkidle' });

    // Switch tabs if needed. Default tab is "Config preview".
    if (scenario.tab === 'graph') {
      await page.getByRole('tab', { name: 'Workflow graph' }).click();
      // Wait for the workflow svg to render.
      await page.waitForSelector('svg[aria-label="Workflow graph"]', { timeout: 5000 });
    } else {
      await page.getByRole('tab', { name: 'Config preview' }).click();
    }

    // Small render settle pause — fonts, layout.
    await page.waitForTimeout(250);

    const outPath = resolve(SCREENSHOTS_DIR, `${scenario.name}.png`);
    await page.screenshot({ path: outPath, fullPage: true });

    // Also take a focused screenshot of the right pane only — much easier
    // to evaluate node text / edges / colors at a usable size.
    const rightPaneSelector =
      scenario.tab === 'graph'
        ? 'aside[aria-label="Workflow graph"]'
        : 'aside[aria-label="Config preview"]';
    const pane = await page.$(rightPaneSelector);
    if (pane) {
      const focusPath = resolve(SCREENSHOTS_DIR, `${scenario.name}-focus.png`);
      await pane.screenshot({ path: focusPath });
    }
    console.log(`✓ ${scenario.name}  (${scenario.desc})`);

    await ctx.close();
  }

  await browser.close();
  console.log(`\nAll screenshots saved to ${SCREENSHOTS_DIR}`);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
