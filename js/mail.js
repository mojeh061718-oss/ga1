/* PAW MAIL: letters "from HQ" that the parent secretly writes and she
 * opens, reads (with help), and answers with voice replies. Nothing is
 * ever actually sent anywhere — letters and reply recordings live only in
 * the on-phone database — but it should FEEL real: sealed envelopes,
 * an unread badge, a wax-seal letter, and a SENT TO HQ stamp on replies.
 *
 * Parent: press and hold the PAW MAIL title for 5 seconds to write a
 * letter. */
const Mail = (() => {
  const COMPOSE_HOLD_MS = 5000;
  const MAX_REPLY_MS = 60000;

  const ENV_CLOSED = `<svg viewBox="0 0 60 44">
    <rect x="3" y="4" width="54" height="36" rx="6" fill="#26324f" stroke="#f2a7c6" stroke-width="2.5"/>
    <path d="M5 8 L30 26 L55 8" fill="none" stroke="#f2a7c6" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="30" cy="20" r="5" fill="#f2a7c6"/>
  </svg>`;
  const ENV_OPEN = `<svg viewBox="0 0 60 44">
    <rect x="3" y="12" width="54" height="28" rx="6" fill="#1d2740" stroke="#5d7292" stroke-width="2.5"/>
    <path d="M5 14 L30 2 L55 14" fill="none" stroke="#5d7292" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="12" y="16" width="36" height="20" rx="3" fill="#f7ecd7"/>
  </svg>`;

  let letters = [];
  let current = null;
  let recorder = null;
  let recTimer = null;
  let urls = [];

  function fmtDate(at) {
    return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  async function refresh() {
    letters = ((await Store.allLetters()) || []).sort((a, b) => b.at - a.at);
    renderPanel();
  }

  function renderPanel() {
    const list = document.getElementById('mail-list');
    list.innerHTML = '';
    const unread = letters.filter((l) => !l.opened).length;
    const badge = document.getElementById('mail-badge');
    badge.textContent = unread;
    badge.classList.toggle('hidden', !unread);
    if (!letters.length) {
      const empty = document.createElement('div');
      empty.id = 'mail-empty';
      empty.innerHTML = ENV_OPEN;
      list.appendChild(empty);
      return;
    }
    letters.forEach((l) => {
      const row = document.createElement('button');
      row.className = 'mail-row' + (l.opened ? ' opened' : ' unread');
      row.innerHTML =
        `<span class="mail-env">${l.opened ? ENV_OPEN : ENV_CLOSED}</span>` +
        `<span class="mail-date">${fmtDate(l.at)}</span>` +
        (l.replies && l.replies.length
          ? `<span class="mail-replied">&#10003;</span>` : '');
      row.addEventListener('click', () => open(l));
      list.appendChild(row);
    });
  }

  /* Reader voice: the parent picks one in the compose panel (persisted);
   * otherwise the best installed English voice wins automatically —
   * downloaded Enhanced/Premium voices match first. */
  const VOICE_KEY = 'calmpups-mail-voice';

  function pickVoice() {
    try {
      const voices = speechSynthesis.getVoices();
      const saved = localStorage.getItem(VOICE_KEY);
      if (saved) {
        const v = voices.find((v) => v.name === saved);
        if (v) return v;
      }
      const en = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('en'));
      return en.find((v) => /premium|enhanced|natural|siri|samantha/i.test(v.name)) || en[0] || null;
    } catch (err) { return null; }
  }

  function populateVoicePicker() {
    const sel = document.getElementById('compose-voice');
    let voices = [];
    try { voices = speechSynthesis.getVoices(); } catch (err) {}
    const saved = localStorage.getItem(VOICE_KEY);
    sel.innerHTML = '';
    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = 'Reader voice: Auto (best available)';
    sel.appendChild(auto);
    voices
      .filter((v) => v.lang && v.lang.toLowerCase().startsWith('en'))
      .forEach((v) => {
        const o = document.createElement('option');
        o.value = v.name;
        o.textContent = v.name;
        if (v.name === saved) o.selected = true;
        sel.appendChild(o);
      });
  }

  /* Read the letter aloud. iOS only speaks reliably from a tap, so this is
   * called synchronously from the open/replay taps. */
  function speak(text, toggle, btn) {
    try {
      if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
        if (btn) btn.classList.remove('speaking');
        if (toggle) return; // tapped the speaker while reading = stop
      }
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.85;
      u.voice = pickVoice();
      if (btn) {
        u.onend = () => btn.classList.remove('speaking');
        u.onerror = () => btn.classList.remove('speaking');
        btn.classList.add('speaking');
      }
      speechSynthesis.speak(u);
    } catch (err) { /* no speech support — letter is still readable */ }
  }

  function speakLetter(toggle) {
    speak(current.text, toggle, document.getElementById('mail-speak-btn'));
  }

  function open(letter) {
    current = letter;
    renderRead();
    App.show('mailread');
    speakLetter(); // inside the tap gesture — auto-reads on open
    if (!letter.opened) {
      letter.opened = true;
      Store.saveLetter(letter).then(renderPanel);
      Sounds.chime();
    } else {
      renderPanel();
    }
  }

  function renderRead() {
    document.getElementById('mail-letter-date').textContent = fmtDate(current.at);
    document.getElementById('mail-letter-text').textContent = current.text;
    const fromPhoto = document.getElementById('mail-from-photo');
    const seal = document.getElementById('mail-seal');
    if (current.fromPhoto) {
      fromPhoto.src = current.fromPhoto;
      fromPhoto.classList.remove('hidden');
      seal.classList.add('hidden');
    } else {
      fromPhoto.classList.add('hidden');
      seal.classList.remove('hidden');
    }
    const card = document.getElementById('mail-letter');
    card.classList.remove('letter-in');
    void card.offsetWidth;
    card.classList.add('letter-in');
    renderReplies();
  }

  function renderReplies() {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
    const host = document.getElementById('mail-replies');
    host.innerHTML = '';
    (current.replies || []).forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'mail-reply';
      const label = document.createElement('span');
      label.textContent = `Reply ${i + 1} · ${fmtDate(r.at)}`;
      row.appendChild(label);
      const btn = document.createElement('button');
      btn.className = 'day-play';
      btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5 L19 12 L8 19 Z" fill="currentColor"/></svg>';
      const u = URL.createObjectURL(r.audio);
      urls.push(u);
      let audio = null;
      btn.addEventListener('click', () => {
        if (audio && !audio.paused) { audio.pause(); return; }
        audio = new Audio(u);
        audio.play().catch(() => {});
      });
      row.appendChild(btn);
      host.appendChild(row);
    });
  }

  async function toggleReply() {
    const btn = document.getElementById('mail-reply-btn');
    if (recorder) { stopReply(); return; }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) { return; }
    const chunks = [];
    recorder = new MediaRecorder(stream);
    const mime = recorder.mimeType || 'audio/mp4';
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recorder = null;
      btn.classList.remove('recording');
      current.replies = current.replies || [];
      current.replies.push({ at: Date.now(), audio: new Blob(chunks, { type: mime }) });
      await Store.saveLetter(current);
      renderReplies();
      renderPanel();
      // make it feel like it flew off to HQ
      Sounds.praise();
      const flash = document.getElementById('mail-sent-flash');
      flash.classList.remove('hidden');
      setTimeout(() => flash.classList.add('hidden'), 2200);
    };
    recorder.start();
    btn.classList.add('recording');
    recTimer = setTimeout(stopReply, MAX_REPLY_MS);
  }

  function stopReply() {
    if (recTimer) { clearTimeout(recTimer); recTimer = null; }
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  /* Downscale a "from" photo (e.g. Chase) to a small data URL for the
   * letter record — stays on the phone like everything else. */
  let pendingFromPhoto = null;
  function processFromPhoto(file) {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const MAX = 512;
      const scale = Math.min(1, MAX / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.width * scale));
      c.height = Math.max(1, Math.round(im.height * scale));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      pendingFromPhoto = c.toDataURL('image/jpeg', 0.82);
      const prev = document.getElementById('compose-photo-preview');
      prev.src = pendingFromPhoto;
      prev.classList.remove('hidden');
    };
    im.onerror = () => URL.revokeObjectURL(url);
    im.src = url;
  }

  document.addEventListener('DOMContentLoaded', () => {
    refresh();

    // Parent compose: hold the PAW MAIL title for 5s.
    const title = document.getElementById('mail-title');
    let holdTimer = null;
    title.addEventListener('pointerdown', () => {
      holdTimer = setTimeout(() => {
        document.getElementById('compose-text').value = '';
        pendingFromPhoto = null;
        document.getElementById('compose-photo-preview').classList.add('hidden');
        document.getElementById('mail-compose').classList.remove('hidden');
      }, COMPOSE_HOLD_MS);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
      title.addEventListener(ev, () => {
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      }));

    const composeFile = document.getElementById('compose-photo');
    document.getElementById('compose-photo-btn').addEventListener('click', () => composeFile.click());
    composeFile.addEventListener('change', () => {
      const f = composeFile.files && composeFile.files[0];
      if (f) processFromPhoto(f);
      composeFile.value = '';
    });

    document.getElementById('compose-cancel').addEventListener('click', () =>
      document.getElementById('mail-compose').classList.add('hidden'));

    document.getElementById('compose-send').addEventListener('click', async () => {
      const text = document.getElementById('compose-text').value.trim();
      if (!text) return;
      await Store.saveLetter({
        id: 'm' + Date.now(),
        text,
        at: Date.now(),
        opened: false,
        replies: [],
        fromPhoto: pendingFromPhoto,
      });
      document.getElementById('mail-compose').classList.add('hidden');
      await refresh();
      Sounds.inviteChime(); // new mail!
    });

    document.getElementById('mail-reply-btn').addEventListener('click', toggleReply);
    document.getElementById('mail-speak-btn').addEventListener('click', () => speakLetter(true));

    // reader-voice picker in the compose panel
    populateVoicePicker();
    try {
      speechSynthesis.addEventListener('voiceschanged', populateVoicePicker);
    } catch (err) {}
    document.getElementById('compose-voice').addEventListener('change', (e) => {
      try {
        if (e.target.value) localStorage.setItem(VOICE_KEY, e.target.value);
        else localStorage.removeItem(VOICE_KEY);
      } catch (err) {}
    });
    document.getElementById('compose-voice-test').addEventListener('click', () => {
      speak('Hello Maelie! This is how your letters will sound.', false, null);
    });

    App.register('mailread', {
      exit() {
        stopReply();
        try { speechSynthesis.cancel(); } catch (err) {}
        document.getElementById('mail-speak-btn').classList.remove('speaking');
        urls.forEach((u) => URL.revokeObjectURL(u));
        urls = [];
      },
    });
  });

  return { refresh };
})();
