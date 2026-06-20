// Diagnostic for the editable preview: measures the read-only preview box
// vs the edit textarea box, and screenshots the edit + dialog states.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'screenshots', 'edit');
const PORT = (() => {
  const i = process.argv.indexOf('--port');
  return i !== -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : 5173;
})();
const URL = `http://localhost:${PORT}/nf-skyline-dia-ms-config-gui/`;

const box = async (loc) => {
  const b = await loc.boundingBox();
  return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
};

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(URL, { waitUntil: 'networkidle' });

  const aside = page.locator('aside[aria-label="Config preview"]');
  const roContent = aside.locator('> div').nth(0); // PreviewActions is first child div? measure pre instead
  const pre = aside.locator('pre');
  console.log('aside box        :', await box(aside));
  console.log('readonly pre box :', await box(pre));
  await page.screenshot({ path: resolve(OUT, '01-readonly.png') });

  // Enter edit mode
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.waitForTimeout(150);
  const ta = page.getByLabel('Edit config text');
  console.log('aside box (edit) :', await box(aside));
  console.log('textarea box     :', await box(ta));
  await page.screenshot({ path: resolve(OUT, '02-editing.png') });

  // Apply with a process block to trigger the confirm dialog
  const cfgWithNotices = `params {\n  fasta = '/db.fasta'\n  search_engine = 'diann'\n}\nprocess {\n  cpus = 4\n}\n`;
  await ta.fill(cfgWithNotices);
  await page.getByRole('button', { name: 'Apply' }).first().click();
  await page.waitForTimeout(200);
  const dialog = page.getByRole('dialog');
  console.log('dialog present   :', await dialog.count());
  console.log('dialog box       :', await box(dialog));
  await page.screenshot({ path: resolve(OUT, '03-confirm-dialog.png') });

  // Cancel the dialog, then trigger a syntax error
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(100);
  await ta.fill(`params {\n  fasta = 'unterminated\n}\n`);
  await page.getByRole('button', { name: 'Apply' }).first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(OUT, '04-syntax-error.png') });

  await browser.close();
  console.log('screenshots in', OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
