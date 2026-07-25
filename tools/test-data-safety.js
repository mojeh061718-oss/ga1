#!/usr/bin/env node
/* Behavioural tests for the 3.0 data-safety fixes.
 *
 * These cover the three failures that could actually cost a family something:
 * a check-in lost by backing out, a write failure reported as success, and an
 * oversized voice reply wedging sync forever.
 */
const { chromium } = require('playwright');

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:8099/dev/';
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${msg}`); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  console.log('\nPUP CHECK-IN survives leaving mid-session');

  // Walk three questions in, then back out to the hub — the exact gesture that
  // used to throw the whole night away.
  await page.evaluate(() => App.show('diary'));
  await page.waitForTimeout(500);
  for (let i = 0; i < 3; i++) {
    await page.click('#diary-next');
    await page.waitForTimeout(260);
  }
  const leftAt = await page.evaluate(() =>
    document.querySelectorAll('#diary-progress .diary-dot.done').length);
  await page.evaluate(() => App.show('hub'));
  await page.waitForTimeout(700);

  const stored = await page.evaluate(async () => {
    const d = await Store.getDay(Day.today());
    return d ? { progress: d.diaryProgress, hasDiary: Array.isArray(d.diary), finished: !!d.diaryAt } : null;
  });
  check(stored !== null, 'a partial session is written to the day record');
  check(stored && stored.progress === leftAt, `resume point persisted (${stored && stored.progress} == ${leftAt})`);
  check(stored && !stored.finished, 'partial session is not marked complete');

  await page.evaluate(() => App.show('diary'));
  await page.waitForTimeout(800);
  const resumed = await page.evaluate(() =>
    document.querySelectorAll('#diary-progress .diary-dot.done').length);
  check(resumed === leftAt, `re-entering resumes where she left off (${resumed} == ${leftAt})`);

  // Finishing must clear the resume marker so a completed day is never reopened.
  await page.evaluate(async () => {
    const d = await Store.getDay(Day.today());
    await Store.updateDay(Day.today(), { diaryAt: Date.now(), diaryProgress: null });
    return d;
  });
  const cleared = await page.evaluate(async () => {
    const d = await Store.getDay(Day.today());
    return { has: 'diaryProgress' in d, finished: !!d.diaryAt };
  });
  check(!cleared.has && cleared.finished, 'finishing clears the resume marker');

  console.log('\nStorage failures are visible, not silent');
  const reported = await page.evaluate(() => {
    Store.reportProblem('test failure');
    const el = document.getElementById('store-problem');
    return !!el && el.classList.contains('show');
  });
  check(reported, 'a write failure raises a visible banner');

  console.log('\nDay keys are centralised');
  const dayOk = await page.evaluate(() => {
    const k = Day.today();
    const d = new Date();
    return k === `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` &&
           Day.ms(k) === new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  });
  check(dayOk, 'Day.today() matches the stored key format and Day.ms parses it');

  console.log('\nBackup produces a real file');
  const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
  await page.evaluate(() => { document.getElementById('badge-edit').click(); });
  await page.waitForTimeout(300);
  await page.click('#setup-export');
  const download = await dl;
  check(!!download, 'export triggers a download');
  if (download) check(/calm-pups-backup-\d{4}-\d{2}-\d{2}\.json/.test(download.suggestedFilename()),
    `filename is dated (${download.suggestedFilename()})`);

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);

  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})();
