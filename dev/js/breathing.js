/* Breathing buddy: the orb grows and shrinks on a preschool-paced cycle
 * (4s in, 2s hold, 6s out, 1s rest) using the Web Animations API so one JS
 * clock can drive both the visual and the audio cues in sync. */
(() => {
  const IN_MS = 4000, HOLD_MS = 2000, OUT_MS = 6000, REST_MS = 1000;
  const CYCLE_MS = IN_MS + HOLD_MS + OUT_MS + REST_MS;
  const GROW = 1.6;

  let orbAnim = null;
  let haloAnim = null;
  let rafId = null;
  let lastPhase = null;
  let cycles = 0;

  function phaseAt(t) {
    if (t < IN_MS) return 'in';
    if (t < IN_MS + HOLD_MS) return 'hold';
    if (t < IN_MS + HOLD_MS + OUT_MS) return 'out';
    return 'rest';
  }

  /* Every full breath lights one paw-light; five breaths fully recharges
   * the pup — quiet celebration, then a fresh row. */
  function lights() {
    return Array.from(document.querySelectorAll('.breath-light'));
  }

  function lightUp() {
    const row = lights();
    const lit = row.filter((l) => l.classList.contains('lit')).length;
    if (lit < row.length) {
      row[lit].classList.add('lit');
      Sounds.inviteChime();
    }
    if (lit + 1 >= row.length) {
      Sfx.play('toppup');
      const pup = document.getElementById('breath-pup');
      pup.classList.add('blink');
      setTimeout(() => pup.classList.remove('blink'), 1700);
      setTimeout(() => row.forEach((l) => l.classList.remove('lit')), 2600);
    }
  }

  function start() {
    const orb = document.getElementById('breath-orb');
    const halo = document.getElementById('breath-halo');
    const o = [IN_MS, HOLD_MS, OUT_MS].map((_, i) =>
      [IN_MS, IN_MS + HOLD_MS, IN_MS + HOLD_MS + OUT_MS][i] / CYCLE_MS);

    orbAnim = orb.animate([
      { transform: 'scale(1)', filter: 'brightness(1)', offset: 0 },
      { transform: `scale(${GROW})`, filter: 'brightness(1.08)', offset: o[0] },
      { transform: `scale(${GROW})`, filter: 'brightness(1.1)', offset: o[1] },
      { transform: 'scale(1)', filter: 'brightness(0.97)', offset: o[2] },
      { transform: 'scale(1)', filter: 'brightness(1)', offset: 1 },
    ], { duration: CYCLE_MS, iterations: Infinity, easing: 'linear' });

    haloAnim = halo.animate([
      { transform: 'scale(1)', opacity: 0.5, offset: 0 },
      { transform: `scale(${GROW + 0.25})`, opacity: 0.9, offset: o[0] },
      { transform: `scale(${GROW + 0.25})`, opacity: 0.9, offset: o[1] },
      { transform: 'scale(1)', opacity: 0.5, offset: o[2] },
      { transform: 'scale(1)', opacity: 0.5, offset: 1 },
    ], { duration: CYCLE_MS, iterations: Infinity, easing: 'linear' });

    lastPhase = null;
    cycles = 0;
    rafId = requestAnimationFrame(drive);
  }

  function drive() {
    if (orbAnim) {
      const t = Number(orbAnim.currentTime || 0) % CYCLE_MS;
      const phase = phaseAt(t);
      if (phase !== lastPhase) {
        if (phase === 'in') Sounds.breathIn(IN_MS / 1000);
        if (phase === 'out') Sounds.breathOut(OUT_MS / 1000);
        if (phase === 'rest') {
          cycles++;
          lightUp();
        }
        lastPhase = phase;
      }
    }
    rafId = requestAnimationFrame(drive);
  }

  document.addEventListener('DOMContentLoaded', () => {
    App.register('breathing', {
      enter() {
        lights().forEach((l) => l.classList.remove('lit'));
        start();
      },
      exit() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        if (orbAnim) orbAnim.cancel();
        if (haloAnim) haloAnim.cancel();
        orbAnim = haloAnim = null;
      },
    });
  });
})();
