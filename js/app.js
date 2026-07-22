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
    // First touch anywhere unlocks the shared AudioContext (iOS requirement).
    document.addEventListener('pointerdown', () => Sounds.unlock(), { once: true });

    // A toddler will long-press everything; kill the context menu.
    document.addEventListener('contextmenu', (e) => e.preventDefault());

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

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  });

  return {
    register, show,
    get motionGranted() { return motionGranted; },
    set motionGranted(v) { motionGranted = v; },
  };
})();
