/* Parent-recorded voice prompts. A hidden panel (triple-tap the top-RIGHT
 * corner of the login screen) lets a parent record short clips in their own
 * voice — "put your finger on the badge!" and "say your name!" — which are
 * stored in localStorage as data URLs and played at the right login moments.
 * With no recording saved, speech synthesis is the (robotic, best-effort)
 * fallback. iOS cannot play ANY audio before the first touch, so the hold
 * prompt fires on her first touch rather than on screen load. */
const Voice = (() => {
  const MAX_CLIP_MS = 5000;
  const KEYS = {
    hold: { ls: 'calmpups-voice-hold', fallback: 'Put your finger on the badge!' },
    name: { ls: 'calmpups-voice-name', fallback: 'Say your name!' },
  };

  let recorder = null;
  let recKey = null;
  let recTimer = null;
  let player = null;

  function clip(key) {
    try { return localStorage.getItem(KEYS[key].ls); } catch (err) { return null; }
  }

  function play(key) {
    const data = clip(key);
    if (data) {
      try {
        if (player) player.pause();
        player = new Audio(data);
        player.play().catch(() => speak(key));
        return;
      } catch (err) { /* fall through */ }
    }
    speak(key);
  }

  function speak(key) {
    try {
      const u = new SpeechSynthesisUtterance(KEYS[key].fallback);
      u.rate = 0.9;
      speechSynthesis.speak(u);
    } catch (err) {}
  }

  async function startRecording(key, onDone) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      onDone(false);
      return null;
    }
    const chunks = [];
    recorder = new MediaRecorder(stream);
    recKey = key;
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/mp4' });
      const reader = new FileReader();
      reader.onload = () => {
        try {
          localStorage.setItem(KEYS[key].ls, reader.result);
          onDone(true);
        } catch (err) { onDone(false); }
      };
      reader.readAsDataURL(blob);
      recorder = null;
      recKey = null;
    };
    recorder.start();
    recTimer = setTimeout(() => stopRecording(), MAX_CLIP_MS);
    return recorder;
  }

  function stopRecording() {
    if (recTimer) { clearTimeout(recTimer); recTimer = null; }
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  // ---- parent panel ----
  function bindPanel() {
    const panel = document.getElementById('voice-panel');
    panel.querySelectorAll('.voice-row').forEach((row) => {
      const key = row.dataset.key;
      const recBtn = row.querySelector('.v-rec');
      const playBtn = row.querySelector('.v-play');
      const refresh = () => row.classList.toggle('has-clip', !!clip(key));
      refresh();

      recBtn.addEventListener('click', async () => {
        if (recorder && recKey === key) { stopRecording(); return; }
        if (recorder) return; // another row is recording
        recBtn.classList.add('recording');
        await startRecording(key, () => {
          recBtn.classList.remove('recording');
          refresh();
        });
      });

      playBtn.addEventListener('click', () => play(key));
    });

    document.getElementById('voice-close').addEventListener('click', () => {
      stopRecording();
      panel.classList.add('hidden');
    });

    // Hidden parent entrance: triple-tap the top-right corner of the login.
    let taps = [];
    document.getElementById('login-corner-voice').addEventListener('pointerdown', () => {
      const now = Date.now();
      taps = taps.filter((t) => now - t < 1200);
      taps.push(now);
      if (taps.length >= 3) panel.classList.remove('hidden');
    });
  }

  document.addEventListener('DOMContentLoaded', bindPanel);

  return { play, hasClip: (key) => !!clip(key) };
})();
