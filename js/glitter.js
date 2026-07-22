/* Glitter jar: swirl with a finger (or shake the phone, if motion permission
 * was granted at login), then watch ~45 seconds of slow settling. The
 * settling IS the activity — a digital calm-down jar. */
(() => {
  const COUNT = 230;
  const TAU = 8;              // energy e-folding time (s) -> ~45s visible settle
  const SHAKE_THRESHOLD = 8;  // m/s^2 beyond gravity
  const PALETTE = ['#8fc7bd', '#c3b6dd', '#f2a7c6', '#f9e6a8', '#a8c8e8'];

  let canvas, ctx, W, H, jar;
  let particles = [];
  let energy = 0;
  let settledChimed = false;
  let rafId = null;
  let lastT = 0;
  let pointer = null; // {x, y, vx, vy}
  let motionHooked = false;

  function layout() {
    canvas = document.getElementById('glitter-canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    jar = {
      x: W * 0.16,
      y: H * 0.14,
      w: W * 0.68,
      h: H * 0.74,
      r: 26,
    };
  }

  function seed() {
    particles = [];
    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: jar.x + Math.random() * jar.w,
        y: jar.y + jar.h - Math.random() * jar.h * 0.25, // start piled low
        vx: 0, vy: 0,
        size: 1 + Math.random() * 2,
        color: PALETTE[i % PALETTE.length],
        phase: Math.random() * Math.PI * 2,
        drift: 0.6 + Math.random() * 0.8, // fine haze settles last
        rest: 3 + Math.random() * 30,     // own depth in the pile at the bottom
      });
    }
  }

  function stir(amount) {
    energy = Math.min(1, energy + amount);
  }

  function onMotion(e) {
    const a = e.acceleration;
    if (!a || a.x === null) return;
    const mag = Math.hypot(a.x, a.y, a.z);
    if (mag > SHAKE_THRESHOLD) stir((mag - SHAKE_THRESHOLD) / 45);
  }

  function step(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    const t = now / 1000;

    energy *= Math.exp(-dt / TAU);
    if (energy > 0.1) settledChimed = false;
    if (energy < 0.01 && !settledChimed) {
      settledChimed = true;
      Sounds.settleChime();
      const pup = document.getElementById('glitter-pup');
      pup.classList.add('nod');
      setTimeout(() => pup.classList.remove('nod'), 2500);
    }

    for (const p of particles) {
      // swirl field: two slow sinusoids, scaled by jar energy
      const s = 420 * energy * p.drift;
      p.vx += Math.sin(p.y * 0.013 + t * 0.9 + p.phase) * s * dt;
      p.vy += (Math.cos(p.x * 0.011 + t * 0.7) * 0.6 - 0.55) * s * dt; // slight lift
      // gravity + drag
      p.vy += 42 * (p.size / 2) * dt;
      const drag = Math.max(0, 1 - 1.4 * dt);
      p.vx *= drag;
      p.vy *= drag;
      // finger stir impulse
      if (pointer) {
        const dx = p.x - pointer.x, dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 6400) {
          const f = (1 - Math.sqrt(d2) / 80) * 0.25;
          p.vx += pointer.vx * f;
          p.vy += pointer.vy * f;
        }
      }
      // gentle inward drift so glitter doesn't pile up on the glass
      if (p.x < jar.x + 14) p.vx += 26 * dt;
      else if (p.x > jar.x + jar.w - 14) p.vx -= 26 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // soft jar walls
      if (p.x < jar.x + 3) { p.x = jar.x + 3; p.vx *= -0.3; }
      if (p.x > jar.x + jar.w - 3) { p.x = jar.x + jar.w - 3; p.vx *= -0.3; }
      if (p.y < jar.y + 3) { p.y = jar.y + 3; p.vy *= -0.3; }
      if (p.y > jar.y + jar.h - p.rest) { p.y = jar.y + jar.h - p.rest; p.vy *= -0.2; p.vx *= 0.9; }
    }

    draw(t);
    pointer = null; // impulses apply for the frame the finger moved
    rafId = requestAnimationFrame(step);
  }

  function roundedRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    // glass
    roundedRect(ctx, jar.x, jar.y, jar.w, jar.h, jar.r);
    ctx.fillStyle = 'rgba(223, 240, 244, 0.55)';
    ctx.fill();
    ctx.strokeStyle = '#b3ccd6';
    ctx.lineWidth = 3;
    ctx.stroke();
    // lid
    roundedRect(ctx, jar.x + jar.w * 0.18, jar.y - 26, jar.w * 0.64, 22, 8);
    ctx.fillStyle = '#9fb6c9';
    ctx.fill();
    // glitter (clipped to the glass)
    ctx.save();
    roundedRect(ctx, jar.x, jar.y, jar.w, jar.h, jar.r);
    ctx.clip();
    for (const p of particles) {
      const tw = 0.55 + 0.45 * Math.sin(t * (2 + energy * 5) + p.phase);
      ctx.globalAlpha = 0.45 + 0.55 * tw;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function onPointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x > jar.x - 20 && x < jar.x + jar.w + 20 && y > jar.y - 20 && y < jar.y + jar.h + 20) {
      const vx = (e.movementX || 0) * 18;
      const vy = (e.movementY || 0) * 18;
      pointer = { x, y, vx, vy };
      stir(Math.min(0.04, Math.hypot(vx, vy) / 14000));
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    App.register('glitter', {
      enter() {
        layout();
        seed();
        energy = 0.55; // a gentle opening swirl she immediately sees settling
        settledChimed = false;
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerdown', (e) => {
          onPointerMove(e);
          stir(0.05);
        });
        if (App.motionGranted && !motionHooked) {
          window.addEventListener('devicemotion', onMotion);
          motionHooked = true;
        }
        lastT = performance.now();
        rafId = requestAnimationFrame(step);
      },
      exit() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        canvas.removeEventListener('pointermove', onPointerMove);
        if (motionHooked) {
          window.removeEventListener('devicemotion', onMotion);
          motionHooked = false;
        }
      },
    });

    window.addEventListener('resize', () => {
      if (rafId) { layout(); }
    });
  });
})();
