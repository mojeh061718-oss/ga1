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
  /* A pantry basket tops out around 1.4MB. A 60-second voice reply is ~0.5-1MB
   * of AAC, and base64 adds a third — so a long reply could exceed it. When it
   * did, putBasket threw, the index write below it never ran, and the same
   * doomed upload was retried every 90 seconds on every device forever: mail
   * AND monitor sync dead until someone found and deleted that letter. Now
   * oversized bodies are skipped and flagged instead of throwing. */
  const MAX_BASKET_CHARS = 1300000;

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
    // pantry answers 400/404 for a basket that doesn't exist yet — that
    // genuinely means "empty". Anything else (5xx, 429…) is an outage:
    // abort the pass so a blip can't make us treat the mailbox as empty
    // and overwrite it, and so the dot honestly shows red.
    if (r.status === 400 || r.status === 404) return null;
    if (!r.ok) throw new Error('store outage: ' + r.status + ' on ' + name);
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

  async function deleteBasket(name) {
    try { await fetch(url(name), { method: 'DELETE' }); } catch (err) {}
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
        if (!r || !r.deleted) {
          remoteChanged = true;
          // Tombstoning left the bodies behind: a deleted letter's photo and
          // the child's voice replies stayed readable on the public relay
          // forever. Drop them as the tombstone goes up.
          if (r && r.photo) await deleteBasket(r.photo);
          for (const rr of (r && r.replies) || []) {
            if (rr && rr.basket) await deleteBasket(rr.basket);
          }
        }
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
        if (remoteReplies.has(at)) continue;
        if (lr.tooBig) continue; // already judged unsendable; keep it local
        const name = 'r-' + id + '-' + at;
        const mime = (lr.audio && lr.audio.type) || 'audio/mp4';
        const d = await blobToDataURL(lr.audio);
        if (d.length > MAX_BASKET_CHARS) {
          // Too large for the relay. Flag it so we stop re-encoding it every
          // pass, and leave it playable on the device that recorded it.
          lr.tooBig = true;
          saveL = true;
          Store.reportProblem('One voice reply was too long to send to HQ. It is saved on this phone.');
          continue;
        }
        meta.replies.push({ at, mime, basket: name });
        blobsToPush.push([name, { d, mime }]);
        remoteChanged = true;
      }
      if (saveL) await Store.saveLetter(l);
      if (!r) remoteChanged = true;
      meta.replies.sort((a, b) => a.at - b.at);
      outLetters.push(meta);
    }

    if (remoteChanged || blobsToPush.length) {
      // One failed body must not abandon the index write. Push what we can,
      // then strip any reference that didn't make it so the index never
      // points at a basket that isn't there.
      const failed = new Set();
      for (const [name, payload] of blobsToPush) {
        try {
          await putBasket(name, payload);
        } catch (err) {
          failed.add(name);
        }
      }
      if (failed.size) {
        outLetters.forEach((l) => {
          if (l.photo && failed.has(l.photo)) delete l.photo;
          if (l.replies) l.replies = l.replies.filter((x) => !failed.has(x.basket));
        });
      }
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
