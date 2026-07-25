/* Parent backup — the family's only lifeboat.
 *
 * Everything the app collects (twenty voice answers a night, the goodnight
 * selfie, every letter and her recorded replies) lives in one phone's
 * IndexedDB. iOS evicts that under storage pressure, and there was no export
 * of any kind — so the archive of her voice at five could vanish with no
 * warning and no copy. This writes the whole thing to a file the parent can
 * put somewhere safe.
 *
 * Format: one JSON document, audio and photos inline as data URLs. Written in
 * chunks into a Blob so the whole archive is never concatenated into a single
 * giant string.
 */
const Backup = (() => {
  function blobToDataURL(blob) {
    return new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  }

  const isBlob = (v) => v instanceof Blob;

  /* Walk a record and turn any Blob into a data URL, leaving everything else
   * untouched. Handles the shapes we store: day.diary[].audio, day.selfie,
   * letter.replies[].audio (letter.fromPhoto is already a data URL string). */
  async function inflate(value) {
    if (isBlob(value)) return { __blob: true, type: value.type, d: await blobToDataURL(value) };
    if (Array.isArray(value)) {
      const out = [];
      for (const v of value) out.push(await inflate(v));
      return out;
    }
    if (value && typeof value === 'object') {
      const out = {};
      for (const k of Object.keys(value)) out[k] = await inflate(value[k]);
      return out;
    }
    return value;
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Give Safari a moment to start the download before the URL dies.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function run(onProgress) {
    const parts = [];
    const dates = (await Store.listDates()) || [];
    const letters = (await Store.allLetters()) || [];
    const total = dates.length + letters.length || 1;
    let done = 0;

    parts.push('{\n"format": "calm-pups-backup",\n"version": 3,\n"exportedAt": ' +
      JSON.stringify(new Date().toISOString()) + ',\n"member": ' +
      JSON.stringify({ name: Hub.name, speak: Hub.speak }) + ',\n"days": [\n');

    for (let i = 0; i < dates.length; i++) {
      const day = await Store.getDay(dates[i]);
      if (day) parts.push((i ? ',\n' : '') + JSON.stringify(await inflate(day)));
      if (onProgress) onProgress(++done, total);
    }

    parts.push('\n],\n"mail": [\n');
    for (let i = 0; i < letters.length; i++) {
      parts.push((i ? ',\n' : '') + JSON.stringify(await inflate(letters[i])));
      if (onProgress) onProgress(++done, total);
    }
    parts.push('\n]\n}\n');

    const blob = new Blob(parts, { type: 'application/json' });
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    download(blob, `calm-pups-backup-${stamp}.json`);
    return { days: dates.length, letters: letters.length, bytes: blob.size };
  }

  function human(bytes) {
    if (!bytes && bytes !== 0) return '';
    const mb = bytes / 1048576;
    return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : mb.toFixed(mb < 10 ? 1 : 0) + ' MB';
  }

  /* Show what the app is holding, so "the phone is full" is never the first
   * warning a parent gets. */
  async function showStorage() {
    const el = document.getElementById('setup-storage');
    if (!el) return;
    const est = await Store.estimate();
    const dates = (await Store.listDates()) || [];
    const used = est && est.usage ? human(est.usage) : null;
    el.textContent = used
      ? `${dates.length} days saved · about ${used} used on this phone`
      : `${dates.length} days saved on this phone`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('setup-export');
    if (!btn) return;
    const label = btn.textContent;

    document.getElementById('badge-edit').addEventListener('click', showStorage);

    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        const res = await run((done, total) => {
          btn.textContent = `Saving… ${Math.round((done / total) * 100)}%`;
        });
        btn.textContent = `Saved ${res.days} days + ${res.letters} letters (${human(res.bytes)})`;
      } catch (err) {
        btn.textContent = 'Could not save a copy — try again';
      }
      setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 4000);
    });
  });

  return { run };
})();
