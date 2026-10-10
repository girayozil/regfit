// Settings: account & sync, backup/restore, demo data, install tip.

import { esc, icon, on, app, todayISO } from '../util.js';
import { db, replaceData, demoData, emptyData, isValidBackup } from '../store.js';

export function render() {
  const done = db.sessions.filter((s) => s.status === 'done').length;
  return `
  <header class="page-head"><div><div class="eyebrow">RegFit</div><h1 class="page-title">Settings</h1></div></header>
  <section class="card settings-card">
    <div class="card-head"><h2>Account</h2></div>
    <p>Signed in as <strong>${esc((app.account && app.account.email) || '')}</strong></p>
    <p class="muted small sync-line"><span class="sync-dot"></span><span id="sync-status">${esc(app.syncLabel ? app.syncLabel() : '')}</span></p>
    <div class="settings-actions">
      <button type="button" class="btn btn-outline" data-act="signOut">Sign out</button>
    </div>
  </section>
  <section class="card settings-card">
    <div class="card-head"><h2>Your data</h2></div>
    <p class="muted">Saved to your account and synced to every device you sign in on. It also works offline — changes sync when you’re back online. A backup file is a good extra safety net.</p>
    <dl class="stats stats-3">
      <div class="stat"><dt>Clients</dt><dd>${db.clients.length}</dd></div>
      <div class="stat"><dt>Sessions logged</dt><dd>${done}</dd></div>
      <div class="stat"><dt>Exercises</dt><dd>${db.exercises.length}</dd></div>
    </dl>
    <div class="settings-actions">
      <button type="button" class="btn btn-dark" data-act="exportData">${icon.download(16)}Export backup</button>
      <label class="btn btn-outline file-btn">${icon.upload(16)}Import backup<input type="file" accept="application/json,.json" data-change="importData"></label>
    </div>
  </section>
  <section class="card settings-card">
    <div class="card-head"><h2>Install on iPad or iPhone</h2></div>
    <ol class="steps">
      <li>Open this page in <strong>Safari</strong>.</li>
      <li>Tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>.</li>
      <li>Open RegFit from the home screen — it runs full-screen and works offline.</li>
    </ol>
    <p class="muted small">You’ll sign in once on each device.</p>
  </section>
  <section class="card settings-card">
    <div class="card-head"><h2>Start over</h2></div>
    <p class="muted">These change your account on every device. Export a backup first if you might need the current data.</p>
    <div class="settings-actions">
      <button type="button" class="btn btn-outline danger" data-act="eraseData">${icon.trash(16)}Erase clients &amp; sessions</button>
      <button type="button" class="btn btn-ghost" data-act="loadDemo">Load demo data</button>
    </div>
  </section>`;
}

on('click', 'signOut', () => app.signOut());

on('click', 'exportData', () => {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `regfit-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

on('change', 'importData', (el) => {
  const file = el.files && el.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!isValidBackup(d)) throw new Error('bad');
      if (!confirm(`Replace all data in your account, on every device, with the backup (${d.clients.length} clients, ${d.sessions.length} sessions)?`)) return;
      replaceData(d);
      app.toast('Backup restored');
      app.rerender();
    } catch (e) {
      app.toast('That file isn’t a RegFit backup');
    }
    el.value = '';
  };
  reader.readAsText(file);
});

on('click', 'eraseData', () => {
  if (!confirm('Erase all clients and sessions from your account, on every device? The exercise library is kept. Export a backup first if you might need them.')) return;
  replaceData({ ...emptyData(), exercises: db.exercises });
  app.toast('Clients and sessions erased');
  app.rerender();
});

on('click', 'loadDemo', () => {
  if ((db.clients.length || db.sessions.length) && !confirm('Replace everything in your account, on every device, with demo data?')) return;
  replaceData(demoData());
  app.toast('Demo data loaded');
  app.rerender();
});
