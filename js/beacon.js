/* LIGHT THE BEACON: hold the screen (or blow into the mic) steadily to
 * charge the rescue beacon until it blazes to life for the pup. Secretly
 * the same long-slow-exhale exercise as the old balloon: ~5s of sustained
 * effort, slow leak when idle, no fail state, endless. */
(() => {
  const RATE = 0.25;       // charge/second at full effort
  const LEAK = 0.03;       // slow dim when idle invites another breath/hold
  const TOUCH_EFFORT = 0.8;
  const COLORS = ['#ffd977', '#f2a7c6', '#8fd4c7', '#a8c8e8', '#c3b6dd'];

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
    lamp().setAttribute('fill', mix(color, Math.min(1, level)));
    const g = glow();
    g.style.background = `radial-gradient(circle, ${color}55 0%, ${color}22 40%, transparent 70%)`;
    g.style.opacity = (0.2 + level * 0.8).toFixed(3);
    g.style.transform = `translate(-50%, -50%) scale(${(0.5 + level * 0.9).toFixed(3)})`;
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
    const color = COLORS[colorIdx % COLORS.length];
    paint(performance.now());
    beam().style.background = `linear-gradient(180deg, ${color}00 0%, ${color}66 45%, ${color}00 100%)`;
    beam().classList.add('on');
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
