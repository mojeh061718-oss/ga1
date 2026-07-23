/* PAW MAIL: letters "from HQ" that the parent secretly writes and she
 * opens, reads (with help), and answers with voice replies. Nothing is
 * ever actually sent anywhere — letters and reply recordings live only in
 * the on-phone database — but it should FEEL real: sealed envelopes,
 * an unread badge, a wax-seal letter, and a SENT TO HQ stamp on replies.
 *
 * Parent: press and hold the PAW MAIL title for 5 seconds to write a
 * letter. */
const Mail = (() => {
  const COMPOSE_HOLD_MS = 2000;
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

  /* One-time built-in first letter from Ryder, personalized with the
   * badge name when it's created (nothing personal lives in the code). */
  const SEED_KEY = 'calmpups-welcome-seeded';

  function welcomeText(name) {
    return [
      'Dear ' + name + ',',
      '',
      'This is Ryder, leader of the PAW Patrol! Your badge scan worked, your ID card is ready, and you are now an official ACTIVE RESCUE MEMBER of our team. The whole team is cheering for you. Chase, Skye, Marshall, Rubble, Rocky and Zuma all say WELCOME!',
      '',
      'Being on the team is so much fun. You have your very own Rescue HQ! In your Calm Den there are real missions waiting: hold your finger nice and steady on the beacon until it lights up the whole night sky. Breathe slowly with the grey pup and light all five paw-lights to charge her back up. And pull the supply cart across the wobbly rope bridge — remember, rescue pups go SLOW and STEADY, or the bridge wobbles!',
      '',
      'Every night before bed you get to do your PUP CHECK-IN and tell HQ all about your day. We listen to every single one. And when you get letters like this, you can press the big red microphone and talk back to us — we love hearing your voice at HQ!',
      '',
      'Now ' + name + ', every rescue pup has special missions to work on, and here are yours:',
      '',
      'Mission one: sleep in your OWN bed, all night long. Brave pups rest in their own cozy beds so they are strong for the next day.',
      '',
      'Mission two: be kind and gentle with people. Rescue pups use nice words, gentle hands, and big hearts. That is what makes a pup a hero.',
      '',
      'Mission three: use your listening ears. When your mom or dad talks to you, a good pup stops, looks, and listens the FIRST time. That is one of the most important rescue skills of all.',
      '',
      'Every day you work on your missions you can earn green happy faces on your Daily Monitor. Three happy faces makes you TOP PUP of the day! We believe in you, ' + name + '.',
      '',
      'No job is too big, no pup is too small!',
      '',
      'Your friend,',
      'Ryder',
      'PAW Patrol Rescue HQ',
    ].join('\n');
  }

  async function seedWelcome() {
    try {
      if (localStorage.getItem(SEED_KEY) === '2') return;
      const existing = (await Store.allLetters()) || [];
      const name = Hub.name;
      const prior = existing.find((l) => l.id === 'welcome-ryder');
      if (prior && prior.deleted) { // deleted on some device — stay deleted
        localStorage.setItem(SEED_KEY, '2');
        return;
      }
      if (!prior) {
        await Store.saveLetter({
          id: 'welcome-ryder',
          subject: 'Welcome ' + name + '!',
          text: welcomeText(name),
          at: Date.now(),
          opened: false,
          replies: [],
        });
      } else if (!prior.subject) {
        // patch the already-seeded copy: add the subject, drop the old
        // WELCOME!!!!! headline — keep opened state and any replies
        prior.subject = 'Welcome ' + name + '!';
        prior.text = welcomeText(name);
        await Store.saveLetter(prior);
      }
      localStorage.setItem(SEED_KEY, '2');
    } catch (err) {}
  }

  async function refresh() {
    // deleted letters stay stored as tombstones (so cross-device sync can't
    // resurrect them) but never render
    letters = ((await Store.allLetters()) || [])
      .filter((l) => !l.deleted)
      .sort((a, b) => b.at - a.at);
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
      const label = document.createElement('span');
      label.className = 'mail-date';
      label.textContent = l.subject || fmtDate(l.at);
      row.innerHTML =
        `<span class="mail-env">${l.opened ? ENV_OPEN : ENV_CLOSED}</span>`;
      row.appendChild(label);
      if (l.replies && l.replies.length) {
        row.insertAdjacentHTML('beforeend', `<span class="mail-replied">&#10003;</span>`);
      }
      hookRow(row, l);
      list.appendChild(row);
    });
  }

  /* Tap opens a letter; a ~1s still hold asks to delete it instead. */
  let deleteTarget = null;
  function confirmDelete(letter) {
    deleteTarget = letter;
    document.getElementById('mail-delete-date').textContent =
      'Letter from ' + fmtDate(letter.at);
    document.getElementById('mail-delete-confirm').classList.remove('hidden');
  }

  function hookRow(row, letter) {
    let pressTimer = null;
    let startXY = null;
    let suppressOpen = false;
    const cancelPress = () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    };
    row.addEventListener('pointerdown', (e) => {
      startXY = [e.clientX, e.clientY];
      suppressOpen = false;
      cancelPress();
      pressTimer = setTimeout(() => {
        pressTimer = null;
        suppressOpen = true;
        confirmDelete(letter);
      }, 900);
    });
    row.addEventListener('pointermove', (e) => {
      if (pressTimer && startXY &&
          Math.hypot(e.clientX - startXY[0], e.clientY - startXY[1]) > 12) {
        cancelPress(); // it's a scroll, not a hold
      }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
      row.addEventListener(ev, cancelPress));
    // some iOS versions surface a long-press as contextmenu — same intent
    row.addEventListener('contextmenu', () => {
      suppressOpen = true;
      confirmDelete(letter);
    });
    row.addEventListener('click', () => {
      if (suppressOpen) { suppressOpen = false; return; }
      open(letter);
    });
  }

  /* Reader voice: the parent picks voice/speed/pitch via the compose
   * panel's "Reader voice & speed" button; the choice persists until
   * changed. Otherwise the best installed English voice wins automatically. A raised pitch is the
   * closest a web app can get to a kid voice — real Siri/child voices
   * aren't exposed to web apps by iOS. */
  const VOICE_KEY = 'calmpups-mail-voice';
  const RATE_KEY = 'calmpups-voice-rate';
  const PITCH_KEY = 'calmpups-voice-pitch';

  function getRate() {
    const v = parseFloat(localStorage.getItem(RATE_KEY));
    return Number.isFinite(v) ? v : 1.0;
  }
  function getPitch() {
    const v = parseFloat(localStorage.getItem(PITCH_KEY));
    return Number.isFinite(v) ? v : 1.0;
  }

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
    const sel = document.getElementById('vs-voice');
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
  /* The written name stays as spelled, but the voice says the phonetic
   * version from the badge's "say it like" field (TTS engines have no
   * phoneme control on iOS — respelling is the reliable fix). */
  function forSpeech(text) {
    try {
      const name = Hub.name;
      const phonetic = Hub.speak;
      if (name && phonetic) {
        const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        text = text.replace(new RegExp(esc, 'gi'), phonetic);
      }
    } catch (err) {}
    return text;
  }

  /* iOS cuts long utterances off mid-sentence, so long letters are read
   * as a queue of sentence-sized chunks that flow seamlessly. */
  let speakQueue = [];

  function stopSpeech(btn) {
    speakQueue = [];
    try { speechSynthesis.cancel(); } catch (err) {}
    if (btn) btn.classList.remove('speaking');
  }

  function speak(text, toggle, btn) {
    text = forSpeech(text);
    try {
      if (speechSynthesis.speaking || speakQueue.length) {
        stopSpeech(btn);
        if (toggle) return; // tapped the speaker while reading = stop
      }
      const sentences = text.match(/[^.!?\n]+[.!?]*[\s]*/g) || [text];
      const parts = [];
      let cur = '';
      for (const s of sentences) {
        if (cur && (cur + s).length > 220) { parts.push(cur); cur = s; }
        else cur += s;
      }
      if (cur.trim()) parts.push(cur);
      speakQueue = parts;
      if (btn) btn.classList.add('speaking');
      const next = () => {
        const part = speakQueue.shift();
        if (!part) { if (btn) btn.classList.remove('speaking'); return; }
        const u = new SpeechSynthesisUtterance(part);
        u.rate = getRate();
        u.pitch = getPitch();
        u.voice = pickVoice();
        u.onend = next;
        u.onerror = () => stopSpeech(btn);
        speechSynthesis.speak(u);
      };
      next();
    } catch (err) { /* no speech support — letter is still readable */ }
  }

  function speakLetter(toggle) {
    const full = (current.subject ? current.subject + '.\n' : '') + current.text;
    speak(full, toggle, document.getElementById('mail-speak-btn'));
  }

  function open(letter) {
    current = letter;
    renderRead();
    App.show('mailread');
    // no auto-read: the letter speaks only when the speaker button is tapped
    if (!letter.opened) {
      letter.opened = true;
      Store.saveLetter(letter).then(renderPanel).then(() => MailSync.kick());
      Sfx.play('open');
    } else {
      renderPanel();
    }
  }

  function renderRead() {
    const subj = document.getElementById('mail-subject');
    subj.textContent = current.subject || '';
    subj.classList.toggle('hidden', !current.subject);
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
      MailSync.kick();
      renderReplies();
      renderPanel();
      // make it feel like it flew off to HQ
      Sfx.play('sent');
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
    // kick a sync once the seed exists, so a brand-new device both uploads
    // its seeded letter and pulls the family mailbox right away
    seedWelcome().then(refresh).then(() => MailSync.kick());

    // Parent compose: hold the PAW MAIL header for 2s. The header owns its
    // touches (touch-action: none) so iOS can't cancel the hold, and only a
    // real lift cancels the timer — finger drift doesn't.
    const mailHead = document.getElementById('mail-head');
    let holdTimer = null;
    mailHead.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      holdTimer = setTimeout(() => {
        document.getElementById('compose-text').value = '';
        document.getElementById('compose-subject').value = '';
        pendingFromPhoto = null;
        document.getElementById('compose-photo-preview').classList.add('hidden');
        document.getElementById('mail-compose').classList.remove('hidden');
      }, COMPOSE_HOLD_MS);
    });
    ['pointerup', 'pointercancel'].forEach((ev) =>
      mailHead.addEventListener(ev, () => {
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
        subject: document.getElementById('compose-subject').value.trim(),
        text,
        at: Date.now(),
        opened: false,
        replies: [],
        fromPhoto: pendingFromPhoto,
      });
      document.getElementById('mail-compose').classList.add('hidden');
      await refresh();
      MailSync.kick();
      Sfx.play('mail'); // new mail!
    });

    document.getElementById('mail-delete-cancel').addEventListener('click', () => {
      deleteTarget = null;
      document.getElementById('mail-delete-confirm').classList.add('hidden');
    });
    document.getElementById('mail-delete-yes').addEventListener('click', async () => {
      if (deleteTarget) {
        // tombstone instead of hard delete: other devices must learn about
        // the deletion, and a tombstone can't be resurrected by a sync pull
        await Store.saveLetter({ id: deleteTarget.id, deleted: true, at: Date.now() });
        MailSync.kick();
      }
      deleteTarget = null;
      document.getElementById('mail-delete-confirm').classList.add('hidden');
      await refresh();
      Sounds.inviteChime();
    });

    document.getElementById('mail-reply-btn').addEventListener('click', toggleReply);
    document.getElementById('mail-speak-btn').addEventListener('click', () => speakLetter(true));

    // ---- voice settings (opened from the compose panel) ----
    populateVoicePicker();
    try {
      speechSynthesis.addEventListener('voiceschanged', populateVoicePicker);
    } catch (err) {}

    const settings = document.getElementById('voice-settings');
    const rateEl = document.getElementById('vs-rate');
    const pitchEl = document.getElementById('vs-pitch');
    const syncLabels = () => {
      document.getElementById('vs-rate-val').textContent = getRate().toFixed(2) + 'x';
      document.getElementById('vs-pitch-val').textContent = getPitch().toFixed(2);
    };

    const openVoiceSettings = () => {
      populateVoicePicker();
      rateEl.value = getRate();
      pitchEl.value = getPitch();
      document.getElementById('vs-speak').value = Hub.speak;
      syncLabels();
      settings.classList.remove('hidden');
    };
    document.getElementById('vs-speak').addEventListener('input', (e) => {
      Hub.setSpeak(e.target.value);
    });
    document.getElementById('compose-voice-btn').addEventListener('click', openVoiceSettings);

    document.getElementById('vs-voice').addEventListener('change', (e) => {
      try {
        if (e.target.value) localStorage.setItem(VOICE_KEY, e.target.value);
        else localStorage.removeItem(VOICE_KEY);
      } catch (err) {}
    });
    rateEl.addEventListener('input', () => {
      try { localStorage.setItem(RATE_KEY, rateEl.value); } catch (err) {}
      syncLabels();
    });
    pitchEl.addEventListener('input', () => {
      try { localStorage.setItem(PITCH_KEY, pitchEl.value); } catch (err) {}
      syncLabels();
    });
    document.getElementById('vs-kid').addEventListener('click', () => {
      try {
        localStorage.setItem(RATE_KEY, '1.05');
        localStorage.setItem(PITCH_KEY, '1.6');
      } catch (err) {}
      rateEl.value = 1.05;
      pitchEl.value = 1.6;
      syncLabels();
      speak('Hi ' + Hub.name + '! We are so proud of you!', false, null);
    });
    document.getElementById('vs-test').addEventListener('click', () => {
      speak('Hello ' + Hub.name + '! This is how your letters will sound.', false, null);
    });
    document.getElementById('vs-done').addEventListener('click', () => {
      try { speechSynthesis.cancel(); } catch (err) {}
      settings.classList.add('hidden');
    });

    App.register('mailread', {
      exit() {
        stopReply();
        stopSpeech(document.getElementById('mail-speak-btn'));
        urls.forEach((u) => URL.revokeObjectURL(u));
        urls = [];
      },
    });
  });

  return { refresh };
})();
