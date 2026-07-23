/* THE LANTERN LIGHTHOUSE (Studio Aurora): hold the screen (or blow into the
 * mic) steadily to warm the lighthouse lamp until it blazes for the pup.
 * Secretly the same long-slow-exhale exercise as the old balloon: ~5s of
 * sustained effort, slow leak when idle, no fail state, endless.
 * 2.0 art: warmth visibly travels — Wick's lantern glows first, then window
 * lights climb the tower stair, then the lamp blooms and twin beams sweep
 * the sea. Mechanics identical to v1. */
(() => {
  const RATE = 0.25;       // charge/second at full effort
  const LEAK = 0.03;       // slow dim when idle invites another breath/hold
  const TOUCH_EFFORT = 0.8;
  // aurora palette: each rekindled beacon glows a new night color
  const COLORS = ['#ffd88a', '#6fe3c1', '#b9a7f0', '#f0b8d9', '#9ff2b8'];

  let fill = 0;
  let held = false;
  let colorIdx = 0;
  let celebrating = false;
  let rafId = null;
  let lastT = 0;

  const lamp = () => document.getElementById('beacon-lamp');
  const glow = () => document.getElementById('beacon-glow');
  const beam = () => document.getElementById('beacon-beam');
  const micBtn = () => document.getElementById('beacon-mic-btn');

  function mix(hex, t) {
    // blend from the dark unlit lamp color toward the target color
    const dark = [58, 63, 82];
    const c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    const out = dark.map((d, i) => Math.round(d + (c[i] - d) * t));
    return `rgb(${out[0]},${out[1]},${out[2]})`;
  }

  function paint(now) {
    const color = COLORS[colorIdx % COLORS.length];
    let level = fill;
    if (fill > 0.9 && !celebrating) level += Math.sin(now / 60) * 0.04; // eager flicker
    level = Math.max(0, Math.min(1, level));
    lamp().setAttribute('fill', mix(color, level));
    // the lamp halo (SVG circle) blooms and takes the round's color
    const a = document.getElementById('bcn-glow-a');
    const b = document.getElementById('bcn-glow-b');
    if (a) a.setAttribute('stop-color', color);
    if (b) b.setAttribute('stop-color', color);
    const g = glow();
    g.setAttribute('opacity', (0.15 + level * 0.85).toFixed(3));
    g.setAttribute('r', Math.round(64 + level * 116));
    // warmth climbs: Wick's lantern first, then the staircase windows
    document.querySelectorAll('#screen-beacon .bcn-win').forEach((w) => {
      w.classList.toggle('lit', fill >= parseFloat(w.dataset.th));
    });
  }

  function tick(now) {
    const dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    if (!celebrating) {
      const effort = Math.max(held ? TOUCH_EFFORT : 0, Mic.breathStrength());
      if (effort > 0) {
        fill = Math.min(1, fill + effort * RATE * (1 - 0.4 * fill * fill) * dt);
      } else {
        fill = Math.max(0, fill - LEAK * dt);
      }
      paint(now);
      if (fill >= 1) celebrate();
    }
    rafId = requestAnimationFrame(tick);
  }

  function celebrate() {
    celebrating = true;
    paint(performance.now());
    beam().classList.add('on'); // twin SVG beams sweep the sea (SMIL + CSS fade)

    Sfx.play('toppup');
    const pup = document.getElementById('beacon-pup');
    pup.classList.add('happy');
    const sparkles = document.getElementById('beacon-sparkles');
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('div');
      s.className = 'sparkle';
      s.style.left = 25 + Math.random() * 50 + '%';
      s.style.top = 12 + Math.random() * 30 + '%';
      s.style.animationDelay = (i * 0.2) + 's';
      sparkles.appendChild(s);
      setTimeout(() => s.remove(), 3200);
    }
    setTimeout(() => {
      pup.classList.remove('happy');
      beam().classList.remove('on');
      fill = 0;
      colorIdx++; // the next beacon glows a new color
      paint(performance.now());
      celebrating = false;
    }, 3400);
  }

  async function setMic(on) {
    const btn = micBtn();
    if (on) {
      const ok = await Mic.enable();
      btn.classList.toggle('on', ok);
      btn.classList.toggle('denied', !ok);
    } else {
      Mic.disable();
      btn.classList.remove('on');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const stage = document.getElementById('beacon-stage');
    stage.addEventListener('pointerdown', (e) => { e.preventDefault(); held = true; });
    window.addEventListener('pointerup', () => { held = false; });
    window.addEventListener('pointercancel', () => { held = false; });

    micBtn().addEventListener('click', (e) => {
      e.stopPropagation();
      setMic(!Mic.active);
    });

    App.register('beacon', {
      enter() {
        fill = 0;
        celebrating = false;
        paint(performance.now());
        if (Mic.grantedThisSession) setMic(true);
        lastT = performance.now();
        rafId = requestAnimationFrame(tick);
      },
      exit() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        held = false;
        setMic(false);
        micBtn().classList.remove('denied');
        beam().classList.remove('on');
      },
    });
  });
})();
