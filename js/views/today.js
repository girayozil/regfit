// Today / calendar: week strip, the selected day's agenda, and the "up next" card.
// Also owns the global "New session" flow (client picker modal).

import { esc, icon, on, app, todayISO, addDays, weekStart, fmtLong, dowShort, dayNum, relDay, fmtMonthYear, timeToMin, nowMinutes, fullName, initials, tint } from '../util.js';
import { db, sessionsOn, clientById, exName, sessionEnded, createSession, suggestTime, itemParts, groupLabels } from '../store.js';

const ui = { day: null, pickQ: '' };

export const selectedDay = () => ui.day || todayISO();

// Status of a session for display: done / log (ended but not marked done) / next / planned.
export function sessionStatus(s, nextId) {
  if (s.status === 'done') return { key: 'done', label: 'Done' };
  if (sessionEnded(s)) return { key: 'log', label: 'To log' };
  if (s.id === nextId) return { key: 'next', label: 'Up next' };
  return { key: 'planned', label: 'Planned' };
}

function upNext() {
  const t = todayISO();
  const now = nowMinutes();
  return sessionsOn(t).find((s) => s.status === 'planned' && timeToMin(s.time) + (s.duration || 60) > now) || null;
}

const itemsSummary = (s) => {
  if (!s.items.length) return s.started ? 'No exercises yet' : 'Not planned yet';
  return s.items.length + (s.items.length === 1 ? ' exercise' : ' exercises');
};

export function render() {
  const day = selectedDay();
  const t = todayISO();
  const ws = weekStart(day);
  const sessions = sessionsOn(day);
  const next = upNext();

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ws, i);
    const n = sessionsOn(d).length;
    const cls = ['day-btn', d === t ? 'is-today' : ''].join(' ');
    return `<button type="button" class="${cls}" data-act="pickDay" data-day="${d}" aria-pressed="${d === day}" aria-label="${esc(fmtLong(d))}, ${n} sessions">
      <span class="day-dow">${esc(dowShort(d))}</span>
      <span class="day-row"><span class="day-num">${dayNum(d)}</span><span class="day-count">${n ? n + '<span class="hide-sm"> sessions</span>' : '<span class="hide-sm">Rest</span>'}</span></span>
      <span class="day-dots" aria-hidden="true">${'<i></i>'.repeat(Math.min(n, 4))}</span>
    </button>`;
  }).join('');

  const agenda = sessions.length
    ? sessions
        .map((s) => {
          const c = clientById(s.clientId) || { first: 'Unknown', last: '' };
          const st = sessionStatus(s, next && next.id);
          return `<a class="agenda-item st-${st.key}" href="#/session/${s.id}">
            <span class="agenda-time"><strong>${esc(s.time)}</strong><span>${s.duration || 60} min</span></span>
            <span class="avatar avatar-md" style="background:${tint(c.id)}">${esc(initials(c))}</span>
            <span class="agenda-body">
              <span class="agenda-name">${esc(fullName(c))}</span>
              <span class="agenda-meta">${esc(s.focus || 'No focus set')} · ${esc(itemsSummary(s))}</span>
            </span>
            <span class="pill pill-${st.key}">${st.label}</span>
            <span class="chev">${icon.right(18)}</span>
          </a>`;
        })
        .join('')
    : `<div class="card empty-card">
        <p class="empty-title">No sessions ${day === t ? 'today' : 'on ' + esc(relDay(day))}</p>
        <p class="muted">Schedule one from here or from a client's profile.</p>
        <button type="button" class="btn btn-dark" data-act="newSession">${icon.plus(16)}Schedule a session</button>
      </div>`;

  const showNext = day === t && next;
  let aside = '';
  if (showNext) {
    const c = clientById(next.clientId) || { first: 'Unknown', last: '' };
    const mins = timeToMin(next.time) - nowMinutes();
    const when = mins > 0 ? (mins < 60 ? 'in ' + mins + ' min' : 'in ' + Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min') : 'now';
    aside = `<aside class="next-card" aria-label="Up next">
      <div class="next-top"><span class="next-eyebrow">Up next · ${esc(next.time)}</span><span class="next-when">${when}</span></div>
      <div class="next-who">
        <span class="avatar avatar-lg avatar-dark">${esc(initials(c))}</span>
        <span><span class="next-name">${esc(fullName(c))}</span><span class="next-meta">${esc(next.focus || 'No focus set')}</span></span>
      </div>
      ${next.copiedFrom ? `<div class="next-src">${icon.copy(14)}Copied from ${esc(next.copiedFrom)}</div>` : ''}
      ${
        next.items.length
          ? `<ol class="next-list">${next.items
              .map((it) => {
                const { work, load } = itemParts(it);
                const label = groupLabels(next.items)[it.id];
                return `<li><span>${label ? `<b class="ss-label">${label}</b> ` : ''}${esc(exName(it.exId))}</span><span class="next-sets">${esc(work)}</span><span class="next-load">${esc(load === 'Bodyweight' ? 'BW' : load)}</span></li>`;
              })
              .join('')}</ol>`
          : `<p class="next-empty">No exercises planned yet.</p>`
      }
      <div class="next-actions">
        <a class="btn btn-accent" href="#/session/${next.id}">Open session</a>
        <a class="btn btn-outline-dark" href="#/client/${c.id}">Client profile</a>
      </div>
    </aside>`;
  }

  return `
  <header class="page-head">
    <div>
      <div class="eyebrow">${esc(relDay(day) === 'Today' ? 'Today' : fmtMonthYear(day))} · ${sessions.length} session${sessions.length === 1 ? '' : 's'}</div>
      <h1 class="page-title">${esc(fmtLong(day))}</h1>
    </div>
    <div class="head-actions">
      <button type="button" class="btn-icon" data-act="shiftWeek" data-dir="-1" aria-label="Previous week">${icon.left(18)}</button>
      <button type="button" class="btn btn-outline" data-act="pickDay" data-day="${t}"${day === t ? ' disabled' : ''}>Today</button>
      <button type="button" class="btn-icon" data-act="shiftWeek" data-dir="1" aria-label="Next week">${icon.right(18)}</button>
      <button type="button" class="btn btn-dark hide-md" data-act="newSession">${icon.plus(16)}New session</button>
    </div>
  </header>
  <div class="week" role="group" aria-label="Week">${week}</div>
  <div class="today-grid${showNext ? ' has-aside' : ''}">
    <section class="agenda" aria-label="Sessions">${agenda}
      ${sessions.length ? `<button type="button" class="add-row" data-act="newSession">${icon.plus(18)}Add session on ${esc(relDay(day))}</button>` : ''}
    </section>
    ${aside}
  </div>`;
}

on('click', 'pickDay', (el) => {
  ui.day = el.dataset.day;
  app.rerender();
});

on('click', 'shiftWeek', (el) => {
  ui.day = addDays(selectedDay(), 7 * +el.dataset.dir);
  app.rerender();
});

// ---------- new session: pick a client ----------

function pickerList() {
  const q = ui.pickQ.toLowerCase();
  const list = db.clients.filter((c) => fullName(c).toLowerCase().includes(q)).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  if (!list.length) return `<p class="muted pad">No clients found.</p>`;
  return list
    .map(
      (c) => `<button type="button" class="pick-row" data-act="pickClient" data-id="${c.id}">
        <span class="avatar avatar-md" style="background:${tint(c.id)}">${esc(initials(c))}</span>
        <span class="pick-name">${esc(fullName(c))}</span>${icon.right(18)}</button>`
    )
    .join('');
}

on('click', 'newSession', () => {
  ui.pickQ = '';
  const onToday = location.hash.startsWith('#/today') || location.hash === '' || location.hash === '#/';
  const day = onToday ? selectedDay() : todayISO();
  ui.pickDate = day < todayISO() ? todayISO() : day;
  app.modal(
    `<div class="modal-head"><h2>New session · ${esc(relDay(ui.pickDate))}</h2><button type="button" class="btn-icon" data-act="closeModal" aria-label="Close">${icon.x(18)}</button></div>
     <label class="search">${icon.search(18)}<input type="search" placeholder="Search clients" aria-label="Search clients" data-input="pickQ" autocomplete="off"></label>
     <div id="pick-list" class="pick-list">${pickerList()}</div>
     <a class="btn btn-outline wide" href="#/clients/new">${icon.plus(16)}New client</a>`,
    'Choose a client'
  );
});

on('input', 'pickQ', (el) => {
  ui.pickQ = el.value;
  document.getElementById('pick-list').innerHTML = pickerList();
});

on('click', 'pickClient', (el) => {
  const id = el.dataset.id;
  const s = createSession(id, ui.pickDate, suggestTime(id, ui.pickDate));
  app.closeModal();
  app.go('#/session/' + s.id);
});
