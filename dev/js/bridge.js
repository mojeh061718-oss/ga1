/* THE MOONLIT BRIDGE (Studio Aurora): drag the lantern-cart across the rope
 * bridge to the waiting pup — but only SLOW, STEADY dragging works. Quick
 * jerky moves make the bridge wobble and the cart won't budge until it calms
 * down. Secretly a slow-controlled-movement regulation exercise: a full
 * crossing takes ~8+ seconds of gentle dragging. No fail state, endless
 * deliveries. 2.0 art: layered night canyon on canvas — cliffs, waterfall
 * mist, lantern-lit posts, planks that stay warmly lit behind the cart, and
 * a cozy den glowing in the far cliff. Mechanics identical to v1. */
(() => {
  const MAX_SPEED = 0.13;        // cart progress/second at best (≈8s crossing)
  const FAST_FINGER = 520;       // px/s finger speed that rattles the bridge
  const GRAB_R = 90;             // how close a touch must be to grab the cart
  const CARGO = ['star', 'heart', 'bone', 'ball'];
  const CARGO_COLORS = { star: '#f9e6a8', heart: '#f2a7c6', bone: '#eef5f9', ball: '#8fd4c7' };

  let canvas, ctx, W, H;
  let ax, bx, deckY;             // bridge anchors
  let t = 0;                     // cart progress 0..1
  let wobble = 0;                // rattle amplitude, decays
  let grabbing = false;
  let cargoIdx = 0;
  let celebrating = false;
  let rafId = null;
  let lastT = 0;
  let finger = null;             // {x, y, vx, t}
  let lastCreak = 0;
  let grad = null;               // cached gradients (rebuilt on layout)

  function layout() {
    canvas = document.getElementById('bridge-canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ax = W * 0.15;
    bx = W * 0.85;
    deckY = H * 0.55;

    // pre-built gradients for the painterly pass (cheap per-frame reuse)
    grad = {};
    const fall = ctx.createLinearGradient(0, deckY + 20, 0, H);
    fall.addColorStop(0, 'rgba(159, 182, 232, 0.5)');
    fall.addColorStop(0.7, 'rgba(127, 150, 208, 0.26)');
    fall.addColorStop(1, 'rgba(127, 150, 208, 0.05)');
    grad.fall = fall;
    const lamp = ctx.createRadialGradient(0, 0, 0, 0, 0, 20);
    lamp.addColorStop(0, 'rgba(255, 216, 138, 0.6)');
    lamp.addColorStop(1, 'rgba(255, 216, 138, 0)');
    grad.lamp = lamp;
    const cartGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, 64);
    cartGlow.addColorStop(0, 'rgba(255, 216, 138, 0.42)');
    cartGlow.addColorStop(0.6, 'rgba(255, 216, 138, 0.13)');
    cartGlow.addColorStop(1, 'rgba(255, 216, 138, 0)');
    grad.cartGlow = cartGlow;
    const plank = ctx.createRadialGradient(0, 0, 0, 0, 0, 15);
    plank.addColorStop(0, 'rgba(255, 216, 138, 0.3)');
    plank.addColorStop(1, 'rgba(255, 216, 138, 0)');
    grad.plank = plank;
    const den = ctx.createRadialGradient(0, 0, 0, 0, 0, 52);
    den.addColorStop(0, 'rgba(255, 216, 138, 0.35)');
    den.addColorStop(1, 'rgba(255, 216, 138, 0)');
    grad.den = den;
    const canyon = ctx.createLinearGradient(0, deckY - 60, 0, H);
    canyon.addColorStop(0, 'rgba(7, 10, 28, 0)');
    canyon.addColorStop(0.45, 'rgba(7, 10, 28, 0.5)');
    canyon.addColorStop(1, 'rgba(6, 9, 24, 0.92)');
    grad.canyon = canyon;
    const river = ctx.createLinearGradient(0, deckY + 150, 0, H);
    river.addColorStop(0, '#1e2856');
    river.addColorStop(1, '#0c1027');
    grad.river = river;
  }

  function curveY(p, now) {
    const sag = Math.sin(Math.PI * p) * H * 0.055;
    const rattle = wobble * Math.sin(9 * Math.PI * p + now / 45) * 9;
    return deckY + sag + rattle;
  }

  function cartX(p) { return ax + (bx - ax) * p; }

  function step(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    wobble *= Math.exp(-dt / 0.7);

    if (grabbing && finger && !celebrating) {
      if (wobble < 0.45) {
        const desired = Math.max(0, Math.min(1, (finger.x - ax) / (bx - ax)));
        const maxStep = MAX_SPEED * dt;
        t += Math.max(-maxStep, Math.min(maxStep, desired - t));
      }
      if (t >= 0.985) deliver();
    }

    draw(now);
    rafId = requestAnimationFrame(step);
  }

  function rattle(intensity) {
    wobble = Math.min(1.6, wobble + intensity);
    const now = performance.now();
    if (now - lastCreak > 700) {
      lastCreak = now;
      Sounds.creak();
    }
  }

  function deliver() {
    celebrating = true;
    Sfx.play('toppup');
    const pup = document.getElementById('bridge-pup');
    pup.classList.add('happy');
    const sparkles = document.getElementById('bridge-sparkles');
    for (let i = 0; i < 4; i++) {
      const s = document.createElement('div');
      s.className = 'sparkle';
      s.style.right = 6 + Math.random() * 22 + '%';
      s.style.top = 26 + Math.random() * 22 + '%';
      s.style.animationDelay = (i * 0.2) + 's';
      sparkles.appendChild(s);
      setTimeout(() => s.remove(), 3200);
    }
    setTimeout(() => {
      pup.classList.remove('happy');
      t = 0;
      cargoIdx++; // a new delivery is waiting
      celebrating = false;
    }, 3000);
  }

  function drawCargo(x, y, kind, size) {
    ctx.fillStyle = CARGO_COLORS[kind];
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    if (kind === 'star') {
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? size : size * 0.45;
        const a = -Math.PI / 2 + i * Math.PI / 5;
        ctx.lineTo(r * Math.cos(a), r * Math.sin(a));
      }
    } else if (kind === 'heart') {
      const s = size / 14;
      ctx.moveTo(0, 10 * s);
      ctx.bezierCurveTo(-16 * s, -4 * s, -6 * s, -14 * s, 0, -5 * s);
      ctx.bezierCurveTo(6 * s, -14 * s, 16 * s, -4 * s, 0, 10 * s);
    } else if (kind === 'bone') {
      const s = size / 14;
      ctx.rect(-10 * s, -3 * s, 20 * s, 6 * s);
      [-10, 10].forEach((dx) => {
        ctx.moveTo(dx * s, -4 * s);
        ctx.arc(dx * s, -4 * s, 4.5 * s, 0, Math.PI * 2);
        ctx.moveTo(dx * s, 4 * s);
        ctx.arc(dx * s, 4 * s, 4.5 * s, 0, Math.PI * 2);
      });
    } else {
      ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* stamp a cached radial gradient centered on (x, y) */
  function glowSpot(g, x, y, alpha, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(-size, -size, size * 2, size * 2);
    ctx.restore();
  }

  function drawCanyon(now) {
    // depth: the world darkens below the deck (soft, full width — no seams)
    ctx.fillStyle = grad.canyon;
    ctx.fillRect(0, deckY - 60, W, H - deckY + 60);

    // river far below (full width — the cliff bases cover its banks)
    ctx.fillStyle = grad.river;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, deckY + 232);
    ctx.quadraticCurveTo(W * 0.5, deckY + 192, W, deckY + 224);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    // moonlit sheen along the far edge of the water
    ctx.strokeStyle = 'rgba(158, 176, 236, 0.22)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax + 20, deckY + 226);
    ctx.quadraticCurveTo(W * 0.5, deckY + 188, bx - 16, deckY + 220);
    ctx.stroke();
    // soft waves
    ctx.strokeStyle = 'rgba(56, 66, 124, 0.85)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    [[0.36, 0.82], [0.55, 0.86], [0.42, 0.92], [0.62, 0.955]].forEach(([px, py]) => {
      const x = W * px, y = H * py + Math.sin(now / 1600 + px * 9) * 2;
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 12, y - 6, x + 24, y);
    });
    ctx.stroke();
    // moon streak on the water
    ctx.strokeStyle = 'rgba(255, 237, 184, 0.26)';
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.moveTo(W * 0.62, H * 0.8); ctx.lineTo(W * 0.62 + 22, H * 0.8);
    ctx.moveTo(W * 0.6, H * 0.85); ctx.lineTo(W * 0.6 + 30, H * 0.85);
    ctx.moveTo(W * 0.63, H * 0.9); ctx.lineTo(W * 0.63 + 20, H * 0.9);
    ctx.stroke();
    // faint aurora reflection
    ctx.strokeStyle = 'rgba(111, 227, 193, 0.12)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(W * 0.33, H * 0.84);
    ctx.quadraticCurveTo(W * 0.41, H * 0.83, W * 0.49, H * 0.842);
    ctx.stroke();
  }

  function cliffSide(x0, anchor, dir) {
    // dir +1: cliff on the left (outer edge at x0), -1: right
    ctx.beginPath();
    ctx.moveTo(x0, H);
    ctx.lineTo(x0, deckY - 118);
    ctx.quadraticCurveTo(x0 + dir * Math.abs(anchor - x0) * 0.45, deckY - 130,
                         x0 + dir * Math.abs(anchor - x0) * 0.74, deckY - 72);
    ctx.quadraticCurveTo(anchor + dir * 8, deckY - 28, anchor, deckY + 4);
    ctx.quadraticCurveTo(anchor - dir * 10, deckY + 130, anchor + dir * 4, deckY + 260);
    ctx.quadraticCurveTo(anchor + dir * 20, H * 0.9, anchor + dir * 10, H);
    ctx.closePath();
  }

  function drawCliffs() {
    // cliff bodies
    ctx.fillStyle = '#0d1129';
    cliffSide(0, ax, 1);
    ctx.fill();
    cliffSide(W, bx, -1);
    ctx.fill();
    // moonlit rim along the cliff tops
    ctx.strokeStyle = 'rgba(72, 84, 148, 0.55)';
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, deckY - 116);
    ctx.quadraticCurveTo(ax * 0.45, deckY - 128, ax * 0.74, deckY - 70);
    ctx.quadraticCurveTo(ax + 8, deckY - 26, ax, deckY + 4);
    ctx.moveTo(W, deckY - 116);
    ctx.quadraticCurveTo(W - (W - bx) * 0.45, deckY - 128, W - (W - bx) * 0.74, deckY - 70);
    ctx.quadraticCurveTo(bx - 8, deckY - 26, bx, deckY + 4);
    ctx.stroke();
    // rock strata on the inner faces
    ctx.strokeStyle = '#1a2148';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(2, deckY + 80);
    ctx.quadraticCurveTo(ax * 0.55, deckY + 68, ax - 8, deckY + 96);
    ctx.moveTo(0, deckY + 190);
    ctx.quadraticCurveTo(ax * 0.5, deckY + 176, ax - 6, deckY + 206);
    ctx.moveTo(bx + 8, deckY + 108);
    ctx.quadraticCurveTo(W - (W - bx) * 0.5, deckY + 92, W, deckY + 102);
    ctx.moveTo(bx + 4, deckY + 226);
    ctx.quadraticCurveTo(W - (W - bx) * 0.5, deckY + 210, W, deckY + 220);
    ctx.stroke();
    // grass tufts on the cliff tops
    ctx.strokeStyle = '#232c60';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(ax * 0.34, deckY - 88);
    ctx.quadraticCurveTo(ax * 0.34 + 2, deckY - 100, ax * 0.34 - 3, deckY - 105);
    ctx.moveTo(ax * 0.34 + 7, deckY - 88);
    ctx.quadraticCurveTo(ax * 0.34 + 8, deckY - 97, ax * 0.34 + 13, deckY - 102);
    ctx.moveTo(W - (W - bx) * 0.4, deckY - 92);
    ctx.quadraticCurveTo(W - (W - bx) * 0.4 + 2, deckY - 104, W - (W - bx) * 0.4 - 3, deckY - 109);
    ctx.stroke();
  }

  function drawWaterfall(now) {
    const fx = ax - 34;
    ctx.fillStyle = grad.fall;
    ctx.beginPath();
    ctx.roundRect(fx, deckY + 34, 26, H - deckY - 34, 12);
    ctx.fill();
    // falling streaks
    ctx.strokeStyle = 'rgba(188, 211, 240, 0.3)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const off = (now / 7) % 34;
    ctx.beginPath();
    for (let y = deckY + 46 + off; y < H - 24; y += 34) {
      ctx.moveTo(fx + 7, y);
      ctx.lineTo(fx + 7, y + 13);
      ctx.moveTo(fx + 18, y + 9);
      ctx.lineTo(fx + 18, y + 22);
    }
    ctx.stroke();
    // mist puffs at the base + drifting canyon mist
    for (let i = 0; i < 5; i++) {
      const a = 0.09 + 0.05 * Math.sin(now / 900 + i * 2.1);
      ctx.fillStyle = `rgba(188, 211, 240, ${Math.max(0.03, a).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(
        fx + 14 + i * 26 + Math.sin(now / 1300 + i) * 16,
        H - 34 - (i % 3) * 26,
        22 + i * 3, 9 + (i % 2) * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawDen(now) {
    // cozy den carved into the far cliff, under Juniper
    const dx = bx + (W - bx) * 0.42;
    const dy = deckY + 64;
    const flick = 0.8 + 0.2 * Math.sin(now / 640);
    glowSpot(grad.den, dx, dy - 10, flick, 60);
    // arched doorway
    ctx.fillStyle = '#2c1f18';
    ctx.beginPath();
    ctx.moveTo(dx - 16, dy + 24);
    ctx.lineTo(dx - 16, dy - 2);
    ctx.arc(dx, dy - 2, 16, Math.PI, 0);
    ctx.lineTo(dx + 16, dy + 24);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255, 216, 138, ${(0.75 * flick).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(dx - 10, dy + 24);
    ctx.lineTo(dx - 10, dy);
    ctx.arc(dx, dy, 10, Math.PI, 0);
    ctx.lineTo(dx + 10, dy + 24);
    ctx.closePath();
    ctx.fill();
    // two round windows
    [[dx - 24, dy - 26, 5], [dx + 20, dy - 32, 4.4]].forEach(([x, y, r]) => {
      ctx.fillStyle = '#2c1f18';
      ctx.beginPath();
      ctx.arc(x, y, r + 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 216, 138, ${(0.85 * flick).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function draw(now) {
    ctx.clearRect(0, 0, W, H);

    drawCanyon(now);
    drawCliffs();
    drawWaterfall(now);
    drawDen(now);

    // wooden posts with little lanterns
    ctx.strokeStyle = '#3a2b21';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    [[ax, deckY - 2], [bx, deckY - 2]].forEach(([x, y], i) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 56);
      ctx.stroke();
      const flick = 0.75 + 0.25 * Math.sin(now / 700 + i * 2.4);
      glowSpot(grad.lamp, x, y - 66, flick, 26);
      ctx.fillStyle = '#3a2b21';
      ctx.beginPath();
      ctx.roundRect(x - 5.5, y - 74, 11, 15, 3.6);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 216, 138, ${(0.9 * flick).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y - 66.5, 3.8, 0, Math.PI * 2);
      ctx.fill();
    });

    // rope handrail + deck rope
    ctx.lineCap = 'round';
    [[-46, 3.4], [4, 5]].forEach(([off, lw]) => {
      ctx.strokeStyle = '#8a6d55';
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const p = i / 40;
        const y = curveY(p, now) + off;
        i === 0 ? ctx.moveTo(cartX(p), y) : ctx.lineTo(cartX(p), y);
      }
      ctx.stroke();
    });

    // hangers + planks — crossed planks stay warmly lit behind the cart
    for (let i = 0; i <= 16; i++) {
      const p = i / 16;
      const x = cartX(p);
      const y = curveY(p, now);
      ctx.strokeStyle = 'rgba(138, 109, 85, 0.9)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(x, y - 44);
      ctx.lineTo(x, y);
      ctx.stroke();
      const crossed = p <= t + 0.005;
      const near = !crossed && Math.abs(p - t) < 0.1;
      if (crossed) glowSpot(grad.plank, x, y + 3, 0.9, 16);
      ctx.strokeStyle = crossed ? '#e8b06a' : (near ? '#ba8a58' : '#6d563f');
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x - 11, y + 3);
      ctx.lineTo(x + 11, y + 3);
      ctx.stroke();
      // a light-mote rests on every plank the cart has blessed
      if (crossed && i % 2 === 0) {
        const tw = 0.55 + 0.35 * Math.sin(now / 620 + i);
        ctx.fillStyle = `rgba(255, 216, 138, ${tw.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y - 5, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // the lantern cart, tilted with the deck
    const cx = cartX(t);
    const cy = curveY(t, now) - 4;
    const slope = (curveY(Math.min(1, t + 0.03), now) - curveY(Math.max(0, t - 0.03), now)) /
                  (0.06 * (bx - ax));
    const lampA = Math.max(0.35, 1 - wobble * 0.45); // rushing dims the lantern
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan(slope) * 0.5);
    glowSpot(grad.cartGlow, 0, -18, lampA, 70);
    // wheels
    [[-15, 3], [15, 3]].forEach(([dx, dy]) => {
      ctx.fillStyle = '#3a2b21';
      ctx.beginPath();
      ctx.arc(dx, dy, 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a6d55';
      ctx.beginPath();
      ctx.arc(dx, dy, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    // cart box
    ctx.fillStyle = '#8a5f3c';
    ctx.strokeStyle = '#5d3f28';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-26, -30, 52, 26, 7);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-26, -12);
    ctx.lineTo(26, -12);
    ctx.stroke();
    // lantern on a pole
    ctx.strokeStyle = '#5d3f28';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(24, -30);
    ctx.quadraticCurveTo(32, -44, 28, -56);
    ctx.stroke();
    glowSpot(grad.lamp, 28, -62, lampA, 24);
    ctx.fillStyle = '#3a2b21';
    ctx.beginPath();
    ctx.roundRect(28 - 5.5, -70, 11, 15, 3.6);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 216, 138, ${(0.95 * lampA).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(28, -62.5, 4, 0, Math.PI * 2);
    ctx.fill();
    // tonight's bedtime cargo
    drawCargo(0, -44, CARGO[cargoIdx % CARGO.length], 13);
    ctx.restore();

    // soft dashed halo so she knows to grab the cart
    if (!grabbing && !celebrating) {
      ctx.strokeStyle = `rgba(255, 216, 138, ${0.45 + 0.25 * Math.sin(now / 400)})`;
      ctx.lineWidth = 2.6;
      ctx.setLineDash([4, 10]);
      ctx.lineDashOffset = -now / 60;
      ctx.beginPath();
      ctx.arc(cx, cy - 22, 44, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onDown(e) {
    const p = pointerPos(e);
    const cx = cartX(t);
    const cy = curveY(t, performance.now()) - 22;
    if (Math.hypot(p.x - cx, p.y - cy) < GRAB_R) {
      grabbing = true;
      finger = { x: p.x, y: p.y, vx: 0, t: performance.now() };
    }
  }

  function onMove(e) {
    if (!grabbing) return;
    const p = pointerPos(e);
    const now = performance.now();
    if (finger) {
      const dtm = Math.max(8, now - finger.t);
      const speed = Math.abs(p.x - finger.x) / dtm * 1000;
      if (speed > FAST_FINGER) rattle((speed - FAST_FINGER) / 2600);
    }
    finger = { x: p.x, y: p.y, t: now };
  }

  function onUp() {
    grabbing = false;
    finger = null;
  }

  document.addEventListener('DOMContentLoaded', () => {
    App.register('bridge', {
      enter() {
        layout();
        t = 0;
        wobble = 0;
        celebrating = false;
        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        lastT = performance.now();
        rafId = requestAnimationFrame(step);
      },
      exit() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        grabbing = false;
        finger = null;
      },
    });
  });
})();
