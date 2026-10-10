// Client profile: details, upcoming sessions, personal bests, past workouts.

import { esc, icon, on, app, fullName, initials, tint, relDay, fmtShort, monShort, dayNum, fmtMonthYear, todayISO, addDays, fmtKg } from '../util.js';
import { clientById, sessionsFor, doneFor, nextSession, personalBests, exName, exById, describe, createSession, copyItems, sessionById, save, sessionEnded } from '../store.js';

import './export.js';

const ui = { open: {} }; // expanded past session per client

const statTile = (label, value, unit, extra = '') =>
  `<div class="stat ${extra}"><dt>${label}</dt><dd>${value === '' || value == null ? '—' : esc(value)}${unit && value !== '' && value != null ? ` <span>${unit}</span>` : ''}</dd></div>`;

export function render(id) {
  const c = clientById(id);
  if (!c) return `<div class="empty-state"><h1 class="page-title">Client not found</h1><a class="btn btn-dark" href="#/clients">Back to clients</a></div>`;
  const all = sessionsFor(id);
  const done = doneFor(id).slice().reverse();
  const planned = all.filter((s) => s.status === 'planned');
  const next = nextSession(id);
  const pbs = personalBests(id);
  const openId = id in ui.open ? ui.open[id] : done[0] && done[0].id;

  const upcoming = planned.length
    ? `<section class="card" aria-label="Planned sessions">
        <div class="card-head"><h2>Planned</h2><span class="muted small">${planned.length}</span></div>
        <div class="chip-list">${planned
          .map((s) => {
            const late = sessionEnded(s);
            return `<a class="plan-chip${late ? ' late' : ''}" href="#/session/${s.id}">
              <strong>${esc(relDay(s.date))} · ${esc(s.time)}</strong>
              <span>${esc(s.focus || 'No focus')} · ${s.items.length ? s.items.length + ' exercises' : 'not planned yet'}${late ? ' · to log' : ''}</span>
            </a>`;
          })
          .join('')}</div>
      </section>`
    : '';

  const pbHtml = pbs.length
    ? `<ul class="pb-list">${pbs
        .map(
          (p) => `<li>
            <span class="pb-text"><span class="pb-name">${esc(p.name)}</span><span class="pb-date">Set ${esc(fmtShort(p.date))}</span></span>
            ${p.isNew ? '<span class="pill pill-new">New</span>' : ''}
            <span class="pb-val">${esc(p.display)}</span>
          </li>`
        )
        .join('')}</ul>`
    : `<p class="muted pad-y">Personal bests appear here after the first logged session.</p>`;

  const histHtml = done.length
    ? done
        .map((s) => {
          const open = openId === s.id;
          const sets = s.items.reduce((n, it) => n + (+it.sets || 0), 0);
          return `<div class="hist">
            <button type="button" class="hist-btn" data-act="toggleHist" data-id="${s.id}" data-client="${id}" aria-expanded="${open}">
              <span class="hist-date"><span>${esc(monShort(s.date))}</span><strong>${dayNum(s.date)}</strong></span>
              <span class="hist-text"><span class="hist-title">${esc(s.focus || 'Session')}</span><span class="hist-meta">${esc(fmtShort(s.date).split(' ')[0])} · ${s.items.length} exercises · ${sets} sets</span></span>
              <span class="hist-chev${open ? ' open' : ''}">${icon.down(18)}</span>
            </button>
            ${
              open
                ? `<div class="hist-body">
                    ${s.items
                      .map((it) => {
                        const ex = exById(it.exId);
                        return `<div class="hist-item"><span>${esc(exName(it.exId))}</span><span class="muted">${it.sets} sets</span><strong>${esc(describe(it, ex ? ex.tracking : 'Weight × reps'))}</strong></div>`;
                      })
                      .join('')}
                    <div class="hist-actions">
                      <a class="btn btn-sm btn-outline" href="#/session/${s.id}">Open</a>
                      <button type="button" class="btn btn-sm btn-dark" data-act="useTemplate" data-id="${s.id}">${icon.copy(14)}Use for next session</button>
                    </div>
                  </div>`
                : ''
            }
          </div>`;
        })
        .join('')
    : `<p class="muted pad-y">No completed sessions yet.</p>`;

  return `
  <a class="back" href="#/clients">${icon.left(16)}Clients</a>
  <section class="card profile" aria-label="Client details">
    <div class="profile-head">
      <span class="avatar avatar-xl" style="background:${tint(c.id)}">${esc(initials(c))}</span>
      <div class="profile-name">
        <h1 class="page-title">${esc(fullName(c))}</h1>
        <div class="muted small">Client since ${esc(fmtMonthYear(c.createdAt || todayISO()))} · ${done.length} completed session${done.length === 1 ? '' : 's'}</div>
      </div>
      <div class="head-actions">
        <a class="btn btn-outline" href="#/client/${c.id}/edit">${icon.edit(16)}Edit</a>
        <button type="button" class="btn btn-outline" data-act="openExport" data-id="${c.id}">${icon.file(16)}Export PDF</button>
        <button type="button" class="btn btn-dark" data-act="scheduleNext" data-id="${c.id}">${icon.today(16)}Schedule next workout</button>
      </div>
    </div>
    <dl class="stats">
      ${statTile('Age', c.age)}
      ${statTile('Sex', c.sex)}
      ${statTile('Height', c.height, 'cm')}
      ${statTile('Weight', c.weight === '' ? '' : fmtKg(c.weight).replace(' kg', ''), 'kg')}
      ${
        next
          ? `<a class="stat stat-accent" href="#/session/${next.id}"><dt>Next session</dt><dd>${esc(relDay(next.date))} ${esc(next.time)}</dd></a>`
          : `<div class="stat stat-empty"><dt>Next session</dt><dd>Not scheduled</dd></div>`
      }
    </dl>
    ${c.notes ? `<p class="notes">${esc(c.notes)}</p>` : ''}
  </section>
  ${upcoming}
  <div class="profile-grid">
    <section class="card" aria-label="Personal bests">
      <div class="card-head"><h2>${icon.trophy(18)}Personal bests</h2><span class="muted small">${pbs.length} exercise${pbs.length === 1 ? '' : 's'}</span></div>
      ${pbHtml}
    </section>
    <section class="card" aria-label="Past workouts">
      <div class="card-head"><h2>Past workouts</h2><span class="muted small">${done.length}</span></div>
      ${histHtml}
    </section>
  </div>`;
}

on('click', 'toggleHist', (el) => {
  const { id, client } = el.dataset;
  ui.open[client] = el.getAttribute('aria-expanded') === 'true' ? '' : id;
  app.rerender();
});

// Next date for a new session: the day after the client's latest session, never in the past.
function nextDate(clientId) {
  const t = todayISO();
  const latest = sessionsFor(clientId).slice(-1)[0];
  if (!latest || latest.date < t) return t;
  return addDays(latest.date, latest.date === t ? 1 : 2);
}

on('click', 'scheduleNext', (el) => {
  const id = el.dataset.id;
  const latest = sessionsFor(id).slice(-1)[0];
  const s = createSession(id, nextDate(id), latest ? latest.time : '09:00');
  app.go('#/session/' + s.id);
});

on('click', 'useTemplate', (el) => {
  const src = sessionById(el.dataset.id);
  const s = createSession(src.clientId, nextDate(src.clientId), src.time);
  s.items = copyItems(src);
  s.focus = src.focus;
  s.duration = src.duration;
  s.started = true;
  s.copiedFrom = fmtShort(src.date) + (src.focus ? ' · ' + src.focus : '');
  save();
  app.go('#/session/' + s.id);
});
