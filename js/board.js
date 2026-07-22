/* Pup Board: a strike/reward board the parent marks — "the pups can see
 * how you're doing." Double-tap a strike box stamps a big X; triple-tap a
 * star slot pops a happy face. Long-press (~1.5s) erases a mark. The board
 * resets itself each morning — every day is a fresh start. */
(() => {
  const TAP_WINDOW_MS = 420;    // decide double vs triple this long after the last tap
  const CLEAR_HOLD_MS = 1500;
  const LS_KEY = 'calmpups-board';

  const X_SVG = `<svg viewBox="0 0 60 60">
    <line x1="12" y1="12" x2="48" y2="48" stroke="#d68a8a" stroke-width="9" stroke-linecap="round"/>
    <line x1="48" y1="12" x2="12" y2="48" stroke="#d68a8a" stroke-width="9" stroke-linecap="round"/>
  </svg>`;
  const FACE_SVG = `<svg viewBox="0 0 60 60">
    <circle cx="30" cy="30" r="24" fill="#f9e6a8" stroke="#eccf7f" stroke-width="3"/>
    <circle cx="22" cy="25" r="3.4" fill="#7a6a3f"/>
    <circle cx="38" cy="25" r="3.4" fill="#7a6a3f"/>
    <path d="M19 35 q 11 12 22 0" fill="none" stroke="#7a6a3f" stroke-width="3.5" stroke-linecap="round"/>
  </svg>`;

  let state = null;

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function fresh() {
    return { date: today(), strikes: [false, false, false], stars: [false, false, false, false, false] };
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY));
      if (s && s.date === today() && s.strikes && s.stars) { state = s; return; }
    } catch (err) {}
    state = fresh();
    save();
  }

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (err) {}
  }

  function boxes(kind) {
    return Array.from(document.querySelectorAll(`.board-box.${kind}`));
  }

  function render() {
    boxes('strike').forEach((el, i) => setMark(el, state.strikes[i], X_SVG));
    boxes('star').forEach((el, i) => setMark(el, state.stars[i], FACE_SVG));
    const pup = document.getElementById('board-pup');
    pup.classList.toggle('concerned', state.strikes.every(Boolean));
  }

  function setMark(el, on, svg) {
    const cur = el.querySelector('.mark');
    if (on && !cur) {
      const m = document.createElement('div');
      m.className = 'mark';
      m.innerHTML = svg;
      el.appendChild(m);
    } else if (!on && cur) {
      cur.remove();
    }
  }

  function wiggle(el) {
    el.classList.remove('wiggle');
    void el.offsetWidth;
    el.classList.add('wiggle');
  }

  function addStrike(i) {
    if (state.strikes[i]) return;
    state.strikes[i] = true;
    save();
    render();
    Sounds.uhoh();
  }

  function addStar(i) {
    if (state.stars[i]) return;
    state.stars[i] = true;
    save();
    render();
    const pup = document.getElementById('board-pup');
    pup.classList.add('happy');
    setTimeout(() => pup.classList.remove('happy'), 2800);
    if (state.stars.every(Boolean)) {
      Sounds.praise();
      const host = document.getElementById('board-sparkles');
      for (let s = 0; s < 8; s++) {
        const el = document.createElement('div');
        el.className = 'sparkle';
        el.style.left = 10 + Math.random() * 80 + '%';
        el.style.top = 10 + Math.random() * 70 + '%';
        el.style.animationDelay = (s * 0.15) + 's';
        host.appendChild(el);
        setTimeout(() => el.remove(), 3200);
      }
    } else {
      Sounds.chime();
    }
  }

  function clearMark(kind, i) {
    const arr = kind === 'strike' ? state.strikes : state.stars;
    if (!arr[i]) return;
    arr[i] = false;
    save();
    render();
    Sounds.inviteChime();
  }

  function hookBox(el, kind, i) {
    let taps = [];
    let decideTimer = null;
    let holdTimer = null;

    el.addEventListener('pointerdown', () => {
      const marked = kind === 'strike' ? state.strikes[i] : state.stars[i];
      if (marked) {
        el.classList.add('clearing');
        holdTimer = setTimeout(() => {
          el.classList.remove('clearing');
          clearMark(kind, i);
        }, CLEAR_HOLD_MS);
      }
    });
    const cancelHold = () => {
      el.classList.remove('clearing');
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    };
    el.addEventListener('pointerup', cancelHold);
    el.addEventListener('pointerleave', cancelHold);
    el.addEventListener('pointercancel', cancelHold);

    el.addEventListener('click', () => {
      const now = Date.now();
      taps = taps.filter((t) => now - t < TAP_WINDOW_MS * 2);
      taps.push(now);
      if (decideTimer) clearTimeout(decideTimer);
      decideTimer = setTimeout(() => {
        const n = taps.length;
        taps = [];
        const marked = kind === 'strike' ? state.strikes[i] : state.stars[i];
        if (marked) return; // long-press is the only way to change a marked box
        if (kind === 'strike' && n === 2) addStrike(i);
        else if (kind === 'star' && n >= 3) addStar(i);
        else if (n >= 2) wiggle(el); // wrong gesture for this row
      }, TAP_WINDOW_MS);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    load();
    render();
    boxes('strike').forEach((el, i) => hookBox(el, 'strike', i));
    boxes('star').forEach((el, i) => hookBox(el, 'star', i));

    App.register('board', {
      enter() {
        if (state.date !== today()) { state = fresh(); save(); } // morning reset
        render();
      },
    });
  });
})();
