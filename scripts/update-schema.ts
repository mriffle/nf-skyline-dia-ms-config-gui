// Fetch the latest nextflow_schema.json from the upstream workflow repo and
// write it to the repo root. After this, run `npm run regen-schema` (or use
// the combined `npm run update-schema` script which does both in one step).
//
// The vendored schema is committed to git so PRs make schema drift visible.

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UPSTREAM_URL =
  'https://raw.githubusercontent.com/mriffle/nf-skyline-dia-ms/main/nextflow_schema.json';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '..', 'nextflow_schema.json');

const res = await fetch(UPSTREAM_URL);
if (!res.ok) {
  throw new Error(`Failed to fetch schema: ${res.status} ${res.statusText}`);
}
const body = await res.text();

// Validate it's actually JSON before writing.
try {
  JSON.parse(body);
} catch (err) {
  throw new Error(`Upstream response was not valid JSON: ${(err as Error).message}`);
}

writeFileSync(outPath, body, 'utf8');
// eslint-disable-next-line no-console
console.log(`Wrote ${body.length} bytes to ${outPath} from ${UPSTREAM_URL}`);
