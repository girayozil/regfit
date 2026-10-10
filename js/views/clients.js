// Clients list (search + filter) and the new/edit client form.

import { esc, icon, on, app, fullName, initials, tint, relDay, parseNum } from '../util.js';
import { db, clientById, nextSession, lastDone, sessionsFor, createClient, deleteClient, save } from '../store.js';

const ui = { q: '', filter: 'all' };

function rows() {
  const q = ui.q.toLowerCase();
  const list = db.clients
    .map((c) => ({ c, next: nextSession(c.id), last: lastDone(c.id), count: sessionsFor(c.id).filter((s) => s.status === 'done').length }))
    .filter(({ c }) => fullName(c).toLowerCase().includes(q))
    .filter(({ next }) => ui.filter === 'all' || (ui.filter === 'sched' ? next : !next))
    .sort((a, b) => fullName(a.c).localeCompare(fullName(b.c)));
  if (!list.length) {
    return `<div class="empty-inline">${db.clients.length ? 'No clients match.' : 'No clients yet. Add your first one.'}</div>`;
  }
  return list
    .map(({ c, next, last, count }) => {
      const nextLabel = next ? relDay(next.date) + ' · ' + next.time : 'Not scheduled';
      const nextCls = next ? (relDay(next.date) === 'Today' ? 'pill-next' : 'pill-soft') : 'pill-dashed';
      return `<a class="client-row" href="#/client/${c.id}">
        <span class="client-cell">
          <span class="avatar avatar-md" style="background:${tint(c.id)}">${esc(initials(c))}</span>
          <span class="client-text"><span class="client-name">${esc(fullName(c))}</span><span class="client-meta">${esc([c.age, c.sex].filter(Boolean).join(' · '))}</span></span>
        </span>
        <span class="col-last">${last ? esc(relDay(last.date)) : '<span class="muted">—</span>'}</span>
        <span class="col-next"><span class="pill ${nextCls}">${esc(nextLabel)}</span></span>
        <span class="col-count">${count}</span>
        <span class="chev">${icon.right(18)}</span>
      </a>`;
    })
    .join('');
}

export function renderList() {
  const seg = [['all', 'All'], ['sched', 'Scheduled'], ['unsched', 'Not scheduled']]
    .map(([id, label]) => `<button type="button" class="seg-btn" data-act="clientFilter" data-v="${id}" aria-pressed="${ui.filter === id}">${label}</button>`)
    .join('');
  return `
  <header class="page-head">
    <div>
      <div class="eyebrow">${db.clients.length} client${db.clients.length === 1 ? '' : 's'}</div>
      <h1 class="page-title">Clients</h1>
    </div>
    <div class="head-actions"><a class="btn btn-dark" href="#/clients/new">${icon.plus(16)}New client</a></div>
  </header>
  <div class="toolbar">
    <label class="search">${icon.search(18)}<input type="search" placeholder="Search clients" aria-label="Search clients" value="${esc(ui.q)}" data-input="clientQ" autocomplete="off"></label>
    <div class="seg" role="group" aria-label="Filter clients">${seg}</div>
  </div>
  <section class="card table-card" aria-label="Client list">
    <div class="client-row client-head" aria-hidden="true">
      <span>Client</span><span class="col-last">Last session</span><span class="col-next">Next session</span><span class="col-count">Sessions</span><span></span>
    </div>
    <div id="client-rows">${rows()}</div>
  </section>`;
}

on('input', 'clientQ', (el) => {
  ui.q = el.value;
  document.getElementById('client-rows').innerHTML = rows();
});

on('click', 'clientFilter', (el) => {
  ui.filter = el.dataset.v;
  app.rerender();
});

// ---------- form ----------

export function renderForm(id) {
  const c = id ? clientById(id) : null;
  if (id && !c) return `<div class="empty-state"><h1 class="page-title">Client not found</h1><a class="btn btn-dark" href="#/clients">Back to clients</a></div>`;
  const v = c || { first: '', last: '', age: '', sex: '', height: '', weight: '', notes: '' };
  const sexOpt = (s) => `<label class="seg-radio"><input type="radio" name="sex" value="${s}"${v.sex === s ? ' checked' : ''}><span>${s}</span></label>`;
  return `
  <a class="back" href="${c ? '#/client/' + c.id : '#/clients'}">${icon.left(16)}${c ? esc(fullName(c)) : 'Clients'}</a>
  <h1 class="page-title">${c ? 'Edit client' : 'New client'}</h1>
  <form class="card form-card" id="client-form" data-id="${c ? c.id : ''}" novalidate autocomplete="off">
    <fieldset>
      <legend>Personal</legend>
      <div class="form-grid">
        <label class="field-label">Name<input class="field" name="first" value="${esc(v.first)}" placeholder="e.g. Elif" autocapitalize="words" required></label>
        <label class="field-label">Last name<input class="field" name="last" value="${esc(v.last)}" placeholder="e.g. Demir" autocapitalize="words"></label>
        <label class="field-label">Age<input class="field" name="age" type="number" inputmode="numeric" min="5" max="110" value="${esc(v.age)}" placeholder="Years"></label>
        <div class="field-label"><span id="sex-label">Sex</span><div class="seg seg-fill" role="radiogroup" aria-labelledby="sex-label">${sexOpt('Female')}${sexOpt('Male')}</div></div>
      </div>
    </fieldset>
    <fieldset>
      <legend>Body</legend>
      <div class="form-grid">
        <label class="field-label">Height<span class="unit-wrap"><input class="field" name="height" inputmode="decimal" value="${esc(v.height)}" placeholder="0"><span class="unit">cm</span></span></label>
        <label class="field-label">Weight<span class="unit-wrap"><input class="field" name="weight" inputmode="decimal" value="${esc(v.weight)}" placeholder="0"><span class="unit">kg</span></span></label>
      </div>
    </fieldset>
    <label class="field-label">Notes <span class="hint">Goals, injuries, anything to remember</span>
      <textarea class="field" name="notes" rows="3" placeholder="e.g. Recovering from a left knee strain — no deep lunges yet">${esc(v.notes)}</textarea>
    </label>
    <div class="form-actions">
      ${c ? `<button type="button" class="btn btn-ghost danger" data-act="deleteClient" data-id="${c.id}">${icon.trash(16)}Delete client</button>` : ''}
      <span class="spacer"></span>
      <a class="btn btn-outline" href="${c ? '#/client/' + c.id : '#/clients'}">Cancel</a>
      <button type="submit" class="btn btn-dark" data-act="saveClient">${icon.check(16)}Save client</button>
    </div>
  </form>`;
}

on('click', 'saveClient', () => {
  const form = document.getElementById('client-form');
  const f = new FormData(form);
  const first = String(f.get('first') || '').trim();
  if (!first) {
    app.toast('Add a name first');
    form.elements.first.focus();
    return;
  }
  const age = parseInt(f.get('age'), 10);
  const fields = {
    first,
    last: String(f.get('last') || '').trim(),
    age: isNaN(age) ? '' : age,
    sex: f.get('sex') || '',
    height: parseNum(f.get('height')),
    weight: parseNum(f.get('weight')),
    notes: String(f.get('notes') || '').trim(),
  };
  const id = form.dataset.id;
  if (id) {
    Object.assign(clientById(id), fields);
    save();
    app.toast('Client updated');
    app.go('#/client/' + id);
  } else {
    const c = createClient(fields);
    app.toast('Client added');
    app.go('#/client/' + c.id);
  }
});

// Enter key in the form submits through the same handler.
document.addEventListener('submit', (e) => {
  if (e.target.id === 'client-form') {
    e.preventDefault();
    document.querySelector('[data-act="saveClient"]').click();
  }
});

on('click', 'deleteClient', (el) => {
  const c = clientById(el.dataset.id);
  const n = sessionsFor(c.id).length;
  if (!confirm(`Delete ${fullName(c)} and their ${n} session${n === 1 ? '' : 's'}? This can't be undone.`)) return;
  deleteClient(c.id);
  app.toast('Client deleted');
  app.go('#/clients');
});
