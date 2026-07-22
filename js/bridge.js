/* CROSS THE BRIDGE: drag the supply cart across the rope bridge to the
 * waiting pup — but only SLOW, STEADY dragging works. Quick jerky moves
 * make the bridge wobble and the cart won't budge until it calms down.
 * Secretly a slow-controlled-movement regulation exercise: a full crossing
 * takes ~8+ seconds of gentle dragging. No fail state, endless deliveries. */
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

  function draw(now) {
    ctx.clearRect(0, 0, W, H);

    // cliffs
    ctx.fillStyle = '#1a2440';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, deckY - 26);
    ctx.quadraticCurveTo(ax * 0.7, deckY - 34, ax, deckY - 2);
    ctx.lineTo(ax, H);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W, H);
    ctx.lineTo(W, deckY - 26);
    ctx.quadraticCurveTo(W - (W - bx) * 0.7, deckY - 34, bx, deckY - 2);
    ctx.lineTo(bx, H);
    ctx.closePath();
    ctx.fill();

    // posts
    ctx.strokeStyle = '#3d5170';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    [[ax, deckY - 4], [bx, deckY - 4]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 52);
      ctx.stroke();
    });

    // ropes
    ctx.strokeStyle = '#7d97b0';
    ctx.lineWidth = 3;
    [-46, 4].forEach((off) => {
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const p = i / 40;
        const y = curveY(p, now) + off;
        i === 0 ? ctx.moveTo(cartX(p), y) : ctx.lineTo(cartX(p), y);
      }
      ctx.stroke();
    });

    // planks + hangers
    for (let i = 0; i <= 16; i++) {
      const p = i / 16;
      const x = cartX(p);
      const y = curveY(p, now);
      ctx.strokeStyle = '#5d7292';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 42);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.strokeStyle = '#8a6d55';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x - 11, y + 3);
      ctx.lineTo(x + 11, y + 3);
      ctx.stroke();
    }

    // cart on the deck
    const cx = cartX(t);
    const cy = curveY(t, now) - 4;
    ctx.fillStyle = '#c98f63';
    ctx.strokeStyle = '#8a6d55';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(cx - 26, cy - 34, 52, 26, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2a3a5c';
    [[-16, -6], [16, -6]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, 7, 0, Math.PI * 2);
      ctx.fill();
    });
    drawCargo(cx, cy - 44, CARGO[cargoIdx % CARGO.length], 14);

    // soft halo so she knows to grab the cart
    if (!grabbing && !celebrating) {
      ctx.strokeStyle = `rgba(249, 230, 168, ${0.35 + 0.25 * Math.sin(now / 400)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy - 22, 44, 0, Math.PI * 2);
      ctx.stroke();
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
