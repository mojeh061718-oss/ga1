/* IndexedDB day-record store. One record per calendar day:
 *   { date: 'YYYY-M-D', marks: [null|'x'|'star' x3],
 *     diary: [{ q, audio: Blob|null, skipped }], selfie: Blob|null,
 *     diaryAt: timestamp }
 * Audio and photos live here (localStorage is far too small); installed
 * home-screen web apps keep IndexedDB across launches on iOS. */
const Store = (() => {
  let dbp = null;

  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open('calmpups', 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore('days', { keyPath: 'date' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbp;
  }

  function tx(mode, fn) {
    return db().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction('days', mode);
      const store = t.objectStore('days');
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function getDay(date) {
    return tx('readonly', (s) => s.get(date)).catch(() => null);
  }

  async function updateDay(date, patch) {
    const cur = (await getDay(date)) || { date };
    const next = Object.assign(cur, patch, { date });
    return tx('readwrite', (s) => s.put(next)).then(() => next).catch(() => null);
  }

  function listDates() {
    return tx('readonly', (s) => s.getAllKeys()).catch(() => []);
  }

  function deleteDay(date) {
    return tx('readwrite', (s) => s.delete(date)).catch(() => null);
  }

  return { getDay, updateDay, listDates, deleteDay };
})();
