/* Glitter jar v2 — real material, not drifting dots.
 *
 * Flakes are tiny rotated rectangles that tumble and glint as they fall
 * under real gravity, a finger drag stirs them like thick liquid (with a
 * vortex), a shake bursts the pile upward, and — the payoff — flakes LAND
 * on a height-map pile that visibly grows into a mound at the bottom.
 * Watching it all come to rest (~30-60s) is the calming activity.
 */
(() => {
  const COUNT = 240;
  const COL_W = 5;              // pile column width, px
  const GRAV = 500;             // px/s^2
  const SHAKE_THRESHOLD = 8;    // m/s^2 beyond gravity
  const FINGER_R = 110;         // vortex radius around the finger
  const DIG_R = 90;             // radius in which a finger digs up the pile
  const LIGHT_ANGLE = 1.1;      // glint direction
  const PALETTE = ['#8fc7bd', '#c3b6dd', '#f2a7c6', '#f9e6a8', '#a8c8e8'];

  let canvas, ctx, W, H, jar;
  let flakes = [];
  let heights = [];             // pile height per column
  let nCols = 0;
  let shakeEnergy = 0;
  let settledChimed = false;
  let rafId = null;
  let lastT = 0;
  let finger = null;            // {x, y, vx, vy, t}
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
    jar = { x: W * 0.16, y: H * 0.14, w: W * 0.68, h: H * 0.74, r: 26 };
    nCols = Math.ceil(jar.w / COL_W);
    heights = new Array(nCols).fill(0);
  }

  function colOf(x) {
    return Math.max(0, Math.min(nCols - 1, Math.floor((x - jar.x) / COL_W)));
  }

  function makeFlake(i) {
    return {
      x: jar.x + 6 + Math.random() * (jar.w - 12),
      y: jar.y + 6 + Math.random() * jar.h * 0.5,
      vx: 0, vy: 0,
      w: 2 + Math.random() * 2.2,
      h: 3 + Math.random() * 3,
      angle: Math.random() * Math.PI,
      av: (Math.random() - 0.5) * 6,
      color: PALETTE[i % PALETTE.length],
      drag: 3.5 + Math.random() * 4.5, // varied terminal velocity; fine flakes drift longest
      phase: Math.random() * Math.PI * 2,
      settled: false,
    };
  }

  /* Land a flake: roll downhill a few columns so mounds self-level, then
   * freeze it into the pile and raise that column. */
  function land(p) {
    let c = colOf(p.x);
    for (let n = 0; n < 24; n++) {
      if (c > 0 && heights[c] > heights[c - 1] + 6) c -= 1;
      else if (c < nCols - 1 && heights[c] > heights[c + 1] + 6) c += 1;
      else break;
    }
    p.x = jar.x + (c + 0.5) * COL_W + (Math.random() - 0.5) * COL_W;
    p.y = jar.y + jar.h - heights[c] - p.h / 2;
    p.vx = p.vy = 0;
    p.av = 0;
    p.settled = true;
    heights[c] = Math.min(jar.h * 0.5, heights[c] + (p.w * p.h) / COL_W * 1.6);
  }

  function unsettle(p, vx, vy) {
    const c = colOf(p.x);
    heights[c] = Math.max(0, heights[c] - (p.w * p.h) / COL_W * 1.6);
    p.settled = false;
    p.vx = vx;
    p.vy = vy;
    p.av = (Math.random() - 0.5) * 10;
    settledChimed = false;
  }

  function seed() {
    flakes = [];
    heights.fill(0);
    for (let i = 0; i < COUNT; i++) flakes.push(makeFlake(i));
    // Most of the jar starts as a settled mound (center-biased), with a
    // fraction suspended so she immediately sees glitter falling and landing.
    flakes.forEach((p, i) => {
      if (i % 4 !== 0) {
        const g = (Math.random() + Math.random() + Math.random()) / 3; // center-biased
        p.x = jar.x + 8 + g * (jar.w - 16);
        land(p);
      }
    });
  }

  function onMotion(e) {
    const a = e.acceleration;
    if (!a || a.x === null) return;
    const mag = Math.hypot(a.x, a.y, a.z);
    if (mag > SHAKE_THRESHOLD) {
      shakeEnergy = Math.min(1, shakeEnergy + (mag - SHAKE_THRESHOLD) / 30);
    }
  }

  function step(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    const t = now / 1000;
    shakeEnergy *= Math.exp(-dt / 0.8);

    let active = 0;
    for (const p of flakes) {
      if (p.settled) {
        // finger digs the pile up
        if (finger) {
          const dx = p.x - finger.x, dy = p.y - finger.y;
          if (dx * dx + dy * dy < DIG_R * DIG_R) {
            unsettle(p, finger.vx * 0.7 + (Math.random() - 0.5) * 60,
                        finger.vy * 0.7 - 60 - Math.random() * 80);
          }
        }
        // shake bursts part of the pile upward
        if (shakeEnergy > 0.2 && Math.random() < shakeEnergy * 2.5 * dt) {
          unsettle(p, (Math.random() - 0.5) * 220 * shakeEnergy,
                      -(150 + Math.random() * 380) * shakeEnergy);
        }
        continue;
      }

      active++;
      // leaf-fall flutter + tumble
      p.vx += Math.sin(t * 3 + p.phase) * 26 * dt;
      p.vy += GRAV * dt;
      const drag = Math.max(0, 1 - p.drag * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.angle += p.av * dt;
      p.av *= Math.max(0, 1 - 1.5 * dt);
      if (Math.abs(p.av) < 1.2) p.av += Math.sin(t * 2 + p.phase) * 3 * dt;

      // finger vortex: drag toward finger motion + tangential swirl
      if (finger) {
        const dx = p.x - finger.x, dy = p.y - finger.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < FINGER_R * FINGER_R) {
          const d = Math.sqrt(d2) || 1;
          const f = 1 - d / FINGER_R;
          p.vx += (finger.vx - p.vx) * f * 6 * dt + (-dy / d) * f * 160 * dt;
          p.vy += (finger.vy - p.vy) * f * 6 * dt + (dx / d) * f * 160 * dt;
          p.av += f * 8 * dt * (finger.vx > 0 ? 1 : -1);
        }
      }
      // shake turbulence on airborne flakes too
      if (shakeEnergy > 0.05) {
        p.vx += (Math.random() - 0.5) * 900 * shakeEnergy * dt;
        p.vy -= Math.random() * 500 * shakeEnergy * dt;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // walls
      if (p.x < jar.x + 4) { p.x = jar.x + 4; p.vx *= -0.35; }
      if (p.x > jar.x + jar.w - 4) { p.x = jar.x + jar.w - 4; p.vx *= -0.35; }
      if (p.y < jar.y + 4) { p.y = jar.y + 4; p.vy *= -0.35; }

      // land on the pile
      const floorY = jar.y + jar.h - heights[colOf(p.x)];
      if (p.y + p.h / 2 >= floorY && p.vy >= -10) {
        if (Math.abs(p.vy) > 140) { // hard hit bounces once
          p.y = floorY - p.h / 2;
          p.vy *= -0.25;
          p.vx *= 0.7;
        } else {
          land(p);
        }
      }
    }

    if (active <= 6 && !settledChimed) {
      settledChimed = true;
      Sounds.settleChime();
      const pup = document.getElementById('glitter-pup');
      pup.classList.add('nod');
      setTimeout(() => pup.classList.remove('nod'), 2500);
    }

    draw(t);
    finger = null; // forces fresh pointer data each frame
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

    ctx.save();
    roundedRect(ctx, jar.x, jar.y, jar.w, jar.h, jar.r);
    ctx.clip();

    // soft mound silhouette under the flakes so the pile reads clearly
    ctx.beginPath();
    ctx.moveTo(jar.x, jar.y + jar.h);
    for (let c = 0; c < nCols; c++) {
      ctx.lineTo(jar.x + (c + 0.5) * COL_W, jar.y + jar.h - heights[c]);
    }
    ctx.lineTo(jar.x + jar.w, jar.y + jar.h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(199, 189, 214, 0.45)';
    ctx.fill();

    // flakes
    for (const p of flakes) {
      const glint = Math.pow(Math.abs(Math.cos(p.angle - LIGHT_ANGLE)), 3);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = p.settled
        ? 0.8 + 0.2 * Math.sin(t * 1.5 + p.phase)     // pile twinkles gently
        : 0.5 + 0.5 * glint;                           // tumbling flakes glint
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      if (!p.settled && glint > 0.92) {                // bright sparkle flash
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  let lastPointer = null;
  function onPointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const now = performance.now();
    let vx = 0, vy = 0;
    if (lastPointer) {
      const dt = Math.max(8, now - lastPointer.t) / 1000;
      vx = (x - lastPointer.x) / dt;
      vy = (y - lastPointer.y) / dt;
    }
    lastPointer = { x, y, t: now };
    if (x > jar.x - 20 && x < jar.x + jar.w + 20 &&
        y > jar.y - 20 && y < jar.y + jar.h + 20) {
      finger = { x, y, vx, vy };
    }
  }
  function onPointerEnd() { lastPointer = null; }

  document.addEventListener('DOMContentLoaded', () => {
    App.register('glitter', {
      enter() {
        layout();
        seed();
        settledChimed = false;
        shakeEnergy = 0;
        canvas.addEventListener('pointerdown', onPointerMove);
        canvas.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerEnd);
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
        canvas.removeEventListener('pointerdown', onPointerMove);
        canvas.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerEnd);
        if (motionHooked) {
          window.removeEventListener('devicemotion', onMotion);
          motionHooked = false;
        }
      },
    });
  });
})();
