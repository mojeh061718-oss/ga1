/* Rescue login: shield finger-scan hold -> permission chain -> "say your name".
 * This ritual is the app's ONLY permission surface. It can never block entry:
 * every failure path lands on the big paw button. */
const Login = (() => {
  const HOLD_SECONDS = 8;        // parent-tunable; partial credit is kept on lift
  const QUICK_RETURN_MIN = 30;   // relaunch within this many minutes skips login
  const NAME_LISTEN_MS = 8000;
  const RING_LEN = 603.2;        // circumference of the scan ring circle
  const LS_KEY = 'calmpups-last-login';

  let progress = 0;              // 0..1, accumulates only while held
  let holding = false;
  let done = false;
  let rafId = null;
  let lastT = 0;

  const screen = () => document.getElementById('screen-login');
  const ring = () => document.getElementById('scan-ring');

  function quickReturnValid() {
    try {
      const t = parseInt(localStorage.getItem(LS_KEY), 10);
      return t && Date.now() - t < QUICK_RETURN_MIN * 60 * 1000;
    } catch (err) { return false; }
  }

  function rememberLogin() {
    try { localStorage.setItem(LS_KEY, String(Date.now())); } catch (err) {}
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
    done = true;
    holding = false;
    screen().classList.remove('scanning', 'inviting');
    Sounds.humStop();
    Sounds.chime();
    sparkleBurst(document.getElementById('scan-sparkles'), 6);
    // The permission chain runs from the next pointerup (finger lift) so the
    // iOS DeviceMotion prompt happens inside a genuine user gesture.
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

  async function requestMotion() {
    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        App.motionGranted = (await DeviceMotionEvent.requestPermission()) === 'granted';
      } catch (err) { App.motionGranted = false; }
    } else {
      App.motionGranted = true; // no permission gate on this platform
    }
  }

  async function nameStep() {
    document.getElementById('login-scan').classList.remove('active');
    document.getElementById('login-name').classList.add('active');
    Sounds.inviteChime();
    // Parent-recorded clip if one exists, else speech synthesis. Either way
    // the pulsing mic visual carries the meaning on its own.
    Voice.play('name');

    const micOk = await Mic.enable();
    if (micOk) {
      const heard = await Mic.waitForSound(NAME_LISTEN_MS);
      Mic.disable(); // no lingering orange recording indicator
      if (heard) { succeed(); return; }
    }
    // Denied / silent / failed: the paw always lets her in.
    document.getElementById('login-paw-btn').classList.remove('hidden');
  }

  function succeed() {
    rememberLogin();
    Sounds.praise();
    screen().classList.add('opening');
    setTimeout(() => enterApp(), 1200);
  }

  function enterApp() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    App.show('hub');
  }

  document.addEventListener('DOMContentLoaded', () => {
    App.register('login', {});

    if (new URLSearchParams(location.search).has('skiplogin') || quickReturnValid()) {
      enterApp();
      return;
    }

    screen().classList.add('inviting');

    // iOS blocks all audio until the first touch, so the "put your finger
    // on the badge" prompt plays the moment she first touches anywhere.
    screen().addEventListener('pointerdown', () => {
      if (Voice.hasClip('hold')) Voice.play('hold');
    }, { once: true });

    const wrap = document.getElementById('shield-wrap');

    wrap.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (done) return;
      holding = true;
      screen().classList.add('scanning');
      Sounds.humStart();
    });

    const release = async () => {
      if (holding) {
        holding = false;
        screen().classList.remove('scanning');
        Sounds.humStop(); // progress is kept — lifting early just pauses
      }
      if (done && document.getElementById('login-scan').classList.contains('active')) {
        await requestMotion(); // inside the pointerup gesture
        nameStep();
      }
    };
    wrap.addEventListener('pointerup', release);
    wrap.addEventListener('pointercancel', release);

    document.getElementById('login-paw-btn').addEventListener('click', () => {
      rememberLogin();
      enterApp();
    });

    // Hidden parent skip: triple-tap the top-left corner (README-only).
    let taps = [];
    document.getElementById('login-corner-skip').addEventListener('pointerdown', () => {
      const now = Date.now();
      taps = taps.filter((t) => now - t < 1200);
      taps.push(now);
      if (taps.length >= 3) { rememberLogin(); enterApp(); }
    });

    lastT = performance.now();
    rafId = requestAnimationFrame(tick);
  });
})();
