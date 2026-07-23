/* THE FIREFLY LULLABY — Studio Aurora.
 * A night meadow, a glass jar on a stump, five drifting fireflies.
 * STILLNESS IS THE MECHANIC: press and hold a finger anywhere and keep it
 * still — a firefly is slowly drawn to it; wiggle and they drift shyly away
 * (never punished, just gentle). A firefly that reaches a still fingertip
 * alights, then floats itself into the jar: the jar brightens one step and
 * one music-box note of a five-note lullaby plays. Five fireflies = warm
 * jar, full lullaby, sparkles — then the scene rests as a night-light.
 * No fail states, no timer, no score. */
(() => {
  // ---- tuning ----
  const N_FLIES = 5;
  const STILL_TOL = 16;      // px of finger drift still counted as "still"
  const STILL_AFTER = 0.55;  // s of stillness before a firefly commits
  const ATTRACT_V0 = 30;     // px/s toward the finger at first…
  const ATTRACT_VK = 15;     // …plus this per second of stillness (cap 6 s)
  const CATCH_R = 22;        // px — reaching the fingertip
  const ALIGHT_S = 0.85;     // s resting on the fingertip
  const TOJAR_S = 1.9;       // s floating from finger to jar
  const WANDER_V = 26;       // px/s cruising speed
  const SHY_R = 150;         // px — a moving finger nudges flies inside this
  const SHY_PUSH = 55;       // px/s^2 of gentle away-drift
  // G3 A3 C4 D4 E4 — an ascending pentatonic lullaby, one note per firefly.
  const LULLABY = [392.0, 440.0, 523.25, 587.33, 659.25];
  const MELODY = [0, 1, 2, 3, 4, 2, 3, 4]; // the full playback at the end
  const HINTS = [
    'hold very still… a firefly will come',
    'fireflies love a quiet finger',
    'shh… slow and still',
  ];
  const HINTS_DONE = ['the jar sings — sweet dreams, Fern', 'a night-light made of five little songs'];
  // jar interior perches (scene svg units — glass spans x 233-283, y 506-598)
  const PERCH = [[248, 560], [268, 542], [252, 520], [265, 574], [257, 538]];
  const JAR_MOUTH = [258, 462]; // where inbound fireflies aim (svg units)

  let stage = null, jar = null, halo = null;
  let W = 0, H = 0, scale = 1, ox = 0, oy = 0; // slice mapping of the 390x844 scene
  let flies = [];
  let count = 0;
  let celebrated = false;
  let rafId = null;
  let lastFrame = 0;
  let hintIdx = 0, hintTimer = 0;

  // pointer state
  let pDown = false, px = 0, py = 0;
  let anchorX = 0, anchorY = 0, stillStart = 0, lastMoveT = 0;
  let attracted = null;

  const hintEl = () => document.getElementById('firefly-hint');
  const toX = (x) => x * scale + ox;
  const toY = (y) => y * scale + oy;

  // ---- audio: music-box notes through the shared (iOS-unlocked) context ----
  function musicBox(freq, when = 0, gain = 0.06, dur = 1.8) {
    try {
      const ac = Sounds.ensure();
      const t0 = ac.currentTime + when;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      lp.connect(ac.destination);
      [[freq, 'triangle', gain], [freq * 2, 'sine', gain * 0.35], [freq * 4, 'sine', gain * 0.07]]
        .forEach(([f, type, g0]) => {
          const osc = ac.createOscillator();
          const g = ac.createGain();
          osc.type = type;
          osc.frequency.value = f;
          g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(g0, t0 + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
          osc.connect(g).connect(lp);
          osc.start(t0);
          osc.stop(t0 + dur + 0.1);
        });
    } catch (err) { /* audio not unlocked yet */ }
  }

  // ---- the painted meadow ----
  function buildScene() {
    if (document.getElementById('firefly-scene')) return;
    const scene = document.createElement('div');
    scene.id = 'firefly-scene';
    scene.innerHTML = `
<svg viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="ngFfAur" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#6fe3c1" stop-opacity="0"/>
      <stop offset=".5" stop-color="#6fe3c1" stop-opacity=".32"/>
      <stop offset="1" stop-color="#b9a7f0" stop-opacity="0"/>
    </linearGradient>
    <filter id="ngFfBlur" x="-40%" y="-300%" width="180%" height="700%"><feGaussianBlur stdDeviation="12"/></filter>
    <radialGradient id="ngFfJarGlow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#ffd88a" stop-opacity=".55"/>
      <stop offset=".55" stop-color="#ffd88a" stop-opacity=".2"/>
      <stop offset="1" stop-color="#ffd88a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ngFfMoonHalo" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#ffedb8" stop-opacity=".28"/><stop offset="1" stop-color="#ffedb8" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ngFfGrassA" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#161d40"/><stop offset="1" stop-color="#101532"/>
    </linearGradient>
    <linearGradient id="ngFfGrassB" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0e1330"/><stop offset="1" stop-color="#080b20"/>
    </linearGradient>
  </defs>

  <g class="ff-drift" filter="url(#ngFfBlur)" opacity=".8">
    <path d="M-30 120 C 80 90, 180 146, 270 110 S 400 74, 440 96"
          fill="none" stroke="url(#ngFfAur)" stroke-width="38" stroke-linecap="round"/>
  </g>

  <circle cx="56" cy="236" r="46" fill="url(#ngFfMoonHalo)"/>
  <path d="M70 212 A 27 27 0 1 0 72 258 A 21 21 0 0 1 70 212 Z" fill="#ffedb8"/>

  <!-- back meadow -->
  <path d="M0 588 C 100 566, 280 566, 390 584 L390 844 L0 844 Z" fill="url(#ngFfGrassA)"/>

  <!-- jar light flooding the meadow (brightens one step per firefly);
       the flicker class lives on the wrapper so it never fights the
       count-driven opacity set on the ellipse itself -->
  <g class="ff-flick">
    <ellipse id="ff-flood" cx="256" cy="560" rx="200" ry="150" fill="url(#ngFfJarGlow)" opacity=".14"/>
  </g>

  <!-- tree stump -->
  <g>
    <path d="M226 596 Q 224 640 230 656 L286 656 Q 292 640 290 596 Z" fill="#3a2b21"/>
    <ellipse cx="258" cy="596" rx="32" ry="11" fill="#5d4530"/>
    <ellipse cx="258" cy="596" rx="22" ry="7" fill="#4a3626"/>
    <path d="M232 626 q6 3 10 0 M276 640 q5 3 9 0" stroke="#2c1f18" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  </g>

  <!-- Fern, dozing beside the stump (moss bandana, permanently sleepy) -->
  <g transform="translate(88 596)">
    <ellipse cx="52" cy="46" rx="44" ry="22" fill="#b0a184"/>
    <path d="M10 46 A 44 22 0 0 0 94 50 Q 60 62 24 58 Q 12 54 10 46 Z" fill="#9c8f74"/>
    <path d="M92 44 q 18 2 22 -12" stroke="#9c8f74" stroke-width="11" stroke-linecap="round" fill="none"/>
    <ellipse cx="18" cy="58" rx="13" ry="7" fill="#bcae92"/>
    <ellipse cx="40" cy="60" rx="13" ry="7" fill="#b0a184"/>
    <circle cx="24" cy="34" r="23" fill="#bcae92"/>
    <ellipse cx="6" cy="20" rx="8" ry="12.5" transform="rotate(-30 6 20)" fill="#8a7d62"/>
    <ellipse class="fern-ear" cx="42" cy="18" rx="8" ry="12.5" transform="rotate(24 42 18)" fill="#8a7d62"
             style="transform-origin:42px 18px"/>
    <ellipse cx="15" cy="42" rx="11.5" ry="8.6" fill="#cdc0a6"/>
    <ellipse cx="7" cy="38" rx="4.2" ry="3.5" fill="#3d3626"/>
    <path d="M16 28 q4 3 8 0 M34 28 q4 3 8 0" stroke="#3d3626" stroke-width="2.8" stroke-linecap="round" fill="none"/>
    <circle cx="17" cy="37" r="3.2" fill="#e8a0b4" opacity=".45"/>
    <path d="M8 52 Q 26 62 46 52 L46 60 Q 26 70 8 60 Z" fill="#5f8a5e"/>
  </g>

  <!-- front grass + sleeping bell-flowers -->
  <path d="M0 668 C 120 640, 260 644, 390 664 L390 844 L0 844 Z" fill="url(#ngFfGrassB)"/>
  <g stroke="#131938" stroke-width="4" stroke-linecap="round" fill="none">
    <path d="M30 668 q-4 -26 4 -40"/><path d="M44 670 q2 -22 -6 -34"/>
    <path d="M206 652 q-4 -24 4 -36"/><path d="M220 654 q2 -20 -6 -30"/>
    <path d="M330 660 q-4 -26 4 -40"/><path d="M346 662 q2 -22 -6 -34"/>
    <path d="M370 668 q-3 -20 3 -30"/>
  </g>
  <g>
    <path d="M76 654 q-2 -24 8 -34" stroke="#1d2450" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M80 616 q6 -8 12 0 l-3 9 q-3 3 -6 0 Z" fill="#7a6fb0"/>
    <path d="M300 650 q-2 -22 8 -30" stroke="#1d2450" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M304 616 q6 -8 12 0 l-3 9 q-3 3 -6 0 Z" fill="#7a6fb0"/>
  </g>
</svg>`;
    stage.insertBefore(scene, jar);

    // the jar itself lives in #firefly-jar so it can hold its own glow layers
    jar.innerHTML = `
<svg viewBox="0 0 90 150" aria-hidden="true">
  <defs>
    <radialGradient id="ngJarHalo" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#ffd88a" stop-opacity=".5"/>
      <stop offset=".55" stop-color="#ffd88a" stop-opacity=".18"/>
      <stop offset="1" stop-color="#ffd88a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle id="ff-jar-halo" cx="45" cy="86" r="82" fill="url(#ngJarHalo)" opacity="0"/>
  <g id="ff-jar-glass">
    <path d="M20 40 L20 118 Q20 132 34 132 L56 132 Q70 132 70 118 L70 40 Z"
          fill="rgba(190,220,236,.14)" stroke="#9fb6d0" stroke-width="3"/>
    <path d="M26 46 L26 114" stroke="#dcecf8" stroke-width="3" opacity=".4" stroke-linecap="round"/>
    <ellipse id="ff-jar-pool" cx="45" cy="118" rx="19" ry="8" fill="#ffd88a" opacity=".12"/>
    <rect x="14" y="22" width="62" height="17" rx="7" fill="#8a6d55"/>
    <rect x="14" y="33" width="62" height="5" fill="#5d4530"/>
    <path d="M76 30 q10 4 8 14" stroke="#c9a878" stroke-width="3" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;

    halo = document.createElement('div');
    halo.id = 'ff-halo';
    stage.appendChild(halo);
  }

  function buildFlies() {
    flies.forEach((f) => f.el.remove());
    flies = [];
    for (let i = 0; i < N_FLIES; i++) {
      const el = document.createElement('div');
      el.className = 'ff-fly';
      el.innerHTML = '<div class="ff-core"></div>';
      el.firstChild.style.animationDelay = (-i * 0.7) + 's';
      stage.appendChild(el);
      flies.push({
        el, state: 'wander',
        x: 0, y: 0, vx: 0, vy: 0,
        wpX: 0, wpY: 0, wpT: 0,
        bob: Math.random() * Math.PI * 2,
        t: 0, p0: null, p1: null, p2: null,
        perch: null,
      });
    }
  }

  // ---- layout: same "slice" mapping the scene svg uses ----
  function layout() {
    W = stage.clientWidth;
    H = stage.clientHeight;
    scale = Math.max(W / 390, H / 844);
    ox = (W - 390 * scale) / 2;
    oy = (H - 844 * scale) / 2;
    // jar svg is drawn in the same unit size as the scene: 90x150 units,
    // glass bottom (y=132) rests on the stump top (scene y=598, cx=258)
    jar.style.width = (90 * scale) + 'px';
    jar.style.height = (150 * scale) + 'px';
    jar.style.left = (toX(258) - 45 * scale) + 'px';
    jar.style.top = (toY(598 - 132)) + 'px';
  }

  function flyBounds() {
    return {
      x0: 24, x1: W - 24,
      y0: Math.max(H * 0.16, 140),
      y1: H * 0.62,
    };
  }

  function scatterFlies() {
    const b = flyBounds();
    flies.forEach((f, i) => {
      f.state = 'wander';
      f.x = b.x0 + (b.x1 - b.x0) * ((i + 0.5) / N_FLIES);
      f.y = b.y0 + (b.y1 - b.y0) * (0.25 + 0.55 * Math.random());
      f.vx = f.vy = 0;
      f.wpT = 0;
      f.el.className = 'ff-fly';
    });
  }

  // ---- hints ----
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
    const list = celebrated ? HINTS_DONE : HINTS;
    hintIdx = (hintIdx + 1) % list.length;
    setHint(list[hintIdx]);
  }

  // ---- jar warmth ----
  function warmJar() {
    const flood = document.getElementById('ff-flood');
    const jhalo = document.getElementById('ff-jar-halo');
    const pool = document.getElementById('ff-jar-pool');
    if (flood) flood.setAttribute('opacity', (0.14 + count * 0.16).toFixed(2));
    if (jhalo) jhalo.style.opacity = (count / N_FLIES * 0.95).toFixed(2);
    if (pool) pool.style.opacity = (0.12 + count * 0.14).toFixed(2);
  }

  function sparkle(n, spread) {
    const jx = toX(258), jy = toY(510);
    for (let i = 0; i < n; i++) {
      const s = document.createElement('div');
      s.className = 'ng-sparkle';
      s.style.left = (jx + (Math.random() - 0.5) * spread) + 'px';
      s.style.top = (jy + (Math.random() - 0.5) * spread * 0.8) + 'px';
      s.style.animationDelay = (Math.random() * 1.4) + 's';
      stage.appendChild(s);
      setTimeout(() => s.remove(), 4400);
    }
  }

  // ---- five fireflies home: warm jar, the whole lullaby, then rest ----
  function celebrate() {
    celebrated = true;
    jar.classList.add('full');
    setTimeout(() => { if (App.current === 'fireflies') Sfx.play('toppup'); }, 500);
    // the full lullaby, slow as a music box winding down
    MELODY.forEach((n, i) => {
      const last = i === MELODY.length - 1;
      musicBox(LULLABY[n], 1.2 + i * 0.78, last ? 0.055 : 0.05, last ? 3 : 2);
    });
    // a soft low fifth under the final note
    musicBox(LULLABY[0] / 2, 1.2 + (MELODY.length - 1) * 0.78, 0.03, 3.2);
    sparkle(10, 150);
    setTimeout(() => sparkle(6, 190), 1600);
    setTimeout(() => {
      if (App.current === 'fireflies') stage.classList.add('rested');
    }, 8500);
    hintTimer = 0;
    hintIdx = 0;
    setHint(HINTS_DONE[0]);
  }

  // ---- firefly brains ----
  function updateFly(f, dt, now) {
    const t = now / 1000;
    const b = flyBounds();
    if (f.state === 'wander') {
      if (!f.wpT || now > f.wpT ||
          Math.hypot(f.wpX - f.x, f.wpY - f.y) < 18) {
        f.wpX = b.x0 + Math.random() * (b.x1 - b.x0);
        f.wpY = b.y0 + Math.random() * (b.y1 - b.y0);
        f.wpT = now + 3000 + Math.random() * 4000;
      }
      const dx = f.wpX - f.x, dy = f.wpY - f.y;
      const d = Math.hypot(dx, dy) || 1;
      f.vx += ((dx / d) * WANDER_V - f.vx) * Math.min(dt * 1.2, 1);
      f.vy += ((dy / d) * WANDER_V - f.vy) * Math.min(dt * 1.2, 1);
      // shy of a fidgeting finger — drift away, never flee
      if (pDown && now - lastMoveT < 450) {
        const ax = f.x - px, ay = f.y - py;
        const ad = Math.hypot(ax, ay);
        if (ad < SHY_R && ad > 1) {
          f.vx += (ax / ad) * SHY_PUSH * dt;
          f.vy += (ay / ad) * SHY_PUSH * dt;
        }
      }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.x = Math.min(Math.max(f.x, b.x0), b.x1);
      f.y = Math.min(Math.max(f.y, b.y0), b.y1);
    } else if (f.state === 'attract') {
      const still = pDown ? (now - stillStart) / 1000 : 0;
      const v = ATTRACT_V0 + Math.min(still, 6) * ATTRACT_VK;
      const dx = px - f.x, dy = py - f.y;
      const d = Math.hypot(dx, dy) || 1;
      f.x += (dx / d) * v * dt + Math.cos(t * 2.2 + f.bob) * 10 * dt;
      f.y += (dy / d) * v * dt + Math.sin(t * 1.8 + f.bob) * 10 * dt;
      if (d < CATCH_R) {
        f.state = 'alight';
        f.t = 0;
        f.el.classList.add('alight');
        attracted = null; // finger is free to invite the next one
      }
    } else if (f.state === 'alight') {
      f.t += dt;
      // rest on the fingertip, orbiting a breath's width away
      const a = t * 1.6 + f.bob;
      const tx = (pDown ? px : f.x) + Math.cos(a) * 9;
      const ty = (pDown ? py : f.y) + Math.sin(a) * 7 - 6;
      f.x += (tx - f.x) * Math.min(dt * 8, 1);
      f.y += (ty - f.y) * Math.min(dt * 8, 1);
      if (f.t > ALIGHT_S) {
        f.state = 'tojar';
        f.t = 0;
        f.p0 = [f.x, f.y];
        f.p2 = [toX(JAR_MOUTH[0]), toY(JAR_MOUTH[1])];
        f.p1 = [(f.x + f.p2[0]) / 2 + (Math.random() - 0.5) * 60,
                Math.min(f.y, f.p2[1]) - 70 - Math.random() * 50];
      }
    } else if (f.state === 'tojar') {
      f.t += dt / TOJAR_S;
      const u = Math.min(f.t, 1);
      const e = u * u * (3 - 2 * u); // smoothstep — a float, not a flight
      const iu = 1 - e;
      f.x = iu * iu * f.p0[0] + 2 * iu * e * f.p1[0] + e * e * f.p2[0];
      f.y = iu * iu * f.p0[1] + 2 * iu * e * f.p1[1] + e * e * f.p2[1];
      if (u >= 1) {
        f.state = 'inside';
        f.perch = PERCH[count];
        f.arrive = [f.x, f.y];
        f.t = 0;
        f.bob = Math.random() * Math.PI * 2;
        f.el.classList.remove('alight');
        f.el.classList.add('inside');
        musicBox(LULLABY[count], 0, 0.065, 2);
        count++;
        warmJar();
        if (count >= N_FLIES) celebrate();
      }
    } else if (f.state === 'inside') {
      f.t += dt;
      const amp = celebrated ? 5 : 3;
      const tx = toX(f.perch[0]) + Math.sin(t * 0.7 + f.bob) * amp;
      const ty = toY(f.perch[1]) + Math.cos(t * 0.55 + f.bob) * amp;
      // settle from the jar mouth down to the perch, no popping
      const k = Math.min(f.t / 0.9, 1);
      const e = k * k * (3 - 2 * k);
      f.x = f.arrive[0] + (tx - f.arrive[0]) * e;
      f.y = f.arrive[1] + (ty - f.arrive[1]) * e;
    }
    const bobY = f.state === 'wander' ? Math.sin(t * 1.4 + f.bob) * 4 : 0;
    f.el.style.transform = `translate3d(${f.x.toFixed(1)}px,${(f.y + bobY).toFixed(1)}px,0)`;
  }

  // ---- main loop ----
  function frame(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;

    // stillness bookkeeping + invitations
    if (pDown) {
      const still = (now - stillStart) / 1000;
      halo.classList.toggle('still', still > STILL_AFTER);
      if (still > STILL_AFTER && !attracted && !celebrated) {
        let best = null, bestD = Infinity;
        for (const f of flies) {
          if (f.state !== 'wander') continue;
          const d = Math.hypot(f.x - px, f.y - py);
          if (d < bestD) { bestD = d; best = f; }
        }
        if (best) {
          best.state = 'attract';
          attracted = best;
        }
      }
    }

    for (const f of flies) updateFly(f, dt, now);
    cycleHint(dt);
    rafId = requestAnimationFrame(frame);
  }

  // ---- pointer ----
  function moveHalo() {
    halo.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0)`;
  }

  function onDown(e) {
    e.preventDefault();
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    pDown = true;
    px = anchorX = e.clientX;
    py = anchorY = e.clientY;
    stillStart = performance.now();
    lastMoveT = 0;
    moveHalo();
    halo.classList.add('show');
  }

  function onMove(e) {
    if (!pDown) return;
    e.preventDefault();
    px = e.clientX;
    py = e.clientY;
    moveHalo();
    if (Math.hypot(px - anchorX, py - anchorY) > STILL_TOL) {
      // the finger wandered: reset stillness, release any inbound firefly
      anchorX = px;
      anchorY = py;
      stillStart = performance.now();
      lastMoveT = stillStart;
      halo.classList.remove('still');
      if (attracted && attracted.state === 'attract') {
        attracted.state = 'wander';
        attracted.wpT = 0;
        attracted = null;
      }
    }
  }

  function onUp() {
    pDown = false;
    halo.classList.remove('show');
    halo.classList.remove('still');
    if (attracted && attracted.state === 'attract') {
      attracted.state = 'wander';
      attracted.wpT = 0;
      attracted = null;
    }
  }

  function reset() {
    count = 0;
    celebrated = false;
    attracted = null;
    pDown = false;
    hintIdx = 0;
    hintTimer = 0;
    stage.classList.remove('rested');
    jar.classList.remove('full');
    halo.classList.remove('show');
    halo.classList.remove('still');
    warmJar();
    scatterFlies();
    setHint(HINTS[0]);
  }

  // ---- wiring ----
  document.addEventListener('DOMContentLoaded', () => {
    stage = document.getElementById('firefly-stage');
    jar = document.getElementById('firefly-jar');
    buildScene();
    buildFlies();

    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);

    window.addEventListener('resize', () => {
      if (App.current === 'fireflies') layout();
    });

    App.register('fireflies', {
      enter() {
        layout();
        reset();
        lastFrame = performance.now();
        rafId = requestAnimationFrame(frame);
      },
      exit() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        onUp();
      },
    });
  });
})();
