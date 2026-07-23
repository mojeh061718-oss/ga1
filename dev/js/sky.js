/* PAINT THE SKY — Studio Aurora.
 * Finger-drag paints aurora ribbons onto the night; SLOWNESS IS THE BRUSH:
 * a slow drift lays a wide luminous ribbon, a fast scribble barely a wisp.
 * Seven sleeping stars wake (one pentatonic note each) as ribbons pass by;
 * all seven awake + enough painted sky = one gentle full-sky shimmer, then
 * the scene settles into a living painting she can keep touching.
 * No fail states, no timer, no score. */
(() => {
  // ---- tuning ----
  const SLOW_V = 140;      // px/s and below = full-width luminous ribbon
  const FAST_V = 1000;     // px/s and above = the thinnest wisp
  const W_MAX = 44;        // ribbon core width (px) at slow speed
  const W_MIN = 5;
  // Per-stamp alpha is kept tiny: stamps overlap ~2R/gap times in the
  // additive pass, so accumulated core brightness ≈ alpha × overlap ≈ 0.45.
  const A_MAX = 0.17;      // stamp alpha at slow speed
  const A_MIN = 0.05;
  const GAP_MIN = 4;       // px between stamps (scales with brush width)
  const GAP_K = 0.24;      // gap = max(GAP_MIN, width × GAP_K)
  const R_K = 1.6;         // sprite radius = width × R_K (soft halo included)
  const CORE_R = 0.62;     // narrow luminous core pass, radius = width × CORE_R
  const CYCLE_LEN = 720;   // px of stroke for a full teal→pink color cycle
  const WAKE_R = 54;       // px — ribbon this close wakes a star
  const NEED_PAINT = 1200; // paint "mass" required (≈ 2 long slow strokes)
  const LIVE_MAX = 900;    // live shimmering points before baking oldest
  const N_SPRITES = 24;

  const PALETTE = [[111, 227, 193], [159, 242, 184], [185, 167, 240], [240, 184, 217]];
  // C-major pentatonic spread over two octaves — any wake order is a melody.
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];
  const STAR_POS = [
    [0.18, 0.24], [0.52, 0.155], [0.82, 0.30], [0.30, 0.44],
    [0.68, 0.53], [0.20, 0.66], [0.585, 0.735],
  ];
  const HINTS = [
    'paint slowly… the sky loves slow',
    'drift your finger like a feather',
    'slow ribbons glow brightest',
    'can you wake the sleepy stars?',
  ];
  const HINTS_DONE = ['the sky is yours — keep painting', 'every star is awake ✦'];

  let canvas = null, ctx = null;
  let bake = null, bctx = null;      // settled ribbons, drawn once
  let W = 0, H = 0, dpr = 1;
  let sprites = [];                  // pre-rendered radial-gradient brush stamps
  let glowSprite = null;             // warm star halo

  let strokes = [];                  // live: {pts:[{x,y,w,a,ci}], phase}
  let livePoints = 0;
  let stroke = null;                 // stroke being painted right now
  let painting = false;
  let lastX = 0, lastY = 0, lastT = 0, curW = W_MAX, curA = A_MAX, hueLen = 0;
  let paintScore = 0;
  let stars = [];                    // {x,y,note,awake:0..1,waking,tw}
  let done = false;                  // celebration reached
  let celebrateT = -1;               // seconds since celebration start, -1 = off
  let rafId = null;
  let hintIdx = 0, hintTimer = 0;

  const hintEl = () => document.getElementById('sky-hint');

  // ---- audio: soft music-box tone through the shared (iOS-unlocked) ctx ----
  function pluck(freq, when = 0, gain = 0.055, dur = 1.5) {
    try {
      const ac = Sounds.ensure();
      const t0 = ac.currentTime + when;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      const out = ac.createGain();
      out.gain.value = 1;
      lp.connect(out).connect(ac.destination);
      [[freq, 'sine', gain], [freq * 2, 'triangle', gain * 0.22]].forEach(([f, type, g0]) => {
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = type;
        osc.frequency.value = f;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(g0, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
        osc.connect(g).connect(lp);
        osc.start(t0);
        osc.stop(t0 + dur + 0.1);
      });
    } catch (err) { /* audio not unlocked yet — painting stays silent */ }
  }

  // ---- sprites: soft radial brush stamps along the aurora palette ----
  function mixColor(t) {
    const n = PALETTE.length;
    const f = (t % 1 + 1) % 1 * n;
    const i = Math.floor(f) % n;
    const j = (i + 1) % n;
    const k = f - Math.floor(f);
    return PALETTE[i].map((c, idx) => Math.round(c + (PALETTE[j][idx] - c) * k));
  }

  function makeSprites() {
    sprites = [];
    for (let s = 0; s < N_SPRITES; s++) {
      const [r, g, b] = mixColor(s / N_SPRITES);
      // brighten the core toward white for that lit-from-within look
      // (kept gentle — additive stacking does the rest of the glowing)
      const cr = Math.round(r + (255 - r) * 0.25);
      const cg = Math.round(g + (255 - g) * 0.25);
      const cb = Math.round(b + (255 - b) * 0.25);
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const cc = c.getContext('2d');
      const grad = cc.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.5)`);
      grad.addColorStop(0.28, `rgba(${r},${g},${b},0.3)`);
      grad.addColorStop(0.62, `rgba(${r},${g},${b},0.1)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      cc.fillStyle = grad;
      cc.fillRect(0, 0, 128, 128);
      sprites.push(c);
    }
    glowSprite = document.createElement('canvas');
    glowSprite.width = glowSprite.height = 128;
    const gc = glowSprite.getContext('2d');
    const gg = gc.createRadialGradient(64, 64, 0, 64, 64, 64);
    gg.addColorStop(0, 'rgba(255,246,216,0.75)');
    gg.addColorStop(0.35, 'rgba(255,237,184,0.28)');
    gg.addColorStop(1, 'rgba(255,237,184,0)');
    gc.fillStyle = gg;
    gc.fillRect(0, 0, 128, 128);
  }

  // ---- foreground scene: dark mountains + Indigo watching the sky ----
  function buildScene() {
    if (document.getElementById('sky-scene')) return;
    const div = document.createElement('div');
    div.id = 'sky-scene';
    div.innerHTML = `
<svg viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="ngSkyM" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0e1330"/><stop offset="1" stop-color="#080b20"/>
    </linearGradient>
  </defs>
  <path d="M0 736 L70 678 L140 720 L215 668 L285 722 L340 686 L390 724 L390 844 L0 844 Z" fill="url(#ngSkyM)"/>
  <path d="M0 790 C 110 754, 260 758, 390 786 L390 844 L0 844 Z" fill="#060918"/>
  <!-- Indigo, the sky painter (deep blue coat, star freckles) -->
  <g transform="translate(60 690)">
    <path class="sky-pup-tail" d="M60 40 q 15 -4 17 -19" stroke="#2c3878" stroke-width="10" stroke-linecap="round" fill="none"/>
    <ellipse cx="40" cy="40" rx="27" ry="21" fill="#39468c"/>
    <circle cx="52" cy="44" r="15" fill="#2c3878"/>
    <rect x="18" y="34" width="10" height="26" rx="5" fill="#39468c"/>
    <rect x="31" y="36" width="10" height="24" rx="5" fill="#2c3878"/>
    <g class="sky-pup-head" style="transform-origin:22px 12px">
      <circle cx="22" cy="10" r="21" fill="#414f9c"/>
      <ellipse cx="6" cy="-2" rx="7.5" ry="11.5" transform="rotate(-28 6 -2)" fill="#28336d"/>
      <ellipse cx="38" cy="-4" rx="7.5" ry="11.5" transform="rotate(22 38 -4)" fill="#28336d"/>
      <ellipse cx="15" cy="17" rx="10.5" ry="8" fill="#5563ad"/>
      <ellipse cx="8" cy="13" rx="4" ry="3.2" fill="#141a3e"/>
      <g fill="#0e1330"><circle cx="18" cy="5" r="3.6"/><circle cx="34" cy="5" r="3.6"/></g>
      <g fill="#ffffff"><circle cx="19.2" cy="3.8" r="1.3"/><circle cx="35.2" cy="3.8" r="1.3"/></g>
      <g fill="#9ff2b8" opacity=".8">
        <circle cx="27" cy="14" r="1.2"/><circle cx="31" cy="17" r="1"/><circle cx="24" cy="18" r=".9"/>
      </g>
    </g>
  </g>
</svg>`;
    const screen = document.getElementById('screen-sky');
    screen.insertBefore(div, hintEl());
  }

  // ---- sizing ----
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!bake) bake = document.createElement('canvas');
    // repaint of the baked layer on resize is not worth the complexity for a
    // phone that never rotates mid-play; just rescale what is there
    const old = bake.width ? bake : null;
    const prev = old && document.createElement('canvas');
    if (prev) {
      prev.width = old.width; prev.height = old.height;
      prev.getContext('2d').drawImage(old, 0, 0);
    }
    bake.width = canvas.width;
    bake.height = canvas.height;
    bctx = bake.getContext('2d');
    if (prev && prev.width) {
      bctx.drawImage(prev, 0, 0, prev.width, prev.height, 0, 0, bake.width, bake.height);
    }
    stars.forEach((s, i) => {
      s.x = STAR_POS[i][0] * W;
      s.y = STAR_POS[i][1] * H;
    });
  }

  function reset() {
    strokes = [];
    livePoints = 0;
    stroke = null;
    painting = false;
    paintScore = 0;
    done = false;
    celebrateT = -1;
    hintIdx = 0;
    hintTimer = 0;
    stars = STAR_POS.map(([fx, fy], i) => ({
      x: fx * W, y: fy * H, note: NOTES[i],
      awake: 0, waking: false, tw: Math.random() * 6,
    }));
    if (bctx) bctx.clearRect(0, 0, bake.width, bake.height);
    setHint(HINTS[0]);
  }

  // ---- hints: gentle cycling with a fade ----
  function setHint(text) {
    const el = hintEl();
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => { el.textContent = text; el.style.opacity = '1'; }, 700);
  }

  function cycleHint(dt) {
    hintTimer += dt;
    if (hintTimer < 8) return;
    hintTimer = 0;
    const list = done ? HINTS_DONE : HINTS;
    hintIdx = (hintIdx + 1) % list.length;
    setHint(list[hintIdx]);
  }

  // ---- painting ----
  let sx = 0, sy = 0; // position of the most recent stamp (carries between events)

  function beginStroke(x, y) {
    painting = true;
    stroke = { pts: [], phase: Math.random() * Math.PI * 2 };
    strokes.push(stroke);
    lastX = sx = x; lastY = sy = y; lastT = performance.now();
    curW = W_MAX * 0.7; curA = A_MAX * 0.7;
    stamp(x, y);
  }

  function stamp(x, y) {
    const ci = Math.floor((hueLen / CYCLE_LEN) * N_SPRITES) % N_SPRITES;
    stroke.pts.push({ x, y, w: curW, a: curA, ci });
    livePoints++;
    // wake nearby sleeping stars
    for (const s of stars) {
      if (s.awake === 0 && !s.waking) {
        const dx = x - s.x, dy = y - s.y;
        if (dx * dx + dy * dy < WAKE_R * WAKE_R) wakeStar(s);
      }
    }
    if (livePoints > LIVE_MAX) bakeOldest();
  }

  function moveStroke(x, y) {
    const now = performance.now();
    const dist = Math.hypot(x - lastX, y - lastY);
    if (dist < 3) return;
    const dt = Math.max(now - lastT, 8);
    const speed = dist / dt * 1000; // px/s
    const n = Math.min(Math.max((speed - SLOW_V) / (FAST_V - SLOW_V), 0), 1);
    const ease = Math.pow(n, 0.65);
    const wT = W_MAX - (W_MAX - W_MIN) * ease;
    const aT = A_MAX - (A_MAX - A_MIN) * ease;
    // walk from the last stamp toward the finger, one gap at a time, so fast
    // flicks still leave an unbroken wisp and slow drifts stay dense enough
    let guard = 200;
    for (;;) {
      const gap = Math.max(GAP_MIN, curW * GAP_K);
      const ddx = x - sx, ddy = y - sy;
      const d = Math.hypot(ddx, ddy);
      if (d < gap || --guard < 0) break;
      curW += (wT - curW) * 0.22;
      curA += (aT - curA) * 0.22;
      hueLen += gap;
      sx += ddx / d * gap;
      sy += ddy / d * gap;
      stamp(sx, sy);
    }
    // slow, wide paint fills the sky; wisps barely count
    paintScore += dist * Math.pow(curW / W_MAX, 1.6);
    lastX = x; lastY = y; lastT = now;
    maybeCelebrate();
  }

  function endStroke() {
    painting = false;
    stroke = null;
  }

  function bakeOldest() {
    // move the oldest finished stroke into the settled layer (drawn once)
    const idx = strokes.findIndex((s) => s !== stroke);
    let s;
    if (idx !== -1) {
      s = strokes.splice(idx, 1)[0];
    } else if (stroke && stroke.pts.length > LIVE_MAX) {
      // one endless stroke: settle its tail so live points stay bounded
      s = { pts: stroke.pts.splice(0, Math.floor(LIVE_MAX / 2)) };
    } else {
      return;
    }
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.globalCompositeOperation = 'lighter';
    for (const p of s.pts) {
      const r = p.w * R_K;
      const rc = p.w * CORE_R;
      bctx.globalAlpha = p.a * 0.92;
      bctx.drawImage(sprites[p.ci], p.x - r, p.y - r, r * 2, r * 2);
      bctx.globalAlpha = p.a * 0.5;
      bctx.drawImage(sprites[p.ci], p.x - rc, p.y - rc, rc * 2, rc * 2);
    }
    bctx.globalAlpha = 1;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    livePoints -= s.pts.length;
  }

  // ---- stars ----
  function wakeStar(s) {
    s.waking = true;
    s.wakeStart = performance.now();
    pluck(s.note, 0, 0.06, 1.6);
  }

  function starSpark(x, y, r, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x + r * 0.18, y - r * 0.18, x + r, y);
    ctx.quadraticCurveTo(x + r * 0.18, y + r * 0.18, x, y + r);
    ctx.quadraticCurveTo(x - r * 0.18, y + r * 0.18, x - r, y);
    ctx.quadraticCurveTo(x - r * 0.18, y - r * 0.18, x, y - r);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawStars(now, t) {
    for (const s of stars) {
      if (s.waking) {
        // rAF timestamps can trail the performance.now() taken in wakeStar —
        // clamp low or the first frame draws a negative-radius star
        s.awake = Math.min(Math.max((now - s.wakeStart) / 1100, 0), 1);
        if (s.awake >= 1) { s.waking = false; s.awake = 1; }
      }
      const tw = 0.75 + 0.25 * Math.sin(t * 1.3 + s.tw * 7);
      if (s.awake === 0) {
        // asleep: a dim ember with the faintest breathing halo
        const doze = 0.6 + 0.18 * Math.sin(t * 0.7 + s.tw * 9);
        ctx.globalAlpha = doze * 0.35;
        ctx.fillStyle = '#67719f';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = doze;
        ctx.fillStyle = '#7c86b8';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        const k = s.awake;
        const halo = 26 * k * (done ? 1.25 : 1);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.6 * k * tw;
        ctx.drawImage(glowSprite, s.x - halo, s.y - halo, halo * 2, halo * 2);
        ctx.globalCompositeOperation = 'source-over';
        starSpark(s.x, s.y, (10 + 3 * Math.sin(t + s.tw * 5)) * k, (0.55 + 0.4 * tw) * k);
        ctx.globalAlpha = k;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3.2 * k, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  // ---- celebration: one gentle full-sky shimmer, then a living sky ----
  function maybeCelebrate() {
    if (done || paintScore < NEED_PAINT) return;
    if (!stars.every((s) => s.awake > 0 || s.waking)) return;
    done = true;
    celebrateT = 0;
    Sfx.play('toppup');
    // a slow rising echo of the wake notes, in order — her melody, resolved
    NOTES.slice(0, 5).forEach((f, i) => pluck(f, 0.5 + i * 0.35, 0.045, 1.8));
    hintTimer = 0;
    hintIdx = 0;
    setHint(HINTS_DONE[0]);
  }

  function drawCelebration(dt, t) {
    if (celebrateT < 0) return;
    celebrateT += dt;
    const p = celebrateT / 4.5; // 4.5 s shimmer
    if (p >= 1) { celebrateT = -1; return; }
    const env = Math.sin(Math.PI * Math.min(p, 1)); // swell in, settle out
    ctx.globalCompositeOperation = 'lighter';
    for (let band = 0; band < 3; band++) {
      const y = H * (0.16 + band * 0.2) + Math.sin(t * 0.6 + band * 2.1) * 24;
      const ci = (band * 8 + Math.floor(t * 3)) % N_SPRITES;
      const r = 130 + band * 40;
      for (let x = -r; x < W + r; x += r * 0.6) {
        ctx.globalAlpha = 0.1 * env * (0.7 + 0.3 * Math.sin(x * 0.01 + t + band));
        ctx.drawImage(sprites[ci], x - r, y - r + Math.sin(x * 0.008 + t * 0.8) * 30, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- main loop ----
  let lastFrame = 0;
  function frame(now) {
    const t = now / 1000;
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    ctx.clearRect(0, 0, W, H);

    // settled ribbons breathe very slowly
    if (bake.width) {
      ctx.globalAlpha = 0.88 + 0.09 * Math.sin(t * 0.45);
      ctx.drawImage(bake, 0, 0, bake.width, bake.height, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // live ribbons: shimmer + a gentle sideways drift
    ctx.globalCompositeOperation = 'lighter';
    for (const s of strokes) {
      const drift = (s === stroke) ? 0 : Math.sin(t * 0.32 + s.phase) * 4;
      const pts = s.pts;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const r = p.w * R_K;
        const rc = p.w * CORE_R;
        const shimmer = 0.9 + 0.1 * Math.sin(t * 0.9 + i * 0.08 + s.phase);
        const dx = p.x + drift + Math.sin(t * 0.5 + p.y * 0.01 + s.phase) * 2;
        ctx.globalAlpha = p.a * shimmer;
        ctx.drawImage(sprites[p.ci], dx - r, p.y - r, r * 2, r * 2);
        ctx.globalAlpha = p.a * 0.5 * shimmer;
        ctx.drawImage(sprites[p.ci], dx - rc, p.y - rc, rc * 2, rc * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    drawStars(now, t);
    drawCelebration(dt, t);
    cycleHint(dt);
    rafId = requestAnimationFrame(frame);
  }

  // ---- wiring ----
  document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('sky-canvas');
    ctx = canvas.getContext('2d');
    makeSprites();
    buildScene();

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      beginStroke(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!painting) return;
      e.preventDefault();
      moveStroke(e.clientX, e.clientY);
    });
    ['pointerup', 'pointercancel'].forEach((ev) =>
      canvas.addEventListener(ev, () => endStroke()));

    window.addEventListener('resize', () => {
      if (App.current === 'sky') resize();
    });

    App.register('sky', {
      enter() {
        resize();
        reset();
        lastFrame = performance.now();
        rafId = requestAnimationFrame(frame);
      },
      exit() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        endStroke();
      },
    });
  });
})();
