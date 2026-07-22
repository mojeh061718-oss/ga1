/* Rescue login: shield finger-scan hold -> "WELCOME <NAME>" -> hub.
 * No permission prompts live here — the mic and motion are requested only
 * by the features that need them.
 *
 * The login runs on EVERY launch (no auto-skip), and returning from the
 * background after RELOCK_MIN minutes reloads back to it.
 *
 * Parent access gate: double-tap anywhere OUTSIDE the shield to toggle the
 * login open/locked (persisted). The tiny dot top-right shows the state —
 * green = she can get in, red = access denied. While locked, a completed
 * scan is refused; the triple-tap top-left parent skip still works as the
 * override. */
const Login = (() => {
  const HOLD_SECONDS = 8;        // parent-tunable; partial credit is kept on lift
  const RELOCK_MIN = 10;         // backgrounded longer than this -> back to login
  const RING_LEN = 603.2;        // circumference of the scan ring circle
  const GATE_KEY = 'calmpups-gate';

  let progress = 0;              // 0..1, accumulates only while held
  let holding = false;
  let done = false;
  let rafId = null;
  let lastT = 0;

  const screen = () => document.getElementById('screen-login');
  const ring = () => document.getElementById('scan-ring');

  // ---- access gate ----
  function gateOpen() {
    try { return localStorage.getItem(GATE_KEY) !== 'locked'; } catch (err) { return true; }
  }
  function setGate(open) {
    try { localStorage.setItem(GATE_KEY, open ? 'open' : 'locked'); } catch (err) {}
    renderGate();
  }
  function renderGate() {
    document.getElementById('gate-dot').classList.toggle('locked', !gateOpen());
  }

  function tick(now) {
    if (holding && !done) {
      progress = Math.min(1, progress + (now - lastT) / 1000 / HOLD_SECONDS);
      ring().style.strokeDashoffset = RING_LEN * (1 - progress);
      Sounds.humProgress(progress);
      if (progress >= 1) scanComplete();
    }
    lastT = now;
    rafId = requestAnimationFrame(tick);
  }

  function scanComplete() {
    holding = false;
    Sounds.humStop();
    if (!gateOpen()) { deny(); return; }
    done = true;
    screen().classList.remove('scanning', 'inviting');
    Sounds.chime();
    sparkleBurst(document.getElementById('scan-sparkles'), 6);
    setTimeout(showWelcome, 700);
  }

  /* Access denied: shake, red flash, ACCESS DENIED popup — HQ is closed. */
  function deny() {
    progress = 0;
    screen().classList.remove('scanning');
    ring().style.strokeDashoffset = RING_LEN;
    ring().classList.add('denied');
    screen().classList.add('shake');
    Sounds.uhoh();
    const popup = document.getElementById('denied-popup');
    popup.classList.remove('hidden');
    setTimeout(() => {
      ring().classList.remove('denied');
      screen().classList.remove('shake');
    }, 900);
    setTimeout(() => popup.classList.add('hidden'), 2800);
  }

  function sparkleBurst(host, n) {
    for (let i = 0; i < n; i++) {
      const s = document.createElement('div');
      s.className = 'sparkle';
      s.style.left = 15 + Math.random() * 70 + '%';
      s.style.top = 10 + Math.random() * 70 + '%';
      s.style.animationDelay = (i * 0.12) + 's';
      host.appendChild(s);
      setTimeout(() => s.remove(), 3000);
    }
  }

  function showWelcome() {
    document.getElementById('login-scan').classList.remove('active');
    const name = Hub.name;
    document.getElementById('welcome-name').textContent = name.toUpperCase();
    const photo = Hub.photo;
    const img = document.getElementById('welcome-photo');
    const shield = document.getElementById('welcome-shield');
    if (photo) {
      img.src = photo;
      img.classList.remove('hidden');
      shield.classList.add('hidden');
    } else {
      img.classList.add('hidden');
      shield.classList.remove('hidden');
      document.getElementById('welcome-initial').textContent =
        (name[0] || 'M').toUpperCase();
    }
    document.getElementById('login-welcome').classList.add('active');
    Sounds.praise();
  }

  function enterApp() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    App.show('hub');
  }

  document.addEventListener('DOMContentLoaded', () => {
    App.register('login', {});
    renderGate();

    // iOS keeps installed web apps alive in memory, so "reopening" often
    // resumes the page instead of reloading it. If the app was in the
    // background long enough, reload back to a fresh login. (Short
    // interruptions — a call, a text — don't kick her out mid-activity.)
    let hiddenAt = null;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > RELOCK_MIN * 60 * 1000) {
        location.reload();
      }
    });

    if (new URLSearchParams(location.search).has('skiplogin')) {
      enterApp();
      return;
    }

    screen().classList.add('inviting');
    const wrap = document.getElementById('shield-wrap');

    wrap.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (done) return;
      holding = true;
      screen().classList.add('scanning');
      Sounds.humStart();
    });

    const release = () => {
      if (holding) {
        holding = false;
        screen().classList.remove('scanning');
        Sounds.humStop(); // progress is kept — lifting early just pauses
      }
    };
    wrap.addEventListener('pointerup', release);
    wrap.addEventListener('pointercancel', release);

    document.getElementById('welcome-go').addEventListener('click', enterApp);

    // Parent gate toggle: double-tap the login background (not the shield).
    let gateTapAt = 0;
    screen().addEventListener('pointerdown', (e) => {
      if (e.target.closest('#shield-wrap') || done) return;
      const now = Date.now();
      if (now - gateTapAt < 400) {
        gateTapAt = 0;
        setGate(!gateOpen());
      } else {
        gateTapAt = now;
      }
    });

    // Hidden parent skip (override, works even while locked):
    // triple-tap the top-left corner.
    let taps = [];
    document.getElementById('login-corner-skip').addEventListener('pointerdown', () => {
      const now = Date.now();
      taps = taps.filter((t) => now - t < 1200);
      taps.push(now);
      if (taps.length >= 3) enterApp();
    });

    lastT = performance.now();
    rafId = requestAnimationFrame(tick);
  });

  return {};
})();
