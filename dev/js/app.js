/* Screen manager + global shell: audio unlock, wake lock, SW registration.
 * Activities register {enter, exit} hooks and are switched by class toggle —
 * one document, no navigation, so nothing can reload mid-meltdown. */
const App = (() => {
  const modules = {}; // name -> {enter, exit}
  let current = 'login';
  let motionGranted = false;
  let wakeLock = null;

  function register(name, hooks) {
    modules[name] = hooks;
  }

  function show(name) {
    if (name === current) return;
    const prev = modules[current];
    if (prev && prev.exit) prev.exit();
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById('screen-' + name).classList.add('active');
    current = name;
    const next = modules[name];
    if (next && next.enter) next.enter();
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (err) { /* unsupported or low battery — screen may auto-lock */ }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Every touch re-arms the shared AudioContext — iOS parks it in
    // 'suspended'/'interrupted' after backgrounding, so a single one-time
    // unlock is not enough (this was the login going silent).
    document.addEventListener('pointerdown', () => Sounds.unlock());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Sounds.ctx) Sounds.ensure();
    });

    // A toddler will long-press everything; kill the context menu.
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS standalone: block pinch/double-tap zoom gestures entirely.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      // second tap landing fast on a non-interactive area = zoom attempt
      if (now - lastTouchEnd < 350 && !e.target.closest('button, input, select, textarea, .hub-box, #shield-wrap, .mail-row, .cal-day')) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    }, { passive: false });

    // Home cards -> activities; home buttons -> home.
    document.querySelectorAll('.card').forEach((card) => {
      card.addEventListener('click', () => show(card.dataset.screen));
    });
    document.querySelectorAll('.home-btn').forEach((btn) => {
      btn.addEventListener('click', () => show(btn.dataset.target || 'home'));
    });

    requestWakeLock();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    });

    /* Offline. 2.0 shipped without a worker on purpose so dev builds were
     * always fresh — but that made the app useless in the one place it matters
     * most, a car with no signal, and left the v1 worker at ../ answering
     * offline navigations here with v1's HTML (which then 404s its own assets
     * under dev/). Registering at this scope takes those navigations back.
     *
     * Freshness is preserved a different way: the cache name embeds the deploy
     * SHA, so every deploy installs a new cache and drops the old one. */
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        // Pick up a new deploy when she comes back, rather than on a cold boot
        // two days later.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      }).catch(() => { /* unsupported or blocked — the app still works online */ });
    }
  });

  return {
    register, show,
    get current() { return current; },
    get motionGranted() { return motionGranted; },
    set motionGranted(v) { motionGranted = v; },
  };
})();
