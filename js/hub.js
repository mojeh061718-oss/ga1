/* HQ hub: the persistent rescue-member ID badge (photo + name, stored on
 * the phone), the banner slot (suspension warning / top-pup reward — see
 * board.js), and navigation to the Calm Den, Diary, and Log. */
const Hub = (() => {
  const LS_KEY = 'calmpups-member';

  let member = { name: 'RESCUE PUP', photo: null };

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

  /* Downscale a chosen photo to a square-ish thumb so localStorage stays small. */
  function processPhoto(file, cb) {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const side = Math.min(im.width, im.height);
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      c.getContext('2d').drawImage(
        im, (im.width - side) / 2, (im.height - side) / 2, side, side, 0, 0, 512, 512);
      URL.revokeObjectURL(url);
      cb(c.toDataURL('image/jpeg', 0.82));
    };
    im.onerror = () => { URL.revokeObjectURL(url); cb(null); };
    im.src = url;
  }

  document.addEventListener('DOMContentLoaded', () => {
    load();
    renderBadge();

    App.register('hub', { enter() {
      renderBadge();
      Board.checkDay();
    } });

    document.getElementById('nav-den').addEventListener('click', () => App.show('home'));
    document.getElementById('nav-diary').addEventListener('click', () => App.show('diary'));
    document.getElementById('nav-calendar').addEventListener('click', () => App.show('calendar'));

    // ---- badge setup overlay ----
    const setup = document.getElementById('badge-setup');
    const nameInput = document.getElementById('setup-name');
    const fileInput = document.getElementById('setup-photo');
    const preview = document.getElementById('setup-preview');
    let pendingPhoto = null;

    document.getElementById('badge-edit').addEventListener('click', () => {
      nameInput.value = member.name === 'RESCUE PUP' ? '' : member.name;
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
      if (pendingPhoto) member.photo = pendingPhoto;
      save();
      renderBadge();
      Board.refreshBanner(); // banner text uses her name
      setup.classList.add('hidden');
    });
  });

  return {
    get name() { return member.name; },
  };
})();
