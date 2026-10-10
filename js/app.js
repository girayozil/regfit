// App shell: sign-in gate, hash router, event delegation, toast + modal, cloud sync, service worker.

import { app, handlers, icon, isWide, todayISO } from './util.js';
import { sessionsOn, startSync, stopSync, applyRemote, flush, markAllUnsynced, replaceData, localOnlyData, demoData, emptyData, db } from './store.js';
import * as auth from './views/auth.js';
import * as today from './views/today.js';
import * as clients from './views/clients.js';
import * as client from './views/client.js';
import * as session from './views/session.js';
import * as library from './views/library.js';
import * as settings from './views/settings.js';

const routes = [
  [/^\/?(today)?$/, 'today', () => today.render()],
  [/^\/clients$/, 'clients', () => clients.renderList()],
  [/^\/clients\/new$/, 'clients', () => clients.renderForm(null)],
  [/^\/client\/([^/]+)\/edit$/, 'clients', (m) => clients.renderForm(m[1])],
  [/^\/client\/([^/]+)$/, 'clients', (m) => client.render(m[1])],
  [/^\/session\/([^/]+)$/, 'today', (m) => session.render(m[1])],
  [/^\/library(?:\/([^/]+))?$/, 'library', (m) => library.render(m[1] || null)],
  [/^\/settings$/, 'settings', () => settings.render()],
];

const viewEl = document.getElementById('view');
let lastPath = null;

function currentPath() {
  return decodeURIComponent(location.hash.replace(/^#/, '')) || '/today';
}

// 'loading' until Firebase says who is signed in, then 'out' or 'in'.
let authState = 'loading';

function render() {
  document.body.classList.toggle('signed-out', authState !== 'in');
  if (authState === 'loading') {
    viewEl.innerHTML = '<div class="auth-wrap"><p class="muted">Loading…</p></div>';
    return;
  }
  if (authState === 'out') {
    viewEl.innerHTML = auth.renderSignIn();
    document.title = 'Sign in · RegFit';
    return;
  }
  const path = currentPath();
  let html = '';
  let nav = 'today';
  const hit = routes.find(([re]) => re.test(path));
  if (hit) {
    nav = hit[1];
    html = hit[2](path.match(hit[0]));
  } else {
    html = `<div class="empty-state"><h1 class="page-title">Page not found</h1><a class="btn btn-dark" href="#/today">Go to Today</a></div>`;
  }
  viewEl.innerHTML = html;
  // A view can ask for work once its markup is in the page (e.g. measuring a chart's width).
  const after = app.afterRender;
  app.afterRender = null;
  if (after) after();
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const active = a.dataset.nav === nav;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const h1 = viewEl.querySelector('h1');
  document.title = h1 ? h1.textContent.trim() + ' · RegFit' : 'RegFit';
  const n = sessionsOn(todayISO()).length;
  document.getElementById('today-badge').textContent = n ? String(n) : '';
}

app.rerender = render;

window.addEventListener('hashchange', () => {
  const path = currentPath();
  // Same screen with a different selection (e.g. library item) keeps scroll position.
  const base = (p) => p.split('/').slice(0, 2).join('/');
  const sameScreen = lastPath && base(lastPath) === base(path) && path.startsWith('/library');
  lastPath = path;
  closeModal();
  render();
  if (!sameScreen) window.scrollTo(0, 0);
});

// Re-render when crossing the wide/narrow breakpoint (layout differs, e.g. library editor).
matchMedia('(min-width: 1024px)').addEventListener('change', render);

// ---------- event delegation ----------

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = handlers.click[el.dataset.act];
  if (fn) {
    e.preventDefault();
    fn(el, e);
  }
});

for (const type of ['change', 'input']) {
  document.addEventListener(type, (e) => {
    const attr = type === 'change' ? 'data-change' : 'data-input';
    const el = e.target.closest('[' + attr + ']');
    if (!el) return;
    const fn = handlers[type][el.getAttribute(attr)];
    if (fn) fn(el, e);
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalLocked) closeModal();
});

// ---------- toast & modal ----------

let toastTimer;
app.toast = (msg) => {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
};

const modalRoot = document.getElementById('modal-root');
let lastFocus = null;
let modalLocked = false;
// locked: no closing by backdrop tap or Escape (the dialog must be answered).
app.modal = (html, label, locked = false) => {
  lastFocus = document.activeElement;
  modalLocked = locked;
  modalRoot.innerHTML = `<div class="modal-backdrop"${locked ? '' : ' data-act="closeModal"'}><div class="modal" role="dialog" aria-modal="true" aria-label="${label}" data-act="noop">${html}</div></div>`;
  document.body.classList.add('modal-open');
  const first = modalRoot.querySelector('input, button, a');
  if (first && isWide()) first.focus();
};
function closeModal() {
  if (!modalRoot.innerHTML) return;
  modalLocked = false;
  modalRoot.innerHTML = '';
  document.body.classList.remove('modal-open');
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
app.closeModal = closeModal;
handlers.click.closeModal = (el, e) => {
  if (e.target.closest('[data-act]') === el) closeModal();
};
handlers.click.noop = () => {};

// ---------- static icons in the shell ----------

document.querySelectorAll('[data-icon]').forEach((el) => {
  el.innerHTML = icon[el.dataset.icon](el.closest('.tab') ? 22 : 18, el.dataset.icon === 'dumbbell' ? 1.9 : undefined);
});
document.querySelector('.brand-mark').innerHTML = icon.dumbbell(18, 2.4);

// ---------- cloud: sign-in, setup, sync ----------

const sync = { pending: 0, uid: null, unsubscribe: null };
app.syncState = () => ({ pending: sync.pending, online: navigator.onLine, email: app.account && app.account.email });

const updateSyncUI = () => {
  const el = document.getElementById('sync-status');
  if (el) el.textContent = syncLabel();
};
function syncLabel() {
  if (!navigator.onLine) return sync.pending ? 'Offline — changes are saved here and will sync when you’re back online' : 'Offline — showing the copy saved on this device';
  return sync.pending ? 'Syncing…' : 'All changes synced';
}
app.syncLabel = syncLabel;

function push(ops) {
  sync.pending++;
  updateSyncUI();
  return app.cloud
    .write(sync.uid, ops)
    .catch((e) => {
      console.error(e);
      app.toast('Couldn’t save to your account. Check the connection.');
    })
    .finally(() => {
      sync.pending--;
      updateSyncUI();
    });
}

// Re-render for changes from another device, but never under the user's fingers.
let deferred = false;
function renderSoon() {
  const a = document.activeElement;
  if (a && viewEl.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) deferred = true;
  else render();
}
viewEl.addEventListener('focusout', () => {
  setTimeout(() => {
    if (deferred && !(document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))) {
      deferred = false;
      render();
    }
  }, 0);
});

async function signedIn(user) {
  app.account = { email: user.email, uid: user.uid };
  sync.uid = user.uid;
  startSync(user.uid, push);
  authState = 'in';
  render();

  const exists = await app.cloud.accountExists(user.uid);
  if (exists === false) {
    const choice = await auth.askSetup(localOnlyData());
    if (choice === 'upload') replaceData(localOnlyData());
    else if (choice === 'demo') replaceData(demoData());
    else replaceData(emptyData());
    markAllUnsynced();
    app.toast('Setting up your account…');
    await flush();
    await app.cloud.markAccount(user.uid);
    app.toast('Your account is ready');
    render();
  } else if (exists === null && !db.clients.length && !db.sessions.length) {
    app.toast('Offline — connect to the internet to load your data');
  }
  sync.unsubscribe = app.cloud.subscribe(user.uid, (name, changes, first) => {
    if (applyRemote(name, changes, first)) renderSoon();
  });
}

app.signOut = async () => {
  await flush();
  if (sync.pending && !confirm('Some changes haven’t reached your account yet (no connection?). Sign out anyway and lose them?')) return;
  if (sync.unsubscribe) sync.unsubscribe();
  stopSync(sync.uid);
  await app.cloud.signOutAndClear();
  location.hash = '#/today';
  location.reload();
};

// Make sure pending edits are sent before the app is backgrounded or closed.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});
window.addEventListener('pagehide', () => flush());
window.addEventListener('online', () => {
  document.body.classList.remove('is-offline');
  updateSyncUI();
});
window.addEventListener('offline', () => {
  document.body.classList.add('is-offline');
  updateSyncUI();
});
document.body.classList.toggle('is-offline', !navigator.onLine);

async function boot() {
  lastPath = currentPath();
  render();
  try {
    app.cloud = await import('./cloud.js');
    await app.cloud.init();
  } catch (e) {
    console.error(e);
    viewEl.innerHTML = '<div class="auth-wrap"><div class="auth-card"><h1 class="page-title">Can’t reach RegFit</h1><p class="muted">Connect to the internet and try again.</p><button type="button" class="btn btn-dark wide" onclick="location.reload()">Try again</button></div></div>';
    return;
  }
  let first = true;
  app.cloud.onAuth((user) => {
    if (user) {
      if (first || !app.account) signedIn(user);
    } else {
      authState = 'out';
      auth.resetSignInForm();
      render();
    }
    first = false;
  });
}

boot();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // When a new version takes over, reload once so the page runs the new code
  // (an app opened from the home screen otherwise keeps running the old code).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker
    .register('sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      // Check for a new version whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {});
}
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}
