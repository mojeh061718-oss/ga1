/* PAW MAIL cross-device sync (DEV).
 *
 * Every device keeps the FULL mailbox in IndexedDB — the remote store is only
 * a relay. The relay is getpantry.cloud: a free, no-account JSON store. If the
 * pantry ever disappears, the next device that syncs re-uploads everything it
 * has (self-healing); a daily GitHub Actions ping keeps the pantry from
 * expiring in the first place.
 *
 * Remote layout (baskets under one pantry):
 *   mailbox            { rev, letters: [ {id, subject, text, at, opened,
 *                        deleted?, photo?: basketName,
 *                        replies: [{at, mime, basket}] } ] }
 *   p-<letterId>       { d: <dataURL> }                  — "from" photo
 *   r-<letterId>-<at>  { d: <dataURL>, mime }            — one voice reply
 * The index stays tiny; big blobs each get their own basket (limit ~1.4MB).
 *
 * Merge rules: letters union by id; deleted (tombstone) beats alive; replies
 * union by `at`; opened is sticky-true. Deletions stay as tombstones on both
 * sides so a dead letter can never resurrect from another device.
 */
const MailSync = (() => {
  const PANTRY_ID = 'c543c575-8429-4573-988f-df6dbc46b73e'; // the family mailbox store
  const BASE = 'https://getpantry.cloud/apiv1/pantry/';
  const POLL_MS = 90 * 1000;
  const DEBOUNCE_MS = 1500;

  const enabled = () => PANTRY_ID && !PANTRY_ID.startsWith('__');

  let syncing = false;
  let queued = false;
  let kickTimer = null;

  const dot = () => document.getElementById('mail-sync-dot');
  function setDot(state) {
    const d = dot();
    if (!d) return;
    d.classList.toggle('hidden', !enabled());
    d.classList.remove('ok', 'busy', 'fail');
    if (state) d.classList.add(state);
  }

  // ---- pantry I/O ----
  function url(basket) { return BASE + PANTRY_ID + '/basket/' + basket; }

  async function getBasket(name) {
    const r = await fetch(url(name), { cache: 'no-store' });
    if (!r.ok) return null; // pantry returns 400 for a missing basket
    return r.json().catch(() => null);
  }

  async function putBasket(name, obj) {
    const r = await fetch(url(name), {
      method: 'POST', // POST = create/replace whole basket
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obj),
    });
    if (!r.ok) throw new Error('pantry put failed: ' + name);
  }

  // ---- blob <-> dataURL ----
  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }
  function dataURLToBlob(d) {
    return fetch(d).then((r) => r.blob());
  }

  // ---- merge ----
  function indexRemote(doc) {
    const m = new Map();
    ((doc && doc.letters) || []).forEach((l) => { if (l && l.id) m.set(l.id, l); });
    return m;
  }

  /* One full sync pass: pull, merge into IndexedDB, push what remote lacks.
   * Returns "new" when the pull brought a new letter/reply (chime-worthy),
   * "changed" for quieter local updates, null for no local change. */
  async function pass() {
    const remoteDoc = (await getBasket('mailbox')) || { letters: [] };
    const remote = indexRemote(remoteDoc);
    const local = new Map();
    ((await Store.allLetters()) || []).forEach((l) => local.set(l.id, l));

    let gotNew = false;
    let changed = false;
    let remoteChanged = false;
    const outLetters = [];
    const blobsToPush = []; // [name, payload]
    const ids = new Set([...remote.keys(), ...local.keys()]);

    for (const id of ids) {
      const r = remote.get(id);
      const l = local.get(id);

      // deletion wins everywhere
      if ((r && r.deleted) || (l && l.deleted)) {
        const at = Math.max((r && r.at) || 0, (l && l.at) || 0) || Date.now();
        if (!l || !l.deleted) {
          await Store.saveLetter({ id, deleted: true, at });
          if (l) changed = true; // a visible letter vanished
        }
        if (!r || !r.deleted) remoteChanged = true;
        outLetters.push({ id, deleted: true, at });
        continue;
      }

      if (r && !l) {
        // new letter from another device — materialize locally
        const letter = {
          id, subject: r.subject || '', text: r.text || '', at: r.at,
          opened: !!r.opened, replies: [],
        };
        if (r.photo) {
          const p = await getBasket(r.photo);
          if (p && p.d) letter.fromPhoto = p.d;
        }
        for (const rr of r.replies || []) {
          const body = await getBasket(rr.basket);
          if (body && body.d) {
            letter.replies.push({ at: rr.at, audio: await dataURLToBlob(body.d) });
          }
        }
        await Store.saveLetter(letter);
        gotNew = true;
        outLetters.push(r);
        continue;
      }

      // local exists (maybe remote too): build the remote form, union replies
      let saveL = false;
      const meta = {
        id, subject: l.subject || '', text: l.text || '', at: l.at,
        opened: !!l.opened || !!(r && r.opened), replies: [],
      };
      if (meta.opened && !l.opened) { l.opened = true; saveL = true; }
      if (l.fromPhoto) {
        meta.photo = 'p-' + id;
        if (!r || !r.photo) blobsToPush.push([meta.photo, { d: l.fromPhoto }]);
      } else if (r && r.photo) {
        meta.photo = r.photo;
        const p = await getBasket(r.photo);
        if (p && p.d) { l.fromPhoto = p.d; saveL = true; changed = true; }
      }

      const remoteReplies = new Map(((r && r.replies) || []).map((x) => [x.at, x]));
      const localReplies = new Map((l.replies || []).map((x) => [x.at, x]));
      for (const [at, rr] of remoteReplies) {
        meta.replies.push(rr);
        if (!localReplies.has(at)) {
          const body = await getBasket(rr.basket);
          if (body && body.d) {
            l.replies = l.replies || [];
            l.replies.push({ at, audio: await dataURLToBlob(body.d) });
            l.replies.sort((a, b) => a.at - b.at);
            saveL = true;
            gotNew = true;
          }
        }
      }
      for (const [at, lr] of localReplies) {
        if (!remoteReplies.has(at)) {
          const name = 'r-' + id + '-' + at;
          meta.replies.push({ at, mime: (lr.audio && lr.audio.type) || 'audio/mp4', basket: name });
          blobsToPush.push([name, {
            d: await blobToDataURL(lr.audio),
            mime: (lr.audio && lr.audio.type) || 'audio/mp4',
          }]);
          remoteChanged = true;
        }
      }
      if (saveL) await Store.saveLetter(l);
      if (!r) remoteChanged = true;
      meta.replies.sort((a, b) => a.at - b.at);
      outLetters.push(meta);
    }

    if (remoteChanged || blobsToPush.length) {
      for (const [name, payload] of blobsToPush) await putBasket(name, payload);
      await putBasket('mailbox', { rev: Date.now(), letters: outLetters });
    }
    return gotNew ? 'new' : (changed ? 'changed' : null);
  }

  /* ---- Daily Monitor sync ----
   * Remote basket 'monitor': { days: { 'Y-M-D': { marks, up } } }.
   * Per-day newest-wins by the `up` edit stamp; history merges into the
   * local day store so the Log reads the same on every device. */
  const MONITOR_KEEP_DAYS = 120;

  function dateMs(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }

  async function monitorPass() {
    const remoteDoc = (await getBasket('monitor')) || {};
    const remote = remoteDoc.days || {};
    const cutoff = Date.now() - MONITOR_KEEP_DAYS * 24 * 3600 * 1000;

    // local view: every stored day with marks, plus today's live board state
    const local = {};
    for (const date of (await Store.listDates()) || []) {
      const day = await Store.getDay(date);
      if (day && Array.isArray(day.marks)) {
        local[date] = { marks: day.marks, up: day.marksUp || 0 };
      }
    }
    const board = Board.syncState();
    if (board) local[board.date] = { marks: board.marks, up: board.up };

    let changed = false;
    let remoteChanged = false;
    const out = {};
    const dates = new Set([...Object.keys(remote), ...Object.keys(local)]);
    for (const date of dates) {
      if (dateMs(date) < cutoff) continue;
      const r = remote[date];
      const l = local[date];
      if (r && (!l || r.up > l.up)) {
        out[date] = r;
        await Store.updateDay(date, { marks: r.marks.slice(), marksUp: r.up });
        if (board && date === board.date) Board.applySynced(r.marks, r.up);
        changed = true;
      } else if (l && l.up && (!r || l.up > r.up)) {
        out[date] = { marks: l.marks, up: l.up };
        remoteChanged = true;
      } else {
        out[date] = r || l;
      }
    }
    if (remoteChanged) await putBasket('monitor', { days: out });
    return changed;
  }

  async function sync() {
    if (!enabled() || !navigator.onLine) return;
    if (syncing) { queued = true; return; }
    syncing = true;
    setDot('busy');
    try {
      const result = await pass();
      // monitor changes need no extra UI work here: Board.applySynced
      // re-renders today's boxes, and the Log re-renders whenever opened
      await monitorPass();
      setDot('ok');
      if (result) {
        Mail.refresh();
        if (result === 'new') { try { Sfx.play('mail'); } catch (err) {} }
      }
    } catch (err) {
      setDot('fail');
    }
    syncing = false;
    if (queued) { queued = false; kick(); }
  }

  /* Debounced "sync soon" — call after compose / reply / delete. */
  function kick() {
    if (!enabled()) return;
    clearTimeout(kickTimer);
    kickTimer = setTimeout(sync, DEBOUNCE_MS);
  }

  document.addEventListener('DOMContentLoaded', () => {
    setDot(null);
    if (!enabled()) return;
    sync();
    setInterval(() => {
      if (document.visibilityState === 'visible') sync();
    }, POLL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') sync();
    });
  });

  return { kick, sync, get enabled() { return enabled(); } };
})();
