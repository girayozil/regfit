// Exercise library: filters (region, muscle, search), exercises grouped by region and main
// muscle, and the editor (side panel on wide screens, its own page on narrow ones).

import { esc, icon, on, app, uid, isWide, select, opt } from '../util.js';
import { db, exById, usageCount, save, REGION_NAME, REGIONS, TRACKING, equipmentList, equipmentUsage, addEquipment, renameEquipment, removeEquipment, INTENSITY, muscleCatalog, canonicalMuscle } from '../store.js';

const ui = { region: 'All', muscle: null, q: '', draft: null }; // draft: unsaved new exercise

function filtered() {
  const q = ui.q.toLowerCase();
  return db.exercises
    .filter((e) => (ui.region === 'All' || e.region === ui.region) && (!ui.muscle || e.muscles.includes(ui.muscle)) && e.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Short names for the editor's region switch (four options must fit a narrow panel).
const REGION_SHORT = { Upper: 'Upper', Lower: 'Lower', Core: 'Core', Cardio: 'Cardio' };

// "Upper body" → shows as "Upper" on phones, where five region buttons have to fit in one row.
const regionLabel = (label) => (/ body$/.test(label) ? `${label.replace(/ body$/, '')}<span class="lbl-long"> body</span>` : label);

const card = (e, selId) => `<a class="ex-card${e.id === selId ? ' selected' : ''}" href="#/library/${e.id}"${e.id === selId ? ' aria-current="true"' : ''}>
    <span class="ex-name" data-ex-name="${e.id}">${esc(e.name)}</span>
    <span class="ex-muscles">${esc(e.muscles.join(' · ') || 'No muscle groups')}</span>
    <span class="ex-meta">${esc(e.equipment)} · ${esc(e.tracking)}</span>
  </a>`;

// Region sections, each split by main muscle (an exercise's first muscle), in the muscle order
// used everywhere else (built-in muscles first, custom ones after).
function sections(selId) {
  const list = filtered();
  if (!list.length) return `<div class="empty-inline">No exercises match these filters.</div>`;
  const cat = muscleCatalog();
  const everywhere = REGIONS.flatMap((r) => cat[r]);
  return REGIONS.map((r) => {
    const inRegion = list.filter((e) => e.region === r);
    if (!inRegion.length) return '';
    const byMuscle = {};
    inRegion.forEach((e) => (byMuscle[e.muscles[0] || 'Other'] = byMuscle[e.muscles[0] || 'Other'] || []).push(e));
    const rank = (m) => (m === 'Other' ? 9999 : cat[r].includes(m) ? cat[r].indexOf(m) : 100 + everywhere.indexOf(m));
    // Cardio (no muscles to group by) is one plain list.
    if (r === 'Cardio' || Object.keys(byMuscle).every((m) => m === 'Other')) {
      return `<section class="lib-section" aria-label="${REGION_NAME[r]}"><h2 class="lib-region">${REGION_NAME[r]} <span>${inRegion.length}</span></h2><div class="ex-grid">${inRegion.map((e) => card(e, selId)).join('')}</div></section>`;
    }
    const groups = Object.keys(byMuscle)
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      .map((m) => `<h3 class="lib-muscle">${esc(m)} <span>${byMuscle[m].length}</span></h3><div class="ex-grid">${byMuscle[m].map((e) => card(e, selId)).join('')}</div>`)
      .join('');
    return `<section class="lib-section" aria-label="${REGION_NAME[r]}"><h2 class="lib-region">${REGION_NAME[r]} <span>${inRegion.length}</span></h2>${groups}</section>`;
  }).join('');
}

// Muscle filter: one alphabetical row of chips (the region switcher narrows it), each with how
// many exercises in view it covers.
function muscleFilter() {
  // Every muscle used by an exercise in view (so Lower body also offers e.g. Lower back).
  const pool = db.exercises.filter((e) => ui.region === 'All' || e.region === ui.region);
  const names = [...new Set(pool.flatMap((e) => e.muscles).concat(ui.muscle ? [ui.muscle] : []))];
  const chips = names
    .map((m) => [m, pool.filter((e) => e.muscles.includes(m)).length])
    .filter(([m, n]) => n || ui.muscle === m)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([m, n]) => `<button type="button" class="chip${ui.muscle === m ? ' chip-dark' : ''}" aria-pressed="${ui.muscle === m}" data-act="libMuscle" data-v="${esc(m)}">${esc(m)} <span class="chip-count">${n}</span></button>`)
    .join('');
  return chips ? `<div class="muscle-row"><div class="chips">${chips}</div></div>` : '';
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
  const regionSeg = REGIONS
    .map((r) => `<label class="seg-radio"><input type="radio" name="ex-region" value="${r}" data-change="exRegion" data-id="${e.id}"${e.region === r ? ' checked' : ''}><span>${REGION_SHORT[r]}</span></label>`)
    .join('');
  const regionMuscles = muscleCatalog()[e.region];
  const muscleList = [...regionMuscles, ...e.muscles.filter((m) => !regionMuscles.includes(m))];
  const muscleChips =
    muscleList
      .map((m) => `<button type="button" class="chip${e.muscles.includes(m) ? ' chip-on' : ''}" aria-pressed="${e.muscles.includes(m)}" data-act="toggleMuscle" data-id="${e.id}" data-m="${esc(m)}">${esc(m)}</button>`)
      .join('') + `<button type="button" class="chip chip-new" data-act="newMuscle" data-id="${e.id}">${icon.plus(14)}New</button>`;
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
    <div class="field-label"><span>Muscle groups <span class="hint">· the first one picked is the main muscle</span></span><div class="chips">${muscleChips}</div></div>
    <div class="form-grid tight">
      <div class="field-label">
        <span class="label-row"><label for="ex-equipment">Equipment</label><button type="button" class="text-btn" data-act="manageEquipment">Edit list</button></span>
        ${select(`id="ex-equipment" data-change="exField" data-f="equipment" data-id="${e.id}"`, ((list) => (list.includes(e.equipment) ? list : [...list, e.equipment]))(equipmentList()).map((x) => opt(x, x, e.equipment)).join(''))}
      </div>
      <label class="field-label">Track by${select(`data-change="exField" data-f="tracking" data-id="${e.id}"`, TRACKING.map((x) => opt(x, x, e.tracking)).join(''))}</label>
      ${e.tracking === 'Time & intensity' ? `<label class="field-label">Intensity${select(`data-change="exField" data-f="intensity" data-id="${e.id}"`, INTENSITY.map((x) => opt(x, x, e.intensity || 'Level')).join(''))}</label>` : ''}
    </div>
    <label class="field-label">Coaching cues<textarea class="field" rows="3" placeholder="e.g. Shoulder blades back, control the lowering" data-input="exCues" data-id="${e.id}">${esc(e.cues || '')}</textarea></label>
    ${foot}
  </aside>`;
}

const blankDraft = () => {
  const region = ui.region === 'All' ? 'Upper' : ui.region;
  return region === 'Cardio'
    ? { id: 'new', name: '', region, muscles: [], equipment: 'Machine', tracking: 'Time & intensity', intensity: 'Level', cues: '' }
    : { id: 'new', name: '', region, muscles: [], equipment: 'Dumbbells', tracking: 'Weight × reps', cues: '' };
};

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

  const regions = [['All', 'All'], ...REGIONS.map((r) => [r, REGION_NAME[r]])]
    .map(([id, label]) => `<button type="button" class="seg-btn" data-act="libRegion" data-v="${id}" aria-pressed="${ui.region === id}">${regionLabel(label)}</button>`)
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
  <div class="muscle-filter" role="group" aria-label="Muscle group">${muscleFilter()}</div>
  <div class="lib-layout${wide ? ' with-editor' : ''}">
    <div class="ex-sections" id="ex-grid">${sections(sel && sel.id)}</div>
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
  document.getElementById('ex-grid').innerHTML = sections(sel);
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
  // Cardio is tracked by time and intensity (still changeable below).
  if (e.region === 'Cardio' && !e.tracking.startsWith('Time')) e.tracking = 'Time & intensity';
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
// "+ New" muscle group: typed in a small panel (top of the screen on phones), then selected for
// this exercise. A name that already exists elsewhere (e.g. "Back") just gets selected.
let muscleFor = null;
on('click', 'newMuscle', (el) => {
  muscleFor = el.dataset.id;
  const e = exOf(el);
  app.modal(
    `<div class="modal-head"><h2>New muscle group</h2></div>
     <label class="field-label">Name<input class="field" id="new-muscle" placeholder="e.g. Rear delts" autocapitalize="words" autocomplete="off" enterkeyhint="done"></label>
     <p class="muted small">Added to ${esc(e.name || 'this exercise')} · ${REGION_NAME[e.region]}</p>
     <div class="note-actions">
       <button type="button" class="btn btn-outline" data-act="closeModal">${icon.x(16)}Cancel</button>
       <button type="button" class="btn btn-dark" data-act="addMuscle">${icon.check(16)}Add</button>
     </div>`,
    'New muscle group',
    false,
    'sheet-top'
  );
  document.getElementById('new-muscle').focus(); // inside the tap, so iOS shows the keyboard
});

on('click', 'addMuscle', () => {
  const input = document.getElementById('new-muscle');
  const name = canonicalMuscle(input && input.value);
  if (!name) {
    app.toast('Type a name first');
    if (input) input.focus();
    return;
  }
  const e = muscleFor === 'new' ? ui.draft : exById(muscleFor);
  if (!e) return;
  if (!e.muscles.includes(name)) e.muscles = [...e.muscles, name];
  commit(e);
  app.closeModal();
  app.rerender();
});

document.addEventListener('keydown', (ev) => {
  if (ev.target && ev.target.id === 'new-muscle' && ev.key === 'Enter') {
    ev.preventDefault();
    document.querySelector('[data-act="addMuscle"]').click();
  }
});

// ---------- equipment list (a quick card from the editor) ----------

function equipmentRows() {
  return equipmentList()
    .map((name) => {
      const n = equipmentUsage(name);
      return `<div class="equip-row">
        <input class="field" value="${esc(name)}" aria-label="Equipment name" data-change="renameEquip" data-old="${esc(name)}" autocapitalize="words" autocomplete="off">
        <button type="button" class="btn-icon sm" data-act="removeEquip" data-v="${esc(name)}" aria-label="Remove ${esc(name)}"${n ? ` disabled title="Used by ${n} exercise${n === 1 ? '' : 's'} — switch them first"` : ''}>${icon.x(16)}</button>
      </div>`;
    })
    .join('');
}

// Redraw the list in the card, and the page behind it so the Equipment dropdown stays current.
function refreshEquipment() {
  const list = document.getElementById('equip-list');
  if (list) list.innerHTML = equipmentRows();
  app.rerender();
}

on('click', 'manageEquipment', () => {
  app.modal(
    `<div class="modal-head"><h2>Equipment</h2><button type="button" class="btn-icon" data-act="closeModal" aria-label="Close">${icon.x(18)}</button></div>
     <p class="muted small">Tap a name to rename it everywhere. Equipment in use can’t be removed.</p>
     <div class="equip-list" id="equip-list">${equipmentRows()}</div>
     <div class="equip-add">
       <input class="field" id="new-equip" placeholder="New equipment" aria-label="New equipment" autocapitalize="words" autocomplete="off" enterkeyhint="done">
       <button type="button" class="btn btn-dark" data-act="addEquip">${icon.plus(16)}Add</button>
     </div>`,
    'Equipment',
    false,
    'sheet-top'
  );
});

on('click', 'addEquip', () => {
  const input = document.getElementById('new-equip');
  const err = addEquipment(input.value);
  if (err) {
    app.toast(err);
    return;
  }
  app.toast(`Added ${input.value.trim()}`);
  input.value = '';
  refreshEquipment();
});

document.addEventListener('keydown', (ev) => {
  if (ev.target && ev.target.id === 'new-equip' && ev.key === 'Enter') {
    ev.preventDefault();
    document.querySelector('[data-act="addEquip"]').click();
  }
});

on('change', 'renameEquip', (el) => {
  const from = el.dataset.old;
  const err = renameEquipment(from, el.value);
  if (err) {
    app.toast(err);
    el.value = from;
    return;
  }
  refreshEquipment();
});

on('click', 'removeEquip', (el) => {
  const err = removeEquipment(el.dataset.v);
  if (err) app.toast(err);
  refreshEquipment();
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
