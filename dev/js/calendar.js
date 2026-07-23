/* The Log: a parent-facing calendar of day records. Days with any data get
 * a dot; tapping one opens the day report — marks, every diary answer as a
 * playable clip, and the goodnight selfie. */
(() => {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const DOWS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  let viewYear, viewMonth; // month is 0-based
  let haveDates = new Set();
  let urls = []; // object URLs to revoke when leaving the day view

  function key(y, m, d) { return `${y}-${m + 1}-${d}`; }

  async function renderMonth() {
    document.getElementById('cal-title').textContent =
      `${MONTHS[viewMonth]} ${viewYear}`;
    const dow = document.getElementById('cal-dow');
    dow.innerHTML = '';
    DOWS.forEach((d) => {
      const el = document.createElement('div');
      el.textContent = d;
      dow.appendChild(el);
    });

    haveDates = new Set(await Store.listDates());
    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '';
    const first = new Date(viewYear, viewMonth, 1).getDay();
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let i = 0; i < first; i++) grid.appendChild(document.createElement('div'));
    const now = new Date();
    for (let d = 1; d <= days; d++) {
      const cell = document.createElement('button');
      cell.className = 'cal-day';
      cell.textContent = d;
      const k = key(viewYear, viewMonth, d);
      if (haveDates.has(k)) {
        cell.classList.add('has-data');
        cell.addEventListener('click', () => openDay(k));
      }
      if (viewYear === now.getFullYear() && viewMonth === now.getMonth() &&
          d === now.getDate()) cell.classList.add('today');
      grid.appendChild(cell);
    }
  }

  async function openDay(dateKey) {
    const day = await Store.getDay(dateKey);
    if (!day) return;
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];

    const host = document.getElementById('day-report');
    host.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'day-title';
    const [y, m, d] = dateKey.split('-').map(Number);
    title.textContent = `${MONTHS[m - 1]} ${d}, ${y}`;
    host.appendChild(title);

    // progress summary: marks
    const marksRow = document.createElement('div');
    marksRow.className = 'day-marks';
    const marks = day.marks || [];
    const xs = marks.filter((v) => v === 'x').length;
    const stars = marks.filter((v) => v === 'star').length;
    marksRow.innerHTML =
      `<span class="day-stat star">&#9733; ${stars}</span>` +
      `<span class="day-stat x">&#10005; ${xs}</span>` +
      (day.diaryAt ? `<span class="day-stat diary">&#9789; diary done</span>` : '');
    host.appendChild(marksRow);

    // selfie
    if (day.selfie) {
      const img = document.createElement('img');
      img.className = 'day-selfie';
      const u = URL.createObjectURL(day.selfie);
      urls.push(u);
      img.src = u;
      host.appendChild(img);
    }

    // diary answers
    if (day.diary && day.diary.length) {
      day.diary.forEach((a) => {
        const row = document.createElement('div');
        row.className = 'day-answer';
        const q = document.createElement('div');
        q.className = 'day-q';
        q.textContent = a.q;
        row.appendChild(q);
        if (a.audio) {
          const btn = document.createElement('button');
          btn.className = 'day-play';
          btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5 L19 12 L8 19 Z" fill="currentColor"/></svg>';
          const u = URL.createObjectURL(a.audio);
          urls.push(u);
          let audio = null;
          btn.addEventListener('click', () => {
            if (audio && !audio.paused) { audio.pause(); return; }
            audio = new Audio(u);
            audio.play().catch(() => {});
          });
          row.appendChild(btn);
        } else {
          const skip = document.createElement('div');
          skip.className = 'day-skip';
          skip.textContent = '—';
          row.appendChild(skip);
        }
        host.appendChild(row);
      });
    }

    App.show('day');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();

    document.getElementById('cal-prev').addEventListener('click', () => {
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      renderMonth();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderMonth();
    });

    App.register('calendar', {
      enter() {
        const n = new Date();
        viewYear = n.getFullYear();
        viewMonth = n.getMonth();
        renderMonth();
      },
    });
    App.register('day', {
      exit() {
        urls.forEach((u) => URL.revokeObjectURL(u));
        urls = [];
      },
    });
  });
})();
