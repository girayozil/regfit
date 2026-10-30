// Templates: a client's reusable session plans ("Upper body A"). Edited with the same exercise
// list as a session; a session starts from one with a tap (choosing whose numbers to use).

import { esc, icon, on, app, fullName, initials, tint, fmtShort } from '../util.js';
import { clientById, templateById, templatesFor, createTemplate, deleteTemplate, templateLastUsed, startFromTemplate, sessionById, sessionToFill, copyItems, save } from '../store.js';
import { exercisesCard, summaryText } from './session.js';
import { pickNumbers } from './copychoice.js';

// "6 exercises · used 12 Oct"
export function templateMeta(t) {
  const n = t.items.filter((it) => it.exId).length;
  const used = templateLastUsed(t.id);
  return `${n} exercise${n === 1 ? '' : 's'}${used ? ' · used ' + fmtShort(used) : ''}`;
}

export function render(id) {
  const t = templateById(id);
  if (!t) return `<div class="empty-state"><h1 class="page-title">Template not found</h1><a class="btn btn-dark" href="#/clients">Back to clients</a></div>`;
  const c = clientById(t.clientId) || { id: '', first: 'Unknown', last: '' };
  return `
  <a class="back" href="#/client/${c.id}">${icon.left(16)}${esc(fullName(c))}</a>
  <header class="page-head">
    <div class="session-title">
      <span class="avatar avatar-lg" style="background:${tint(c.id)}">${esc(initials(c))}</span>
      <div>
        <h1 class="page-title" id="tpl-title">${esc(t.name)}</h1>
        <div class="muted small">Template · ${esc(fullName(c))}</div>
      </div>
    </div>
  </header>
  <section class="card tpl-name" aria-label="Template name">
    <label class="field-label">Name<input class="field" value="${esc(t.name)}" placeholder="e.g. Upper body A" data-input="templateName" data-change="templateNameDone" data-id="${t.id}" autocapitalize="sentences" autocomplete="off"></label>
  </section>
  ${exercisesCard(t)}
  <div class="danger-zone"><button type="button" class="btn btn-ghost danger" data-act="deleteTemplate" data-id="${t.id}">${icon.trash(16)}Delete template</button></div>
  <div class="action-bar">
    <span class="action-summary" id="session-summary">${summaryText(t)}</span>
    <button type="button" class="btn btn-accent" data-act="startTemplate" data-id="${t.id}">${icon.arrow(16)}Start session</button>
  </div>`;
}

on('input', 'templateName', (el) => {
  const t = templateById(el.dataset.id);
  t.name = el.value;
  const title = document.getElementById('tpl-title');
  if (title) title.textContent = el.value || 'Template';
  save();
});
on('change', 'templateNameDone', (el) => {
  const t = templateById(el.dataset.id);
  t.name = t.name.trim() || 'Template';
  save();
  app.rerender();
});

on('click', 'deleteTemplate', (el) => {
  const t = templateById(el.dataset.id);
  if (!confirm(`Delete the template “${t.name}”? Sessions already started from it stay as they are.`)) return;
  deleteTemplate(t.id);
  app.toast('Template deleted');
  app.go('#/client/' + t.clientId);
});

// Start a session from a template: into the session it was picked from (data-session), else the
// client's next empty planned session, else a new one. Asks whose numbers to use when they differ.
on('click', 'startTemplate', (el) => {
  const t = templateById(el.dataset.id);
  if (!t || !t.items.some((it) => it.exId)) {
    app.toast('Add an exercise to the template first');
    return;
  }
  pickNumbers(
    t,
    (numbers) => {
      const s = (el.dataset.session && sessionById(el.dataset.session)) || sessionToFill(t.clientId);
      startFromTemplate(s, t, numbers);
      app.toast(`${fmtShort(s.date)} · started from ${t.name}`);
      if (location.hash === '#/session/' + s.id) app.rerender();
      else app.go('#/session/' + s.id);
    },
    { template: true }
  );
});

// ---------- naming: new template, or saving a session as one ----------
// A small panel pinned to the top of the screen, like the other quick text entries.

let named = null;
export function askTemplateName(value, title, onDone) {
  named = onDone;
  app.modal(
    `<div class="modal-head"><h2>${esc(title)}</h2></div>
     <label class="field-label">Name<input class="field" id="tpl-name" value="${esc(value)}" placeholder="e.g. Upper body A" autocapitalize="sentences" autocomplete="off" enterkeyhint="done"></label>
     <div class="note-actions">
       <button type="button" class="btn btn-outline" data-act="closeModal">${icon.x(16)}Cancel</button>
       <button type="button" class="btn btn-dark" data-act="nameTemplate">${icon.check(16)}Save</button>
     </div>`,
    title,
    false,
    'sheet-top'
  );
  const input = document.getElementById('tpl-name');
  input.focus(); // inside the tap, so iOS shows the keyboard
  input.select();
}

on('click', 'nameTemplate', () => {
  const input = document.getElementById('tpl-name');
  const name = input ? input.value.trim() : '';
  if (!name) {
    app.toast('Type a name first');
    if (input) input.focus();
    return;
  }
  const fn = named;
  named = null;
  app.closeModal();
  if (fn) fn(name);
});

on('click', 'newTemplate', (el) => {
  const clientId = el.dataset.client;
  askTemplateName('', 'New template', (name) => {
    const t = createTemplate(clientId, name);
    app.go('#/template/' + t.id);
  });
});

// A session's exercises, sets, supersets and notes become a template. Same name as an existing
// one for this client: replace it (after asking), so a template can be updated from a session.
export function saveTemplateFrom(s, name) {
  const items = copyItems({ clientId: s.clientId, items: s.items.filter((it) => it.exId) });
  const same = templatesFor(s.clientId).find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (same) {
    if (!confirm(`${clientById(s.clientId).first} already has a template called “${same.name}”. Replace its exercises with this session’s?`)) return;
    same.items = items;
    save();
    app.toast(`Template “${same.name}” updated`);
  } else {
    createTemplate(s.clientId, name, items);
    app.toast(`Saved as template “${name}”`);
  }
  app.rerender();
}

on('click', 'saveAsTemplate', (el) => {
  const s = sessionById(el.dataset.id);
  askTemplateName(s.focus || '', 'Save as template', (name) => saveTemplateFrom(s, name));
});
