#!/usr/bin/env node
/* Assert that every element id the JS reaches for actually exists in the HTML.
 *
 * This app has ~120 hardcoded getElementById calls and no null checks, and
 * every module's setup runs inside its own DOMContentLoaded listener wrapped in
 * empty catch blocks. So a renamed or deleted id doesn't crash — it throws
 * inside one listener and silently removes that entire feature, and the app
 * still looks fine until someone taps the thing that no longer works.
 *
 * No build step, no dependencies, runs in about a second.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const TARGETS = [
  { html: 'dev/index.html', js: 'dev/js', label: '3.0 (dev)', blocking: true },
  // v1 is frozen and not shipped from this branch — report, don't block.
  { html: 'index.html', js: 'js', label: 'v1 (root)', blocking: false },
];

// Ids created at runtime rather than authored in the HTML: the two mission
// scenes inject their own SVG on first entry, and Store builds its error
// banner on demand.
const RUNTIME_IDS = new Set([
  'store-problem',
  'sky-scene', 'firefly-scene',
  'ff-flood', 'ff-jar-halo', 'ff-jar-pool',
]);

let failures = 0;

for (const t of TARGETS) {
  const htmlPath = path.join(ROOT, t.html);
  const jsDir = path.join(ROOT, t.js);
  if (!fs.existsSync(htmlPath) || !fs.existsSync(jsDir)) continue;

  const html = fs.readFileSync(htmlPath, 'utf8');
  const declared = new Set();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) declared.add(m[1]);

  // Duplicate ids: url(#x) and getElementById both resolve to the first match,
  // so duplicates are a silently-wrong-element bug waiting to happen.
  const seen = new Set(); const dupes = new Set();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) {
    if (seen.has(m[1])) dupes.add(m[1]);
    seen.add(m[1]);
  }

  const missing = [];
  for (const file of fs.readdirSync(jsDir).filter((f) => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(jsDir, file), 'utf8');
    src.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)) {
        const id = m[1];
        if (!declared.has(id) && !RUNTIME_IDS.has(id)) {
          missing.push(`${t.js}/${file}:${i + 1}  getElementById('${id}')`);
        }
      }
    });
  }

  const ok = !missing.length && !dupes.size;
  const tag = ok ? 'PASS' : (t.blocking ? 'FAIL' : 'WARN');
  console.log(`${tag}  ${t.label}: ${declared.size} ids declared`);
  missing.forEach((m) => console.log(`      missing id -> ${m}`));
  dupes.forEach((d) => console.log(`      duplicate id -> "${d}"`));
  if (!ok && t.blocking) failures++;
}

process.exit(failures ? 1 : 0);
