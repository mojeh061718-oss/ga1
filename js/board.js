/* Daily Monitor: three universal boxes on the hub. Double-tap stamps an X
 * (strike), triple-tap pops a star. Long-press (~1.5s) erases a mark.
 * 3 X's -> suspension warning banner. 3 stars -> Top Pup celebration.
 * Resets each morning; every day's marks are also written into the
 * IndexedDB day log so the calendar's progress reports keep history. */
const Board = (() => {
  const TAP_WINDOW_MS = 420;
  const CLEAR_HOLD_MS = 1500;
  const LS_KEY = 'calmpups-board';

  const X_SVG = `<svg viewBox="0 0 60 60">
    <line x1="12" y1="12" x2="48" y2="48" stroke="#ff7d7d" stroke-width="9" stroke-linecap="round"/>
    <line x1="48" y1="12" x2="12" y2="48" stroke="#ff7d7d" stroke-width="9" stroke-linecap="round"/>
  </svg>`;
  const STAR_SVG = `<svg viewBox="0 0 60 60">
    <path d="M30 6 l7 14.5 16 2.3 -11.5 11.2 2.7 15.9 -14.2 -7.5 -14.2 7.5 2.7 -15.9 -11.5 -11.2 16 -2.3 Z"
      fill="#f9e6a8" stroke="#eccf7f" stroke-width="2"/>
  </svg>`;

  let state = null;
  let rewarded = false;

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function fresh() {
    return { date: today(), marks: [null, null, null] };
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY));
      if (s && s.date === today() && Array.isArray(s.marks)) { state = s; return; }
    } catch (err) {}
    state = fresh();
    save();
  }

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (err) {}
    Store.updateDay(state.date, { marks: state.marks.slice() });
  }

  function boxes() {
    return Array.from(document.querySelectorAll('.hub-box'));
  }

  function render() {
    boxes().forEach((el, i) => {
      const mark = state.marks[i];
      const cur = el.querySelector('.mark');
      const want = mark === 'x' ? X_SVG : mark === 'star' ? STAR_SVG : null;
      if (cur && (!want || cur.dataset.kind !== mark)) cur.remove();
      if (want && (!cur || cur.dataset.kind !== mark)) {
        const m = document.createElement('div');
        m.className = 'mark';
        m.dataset.kind = mark;
        m.innerHTML = want;
        el.appendChild(m);
      }
    });
    refreshBanner();
  }

  function refreshBanner() {
    const banner = document.getElementById('hub-banner');
    const name = Hub.name.toUpperCase();
    const xs = state.marks.filter((m) => m === 'x').length;
    const stars = state.marks.filter((m) => m === 'star').length;
    if (xs >= 3) {
      banner.className = 'warning';
      banner.innerHTML = `<span class="banner-icon">&#9888;</span> WARNING: ${name} IS AT RISK OF SUSPENSION`;
    } else if (stars >= 3) {
      banner.className = 'reward';
      banner.innerHTML = `<span class="banner-icon">&#9733;</span> TOP PUP! ${name} EARNED A GOLD STAR DAY`;
      if (!rewarded) {
        rewarded = true;
        Sounds.praise();
        const hub = document.getElementById('screen-hub');
        for (let s = 0; s < 8; s++) {
          const el = document.createElement('div');
          el.className = 'sparkle';
          el.style.left = 10 + Math.random() * 80 + '%';
          el.style.top = 10 + Math.random() * 60 + '%';
          el.style.animationDelay = (s * 0.15) + 's';
          hub.appendChild(el);
          setTimeout(() => el.remove(), 3200);
        }
      }
    } else {
      banner.className = 'hidden';
      banner.innerHTML = '';
      rewarded = false;
    }
  }

  function setMark(i, kind) {
    state.marks[i] = kind;
    save();
    render();
    if (kind === 'x') Sounds.uhoh();
    else Sounds.chime();
  }

  function clearMark(i) {
    if (!state.marks[i]) return;
    state.marks[i] = null;
    save();
    render();
    Sounds.inviteChime();
  }

  function wiggle(el) {
    el.classList.remove('wiggle');
    void el.offsetWidth;
    el.classList.add('wiggle');
  }

  function hookBox(el, i) {
    let taps = [];
    let decideTimer = null;
    let holdTimer = null;
    let downAt = 0;

    el.addEventListener('pointerdown', () => {
      downAt = Date.now();
      if (state.marks[i]) {
        el.classList.add('clearing');
        holdTimer = setTimeout(() => {
          el.classList.remove('clearing');
          clearMark(i);
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
      if (downAt && now - downAt > 500) return; // a long-press is not a tap
      taps = taps.filter((t) => now - t < TAP_WINDOW_MS * 2);
      taps.push(now);
      if (decideTimer) clearTimeout(decideTimer);
      decideTimer = setTimeout(() => {
        const n = taps.length;
        taps = [];
        if (state.marks[i]) return; // long-press is the only way to change a mark
        if (n === 2) setMark(i, 'x');
        else if (n >= 3) setMark(i, 'star');
        // single tap: no-op so she can poke around safely
      }, TAP_WINDOW_MS);
    });
  }

  /* Morning reset — called on hub enter and when the app returns to the
   * foreground, so a new day always starts with a clean monitor. */
  function checkDay() {
    if (state && state.date !== today()) {
      state = fresh();
      save();
    }
    render();
  }

  document.addEventListener('DOMContentLoaded', () => {
    load();
    render();
    boxes().forEach((el, i) => hookBox(el, i));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkDay();
    });
  });

  return { refreshBanner, checkDay, get marks() { return state ? state.marks.slice() : []; } };
})();
