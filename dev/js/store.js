/* IndexedDB storage. Two stores:
 *   days — one record per calendar day:
 *     { date, marks, marksUp, diary: [{q, audio, skipped}], selfie, diaryAt }
 *   mail — PAW MAIL letters:
 *     { id, subject, text, at, opened, fromPhoto, replies: [{at, audio: Blob}] }
 *     (deleted letters stay as { id, deleted: true, at } tombstones for sync)
 *
 * 2.0 uses its OWN database + localStorage prefix (calmpups2). The v1 app at
 * ../ is same-origin and shares browser storage; when both apps read/write
 * the same records their formats fight (v1 hard-deletes what sync needs as a
 * tombstone, and tombstones render as ghost letters in v1). Isolating 2.0
 * ends that. A one-time migration copies everything over so nothing is lost. */
const Store = (() => {
  let dbp = null;

  /* localStorage carry-over — synchronous, before any module reads its keys */
  (function migrateLocal() {
    try {
      if (localStorage.getItem('calmpups2-migrated')) return;
      ['member', 'board', 'gate', 'welcome-seeded',
       'mail-voice', 'voice-rate', 'voice-pitch'].forEach((k) => {
        const old = localStorage.getItem('calmpups-' + k);
        if (old !== null && localStorage.getItem('calmpups2-' + k) === null) {
          localStorage.setItem('calmpups2-' + k, old);
        }
      });
      localStorage.setItem('calmpups2-migrated', '1');
    } catch (err) {}
  })();

  /* ---- failure surface ----
   * Every method here used to end in `.catch(() => null)`, so a full disk, a
   * corrupt database or a blocked write was indistinguishable from success —
   * the parent finished a whole bedtime check-in and it silently evaporated.
   * Failures now raise a visible banner, once per message, so the same
   * failing sync pass can't spam it. */
  const seenProblems = new Set();

  function reportProblem(msg) {
    try {
      if (seenProblems.has(msg)) return;
      seenProblems.add(msg);
      let el = document.getElementById('store-problem');
      if (!el) {
        el = document.createElement('div');
        el.id = 'store-problem';
        document.body.appendChild(el);
      }
      el.textContent = msg + ' Tap to dismiss.';
      el.classList.add('show');
      el.onclick = () => { el.classList.remove('show'); seenProblems.delete(msg); };
    } catch (err) { /* the reporter must never be the thing that throws */ }
  }

  function fail(msg) {
    return (err) => {
      reportProblem(msg);
      if (err && err.name === 'QuotaExceededError') {
        reportProblem('The phone is out of storage. Export and clear old days from the Log.');
      }
      return null;
    };
  }

  /* v3 adds `meta`, which holds the migration flags. They lived in
   * localStorage, which iOS evicts independently of IndexedDB — losing the
   * flag re-ran the v1 import over live 2.0 data. */
  function openDb(name, version) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('days')) {
          d.createObjectStore('days', { keyPath: 'date' });
        }
        if (!d.objectStoreNames.contains('mail')) {
          d.createObjectStore('mail', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('meta')) {
          d.createObjectStore('meta', { keyPath: 'k' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function metaGet(d, k) {
    return new Promise((resolve) => {
      try {
        const r = d.transaction('meta').objectStore('meta').get(k);
        r.onsuccess = () => resolve(r.result ? r.result.v : null);
        r.onerror = () => resolve(null);
      } catch (err) { resolve(null); }
    });
  }

  function metaSet(d, k, v) {
    return new Promise((resolve) => {
      try {
        const t = d.transaction('meta', 'readwrite');
        t.objectStore('meta').put({ k, v });
        t.oncomplete = () => resolve(true);
        t.onerror = () => resolve(false);
      } catch (err) { resolve(false); }
    });
  }

  /* Copy days + mail out of the shared v1 database, once. Skipped when the
   * browser can tell us the old database never existed. */
  async function migrateIdb(newDb) {
    try {
      // The flag now lives in IndexedDB alongside the data it guards, so it
      // cannot be evicted separately. The old localStorage flag is still
      // honoured so devices that already migrated don't do it twice.
      if (await metaGet(newDb, 'idb-migrated')) return newDb;
      if (localStorage.getItem('calmpups2-idb-migrated')) {
        await metaSet(newDb, 'idb-migrated', 1);
        return newDb;
      }
      let hasOld = true;
      if (indexedDB.databases) {
        const names = (await indexedDB.databases()).map((d) => d.name);
        hasOld = names.includes('calmpups');
      }
      if (hasOld) {
        const old = await openDb('calmpups', 2);
        for (const s of ['days', 'mail']) {
          if (!old.objectStoreNames.contains(s)) continue;
          const rows = await new Promise((resolve, reject) => {
            const r = old.transaction(s).objectStore(s).getAll();
            r.onsuccess = () => resolve(r.result || []);
            r.onerror = () => reject(r.error);
          });
          if (!rows.length) continue;
          // Which keys does 2.0 already have? A v1 row must never clobber a
          // live 2.0 record: if this migration ever re-runs, the v1 copy of a
          // letter (no replies, unopened) would erase her voice replies.
          const existing = new Set(await new Promise((resolve) => {
            const r = newDb.transaction(s).objectStore(s).getAllKeys();
            r.onsuccess = () => resolve(r.result || []);
            r.onerror = () => resolve([]);
          }));
          const fresh = rows.filter((row) => !existing.has(row[s === 'days' ? 'date' : 'id']));
          if (!fresh.length) continue;
          await new Promise((resolve, reject) => {
            const t = newDb.transaction(s, 'readwrite');
            const os = t.objectStore(s);
            fresh.forEach((row) => os.put(row));
            t.oncomplete = () => resolve();
            t.onerror = () => reject(t.error);
          });
        }
        old.close();
      }
      await metaSet(newDb, 'idb-migrated', 1);
      localStorage.setItem('calmpups2-idb-migrated', '1');
    } catch (err) {} // migration is best-effort; the app still works fresh
    return newDb;
  }

  /* Ask iOS not to evict us. Best-effort: Safari grants this to installed
   * home-screen apps and ignores it elsewhere. Without it the archive of her
   * recordings is only ever "cached" as far as the OS is concerned. */
  function requestPersistence() {
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    } catch (err) {}
  }

  function estimate() {
    try {
      if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate();
    } catch (err) {}
    return Promise.resolve(null);
  }

  function db() {
    if (!dbp) {
      requestPersistence();
      dbp = openDb('calmpups2', 3).then(migrateIdb);
    }
    return dbp;
  }

  /* Writes resolve on `tx.oncomplete`, not `request.onsuccess`. A successful
   * request is not yet a committed transaction, so the old code could report
   * a save that a later abort silently rolled back. */
  function tx(storeName, mode, fn) {
    return db().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(storeName, mode);
      const req = fn(t.objectStore(storeName));
      let result;
      req.onsuccess = () => { result = req.result; };
      req.onerror = () => reject(req.error);
      if (mode === 'readwrite') {
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      } else {
        req.onsuccess = () => resolve(req.result);
      }
    }));
  }

  /* Serialize read-modify-write per key. updateDay reads in one transaction
   * and writes in another, so two concurrent calls on the same date — the
   * diary flushing while the board saves a mark on foreground — used to lose
   * one patch entirely. */
  const chains = new Map();
  function serialize(key, fn) {
    const prev = chains.get(key) || Promise.resolve();
    const next = prev.then(fn, fn);
    chains.set(key, next.catch(() => {}));
    return next;
  }

  // ---- days ----
  function getDay(date) {
    return tx('days', 'readonly', (s) => s.get(date)).catch(() => null);
  }

  function updateDay(date, patch) {
    return serialize('day:' + date, async () => {
      const cur = (await getDay(date)) || { date };
      const next = Object.assign(cur, patch, { date });
      // `null` is the explicit "clear this field" signal (diaryProgress).
      Object.keys(patch).forEach((k) => { if (patch[k] === null) delete next[k]; });
      return tx('days', 'readwrite', (s) => s.put(next)).then(() => next);
    }).catch(fail('That day could not be saved.'));
  }

  function listDates() {
    return tx('days', 'readonly', (s) => s.getAllKeys()).catch(() => []);
  }

  function deleteDay(date) {
    return tx('days', 'readwrite', (s) => s.delete(date))
      .catch(fail('That day could not be deleted.'));
  }

  // ---- mail ----
  function saveLetter(letter) {
    return tx('mail', 'readwrite', (s) => s.put(letter))
      .catch(fail('A letter could not be saved.'));
  }

  function allLetters() {
    return tx('mail', 'readonly', (s) => s.getAll()).catch(() => []);
  }

  function deleteLetter(id) {
    return tx('mail', 'readwrite', (s) => s.delete(id))
      .catch(fail('A letter could not be deleted.'));
  }

  return {
    getDay, updateDay, listDates, deleteDay,
    saveLetter, allLetters, deleteLetter,
    reportProblem, estimate,
  };
})();
