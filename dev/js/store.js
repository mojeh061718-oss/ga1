/* IndexedDB storage. Two stores:
 *   days — one record per calendar day:
 *     { date, marks, diary: [{q, audio, skipped}], selfie, diaryAt }
 *   mail — PAW MAIL letters:
 *     { id, text, at, opened, replies: [{at, audio: Blob}] }
 * Audio and photos live here (localStorage is far too small); installed
 * home-screen web apps keep IndexedDB across launches on iOS. */
const Store = (() => {
  let dbp = null;

  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open('calmpups', 2);
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
