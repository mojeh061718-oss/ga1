/* The one place that decides what "today" is.
 *
 * board.js, diary.js, hub.js and calendar.js each grew their own copy of this
 * line, which is how the app ended up able to write today's marks into
 * yesterday's record: the board only re-checked the date when the hub was
 * entered or the app was foregrounded, so a phone left on the hub across
 * midnight kept writing to the previous day forever.
 *
 * Key format is `YYYY-M-D`, NOT zero-padded. That is deliberate: every day
 * record already saved on the family's phones uses this shape, and changing it
 * would orphan the archive. Anything that needs ordering must parse the key
 * (see `ms`) rather than sorting the strings — `2026-10-1` sorts before
 * `2026-2-1` lexically.
 */
const Day = (() => {
  const listeners = [];
  let timer = null;
  let current = null;

  function keyFor(d) {
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function today() {
    return keyFor(new Date());
  }

  /* Local-midnight timestamp for a day key, for ordering and cutoffs. */
  function ms(key) {
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }

  function onRollover(fn) {
    listeners.push(fn);
  }

  function fire(next) {
    const prev = current;
    current = next;
    listeners.forEach((fn) => {
      try { fn(next, prev); } catch (err) { /* one bad listener must not stop the rest */ }
    });
  }

  /* Re-arm for the next local midnight. setTimeout is unreliable across sleep
   * and long backgrounding, so `check()` also runs on every foreground —
   * whichever notices first wins, and `current` keeps it idempotent. */
  function schedule() {
    clearTimeout(timer);
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    let delay = midnight.getTime() - now.getTime();
    // setTimeout saturates past ~24.8 days; a day always fits, but clamp anyway.
    if (!(delay > 0) || delay > 86400000) delay = 60000;
    timer = setTimeout(() => { check(); schedule(); }, delay);
  }

  function check() {
    const t = today();
    if (t !== current) fire(t);
    return t;
  }

  current = today();
  schedule();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { check(); schedule(); }
  });

  return { today, keyFor, ms, onRollover, check };
})();
