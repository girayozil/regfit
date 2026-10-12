// Exercise picker: search as you type. Opens in a panel (pinned to the top on phones so the
// keyboard never covers it). Empty search shows this client's recent exercises, then the
// library by region; typing ranks name matches first, then muscle / equipment matches.

import { esc, icon, on, app } from '../util.js';
import { db, doneFor, REGION_NAME } from '../store.js';

const st = { onPick: null, clientId: null, current: '', results: [], active: 0 };

// Lower-case, accents removed, so "şınav" finds "sinav" and "pull up" finds "Pull-Up".
const norm = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function recentFor(clientId) {
  const seen = [];
  const done = doneFor(clientId);
  for (let i = done.length - 1; i >= 0 && seen.length < 6; i--) {
    done[i].items.forEach((it) => {
      if (it.exId && !seen.includes(it.exId) && seen.length < 6 && db.exercises.some((e) => e.id === it.exId)) seen.push(it.exId);
    });
  }
  return seen.map((id) => db.exercises.find((e) => e.id === id));
}

// Score how well an exercise matches the query (higher is better, 0 = no match).
function score(e, q) {
  const name = norm(e.name);
  const words = q.split(' ');
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  const nameWords = name.split(' ');
  if (words.every((w) => nameWords.some((nw) => nw.startsWith(w)))) return 60;
  if (name.replace(/ /g, '').includes(q.replace(/ /g, ''))) return 40;
  const extra = norm(e.muscles.join(' ') + ' ' + e.equipment + ' ' + REGION_NAME[e.region]);
  if (words.every((w) => extra.split(' ').some((x) => x.startsWith(w)))) return 20;
  return 0;
}

function optionHtml(e, i) {
  return `<button type="button" role="option" id="pick-${i}" class="picker-opt${i === st.active ? ' active' : ''}${e.id === st.current ? ' current' : ''}" aria-selected="${i === st.active}" data-act="pickEx" data-ex="${e.id}">
    <span class="picker-name">${esc(e.name)}</span>
    <span class="picker-meta">${esc(e.muscles.join(' · ') || REGION_NAME[e.region])}</span>
    ${e.id === st.current ? `<span class="picker-check">${icon.check(16)}</span>` : ''}
  </button>`;
}

function resultsHtml(query) {
  const q = norm(query);
  const byName = (a, b) => a.name.localeCompare(b.name);
  if (!q) {
    const recent = recentFor(st.clientId);
    const groups = ['Upper', 'Lower', 'Core'].map((r) => ({ title: REGION_NAME[r], list: db.exercises.filter((e) => e.region === r).sort(byName) }));
    if (recent.length) groups.unshift({ title: 'Recent', list: recent });
    st.results = groups.flatMap((g) => g.list);
    let i = 0;
    return groups.map((g) => `<div class="picker-group" role="presentation">${esc(g.title)}</div>${g.list.map((e) => optionHtml(e, i++)).join('')}`).join('');
  }
  st.results = db.exercises
    .map((e) => ({ e, s: score(e, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || byName(a.e, b.e))
    .map((x) => x.e);
  if (!st.results.length) return `<p class="picker-empty">No exercises match “${esc(query)}”. Add it in the Exercise library first.</p>`;
  return st.results.map(optionHtml).join('');
}

function paint(query) {
  const box = document.getElementById('picker-results');
  if (!box) return;
  box.innerHTML = resultsHtml(query);
  const input = document.getElementById('picker-input');
  if (input) input.setAttribute('aria-activedescendant', st.results.length ? 'pick-' + st.active : '');
}

// Open the picker. Must be called inside the tap so iOS opens the keyboard.
export function openPicker({ clientId, current, title, onPick }) {
  Object.assign(st, { clientId, current: current || '', onPick, active: 0 });
  app.modal(
    `<div class="modal-head"><h2>${esc(title || 'Choose exercise')}</h2><button type="button" class="btn-icon" data-act="closeModal" aria-label="Close">${icon.x(18)}</button></div>
     <label class="search">${icon.search(18)}<input id="picker-input" type="search" placeholder="Search exercises" aria-label="Search exercises" role="combobox" aria-controls="picker-results" aria-expanded="true" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" data-input="pickerQ"></label>
     <div class="picker-results" id="picker-results" role="listbox" aria-label="Exercises">${resultsHtml('')}</div>`,
    'Choose exercise',
    false,
    'sheet-top picker-modal'
  );
  const input = document.getElementById('picker-input');
  input.focus();
}

on('input', 'pickerQ', (el) => {
  st.active = 0;
  paint(el.value);
  document.getElementById('picker-results').scrollTop = 0;
});

on('click', 'pickEx', (el) => {
  const fn = st.onPick;
  st.onPick = null;
  app.closeModal();
  if (fn) fn(el.dataset.ex);
});

// Arrow keys move through results, Enter picks.
document.addEventListener('keydown', (e) => {
  if (!e.target || e.target.id !== 'picker-input' || !st.results.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    st.active = Math.max(0, Math.min(st.results.length - 1, st.active + (e.key === 'ArrowDown' ? 1 : -1)));
    paint(e.target.value);
    const opt = document.getElementById('pick-' + st.active);
    if (opt) opt.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const pick = st.results[st.active];
    const fn = st.onPick;
    st.onPick = null;
    app.closeModal();
    if (pick && fn) fn(pick.id);
  }
});
