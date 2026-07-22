/* Balloon blowing: press-and-hold always inflates; blowing into the mic does
 * too when it's enabled. Full inflation needs ~5s of cumulative effort (the
 * therapeutic long exhale), then the balloon floats away and a new one
 * arrives. Endless, no fail state. */
(() => {
  const RATE = 0.25;       // fill/second at full effort
  const LEAK = 0.03;       // slow deflate when idle invites another breath
  const TOUCH_EFFORT = 0.8;
  const COLORS = [
    ['#f2a7c6', '#e386ad'], // pink
    ['#8fc7bd', '#6fb0a4'], // sage
    ['#c3b6dd', '#a794cc'], // lavender
    ['#f9e6a8', '#eccf7f'], // sunny
    ['#a8c8e8', '#7fa8d9'], // sky
  ];

  let fill = 0;
  let held = false;
  let colorIdx = 0;
  let celebrating = false;
  let rafId = null;
  let lastT = 0;

  const g = () => document.getElementById('balloon-g');
  const holder = () => document.getElementById('balloon-holder');
  const micBtn = () => document.getElementById('balloon-mic-btn');

  function applyColor() {
    const [body, dark] = COLORS[colorIdx % COLORS.length];
    document.getElementById('balloon-body').setAttribute('fill', body);
    document.getElementById('balloon-knot').setAttribute('fill', dark);
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
      let scale = 0.3 + 0.75 * fill;
      if (fill > 0.9) scale += Math.sin(now / 70) * 0.012; // earned wobble
      g().style.transform = `scale(${scale.toFixed(4)})`;
      if (fill >= 1) celebrate();
    }
    rafId = requestAnimationFrame(tick);
  }

  function celebrate() {
    celebrating = true;
    holder().classList.add('released');
    Sounds.praise();
    const pup = document.getElementById('balloon-pup');
    pup.classList.add('happy');
    const sparkles = document.getElementById('balloon-sparkles');
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('div');
      s.className = 'sparkle';
      s.style.left = 30 + Math.random() * 40 + '%';
      s.style.bottom = 20 + Math.random() * 20 + '%';
      s.style.animationDelay = (i * 0.3) + 's';
      sparkles.appendChild(s);
      setTimeout(() => s.remove(), 3200);
    }
    setTimeout(() => {
      pup.classList.remove('happy');
      const h = holder();
      h.style.transition = 'none';
      h.classList.remove('released');
      void h.offsetHeight; // commit the jump back before re-enabling transition
      h.style.transition = '';
      fill = 0;
      colorIdx++;
      applyColor();
      g().style.transform = 'scale(0.3)';
      h.style.opacity = '0';
      requestAnimationFrame(() => {
        h.style.transition = 'opacity 1s ease-in-out';
        h.style.opacity = '1';
        setTimeout(() => { h.style.transition = ''; celebrating = false; }, 1100);
      });
    }, 4400);
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
    const stage = document.getElementById('balloon-stage');
    stage.addEventListener('pointerdown', (e) => { e.preventDefault(); held = true; });
    window.addEventListener('pointerup', () => { held = false; });
    window.addEventListener('pointercancel', () => { held = false; });

    micBtn().addEventListener('click', (e) => {
      e.stopPropagation();
      setMic(!Mic.active);
    });

    App.register('balloon', {
      enter() {
        fill = 0;
        celebrating = false;
        applyColor();
        g().style.transform = 'scale(0.3)';
        // Promptless re-acquire if login already granted the mic this session.
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
        holder().classList.remove('released');
      },
    });
  });
})();
