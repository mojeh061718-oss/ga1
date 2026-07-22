/* Bedtime diary: a guided question flow for the last 15 minutes of the day.
 * The parent reads each question aloud, taps the mic, and she answers in
 * her own voice (tap again to stop). The final step is a selfie together.
 * The whole session — every recording + the photo — is stored on the phone
 * (IndexedDB) under today's date for the Log calendar. */
(() => {
  const MAX_ANSWER_MS = 60000;

  const QUESTIONS = [
    'What did you love most about today?',
    'What made you laugh really hard today?',
    'What was the hardest part of your day?',
    'Did you feel sad or mad today? What happened?',
    'What did you do to feel better?',
    'Do you think you were a good rescue pup today? Why?',
    'Did you help somebody today? Who?',
    'Did somebody help you today?',
    'What is something new you tried or learned?',
    'What was the yummiest thing you ate today?',
    'Who did you play with today? What did you play?',
    'If today was a color, what color would it be?',
    'What are you thankful for tonight?',
    'Who do you love? Do they know it?',
    'What was the bravest thing you did today?',
    'What do you want to do tomorrow?',
    'If you get big feelings tomorrow, what will you do?',
    'Do you remember your dream from last night?',
    'What do you want to dream about tonight?',
    'Give me your best goodnight howl! Awoooo!',
    'Selfie time! Squeeze in together!', // camera step, always last
  ];
  const SELFIE_INDEX = QUESTIONS.length - 1;

  let idx = 0;
  let answers = [];
  let selfieBlob = null;
  let recorder = null;
  let recTimer = null;

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  const qEl = () => document.getElementById('diary-q');
  const recBtn = () => document.getElementById('diary-rec');
  const camBtn = () => document.getElementById('diary-camera');
  const nextBtn = () => document.getElementById('diary-next');

  function renderProgress() {
    const host = document.getElementById('diary-progress');
    host.innerHTML = '';
    for (let i = 0; i < QUESTIONS.length; i++) {
      const dot = document.createElement('div');
      dot.className = 'diary-dot' +
        (i < idx ? ' done' : i === idx ? ' now' : '');
      host.appendChild(dot);
    }
  }

  function showQuestion() {
    stopRecording(true);
    document.getElementById('diary-end').classList.add('hidden');
    document.getElementById('diary-selfie-preview').classList.add('hidden');
    qEl().classList.remove('hidden');
    qEl().textContent = QUESTIONS[idx];
    qEl().classList.remove('q-in');
    void qEl().offsetWidth;
    qEl().classList.add('q-in');
    const selfie = idx === SELFIE_INDEX;
    recBtn().classList.toggle('hidden', selfie);
    camBtn().classList.toggle('hidden', !selfie);
    nextBtn().classList.remove('hidden');
    renderProgress();
  }

  async function startRecording() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      return false;
    }
    const chunks = [];
    const qi = idx; // the question this recording belongs to
    recorder = new MediaRecorder(stream);
    const mime = recorder.mimeType || 'audio/mp4';
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      answers[qi] = {
        q: QUESTIONS[qi],
        audio: new Blob(chunks, { type: mime }),
        skipped: false,
      };
      recorder = null;
      recBtn().classList.remove('recording');
      recBtn().classList.add('answered');
    };
    recorder.start();
    recBtn().classList.add('recording');
    recBtn().classList.remove('answered');
    recTimer = setTimeout(() => stopRecording(), MAX_ANSWER_MS);
    return true;
  }

  function stopRecording(discard) {
    if (recTimer) { clearTimeout(recTimer); recTimer = null; }
    if (recorder && recorder.state !== 'inactive') {
      if (discard) recorder.ondataavailable = null;
      recorder.stop();
    }
    recBtn().classList.remove('recording');
  }

  async function finish() {
    stopRecording(true);
    qEl().classList.add('hidden');
    recBtn().classList.add('hidden');
    camBtn().classList.add('hidden');
    nextBtn().classList.add('hidden');
    document.getElementById('diary-progress').innerHTML = '';
    document.getElementById('diary-selfie-preview').classList.add('hidden');
    document.getElementById('diary-end').classList.remove('hidden');
    Sounds.settleChime();
    await new Promise((r) => setTimeout(r, 350)); // let a final onstop land
    await Store.updateDay(today(), {
      // build from QUESTIONS, not answers — a sparse answers array would
      // silently drop every skipped question from the record
      diary: QUESTIONS.map((q, i) => answers[i] || { q, audio: null, skipped: true }),
      selfie: selfieBlob,
      diaryAt: Date.now(),
    });
  }

  function next() {
    if (idx >= SELFIE_INDEX) { finish(); return; }
    stopRecording(false);
    idx++;
    // slight delay so a just-stopped recording lands in answers first
    setTimeout(showQuestion, 120);
  }

  document.addEventListener('DOMContentLoaded', () => {
    recBtn().addEventListener('click', () => {
      if (recorder) stopRecording();
      else startRecording();
    });

    nextBtn().addEventListener('click', next);

    const fileInput = document.getElementById('diary-selfie-input');
    camBtn().addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      selfieBlob = f;
      const preview = document.getElementById('diary-selfie-preview');
      preview.src = URL.createObjectURL(f);
      preview.classList.remove('hidden');
      camBtn().classList.add('answered');
      fileInput.value = '';
    });

    App.register('diary', {
      enter() {
        idx = 0;
        answers = [];
        selfieBlob = null;
        recBtn().classList.remove('answered', 'recording');
        camBtn().classList.remove('answered');
        showQuestion();
      },
      exit() {
        stopRecording(true);
      },
    });
  });
})();
