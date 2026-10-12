// Session editor: when/what, start from scratch or copy a previous session,
// exercise rows with dropdowns, and logging the session as done.

import { esc, icon, on, app, uid, fullName, initials, tint, relDay, fmtShort, todayISO, isTimed, parseNum, select, opt, minToTime } from '../util.js';
import { db, sessionById, clientById, sessionsFor, sessionNumber, exById, exName, lastFor, bestFor, personalBests, copyItems, deleteSession, save, PB_CATEGORIES, normalizeGroups, blocksOf, groupLabels, isUniform, itemParts, totalSets, newSets, trackingOf } from '../store.js';
import { sessionStatus } from './today.js';
import { openPicker } from './expicker.js';

const TIMES = Array.from({ length: (22 - 5) * 4 + 1 }, (_, i) => minToTime(5 * 60 + i * 15));
const DURATIONS = [30, 45, 60, 75, 90, 120];
const SETS = Array.from({ length: 10 }, (_, i) => i + 1);
const REPS = [...Array.from({ length: 30 }, (_, i) => i + 1), 35, 40, 50];
const TIMED = ['15s', '20s', '30s', '45s', '60s', '75s', '90s', '120s'];

const ui = { copySrc: {}, openSets: new Set() }; // openSets: items showing the set-by-set editor

function repsOptions(selected, timedFirst) {
  const nums = `<optgroup label="Reps">${REPS.map((r) => opt(r, r, selected)).join('')}</optgroup>`;
  const timed = `<optgroup label="Timed">${TIMED.map((t) => opt(t, parseInt(t, 10) + ' s', selected)).join('')}</optgroup>`;
  return timedFirst ? timed + nums : nums + timed;
}

const summaryText = (s) => `${s.items.length} exercise${s.items.length === 1 ? '' : 's'} · ${totalSets(s.items)} sets`;

const weightInput = (attrs, value, tracking, label) =>
  `<span class="unit-wrap"><input class="field" inputmode="decimal" enterkeyhint="next" aria-label="${label}" placeholder="${tracking === 'Weight × reps' ? '0' : 'BW'}" value="${esc(value)}" ${attrs}><span class="unit">kg</span></span>`;

// Set-by-set editor shown under an exercise row.
function setPanel(it, d, tracking, last) {
  const rows = it.sets
    .map(
      (set, i) => `<div class="set-row">
        <span class="set-num">Set ${i + 1}</span>
        ${select(`aria-label="Set ${i + 1} ${tracking === 'Time' ? 'time' : 'reps'}" data-change="setField" data-i="${i}" ${d}`, repsOptions(set.reps, tracking === 'Time'))}
        ${weightInput(`data-change="setWeight" data-i="${i}" ${d}`, set.weight, tracking, 'Set ' + (i + 1) + ' weight in kg')}
        <button type="button" class="btn-icon sm" data-act="removeSet" data-i="${i}" ${d} aria-label="Remove set ${i + 1}"${it.sets.length === 1 ? ' disabled' : ''}>${icon.x(16)}</button>
      </div>`
    )
    .join('');
  return `<div class="set-panel">
    <div class="set-head" aria-hidden="true"><span></span><span>${tracking === 'Time' ? 'Time' : 'Reps'}</span><span>Weight</span><span></span></div>
    ${rows}
    <div class="set-foot">
      <button type="button" class="btn btn-sm btn-outline" data-act="addSet" ${d}>${icon.plus(14)}Add set</button>
      ${last ? `<span class="muted small">Last time: ${esc(last.display)}</span>` : ''}
    </div>
  </div>`;
}

// label: superset label like 'A1' (or undefined); next: the exercise below, for the link button.
function itemRow(s, it, i, label, next) {
  const tracking = trackingOf(it.exId);
  const last = it.exId ? lastFor(s, it.exId) : null;
  const best = it.exId ? bestFor(s.clientId, it.exId) : null;
  // Compact "last time" for the row; the set-by-set panel shows every set in full.
  const lastShort = last && (isUniform(last.item) ? last.display : (({ work, load }) => (load === '—' ? work : load + ' × ' + work))(itemParts(last.item)));
  const hint = !it.exId ? 'Pick an exercise' : last ? 'Last ' + lastShort : 'First time';
  const d = `data-item="${it.id}"`;
  const open = ui.openSets.has(it.id);
  const uniform = isUniform(it);
  const first = it.sets[0];
  const count = it.sets.length;
  const setOpts = [...new Set([...SETS, count])].sort((a, b) => a - b);

  // Same reps & weight for every set: quick dropdowns. Otherwise (or while editing set by set): a summary.
  let middle;
  if (uniform && !open) {
    middle = `<label class="item-reps"><span class="mini-label">${tracking === 'Time' ? 'Time' : 'Reps'}</span>${select(`aria-label="Reps" data-change="itemReps" ${d}`, repsOptions(first.reps, tracking === 'Time'))}</label>
    <label class="item-weight"><span class="mini-label">Weight</span>${weightInput(`data-change="itemWeight" ${d}`, first.weight, tracking, 'Weight in kg')}</label>`;
  } else {
    const { work, load } = itemParts(it);
    middle = `<button type="button" class="item-mixed${open ? ' is-open' : ''}" data-act="toggleSets" ${d} aria-expanded="${open}">
      ${open ? '<span>Set by set</span>' : `<span><strong>${esc(work)}</strong>${tracking === 'Time' ? '' : ' reps'}</span><span><strong>${esc(load)}</strong></span>`}
      ${open ? icon.up(16) : icon.down(16)}
    </button>`;
  }

  const exLabel = it.exId ? exName(it.exId) : 'exercise ' + (i + 1);
  return `<div class="item-row${open ? ' has-panel' : ''}" data-row="${it.id}">
    <button type="button" class="drag-handle" data-drag ${d} aria-label="Reorder ${esc(exLabel)}: drag, or use the arrow keys" title="Drag to reorder">${icon.grip(18)}</button>
    <div class="item-ex"><button type="button" class="ex-picker${it.exId ? '' : ' empty'}" data-act="openExPicker" ${d} aria-haspopup="dialog" aria-label="Exercise ${i + 1}: ${esc(it.exId ? exName(it.exId) : 'choose')}">${label ? `<span class="ss-label">${label}</span>` : ''}<span class="ex-name">${esc(it.exId ? exName(it.exId) : 'Choose exercise')}</span>${icon.search(16)}</button></div>
    <label class="item-sets"><span class="mini-label">Sets</span>${select(`aria-label="Sets" data-change="itemSets" ${d}`, setOpts.map((v) => opt(v, v, count)).join(''))}</label>
    ${middle}
    <div class="item-foot">
      <span class="item-hint"><span>${esc(hint)}</span>${best ? `<strong>Best ${esc(best)}</strong>` : ''}</span>
      <span class="item-actions">
        <button type="button" class="btn-icon sm${open ? ' on' : ''}" data-act="toggleSets" ${d} aria-label="Edit sets one by one" aria-pressed="${open}">${icon.list(16)}</button>
        <button type="button" class="btn-icon sm${it.note ? ' has-note' : ''}" data-act="toggleNote" ${d} aria-label="${it.note ? 'Edit note' : 'Add a note'}">${icon.note(16)}</button>
        <button type="button" class="btn-icon sm" data-act="removeItem" ${d} aria-label="Remove exercise">${icon.x(16)}</button>
      </span>
    </div>
    ${it.note ? `<button type="button" class="item-note" data-act="toggleNote" ${d} aria-label="Edit note">${esc(it.note)}</button>` : ''}
    ${open ? setPanel(it, d, tracking, last) : ''}
    ${next ? linkButton(it, next) : ''}
  </div>`;
}

// Chain button on the line between two exercises: links them into a superset, or unlinks.
function linkButton(a, b) {
  const linked = !!a.group && a.group === b.group;
  const names = `${a.exId ? exName(a.exId) : 'this exercise'} and ${b.exId ? exName(b.exId) : 'the next one'}`;
  return `<button type="button" class="link-btn${linked ? ' on' : ''}" data-act="toggleLink" data-a="${a.id}" data-b="${b.id}" aria-pressed="${linked}" aria-label="${linked ? 'Unlink ' + esc(names) : 'Superset ' + esc(names)}" title="${linked ? 'Unlink superset' : 'Make a superset'}">${icon.link(15)}</button>`;
}

// Exercises in order; supersets are wrapped in a block with a header and their own drag handle.
function itemsHtml(s) {
  const labels = groupLabels(s.items);
  let i = 0;
  return blocksOf(s.items)
    .map((block) => {
      const rows = block.map((it) => itemRow(s, it, i, labels[it.id], s.items[++i])).join('');
      if (block.length < 2) return rows;
      const letter = labels[block[0].id][0];
      const rounds = Math.max(...block.map((it) => it.sets.length));
      return `<div class="ss-group" data-group="${block[0].group}">
        <div class="ss-head">
          <button type="button" class="drag-handle" data-drag data-group="${block[0].group}" aria-label="Reorder superset ${letter}: drag, or use the arrow keys" title="Drag to reorder">${icon.grip(18)}</button>
          <span>Superset ${letter} · ${block.length} exercises · ${rounds} round${rounds === 1 ? '' : 's'}</span>
        </div>
        ${rows}
      </div>`;
    })
    .join('');
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
      ${!isDone ? `<button type="button" class="btn btn-sm btn-ghost" data-act="changeStart" data-id="${s.id}">Start over</button>` : ''}
    </div>
    <div class="item-head" aria-hidden="true"><span></span><span>Exercise</span><span>Sets</span><span>Reps</span><span>Weight</span><span>Last · Best</span><span></span></div>
    <div class="item-list" data-session="${s.id}">
      ${s.items.length ? itemsHtml(s) : `<div class="empty-inline">No exercises yet. Add the first one below.</div>`}
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
  s.items = [{ id: uid('it'), exId: '', sets: newSets() }];
  save();
  app.rerender();
  pickFor(s, s.items[0]);
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
  if (s.items.some((it) => it.exId) && !confirm('Start over? This removes all exercises from this session.')) return;
  s.items = [];
  s.started = false;
  s.copiedFrom = null;
  save();
  app.rerender();
});

// Add a row and go straight to choosing its exercise.
on('click', 'addItem', (el) => {
  const s = sessionOf(el);
  const it = { id: uid('it'), exId: '', sets: newSets() };
  s.items.push(it);
  save();
  app.rerender();
  pickFor(s, it);
});

// Open the search-as-you-type picker for one row.
function pickFor(s, it) {
  const c = clientById(s.clientId);
  openPicker({
    clientId: s.clientId,
    current: it.exId,
    title: it.exId ? 'Change exercise' : 'Add exercise' + (c ? ' for ' + c.first : ''),
    onPick: (exId) => {
      setExercise(s, it, exId);
      const row = document.querySelector(`.item-row[data-row="${it.id}"]`);
      if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
  });
}

on('click', 'openExPicker', (el) => {
  const { s, it } = itemOf(el);
  pickFor(s, it);
});

function setExercise(s, it, exId) {
  it.exId = exId;
  const ex = exById(it.exId);
  // Keep reps sensible for the exercise's tracking mode.
  it.sets.forEach((set) => {
    if (ex && ex.tracking === 'Time' && !isTimed(set.reps)) set.reps = '60s';
    if (ex && ex.tracking !== 'Time' && isTimed(set.reps)) set.reps = 10;
  });
  // No weights entered yet: start from what they did last time.
  if (ex && it.sets.every((set) => set.weight === '')) {
    const prev = [...sessionsFor(s.clientId)].reverse().find((x) => x.id !== s.id && x.status === 'done' && x.items.some((i) => i.exId === ex.id));
    if (prev) it.sets = prev.items.find((i) => i.exId === ex.id).sets.map((set) => ({ ...set }));
  }
  save();
  app.rerender();
}

const repsValue = (v) => (isTimed(v) ? v : +v);
const updateSummary = (s) => {
  const sum = document.getElementById('session-summary');
  if (sum) sum.textContent = summaryText(s);
};

// Number of sets: add copies of the last set, or drop from the end.
on('change', 'itemSets', (el) => {
  const { it } = itemOf(el);
  const n = +el.value;
  const lastSet = it.sets[it.sets.length - 1] || { reps: 10, weight: '' };
  while (it.sets.length < n) it.sets.push({ ...lastSet });
  it.sets.length = n;
  save();
  app.rerender();
});

// Quick controls apply to every set (only shown while all sets are the same).
on('change', 'itemReps', (el) => {
  const { s, it } = itemOf(el);
  it.sets.forEach((set) => (set.reps = repsValue(el.value)));
  save();
  updateSummary(s);
});
on('change', 'itemWeight', (el) => {
  const { it } = itemOf(el);
  const w = parseNum(el.value);
  it.sets.forEach((set) => (set.weight = w));
  el.value = w;
  save();
});

// Set-by-set editor. Field edits don't re-render, so moving between inputs keeps the keyboard up.
on('click', 'toggleSets', (el) => {
  const id = el.dataset.item;
  if (ui.openSets.has(id)) ui.openSets.delete(id);
  else ui.openSets.add(id);
  app.rerender();
});
on('change', 'setField', (el) => {
  const { s, it } = itemOf(el);
  it.sets[+el.dataset.i].reps = repsValue(el.value);
  save();
  updateSummary(s);
});
on('change', 'setWeight', (el) => {
  const { it } = itemOf(el);
  const w = parseNum(el.value);
  it.sets[+el.dataset.i].weight = w;
  el.value = w;
  save();
});
on('click', 'addSet', (el) => {
  const { it } = itemOf(el);
  it.sets.push({ ...(it.sets[it.sets.length - 1] || { reps: 10, weight: '' }) });
  save();
  app.rerender();
});
on('click', 'removeSet', (el) => {
  const { it } = itemOf(el);
  if (it.sets.length > 1) it.sets.splice(+el.dataset.i, 1);
  save();
  app.rerender();
});

// ---------- notes ----------
// Edited in a small panel pinned to the top of the screen, so the phone keyboard never covers it.
// Changes only count once saved; Discard (or closing the panel) leaves the note as it was.

const editingNote = {};

on('click', 'toggleNote', (el) => {
  const { s, it } = itemOf(el);
  editingNote.session = s.id;
  editingNote.item = it.id;
  app.modal(
    `<div class="modal-head"><h2>Note · ${esc(it.exId ? exName(it.exId) : 'Exercise')}</h2></div>
     <textarea class="field note-input" rows="4" placeholder="Note" aria-label="Note">${esc(it.note || '')}</textarea>
     <div class="note-actions">
       <button type="button" class="btn btn-outline" data-act="discardNote">${icon.x(16)}Discard</button>
       <button type="button" class="btn btn-dark" data-act="saveNote">${icon.check(16)}Save</button>
     </div>`,
    'Exercise note',
    false,
    'sheet-top'
  );
  // Focus inside the tap itself, or iOS won't open the keyboard.
  const box = document.querySelector('.note-input');
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
});

on('click', 'saveNote', () => {
  const s = sessionById(editingNote.session);
  const it = s && s.items.find((x) => x.id === editingNote.item);
  const box = document.querySelector('.note-input');
  if (it && box) {
    const text = box.value.trim();
    if (text) it.note = text;
    else delete it.note;
    save();
  }
  app.closeModal();
  app.rerender();
});

on('click', 'discardNote', () => app.closeModal());

// ---------- drag to reorder ----------
// Only the handle starts a drag. With a mouse it starts straight away; on touch screens it needs
// a long press (like iOS lists), so a thumb that lands on the handle while scrolling just scrolls.

const LONG_PRESS_MS = 400;
const MOVE_TOLERANCE = 8; // px a finger may wander during the press before it counts as a scroll

// Order of every exercise as currently shown (supersets included).
const rowIds = (root) => [...root.querySelectorAll('.item-row')].map((r) => r.dataset.row);
let drag = null;
let press = null; // touch waiting for the long press

// Inside a superset, rows move among themselves; at the top level, single exercises and whole
// supersets move as blocks.
const siblingsOf = (el, list) => [...list.querySelectorAll(list.classList.contains('ss-group') ? ':scope > .item-row' : ':scope > .item-row, :scope > .ss-group')];

function positionDrag() {
  const { el, list, grab, y } = drag;
  el.style.transform = '';
  // Swap with neighbours while the finger/pointer passes their middle (follows the finger,
  // whatever the dragged element's height).
  for (let moved = true; moved; ) {
    moved = false;
    const all = siblingsOf(el, list);
    const i = all.indexOf(el);
    const prev = all[i - 1];
    const next = all[i + 1];
    if (prev && y < prev.getBoundingClientRect().top + prev.offsetHeight / 2) {
      list.insertBefore(el, prev);
      moved = true;
    } else if (next && y > next.getBoundingClientRect().top + next.offsetHeight / 2) {
      list.insertBefore(next, el);
      moved = true;
    }
  }
  el.style.transform = `translateY(${y - grab - el.getBoundingClientRect().top}px)`;
}

function dragFrame() {
  if (!drag) return;
  // Scroll when held near the top or bottom of the screen.
  const edge = 90;
  const bottom = window.innerHeight - 150;
  if (drag.y < edge) window.scrollBy(0, -Math.ceil((edge - drag.y) / 6));
  else if (drag.y > bottom) window.scrollBy(0, Math.ceil((drag.y - bottom) / 6));
  positionDrag();
  drag.raf = requestAnimationFrame(dragFrame);
}

function startDrag(handle, pointerId, startY, y) {
  const el = handle.dataset.group ? handle.closest('.ss-group') : handle.closest('.item-row');
  if (!el || !el.isConnected) return;
  const list = el.parentElement;
  const root = el.closest('.item-list');
  try {
    handle.setPointerCapture(pointerId);
  } catch (err) {
    /* capture is a nicety; moves are tracked on the document anyway */
  }
  drag = { handle, el, list, root, grab: startY - el.getBoundingClientRect().top, y, before: rowIds(root).join() };
  el.classList.add('dragging');
  document.body.classList.add('is-dragging');
  if (navigator.vibrate) navigator.vibrate(10); // a small buzz where supported (Android)
  drag.raf = requestAnimationFrame(dragFrame);
}

const cancelPress = () => {
  if (!press) return;
  clearTimeout(press.timer);
  press.handle.classList.remove('pressing');
  press = null;
};

document.addEventListener('pointerdown', (e) => {
  const handle = e.target.closest('[data-drag]');
  if (!handle || e.button > 0) return;
  if (e.pointerType === 'mouse') {
    e.preventDefault();
    startDrag(handle, e.pointerId, e.clientY, e.clientY);
    return;
  }
  cancelPress();
  press = { handle, id: e.pointerId, x: e.clientX, y: e.clientY, lastY: e.clientY };
  handle.classList.add('pressing');
  press.timer = setTimeout(() => {
    const p = press;
    cancelPress();
    if (p) startDrag(p.handle, p.id, p.y, p.lastY);
  }, LONG_PRESS_MS);
});
document.addEventListener('pointermove', (e) => {
  if (press && e.pointerId === press.id) {
    press.lastY = e.clientY;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE) cancelPress(); // it's a scroll
    return;
  }
  if (!drag) return;
  drag.y = e.clientY;
  positionDrag();
});
// Once a row is lifted, stop the page from scrolling under the finger.
document.addEventListener(
  'touchmove',
  (e) => {
    if (drag) e.preventDefault();
  },
  { passive: false }
);
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest && e.target.closest('[data-drag]')) e.preventDefault();
});
const endDrag = () => {
  cancelPress();
  if (!drag) return;
  const { el, root, before } = drag;
  cancelAnimationFrame(drag.raf);
  drag = null;
  el.style.transform = '';
  el.classList.remove('dragging');
  document.body.classList.remove('is-dragging');
  const order = rowIds(root);
  if (order.join() === before) return;
  const s = sessionById(root.dataset.session);
  s.items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  save();
  app.rerender();
};
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

// Keyboard: arrow keys on a focused handle move the exercise (within its superset) or the
// whole superset (its header handle) past the neighbouring block.
document.addEventListener('keydown', (e) => {
  const handle = e.target.closest && e.target.closest('[data-drag]');
  if (!handle || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  const dir = e.key === 'ArrowUp' ? -1 : 1;
  const s = sessionById(handle.closest('[data-session]').dataset.session);
  const blocks = blocksOf(s.items);
  const g = handle.dataset.group;
  const it = g ? null : s.items.find((x) => x.id === handle.dataset.item);
  const bi = blocks.findIndex((b) => (g ? b[0].group === g : b.includes(it)));
  const block = blocks[bi];
  if (it && block.length > 1) {
    const k = block.indexOf(it);
    if (!block[k + dir]) return;
    [block[k], block[k + dir]] = [block[k + dir], block[k]];
  } else {
    if (!blocks[bi + dir]) return;
    [blocks[bi], blocks[bi + dir]] = [blocks[bi + dir], blocks[bi]];
  }
  s.items = blocks.flat();
  save();
  app.rerender();
  const again = document.querySelector(g ? `[data-drag][data-group="${g}"]` : `[data-drag][data-item="${it.id}"]`);
  if (again) again.focus();
});

// Link two neighbouring exercises into a superset (joining any superset either is in), or split.
on('click', 'toggleLink', (el) => {
  const s = sessionById(el.closest('[data-session]').dataset.session);
  const a = s.items.find((x) => x.id === el.dataset.a);
  const b = s.items.find((x) => x.id === el.dataset.b);
  if (a.group && a.group === b.group) {
    const fresh = uid('g');
    for (let k = s.items.indexOf(b); k < s.items.length && s.items[k].group === a.group; k++) s.items[k].group = fresh;
  } else {
    const g = a.group || b.group || uid('g');
    const old = b.group && b.group !== g ? b.group : null;
    a.group = b.group = g;
    if (old) s.items.forEach((x) => x.group === old && (x.group = g));
  }
  normalizeGroups(s.items);
  save();
  app.rerender();
});

on('click', 'removeItem', (el) => {
  const { s, it } = itemOf(el);
  s.items = normalizeGroups(s.items.filter((x) => x !== it));
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
  // Exercises with a new record in any category (heaviest, best set, best session).
  const newPbs = after.filter((p) => {
    const b = before.find((x) => x.exId === p.exId);
    return PB_CATEGORIES.some(({ key }) => p[key] && (!b || !b[key] || b[key].display !== p[key].display));
  }).length;
  app.toast(newPbs ? `Logged · personal bests in ${newPbs} exercise${newPbs === 1 ? '' : 's'}` : 'Session logged');
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
