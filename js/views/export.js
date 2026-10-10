// "Export" dialog on the client profile: pick sections and a date range,
// then share or download a training summary PDF.

import { icon, on, app, todayISO, addDays, fromISO, toISO } from '../util.js';
import { clientById, doneFor, personalBests } from '../store.js';
import { prepare, isPrepared, buildClientPdf, pdfFileName, sessionsInRange } from '../pdf.js';

// Client notes, or a note on any exercise in their completed sessions.
const clientHasNotes = (c) => !!c.notes || doneFor(c.id).some((s) => s.items.some((it) => it.note));

const st = { clientId: null, history: true, pbs: true, notes: false, preset: '3m', from: '', to: '', status: 'loading' };

const monthsAgo = (n) => {
  const d = fromISO(todayISO());
  d.setMonth(d.getMonth() - n);
  return toISO(d);
};

function presetRange(preset, clientId) {
  const t = todayISO();
  if (preset === '4w') return [addDays(t, -27), t];
  if (preset === '3m') return [monthsAgo(3), t];
  if (preset === '6m') return [monthsAgo(6), t];
  const first = doneFor(clientId)[0];
  const c = clientById(clientId);
  return [first ? first.date : (c && c.createdAt) || t, t];
}

let canShareFiles = false;
try {
  canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.pdf', { type: 'application/pdf' })] }));
} catch (e) {
  canShareFiles = false;
}

const toggle = (key, title, sub, checked, disabled) => `
  <label class="switch-row${disabled ? ' is-disabled' : ''}">
    <span class="switch-text"><strong>${title}</strong><span>${sub}</span></span>
    <input type="checkbox" role="switch" class="switch" data-change="expToggle" data-k="${key}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}>
  </label>`;

function html() {
  const c = clientById(st.clientId);
  const inRange = sessionsInRange(c.id, st.from, st.to).length;
  const pbCount = personalBests(c.id).length;
  const presets = [['4w', '4 weeks'], ['3m', '3 months'], ['6m', '6 months'], ['all', 'All time']]
    .map(([v, label]) => `<button type="button" class="seg-btn" data-act="expPreset" data-v="${v}" aria-pressed="${st.preset === v}">${label}</button>`)
    .join('');
  const hasNotes = clientHasNotes(c);
  const nothing = !st.history && !st.pbs && !(st.notes && hasNotes);
  const busy = st.status !== 'ready';
  const status =
    st.status === 'error'
      ? `<p class="export-status error">Couldn’t load the PDF tools. Check the connection and try again.</p>`
      : nothing
        ? `<p class="export-status">Turn on at least one section.</p>`
        : '';
  return `
  <div class="modal-head"><h2>Export</h2><button type="button" class="btn-icon" data-act="closeModal" aria-label="Close">${icon.x(18)}</button></div>
  <div class="export-opts">
    <div class="export-opt">
      ${toggle('history', 'Exercise history', 'Completed sessions, exercise by exercise', st.history)}
      ${
        st.history
          ? `<div class="export-range">
              <div class="seg seg-fill" role="group" aria-label="Date range">${presets}</div>
              <div class="form-grid tight">
                <label class="field-label">From<input class="field" type="date" value="${st.from}" max="${st.to}" data-change="expDate" data-k="from"></label>
                <label class="field-label">To<input class="field" type="date" value="${st.to}" min="${st.from}" data-change="expDate" data-k="to"></label>
              </div>
              <p class="muted small">${inRange} completed session${inRange === 1 ? '' : 's'} in this range</p>
            </div>`
          : ''
      }
    </div>
    <div class="export-opt">${toggle('pbs', 'Personal bests', pbCount ? `All-time best for ${pbCount} exercise${pbCount === 1 ? '' : 's'}` : 'None yet', st.pbs)}</div>
    <div class="export-opt">${toggle('notes', 'Notes', hasNotes ? 'The client’s notes and any notes on exercises' : 'No notes for this client', st.notes && hasNotes, !hasNotes)}</div>
  </div>
  ${status}
  <div class="export-actions">
    <button type="button" class="btn ${canShareFiles ? 'btn-outline' : 'btn-dark'}" data-act="expGo" data-mode="download"${busy || nothing ? ' disabled' : ''}>${icon.download(16)}${busy && st.status === 'loading' ? 'Preparing…' : 'Download'}</button>
    ${canShareFiles ? `<button type="button" class="btn btn-dark" data-act="expGo" data-mode="share"${busy || nothing ? ' disabled' : ''}>${icon.share(16)}Share PDF</button>` : ''}
  </div>`;
}

function paint() {
  const m = document.querySelector('.modal');
  if (m) m.innerHTML = html();
}

function load() {
  if (isPrepared()) {
    st.status = 'ready';
    return;
  }
  st.status = 'loading';
  prepare()
    .then(() => {
      st.status = 'ready';
      paint();
    })
    .catch(() => {
      st.status = 'error';
      paint();
    });
}

on('click', 'openExport', (el) => {
  const id = el.dataset.id;
  if (st.clientId !== id) {
    Object.assign(st, { clientId: id, history: true, pbs: true, notes: false, preset: '3m' });
    [st.from, st.to] = presetRange('3m', id);
  }
  load();
  app.modal(html(), 'Export');
});

on('change', 'expToggle', (el) => {
  st[el.dataset.k] = el.checked;
  if (st.status === 'error') load();
  paint();
});

on('click', 'expPreset', (el) => {
  st.preset = el.dataset.v;
  [st.from, st.to] = presetRange(st.preset, st.clientId);
  paint();
});

on('change', 'expDate', (el) => {
  if (!el.value) return;
  st[el.dataset.k] = el.value;
  if (st.from > st.to) [st.from, st.to] = [st.to, st.from];
  st.preset = 'custom';
  paint();
});

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

on('click', 'expGo', (el) => {
  if (!isPrepared()) return;
  const c = clientById(st.clientId);
  const opts = { history: st.history, pbs: st.pbs, notes: st.notes && clientHasNotes(c), from: st.from, to: st.to };
  let blob;
  try {
    blob = buildClientPdf(c, opts);
  } catch (e) {
    console.error(e);
    app.toast('Couldn’t create the PDF');
    return;
  }
  const name = pdfFileName(c);
  if (el.dataset.mode === 'share') {
    const file = new File([blob], name, { type: 'application/pdf' });
    navigator
      .share({ files: [file], title: name.replace(/\.pdf$/, '') })
      .then(() => app.closeModal())
      .catch((err) => {
        if (err && err.name === 'AbortError') return;
        download(blob, name);
      });
  } else {
    download(blob, name);
    app.toast('PDF downloaded');
  }
});
