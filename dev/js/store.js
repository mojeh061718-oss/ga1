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

  function openDb(name) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 2);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('days')) {
          d.createObjectStore('days', { keyPath: 'date' });
        }
        if (!d.objectStoreNames.contains('mail')) {
          d.createObjectStore('mail', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /* Copy days + mail out of the shared v1 database, once. Skipped when the
   * browser can tell us the old database never existed. */
  async function migrateIdb(newDb) {
    try {
      if (localStorage.getItem('calmpups2-idb-migrated')) return newDb;
      let hasOld = true;
      if (indexedDB.databases) {
        const names = (await indexedDB.databases()).map((d) => d.name);
        hasOld = names.includes('calmpups');
      }
      if (hasOld) {
        const old = await openDb('calmpups');
        for (const s of ['days', 'mail']) {
          if (!old.objectStoreNames.contains(s)) continue;
          const rows = await new Promise((resolve, reject) => {
            const r = old.transaction(s).objectStore(s).getAll();
            r.onsuccess = () => resolve(r.result || []);
            r.onerror = () => reject(r.error);
          });
          if (rows.length) {
            await new Promise((resolve, reject) => {
              const t = newDb.transaction(s, 'readwrite');
              const os = t.objectStore(s);
              rows.forEach((row) => os.put(row));
              t.oncomplete = () => resolve();
              t.onerror = () => reject(t.error);
            });
          }
        }
        old.close();
      }
      localStorage.setItem('calmpups2-idb-migrated', '1');
    } catch (err) {} // migration is best-effort; the app still works fresh
    return newDb;
  }

  function db() {
    if (!dbp) dbp = openDb('calmpups2').then(migrateIdb);
    return dbp;
  }

  function tx(storeName, mode, fn) {
    return db().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(storeName, mode);
      const req = fn(t.objectStore(storeName));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  // ---- days ----
  function getDay(date) {
    return tx('days', 'readonly', (s) => s.get(date)).catch(() => null);
  }

  async function updateDay(date, patch) {
    const cur = (await getDay(date)) || { date };
    const next = Object.assign(cur, patch, { date });
    return tx('days', 'readwrite', (s) => s.put(next)).then(() => next).catch(() => null);
  }

  function listDates() {
    return tx('days', 'readonly', (s) => s.getAllKeys()).catch(() => []);
  }

  function deleteDay(date) {
    return tx('days', 'readwrite', (s) => s.delete(date)).catch(() => null);
  }

  // ---- mail ----
  function saveLetter(letter) {
    return tx('mail', 'readwrite', (s) => s.put(letter)).catch(() => null);
  }

  function allLetters() {
    return tx('mail', 'readonly', (s) => s.getAll()).catch(() => []);
  }

  function deleteLetter(id) {
    return tx('mail', 'readwrite', (s) => s.delete(id)).catch(() => null);
  }

  return { getDay, updateDay, listDates, deleteDay, saveLetter, allLetters, deleteLetter };
})();
