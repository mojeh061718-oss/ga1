#!/usr/bin/env node
/* Headless smoke test for the 3.0 app.
 *
 * Deliberately narrow: it answers "is the app alive and can she reach every
 * screen", which is currently only detectable by a human holding a phone. A
 * single throw inside any module's DOMContentLoaded listener silently removes
 * that feature, so console/page errors are treated as failures.
 *
 *   node tools/smoke.js            # needs a server on :8099 serving the repo
 */
const { chromium } = require('playwright');

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:8099/dev/';
const SCREENS = ['hub', 'home', 'beacon', 'breathing', 'bridge', 'sky',
                 'fireflies', 'diary', 'calendar'];
const DEVICES = [
  { tag: 'iPhone 14', w: 390, h: 844 },
  { tag: 'iPhone SE', w: 320, h: 568 },
];

// The pantry relay is unreachable in CI; a failed sync is expected and is not
// an app defect.
const IGNORE = [/getpantry\.cloud/i, /ERR_CONNECTION/i, /Failed to load resource/i];

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${msg}`); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch();

  for (const d of DEVICES) {
    console.log(`\n${d.tag} (${d.w}x${d.h})`);
    const ctx = await browser.newContext({
      viewport: { width: d.w, height: d.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    const errors = [];
    const note = (t) => { if (!IGNORE.some((r) => r.test(t))) errors.push(t); };
    page.on('pageerror', (e) => note(String(e.message)));
    page.on('console', (m) => { if (m.type() === 'error') note(m.text()); });

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    check(await page.$('#screen-login.active') !== null, 'launches on the login screen');

    // Every screen must be reachable and actually become visible.
    for (const s of SCREENS) {
      await page.evaluate((n) => App.show(n), s);
      await page.waitForTimeout(450);
      const visible = await page.evaluate((n) => {
        const el = document.getElementById('screen-' + n);
        return !!el && el.classList.contains('active') && getComputedStyle(el).visibility === 'visible';
      }, s);
      check(visible, `screen "${s}" opens`);
    }

    // No page-level horizontal overflow at either width.
    await page.evaluate(() => App.show('hub'));
    await page.waitForTimeout(300);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    check(scrollW <= d.w, `no horizontal overflow (scrollWidth ${scrollW} <= ${d.w})`);

    // The hub's nav is the only way out of the hub — it must be on screen even
    // with both banners up, which is the state a hard evening produces.
    const navOk = await page.evaluate((vh) => {
      const b = document.getElementById('hub-banner');
      b.className = 'warning';
      b.textContent = '⚠ WARNING: MAELIE IS AT RISK OF SUSPENSION';
      document.getElementById('hub-checkin-banner').classList.remove('hidden');
      const nav = document.getElementById('hub-nav');
      const sc = document.getElementById('screen-hub');
      const r = nav.getBoundingClientRect();
      // Reachable = on screen, or scrollable into view.
      return r.bottom <= vh + 1 || sc.scrollHeight > sc.clientHeight;
    }, d.h);
    check(navOk, 'hub nav stays reachable with both banners');

    // Mission hints must not bleed off either edge (the bridge hint did).
    const bleeding = await page.evaluate((vw) => {
      const out = [];
      document.querySelectorAll('.mission-hint').forEach((el) => {
        const sc = el.closest('.screen');
        sc.classList.add('active');
        const r = el.getBoundingClientRect();
        if (r.left < -0.5 || r.right > vw + 0.5) out.push(sc.id);
        sc.classList.remove('active');
      });
      return out;
    }, d.w);
    check(bleeding.length === 0, `mission hints fit${bleeding.length ? ' — bleeding: ' + bleeding.join(', ') : ''}`);

    check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''}`);
    await ctx.close();
  }

  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})();
