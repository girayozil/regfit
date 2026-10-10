// Session editor: when/what, start from scratch or copy a previous session,
// exercise rows with dropdowns, and logging the session as done.

import { esc, icon, on, app, uid, fullName, initials, tint, relDay, fmtShort, todayISO, isTimed, parseNum, select, opt, minToTime } from '../util.js';
import { db, sessionById, clientById, sessionsFor, sessionNumber, exById, lastFor, bestFor, personalBests, copyItems, deleteSession, save, REGION_NAME } from '../store.js';
import { sessionStatus } from './today.js';

const TIMES = Array.from({ length: (22 - 5) * 4 + 1 }, (_, i) => minToTime(5 * 60 + i * 15));
const DURATIONS = [30, 45, 60, 75, 90, 120];
const SETS = Array.from({ length: 10 }, (_, i) => i + 1);
const REPS = [...Array.from({ length: 30 }, (_, i) => i + 1), 35, 40, 50];
const TIMED = ['15s', '20s', '30s', '45s', '60s', '75s', '90s', '120s'];

const ui = { copySrc: {} };

function exerciseOptions(selected) {
  const groups = ['Upper', 'Lower', 'Core']
    .map((r) => {
      const list = db.exercises.filter((e) => e.region === r).sort((a, b) => a.name.localeCompare(b.name));
      return `<optgroup label="${REGION_NAME[r]}">${list.map((e) => opt(e.id, e.name, selected)).join('')}</optgroup>`;
    })
    .join('');
  const missing = selected && !exById(selected) ? opt(selected, 'Deleted exercise', selected) : '';
  return `<option value="" disabled${selected ? '' : ' selected'}>Choose exercise</option>${missing}${groups}`;
}

function repsOptions(selected, timedFirst) {
  const nums = `<optgroup label="Reps">${REPS.map((r) => opt(r, r, selected)).join('')}</optgroup>`;
  const timed = `<optgroup label="Timed">${TIMED.map((t) => opt(t, parseInt(t, 10) + ' s', selected)).join('')}</optgroup>`;
  return timedFirst ? timed + nums : nums + timed;
}

const summaryText = (s) => {
  const sets = s.items.reduce((n, it) => n + (+it.sets || 0), 0);
  return `${s.items.length} exercise${s.items.length === 1 ? '' : 's'} · ${sets} sets`;
};

function itemRow(s, it, i, n) {
  const ex = exById(it.exId);
  const tracking = ex ? ex.tracking : 'Weight × reps';
  const last = it.exId ? lastFor(s, it.exId) : null;
  const best = it.exId ? bestFor(s.clientId, it.exId) : null;
  const hint = !it.exId ? 'Pick an exercise' : last ? 'Last ' + last.display : 'First time';
  const d = `data-item="${it.id}"`;
  return `<div class="item-row">
    <span class="item-num">${i + 1}</span>
    <label class="item-ex"><span class="mini-label">Exercise</span>${select(`aria-label="Exercise ${i + 1}" data-change="itemEx" ${d}`, exerciseOptions(it.exId))}</label>
    <label class="item-sets"><span class="mini-label">Sets</span>${select(`aria-label="Sets" data-change="itemField" data-f="sets" ${d}`, SETS.map((v) => opt(v, v, it.sets)).join(''))}</label>
    <label class="item-reps"><span class="mini-label">${tracking === 'Time' ? 'Time' : 'Reps'}</span>${select(`aria-label="Reps" data-change="itemField" data-f="reps" ${d}`, repsOptions(it.reps, tracking === 'Time'))}</label>
    <label class="item-weight"><span class="mini-label">Weight</span><span class="unit-wrap"><input class="field" inputmode="decimal" enterkeyhint="next" aria-label="Weight in kg" placeholder="${tracking === 'Weight × reps' ? '0' : 'BW'}" value="${esc(it.weight)}" data-change="itemWeight" ${d}><span class="unit">kg</span></span></label>
    <span class="item-hint"><span>${esc(hint)}</span>${best ? `<strong>Best ${esc(best)}</strong>` : ''}</span>
    <span class="item-actions">
      <button type="button" class="btn-icon sm" data-act="moveItem" data-dir="-1" ${d} aria-label="Move up"${i === 0 ? ' disabled' : ''}>${icon.up(16)}</button>
      <button type="button" class="btn-icon sm" data-act="moveItem" data-dir="1" ${d} aria-label="Move down"${i === n - 1 ? ' disabled' : ''}>${icon.down(16)}</button>
      <button type="button" class="btn-icon sm" data-act="removeItem" ${d} aria-label="Remove exercise">${icon.x(16)}</button>
    </span>
  </div>`;
}

export function render(id) {
  const s = sessionById(id);
  if (!s) return `<div class="empty-state"><h1 class="page-title">Session not found</h1><a class="btn btn-dark" href="#/today">Back to Today</a></div>`;
  const c = clientById(s.clientId) || { id: '', first: 'Unknown', last: '' };
  const st = sessionStatus(s, null);
  const others = sessionsFor(s.clientId)
    .filter((x) => x.id !== s.id && x.items.length)
    .sort((a, b) => (a.status === b.status ? (b.date + b.time).localeCompare(a.date + a.time) : a.status === 'done' ? -1 : 1));
  // Default copy source: latest session with the same focus, else the latest one.
  const sameFocus = s.focus && others.find((o) => o.focus && o.focus.toLowerCase() === s.focus.toLowerCase());
  const copySrc = ui.copySrc[s.id] || (sameFocus || others[0] || {}).id;
  const choosing = s.status === 'planned' && !s.started && !s.items.length;
  const isDone = s.status === 'done';

  const times = TIMES.includes(s.time) ? TIMES : [...TIMES, s.time].sort();
  const when = `<section class="card when" aria-label="When">
    <label class="field-label">Date<input class="field" type="date" value="${s.date}" data-change="sessionField" data-f="date" data-id="${s.id}"></label>
    <label class="field-label">Start time${select(`data-change="sessionField" data-f="time" data-id="${s.id}"`, times.map((t) => opt(t, t, s.time)).join(''))}</label>
    <label class="field-label">Duration${select(`data-change="sessionField" data-f="duration" data-id="${s.id}"`, DURATIONS.map((d) => opt(d, d + ' min', s.duration || 60)).join(''))}</label>
    <label class="field-label">Focus<input class="field" value="${esc(s.focus)}" placeholder="e.g. Upper body" data-input="sessionFocus" data-id="${s.id}" autocapitalize="sentences"></label>
  </section>`;

  const choice = `<section class="choose" aria-label="How do you want to start?">
    <h2 class="section-title">How do you want to start?</h2>
    <div class="choice-grid">
      <button type="button" class="choice" data-act="startScratch" data-id="${s.id}">
        <span class="choice-icon">${icon.blank(22)}</span>
        <span class="choice-title">Start from scratch</span>
        <span class="choice-text">An empty session. Add exercises one at a time from the library.</span>
        <span class="choice-go">Start empty ${icon.arrow(16)}</span>
      </button>
      <div class="choice choice-dark">
        <span class="choice-icon accent">${icon.copy(22)}</span>
        <span class="choice-title">Copy previous session</span>
        ${
          others.length
            ? `<label class="field-label on-dark">Session to copy${select(`data-change="copySrc" data-id="${s.id}"`, others.map((o) => opt(o.id, fmtShort(o.date) + ' · ' + (o.focus || 'Session') + ' (' + o.items.length + ')' + (o.status === 'planned' ? ' · planned' : ''), copySrc)).join(''))}</label>
               <button type="button" class="btn btn-accent wide" data-act="startCopy" data-id="${s.id}">Copy exercises &amp; weights</button>`
            : `<span class="choice-text">${esc(c.first)} has no previous sessions yet. Start from scratch for the first one.</span>`
        }
      </div>
    </div>
  </section>`;

  const builder = `<section class="card exercises" aria-label="Exercises">
    <div class="card-head">
      <h2>Exercises</h2>
      ${!isDone ? `<span class="pill pill-soft">${s.copiedFrom ? 'Copied from ' + esc(s.copiedFrom) : 'Started from scratch'}</span>` : ''}
      ${!isDone ? `<button type="button" class="btn btn-sm btn-ghost" data-act="changeStart" data-id="${s.id}">Change start</button>` : ''}
    </div>
    <div class="item-head" aria-hidden="true"><span>#</span><span>Exercise</span><span>Sets</span><span>Reps</span><span>Weight</span><span>Last · Best</span><span></span></div>
    <div class="item-list" data-session="${s.id}">
      ${s.items.length ? s.items.map((it, i) => itemRow(s, it, i, s.items.length)).join('') : `<div class="empty-inline">No exercises yet. Add the first one below.</div>`}
    </div>
    <button type="button" class="add-row" data-act="addItem" data-id="${s.id}">${icon.plus(18)}Add exercise</button>
  </section>`;

  const footer = choosing
    ? ''
    : `<div class="action-bar">
        <span class="action-summary" id="session-summary">${summaryText(s)}</span>
        ${
          isDone
            ? `<button type="button" class="btn btn-outline-dark" data-act="reopenSession" data-id="${s.id}">Reopen</button>
               <a class="btn btn-accent" href="#/client/${c.id}">${icon.check(16)}Done</a>`
            : `<button type="button" class="btn-icon dark" data-act="deleteSession" data-id="${s.id}" aria-label="Delete session">${icon.trash(18)}</button>
               <button type="button" class="btn btn-accent" data-act="completeSession" data-id="${s.id}">${icon.check(16)}Mark as done</button>`
        }
      </div>`;

  return `
  <a class="back" href="#/client/${c.id}">${icon.left(16)}${esc(fullName(c))}</a>
  <header class="page-head">
    <div class="session-title">
      <span class="avatar avatar-lg" style="background:${tint(c.id)}">${esc(initials(c))}</span>
      <div>
        <h1 class="page-title">${esc(relDay(s.date))} · ${esc(s.time)}</h1>
        <div class="muted small">${esc(fullName(c))} · session ${sessionNumber(s)}</div>
      </div>
    </div>
    <span class="pill pill-${st.key} pill-lg">${st.label}</span>
  </header>
  ${when}
  ${choosing ? choice : builder}
  ${footer}`;
}

// ---------- handlers ----------

const sessionOf = (el) => sessionById(el.dataset.id || el.closest('[data-session]').dataset.session);
const itemOf = (el) => {
  const s = sessionOf(el);
  return { s, it: s.items.find((x) => x.id === el.dataset.item) };
};

on('change', 'sessionField', (el) => {
  const s = sessionOf(el);
  const f = el.dataset.f;
  if (f === 'date' && !el.value) return;
  s[f] = f === 'duration' ? +el.value : el.value;
  save();
  app.rerender();
});

on('input', 'sessionFocus', (el) => {
  sessionOf(el).focus = el.value;
  save();
});

on('change', 'copySrc', (el) => {
  ui.copySrc[el.dataset.id] = el.value;
});

on('click', 'startScratch', (el) => {
  const s = sessionOf(el);
  s.started = true;
  s.copiedFrom = null;
  s.items = [{ id: uid('it'), exId: '', sets: 3, reps: 10, weight: '' }];
  save();
  app.rerender();
});

on('click', 'startCopy', (el) => {
  const s = sessionOf(el);
  const sel = document.querySelector('[data-change="copySrc"]');
  const src = sessionById(sel ? sel.value : ui.copySrc[s.id]);
  if (!src) return;
  s.items = copyItems(src);
  s.started = true;
  s.copiedFrom = fmtShort(src.date) + (src.focus ? ' · ' + src.focus : '');
  if (!s.focus) s.focus = src.focus;
  save();
  app.toast(`Copied ${src.items.length} exercises`);
  app.rerender();
});

on('click', 'changeStart', (el) => {
  const s = sessionOf(el);
  if (s.items.some((it) => it.exId) && !confirm('Clear the exercises in this session and choose how to start again?')) return;
  s.items = [];
  s.started = false;
  s.copiedFrom = null;
  save();
  app.rerender();
});

on('click', 'addItem', (el) => {
  const s = sessionOf(el);
  s.items.push({ id: uid('it'), exId: '', sets: 3, reps: 10, weight: '' });
  save();
  app.rerender();
  const rows = document.querySelectorAll('.item-row');
  const lastRow = rows[rows.length - 1];
  if (lastRow) lastRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
});

on('change', 'itemEx', (el) => {
  const { s, it } = itemOf(el);
  it.exId = el.value;
  const ex = exById(it.exId);
  if (ex && ex.tracking === 'Time' && !isTimed(it.reps)) it.reps = '60s';
  if (ex && ex.tracking !== 'Time' && isTimed(it.reps)) it.reps = 10;
  // Pre-fill weight from last time if the row has none yet.
  if (it.weight === '' && ex) {
    const prev = [...sessionsFor(s.clientId)].reverse().find((x) => x.id !== s.id && x.status === 'done' && x.items.some((i) => i.exId === ex.id));
    if (prev) {
      const p = prev.items.find((i) => i.exId === ex.id);
      it.weight = p.weight;
      it.sets = p.sets;
      it.reps = p.reps;
    }
  }
  save();
  app.rerender();
});

on('change', 'itemField', (el) => {
  const { s, it } = itemOf(el);
  it[el.dataset.f] = el.dataset.f === 'sets' ? +el.value : isTimed(el.value) ? el.value : +el.value;
  save();
  const sum = document.getElementById('session-summary');
  if (sum) sum.textContent = summaryText(s);
});

on('change', 'itemWeight', (el) => {
  const { it } = itemOf(el);
  it.weight = parseNum(el.value);
  el.value = it.weight;
  save();
});

on('click', 'moveItem', (el) => {
  const { s, it } = itemOf(el);
  const i = s.items.indexOf(it);
  const j = i + +el.dataset.dir;
  if (j < 0 || j >= s.items.length) return;
  [s.items[i], s.items[j]] = [s.items[j], s.items[i]];
  save();
  app.rerender();
});

on('click', 'removeItem', (el) => {
  const { s, it } = itemOf(el);
  s.items = s.items.filter((x) => x !== it);
  save();
  app.rerender();
});

on('click', 'completeSession', (el) => {
  const s = sessionOf(el);
  const valid = s.items.filter((it) => it.exId);
  if (!valid.length) {
    app.toast('Add at least one exercise first');
    return;
  }
  if (s.date > todayISO() && !confirm(`This session is on ${fmtShort(s.date)}. Mark it as done anyway?`)) return;
  const before = personalBests(s.clientId);
  s.items = valid;
  s.status = 'done';
  s.started = true;
  save();
  const after = personalBests(s.clientId);
  const newPbs = after.filter((p) => {
    const b = before.find((x) => x.exId === p.exId);
    return !b || b.display !== p.display;
  }).length;
  app.toast(newPbs ? `Logged · ${newPbs} new personal best${newPbs === 1 ? '' : 's'}` : 'Session logged');
  app.rerender();
});

on('click', 'reopenSession', (el) => {
  sessionOf(el).status = 'planned';
  save();
  app.rerender();
});

on('click', 'deleteSession', (el) => {
  const s = sessionOf(el);
  if (!confirm('Delete this session?')) return;
  deleteSession(s.id);
  app.toast('Session deleted');
  app.go('#/client/' + s.clientId);
});
