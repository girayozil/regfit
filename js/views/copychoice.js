// Starting from a session or a template: which numbers to use. A copied session offers its own
// numbers ("last time") or each exercise's personal best (for when the client took it easy that
// day); a template offers its own numbers, last time's, or the personal bests. Only asks when
// they differ.

import { esc, icon, on, app, fmtShort } from '../util.js';
import { numberChoices } from '../store.js';

let pending = null;

// Calls done(numbers) with 'as-is', 'last' or 'best': straight away when nothing differs,
// otherwise once the trainer picks.
export function pickNumbers(from, done, { template = false } = {}) {
  const diff = numberChoices(from, template);
  if (!diff.length) return done('as-is');
  pending = done;
  const n = from.items.filter((it) => it.exId).length;
  const cols = template
    ? [['own', 'Template', 'as-is'], ['last', 'Last time', 'last'], ['best', 'Best', 'best']]
    : [['own', 'Last time', 'as-is'], ['best', 'Best', 'best']];
  const intro = template
    ? `${diff.length} of ${n} exercise${n === 1 ? '' : 's'} in ${esc(from.name)} differ from last time or the personal best.`
    : `${diff.length} of ${n} exercise${n === 1 ? '' : 's'} on ${esc(fmtShort(from.date))} differ from the personal best.`;
  const row = (d) =>
    `<div class="num-row" role="row"><span class="num-name" role="rowheader">${esc(d.name)}</span>${cols
      .map(([k], i) => (i === cols.length - 1 ? `<strong role="cell">${esc(d[k])}</strong>` : `<span role="cell">${esc(d[k])}</span>`))
      .join('')}</div>`;
  app.modal(
    `<div class="modal-head"><h2>Which numbers?</h2><button type="button" class="btn-icon" data-act="closeModal" aria-label="Close">${icon.x(18)}</button></div>
     <p class="muted small">${intro}</p>
     <div class="num-diff cols-${cols.length}" role="table" aria-label="Numbers to start from">
       <div class="num-row num-head" role="row">${cols.map(([, label]) => `<span role="columnheader">${label}</span>`).join('')}</div>
       ${diff.map(row).join('')}
     </div>
     <div class="num-actions cols-${cols.length}">
       ${cols
         .map(([, label, v], i) => `<button type="button" class="btn ${i === cols.length - 1 ? 'btn-dark' : 'btn-outline'}" data-act="copyNumbers" data-v="${v}">${v === 'best' ? icon.trophy(16) + 'Personal bests' : label}</button>`)
         .join('')}
     </div>`,
    'Which numbers?'
  );
}

on('click', 'copyNumbers', (el) => {
  const done = pending;
  pending = null;
  app.closeModal();
  if (done) done(el.dataset.v);
});
