// Exercise library: filters (region, muscle, search), cards, and the editor
// (side panel on wide screens, its own page on narrow ones).

import { esc, icon, on, app, uid, isWide, select, opt } from '../util.js';
import { db, exById, usageCount, save, MUSCLES, REGION_NAME, EQUIPMENT, TRACKING } from '../store.js';

const ui = { region: 'All', muscle: null, q: '', draft: null }; // draft: unsaved new exercise
const TAG = { Upper: 'tag-upper', Lower: 'tag-lower', Core: 'tag-core' };

function filtered() {
  const q = ui.q.toLowerCase();
  return db.exercises
    .filter((e) => (ui.region === 'All' || e.region === ui.region) && (!ui.muscle || e.muscles.includes(ui.muscle)) && e.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function cards(selId) {
  const list = filtered();
  if (!list.length) return `<div class="empty-inline">No exercises match these filters.</div>`;
  return list
    .map(
      (e) => `<a class="ex-card${e.id === selId ? ' selected' : ''}" href="#/library/${e.id}"${e.id === selId ? ' aria-current="true"' : ''}>
        <span class="ex-top"><span class="ex-name" data-ex-name="${e.id}">${esc(e.name)}</span><span class="tag ${TAG[e.region]}">${REGION_NAME[e.region]}</span></span>
        <span class="ex-muscles">${esc(e.muscles.join(' · ') || 'No muscle groups')}</span>
        <span class="ex-meta">${esc(e.equipment)} · ${esc(e.tracking)}</span>
      </a>`
    )
    .join('');
}

// `e` is a library exercise, or the unsaved draft (id "new") for New exercise / Duplicate.
function editor(e, standalone) {
  if (!e) {
    return `<aside class="card editor editor-empty" aria-label="Edit exercise">
      <span class="choice-icon">${icon.dumbbell(22)}</span>
      <p class="empty-title">Select an exercise</p>
      <p class="muted">Pick one from the list to edit it.</p>
    </aside>`;
  }
  const isDraft = e.id === 'new';
  const used = isDraft ? 0 : usageCount(e.id);
  const regionSeg = ['Upper', 'Lower', 'Core']
    .map((r) => `<label class="seg-radio"><input type="radio" name="ex-region" value="${r}" data-change="exRegion" data-id="${e.id}"${e.region === r ? ' checked' : ''}><span>${REGION_NAME[r]}</span></label>`)
    .join('');
  const muscleList = [...MUSCLES[e.region], ...e.muscles.filter((m) => !MUSCLES[e.region].includes(m))];
  const muscleChips = muscleList
    .map((m) => `<button type="button" class="chip${e.muscles.includes(m) ? ' chip-on' : ''}" aria-pressed="${e.muscles.includes(m)}" data-act="toggleMuscle" data-id="${e.id}" data-m="${esc(m)}">${esc(m)}</button>`)
    .join('');
  const head = isDraft
    ? `<div class="card-head"><h2 class="eyebrow">${e.copyOf ? 'Duplicate exercise' : 'New exercise'}</h2></div>`
    : `<div class="card-head">
        <h2 class="eyebrow">Edit exercise</h2>
        <button type="button" class="btn-icon sm" data-act="dupEx" data-id="${e.id}" aria-label="Duplicate exercise" title="Duplicate">${icon.copy(18)}</button>
        <button type="button" class="btn-icon sm danger" data-act="delEx" data-id="${e.id}" aria-label="Delete exercise" title="${used ? 'Used in sessions — can’t delete' : 'Delete'}"${used ? ' disabled' : ''}>${icon.trash(18)}</button>
      </div>`;
  const foot = isDraft
    ? `<div class="editor-actions">
        <button type="button" class="btn btn-outline" data-act="cancelDraft">Cancel</button>
        <button type="button" class="btn btn-dark" data-act="addDraft">${icon.check(16)}Add exercise</button>
      </div>`
    : `<p class="muted small">${used ? 'Used in ' + used + ' session' + (used === 1 ? '' : 's') + ' · ' : ''}Changes save automatically.</p>`;
  return `<aside class="card editor${standalone ? ' editor-page' : ''}" aria-label="${isDraft ? 'New exercise' : 'Edit exercise'}">
    ${head}
    <label class="field-label">Name<input class="field" value="${esc(e.name)}" placeholder="e.g. Cable Lateral Raise" data-input="exName" data-change="exNameDone" data-id="${e.id}" autocapitalize="words"></label>
    <div class="field-label"><span id="region-label">Region</span><div class="seg seg-fill" role="radiogroup" aria-labelledby="region-label">${regionSeg}</div></div>
    <div class="field-label"><span>Muscle groups</span><div class="chips">${muscleChips}</div></div>
    <div class="form-grid tight">
      <label class="field-label">Equipment${select(`data-change="exField" data-f="equipment" data-id="${e.id}"`, (EQUIPMENT.includes(e.equipment) ? EQUIPMENT : [...EQUIPMENT, e.equipment]).map((x) => opt(x, x, e.equipment)).join(''))}</label>
      <label class="field-label">Track by${select(`data-change="exField" data-f="tracking" data-id="${e.id}"`, TRACKING.map((x) => opt(x, x, e.tracking)).join(''))}</label>
    </div>
    <label class="field-label">Coaching cues<textarea class="field" rows="3" placeholder="e.g. Shoulder blades back, control the lowering" data-input="exCues" data-id="${e.id}">${esc(e.cues || '')}</textarea></label>
    ${foot}
  </aside>`;
}

const blankDraft = () => ({ id: 'new', name: '', region: ui.region === 'All' ? 'Upper' : ui.region, muscles: [], equipment: 'Dumbbells', tracking: 'Weight × reps', cues: '' });

export function render(selId) {
  if (selId === 'new' && !ui.draft) ui.draft = blankDraft();
  if (selId !== 'new') ui.draft = null;
  const sel = selId === 'new' ? ui.draft : selId ? exById(selId) : null;
  const wide = isWide();

  if (sel && !wide) {
    return `<a class="back" href="#/library">${icon.left(16)}Exercise library</a>
      <h1 class="page-title">${sel.id === 'new' ? (sel.copyOf ? 'Duplicate exercise' : 'New exercise') : esc(sel.name)}</h1>
      ${editor(sel, true)}`;
  }

  const regions = [['All', 'All'], ['Upper', 'Upper body'], ['Lower', 'Lower body'], ['Core', 'Core']]
    .map(([id, label]) => `<button type="button" class="seg-btn" data-act="libRegion" data-v="${id}" aria-pressed="${ui.region === id}">${label}</button>`)
    .join('');
  const muscleNames = ui.region === 'All' ? [...MUSCLES.Upper, ...MUSCLES.Lower, ...MUSCLES.Core] : MUSCLES[ui.region];
  const chips = muscleNames
    .map((m) => `<button type="button" class="chip${ui.muscle === m ? ' chip-dark' : ''}" aria-pressed="${ui.muscle === m}" data-act="libMuscle" data-v="${esc(m)}">${esc(m)}</button>`)
    .join('');

  return `
  <header class="page-head">
    <div>
      <div class="eyebrow">${db.exercises.length} exercises</div>
      <h1 class="page-title">Exercise library</h1>
    </div>
    <div class="head-actions"><button type="button" class="btn btn-dark" data-act="newEx">${icon.plus(16)}New exercise</button></div>
  </header>
  <div class="toolbar">
    <label class="search">${icon.search(18)}<input type="search" placeholder="Search exercises" aria-label="Search exercises" value="${esc(ui.q)}" data-input="libQ" autocomplete="off"></label>
    <div class="seg seg-scroll" role="group" aria-label="Body region">${regions}</div>
  </div>
  <div class="chips chips-filter" role="group" aria-label="Muscle group">${chips}</div>
  <div class="lib-layout${wide ? ' with-editor' : ''}">
    <div class="ex-grid" id="ex-grid">${cards(sel && sel.id)}</div>
    ${wide ? editor(sel, false) : ''}
  </div>`;
}

// ---------- filters ----------

on('click', 'libRegion', (el) => {
  ui.region = el.dataset.v;
  ui.muscle = null;
  app.rerender();
});
on('click', 'libMuscle', (el) => {
  ui.muscle = ui.muscle === el.dataset.v ? null : el.dataset.v;
  app.rerender();
});
on('input', 'libQ', (el) => {
  ui.q = el.value;
  const sel = location.hash.split('/')[2];
  document.getElementById('ex-grid').innerHTML = cards(sel);
});

// ---------- editing ----------

// The exercise a control edits: the unsaved draft, or a library exercise (saved straight away).
const exOf = (el) => (el.dataset.id === 'new' ? ui.draft : exById(el.dataset.id));
const commit = (e) => {
  if (e.id !== 'new') save();
};

on('input', 'exName', (el) => {
  const e = exOf(el);
  e.name = el.value;
  commit(e);
  const label = document.querySelector(`[data-ex-name="${e.id}"]`);
  if (label) label.textContent = el.value;
});
on('change', 'exNameDone', (el) => {
  const e = exOf(el);
  if (e.id === 'new') return;
  e.name = e.name.trim() || 'Untitled exercise';
  save();
  app.rerender();
});
on('change', 'exRegion', (el) => {
  const e = exOf(el);
  e.region = el.value;
  commit(e);
  app.rerender();
});
on('click', 'toggleMuscle', (el) => {
  const e = exOf(el);
  const m = el.dataset.m;
  e.muscles = e.muscles.includes(m) ? e.muscles.filter((x) => x !== m) : [...e.muscles, m];
  commit(e);
  app.rerender();
});
on('change', 'exField', (el) => {
  const e = exOf(el);
  e[el.dataset.f] = el.value;
  commit(e);
  app.rerender();
});
on('input', 'exCues', (el) => {
  const e = exOf(el);
  e.cues = el.value;
  commit(e);
});

// New exercise and Duplicate open an unsaved draft; nothing is added until "Add exercise".
on('click', 'newEx', () => {
  ui.draft = blankDraft();
  app.go('#/library/new');
  if (location.hash === '#/library/new') app.rerender();
  setTimeout(() => {
    const input = document.querySelector('[data-input="exName"]');
    if (input) input.focus();
  }, 50);
});

on('click', 'dupEx', (el) => {
  const e = exById(el.dataset.id);
  ui.draft = { ...e, id: 'new', copyOf: e.id, name: e.name + ' (copy)', muscles: [...e.muscles] };
  app.go('#/library/new');
  if (location.hash === '#/library/new') app.rerender();
});

on('click', 'cancelDraft', () => {
  ui.draft = null;
  app.go('#/library');
});

on('click', 'addDraft', () => {
  const d = ui.draft;
  const name = (d.name || '').trim();
  if (!name) {
    app.toast('Give the exercise a name');
    const input = document.querySelector('[data-input="exName"]');
    if (input) input.focus();
    return;
  }
  if (db.exercises.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
    app.toast('An exercise with that name already exists');
    return;
  }
  const { copyOf, ...fields } = d;
  const e = { ...fields, id: uid('ex'), name, muscles: [...d.muscles] };
  db.exercises.push(e);
  save();
  ui.draft = null;
  ui.q = '';
  ui.muscle = null;
  app.toast('Exercise added');
  app.go('#/library/' + e.id);
});

on('click', 'delEx', (el) => {
  const e = exOf(el);
  if (usageCount(e.id)) return;
  if (!confirm(`Delete “${e.name}” from the library?`)) return;
  db.exercises = db.exercises.filter((x) => x.id !== e.id);
  save();
  app.toast('Exercise deleted');
  app.go('#/library');
});
