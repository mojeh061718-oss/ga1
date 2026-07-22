/* HQ hub: the persistent rescue-member ID badge (photo + name, stored on
 * the phone), the banner slot (suspension warning / top-pup reward — see
 * board.js), and navigation to the Calm Den, Diary, and Log. */
const Hub = (() => {
  const LS_KEY = 'calmpups-member';

  let member = { name: 'RESCUE PUP', photo: null, speak: '' };

  function load() {
    try {
      const m = JSON.parse(localStorage.getItem(LS_KEY));
      if (m && m.name) member = m;
    } catch (err) {}
  }

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(member)); } catch (err) {}
  }

  function renderBadge() {
    document.getElementById('badge-name').textContent = member.name.toUpperCase();
    const img = document.getElementById('badge-photo');
    const ph = document.getElementById('badge-photo-placeholder');
    if (member.photo) {
      img.src = member.photo;
      img.classList.remove('hidden');
      ph.classList.add('hidden');
    } else {
      img.classList.add('hidden');
      ph.classList.remove('hidden');
    }
  }

  /* Downscale a chosen photo (keeping its shape — cards and portraits stay
   * whole) so localStorage stays small. The hub badge circle center-crops
   * visually via object-fit; the welcome screen shows the full image. */
  function processPhoto(file, cb) {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const MAX = 1024;
      const scale = Math.min(1, MAX / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.width * scale));
      c.height = Math.max(1, Math.round(im.height * scale));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      cb(c.toDataURL('image/jpeg', 0.82));
    };
    im.onerror = () => { URL.revokeObjectURL(url); cb(null); };
    im.src = url;
  }

  /* Evening nudge: between 6pm and 10pm, if today's PUP CHECK-IN hasn't
   * been sent yet, show the reminder banner and make the nav button glow. */
  async function updateCheckin() {
    const d = new Date();
    const today = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const h = d.getHours();
    const day = await Store.getDay(today);
    const due = h >= 18 && h < 22 && !(day && day.diaryAt);
    document.getElementById('hub-checkin-banner').classList.toggle('hidden', !due);
    document.getElementById('nav-diary').classList.toggle('due', due);
  }

  document.addEventListener('DOMContentLoaded', () => {
    load();
    renderBadge();
    updateCheckin(); // also runs on load: App.show('hub') can precede registration

    App.register('hub', { enter() {
      renderBadge();
      Board.checkDay();
      Mail.refresh();
      updateCheckin();
    } });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') updateCheckin();
    });
    document.getElementById('hub-checkin-banner')
      .addEventListener('click', () => App.show('diary'));

    document.getElementById('nav-den').addEventListener('click', () => App.show('home'));
    document.getElementById('nav-diary').addEventListener('click', () => App.show('diary'));
    document.getElementById('nav-calendar').addEventListener('click', () => App.show('calendar'));

    // ---- badge setup overlay ----
    const setup = document.getElementById('badge-setup');
    const nameInput = document.getElementById('setup-name');
    const fileInput = document.getElementById('setup-photo');
    const preview = document.getElementById('setup-preview');
    let pendingPhoto = null;

    const speakInput = document.getElementById('setup-speak');
    document.getElementById('badge-edit').addEventListener('click', () => {
      nameInput.value = member.name === 'RESCUE PUP' ? '' : member.name;
      speakInput.value = member.speak || '';
      pendingPhoto = null;
      preview.classList.toggle('hidden', !member.photo);
      if (member.photo) preview.src = member.photo;
      setup.classList.remove('hidden');
    });

    document.getElementById('setup-photo-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      processPhoto(f, (dataUrl) => {
        if (!dataUrl) return;
        pendingPhoto = dataUrl;
        preview.src = dataUrl;
        preview.classList.remove('hidden');
      });
      fileInput.value = '';
    });

    document.getElementById('setup-save').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (name) member.name = name;
      member.speak = speakInput.value.trim();
      if (pendingPhoto) member.photo = pendingPhoto;
      save();
      renderBadge();
      Board.refreshBanner(); // banner text uses her name
      setup.classList.add('hidden');
    });
  });

  return {
    get name() { return member.name; },
    get photo() { return member.photo; },
    get speak() { return member.speak || ''; },
    setSpeak(v) {
      member.speak = (v || '').trim();
      save();
      const el = document.getElementById('setup-speak');
      if (el) el.value = member.speak; // keep badge setup in sync
    },
  };
})();
