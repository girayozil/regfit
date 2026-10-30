// Copying a session: start from last time's numbers, or each exercise's personal best (for when
// the client took it easy that day). Only asks when the two differ.

import { esc, icon, on, app, fmtShort } from '../util.js';
import { bestsDiffer } from '../store.js';

let pending = null;

// Calls done(withBests) straight away when nothing differs, otherwise after the trainer picks.
export function pickNumbers(src, done) {
  const diff = bestsDiffer(src);
  if (!diff.length) return done(false);
  pending = done;
  const n = src.items.filter((it) => it.exId).length;
  app.modal(
    `<div class="modal-head"><h2>Which numbers?</h2><button type="button" class="btn-icon" data-act="closeModal" aria-label="Close">${icon.x(18)}</button></div>
     <p class="muted small">${diff.length} of ${n} exercise${n === 1 ? '' : 's'} on ${esc(fmtShort(src.date))} differ from the personal best.</p>
     <div class="num-diff" role="table" aria-label="Last time and personal best">
       <div class="num-row num-head" role="row"><span role="columnheader">Exercise</span><span role="columnheader">Last time</span><span role="columnheader">Best</span></div>
       ${diff
         .map((d) => `<div class="num-row" role="row"><span role="cell">${esc(d.name)}</span><span role="cell">${esc(d.last)}</span><strong role="cell">${esc(d.best)}</strong></div>`)
         .join('')}
     </div>
     <div class="note-actions">
       <button type="button" class="btn btn-outline" data-act="copyNumbers" data-v="last">Last time</button>
       <button type="button" class="btn btn-dark" data-act="copyNumbers" data-v="best">${icon.trophy(16)}Personal bests</button>
     </div>`,
    'Which numbers?'
  );
}

on('click', 'copyNumbers', (el) => {
  const done = pending;
  pending = null;
  app.closeModal();
  if (done) done(el.dataset.v === 'best');
});
