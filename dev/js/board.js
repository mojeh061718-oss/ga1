/* Daily Monitor: three universal boxes on the hub. Double-tap stamps an X
 * (strike), triple-tap pops a star. Long-press (~1.5s) erases a mark.
 * 3 X's -> suspension warning banner. 3 stars -> Top Pup celebration.
 * Resets each morning; every day's marks are also written into the
 * IndexedDB day log so the calendar's progress reports keep history. */
const Board = (() => {
  const TAP_WINDOW_MS = 420;
  const CLEAR_HOLD_MS = 1500;
  const LS_KEY = 'calmpups2-board';

  // Studio Aurora marks: sleepy raincloud pebble (strike) /
  // glowing golden moonstone with a smile (star) — see mockup-home's
  // Daily Monitor. Same slots, same logic, new art.
  const X_SVG = `<svg viewBox="0 0 96 96">
    <defs>
      <radialGradient id="aurStoneSad" cx=".42" cy=".36" r=".72">
        <stop offset="0" stop-color="#8b95c2"/>
        <stop offset=".6" stop-color="#5d6795"/><stop offset="1" stop-color="#414a75"/>
      </radialGradient>
    </defs>
    <g>
      <circle cx="38" cy="52" r="16" fill="url(#aurStoneSad)"/>
      <circle cx="56" cy="52" r="14" fill="url(#aurStoneSad)"/>
      <circle cx="47" cy="42" r="15" fill="url(#aurStoneSad)"/>
      <rect x="26" y="52" width="44" height="14" rx="7" fill="url(#aurStoneSad)"/>
    </g>
    <path d="M38 49 q3 2.5 6 0 M53 49 q3 2.5 6 0" fill="none" stroke="#20264a" stroke-width="3" stroke-linecap="round"/>
    <path d="M41 60 q7 -5 14 0" fill="none" stroke="#20264a" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M62 66 q3 5 0 7.5 q-3 -2.5 0 -7.5" fill="#8b95c2" opacity=".8"/>
  </svg>`;
  const STAR_SVG = `<svg viewBox="0 0 96 96">
    <defs>
      <radialGradient id="aurStoneHappy" cx=".42" cy=".36" r=".72">
        <stop offset="0" stop-color="#fff2c8"/><stop offset=".55" stop-color="#ffd88a"/>
        <stop offset="1" stop-color="#f0a95c"/>
      </radialGradient>
      <radialGradient id="aurStoneHalo" cx=".5" cy=".5" r=".5">
        <stop offset="0" stop-color="#ffd88a" stop-opacity=".45"/>
        <stop offset="1" stop-color="#ffd88a" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="48" cy="48" r="46" fill="url(#aurStoneHalo)"/>
    <circle cx="48" cy="48" r="30" fill="url(#aurStoneHappy)"/>
    <path d="M34 44 q4 -5 8 0 M54 44 q4 -5 8 0" fill="none" stroke="#7a4a1e" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M37 55 q11 10 22 0" fill="none" stroke="#7a4a1e" stroke-width="3.6" stroke-linecap="round"/>
    <circle cx="33" cy="52" r="3.4" fill="#ff9d6b" opacity=".45"/>
    <circle cx="63" cy="52" r="3.4" fill="#ff9d6b" opacity=".45"/>
    <circle cx="40" cy="36" r="3" fill="#fff8e2" opacity=".8"/>
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

  /* Only real user edits (setMark/clearMark) stamp `up` — a freshly created
   * or morning-reset board keeps up=0, so in sync merges another device's
   * actual marks always beat an empty default. */
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (err) {}
    Store.updateDay(state.date, { marks: state.marks.slice(), marksUp: state.up || 0 });
    try { MailSync.kick(); } catch (err) {}
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

  /* Banner text is built with text nodes (never innerHTML) — the name is
   * parent-typed, and typed markup must stay visible text, not become DOM. */
  function setBanner(banner, icon, text) {
    banner.textContent = '';
    const ic = document.createElement('span');
    ic.className = 'banner-icon';
    ic.textContent = icon;
    banner.appendChild(ic);
    banner.appendChild(document.createTextNode(' ' + text));
  }

  function refreshBanner() {
    const banner = document.getElementById('hub-banner');
    const name = Hub.name.toUpperCase();
    const xs = state.marks.filter((m) => m === 'x').length;
    const stars = state.marks.filter((m) => m === 'star').length;
    if (xs >= 3) {
      banner.className = 'warning';
      setBanner(banner, '⚠', `WARNING: ${name} IS AT RISK OF SUSPENSION`);
    } else if (stars >= 3) {
      banner.className = 'reward';
      setBanner(banner, '★', `TOP PUP! ${name} EARNED A GOLD STAR DAY`);
      if (!rewarded) {
        rewarded = true;
        Sfx.play('toppup');
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
      banner.textContent = '';
      rewarded = false;
    }
  }

  function setMark(i, kind) {
    state.marks[i] = kind;
    state.up = Date.now();
    save();
    render();
    if (kind === 'x') Sfx.play('strike');
    else Sfx.play('star');
  }

  function clearMark(i) {
    if (!state.marks[i]) return;
    state.marks[i] = null;
    state.up = Date.now();
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

    let holdXY = null;
    el.addEventListener('pointerdown', (e) => {
      downAt = Date.now();
      holdXY = [e.clientX, e.clientY];
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
    // sliding off aborts the erase, same as mail rows
    el.addEventListener('pointermove', (e) => {
      if (holdTimer && holdXY &&
          Math.hypot(e.clientX - holdXY[0], e.clientY - holdXY[1]) > 12) {
        cancelHold();
      }
    });
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

  /* ---- sync hooks (MailSync's monitor pass) ---- */
  function syncState() {
    if (!state || state.date !== today()) return null;
    return { date: state.date, marks: state.marks.slice(), up: state.up || 0 };
  }
  /* Adopt marks for today that arrived from another device (already known to
   * be newer). Writes without re-stamping `up` so the merge stays stable. */
  function applySynced(marks, up) {
    if (!state || state.date !== today()) return;
    state.marks = marks.slice(0, 3);
    while (state.marks.length < 3) state.marks.push(null);
    state.up = up;
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (err) {}
    Store.updateDay(state.date, { marks: state.marks.slice(), marksUp: up });
    render();
  }

  return {
    refreshBanner, checkDay, syncState, applySynced,
    get marks() { return state ? state.marks.slice() : []; },
  };
})();
