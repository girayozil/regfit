// Exercise library: filters (region, muscle, search), cards, and the editor
// (side panel on wide screens, its own page on narrow ones).

import { esc, icon, on, app, uid, isWide, select, opt } from '../util.js';
import { db, exById, usageCount, save, MUSCLES, REGION_NAME, EQUIPMENT, TRACKING } from '../store.js';

const ui = { region: 'All', muscle: null, q: '' };
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

function editor(e, standalone) {
  if (!e) {
    return `<aside class="card editor editor-empty" aria-label="Edit exercise">
      <span class="choice-icon">${icon.dumbbell(22)}</span>
      <p class="empty-title">Select an exercise</p>
      <p class="muted">Pick one from the list to edit, duplicate or delete it.</p>
    </aside>`;
  }
  const used = usageCount(e.id);
  const regionSeg = ['Upper', 'Lower', 'Core']
    .map((r) => `<label class="seg-radio"><input type="radio" name="ex-region" value="${r}" data-change="exRegion" data-id="${e.id}"${e.region === r ? ' checked' : ''}><span>${REGION_NAME[r]}</span></label>`)
    .join('');
  const muscleList = [...MUSCLES[e.region], ...e.muscles.filter((m) => !MUSCLES[e.region].includes(m))];
  const muscleChips = muscleList
    .map((m) => `<button type="button" class="chip${e.muscles.includes(m) ? ' chip-on' : ''}" aria-pressed="${e.muscles.includes(m)}" data-act="toggleMuscle" data-id="${e.id}" data-m="${esc(m)}">${esc(m)}</button>`)
    .join('');
  return `<aside class="card editor${standalone ? ' editor-page' : ''}" aria-label="Edit exercise">
    <div class="card-head"><h2 class="eyebrow">Edit exercise</h2><span class="muted small">${used ? 'Used in ' + used + ' session' + (used === 1 ? '' : 's') : 'Not used yet'}</span></div>
    <label class="field-label">Name<input class="field" value="${esc(e.name)}" data-input="exName" data-change="exNameDone" data-id="${e.id}" autocapitalize="words"></label>
    <div class="field-label"><span id="region-label">Region</span><div class="seg seg-fill" role="radiogroup" aria-labelledby="region-label">${regionSeg}</div></div>
    <div class="field-label"><span>Muscle groups</span><div class="chips">${muscleChips}</div></div>
    <div class="form-grid tight">
      <label class="field-label">Equipment${select(`data-change="exField" data-f="equipment" data-id="${e.id}"`, (EQUIPMENT.includes(e.equipment) ? EQUIPMENT : [...EQUIPMENT, e.equipment]).map((x) => opt(x, x, e.equipment)).join(''))}</label>
      <label class="field-label">Track by${select(`data-change="exField" data-f="tracking" data-id="${e.id}"`, TRACKING.map((x) => opt(x, x, e.tracking)).join(''))}</label>
    </div>
    <label class="field-label">Coaching cues<textarea class="field" rows="3" placeholder="e.g. Shoulder blades back, control the lowering" data-input="exCues" data-id="${e.id}">${esc(e.cues || '')}</textarea></label>
    <div class="editor-actions">
      <button type="button" class="btn btn-outline" data-act="dupEx" data-id="${e.id}">${icon.copy(16)}Duplicate</button>
      <button type="button" class="btn btn-ghost danger" data-act="delEx" data-id="${e.id}"${used ? ' disabled title="Used in sessions — can’t delete"' : ''}>${icon.trash(16)}Delete</button>
    </div>
    <p class="muted small">Changes save automatically.</p>
  </aside>`;
}

export function render(selId) {
  const sel = selId ? exById(selId) : null;
  const wide = isWide();

  if (sel && !wide) {
    return `<a class="back" href="#/library">${icon.left(16)}Exercise library</a>
      <h1 class="page-title">${esc(sel.name)}</h1>
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

const exOf = (el) => exById(el.dataset.id);

on('input', 'exName', (el) => {
  const e = exOf(el);
  e.name = el.value;
  save();
  const label = document.querySelector(`[data-ex-name="${e.id}"]`);
  if (label) label.textContent = el.value;
});
on('change', 'exNameDone', (el) => {
  const e = exOf(el);
  if (!e.name.trim()) e.name = 'Untitled exercise';
  e.name = e.name.trim();
  save();
  app.rerender();
});
on('change', 'exRegion', (el) => {
  exOf(el).region = el.value;
  save();
  app.rerender();
});
on('click', 'toggleMuscle', (el) => {
  const e = exOf(el);
  const m = el.dataset.m;
  e.muscles = e.muscles.includes(m) ? e.muscles.filter((x) => x !== m) : [...e.muscles, m];
  save();
  app.rerender();
});
on('change', 'exField', (el) => {
  exOf(el)[el.dataset.f] = el.value;
  save();
  app.rerender();
});
on('input', 'exCues', (el) => {
  exOf(el).cues = el.value;
  save();
});

on('click', 'dupEx', (el) => {
  const e = exOf(el);
  const copy = { ...e, id: uid('ex'), name: e.name + ' (copy)', muscles: [...e.muscles] };
  db.exercises.push(copy);
  save();
  ui.q = '';
  app.toast('Duplicated');
  app.go('#/library/' + copy.id);
});

on('click', 'newEx', () => {
  const region = ui.region === 'All' ? 'Upper' : ui.region;
  const e = { id: uid('ex'), name: 'New exercise', region, muscles: [], equipment: 'Dumbbells', tracking: 'Weight × reps', cues: '' };
  db.exercises.push(e);
  save();
  ui.q = '';
  ui.muscle = null;
  app.go('#/library/' + e.id);
  setTimeout(() => {
    const input = document.querySelector('[data-input="exName"]');
    if (input) input.select();
  }, 50);
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
