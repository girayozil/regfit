// App shell: hash router, event delegation, toast + modal, service worker.

import { app, handlers, icon, isWide, todayISO } from './util.js';
import { sessionsOn } from './store.js';
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

function render() {
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
  if (e.key === 'Escape') closeModal();
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
app.modal = (html, label) => {
  lastFocus = document.activeElement;
  modalRoot.innerHTML = `<div class="modal-backdrop" data-act="closeModal"><div class="modal" role="dialog" aria-modal="true" aria-label="${label}" data-act="noop">${html}</div></div>`;
  document.body.classList.add('modal-open');
  const first = modalRoot.querySelector('input, button, a');
  if (first && isWide()) first.focus();
};
function closeModal() {
  if (!modalRoot.innerHTML) return;
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

// ---------- go ----------

lastPath = currentPath();
render();

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
