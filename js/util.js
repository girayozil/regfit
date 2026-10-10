// Shared helpers: escaping, dates, ids, icons, and the event-handler registry.

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = (prefix) => prefix + '-' + Math.random().toString(36).slice(2, 9);

// ---------- dates (always local YYYY-MM-DD strings) ----------

const pad = (n) => String(n).padStart(2, '0');

export const toISO = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const fromISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayISO = () => toISO(new Date());
export const addDays = (iso, n) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const weekStart = (iso) => {
  const d = fromISO(iso);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return toISO(d);
};

const fmt = (iso, opts) => fromISO(iso).toLocaleDateString('en-GB', opts);
export const fmtShort = (iso) => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' }); // Sat 10 Oct
export const fmtLong = (iso) => fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' }); // Saturday, 10 October
export const fmtMonthYear = (iso) => fmt(iso, { month: 'long', year: 'numeric' });
export const dowShort = (iso) => fmt(iso, { weekday: 'short' });
export const dayNum = (iso) => fromISO(iso).getDate();
export const monShort = (iso) => fmt(iso, { month: 'short' });

export const relDay = (iso) => {
  const t = todayISO();
  if (iso === t) return 'Today';
  if (iso === addDays(t, 1)) return 'Tomorrow';
  if (iso === addDays(t, -1)) return 'Yesterday';
  return fmtShort(iso);
};

export const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
export const timeToMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const minToTime = (m) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);

// ---------- formatting ----------

export const initials = (c) => ((c.first || '')[0] || '').toUpperCase() + ((c.last || '')[0] || '').toUpperCase();
export const fullName = (c) => ((c.first || '') + ' ' + (c.last || '')).trim();
export const fmtKg = (w) => (w === '' || w == null ? '' : String(+(+w).toFixed(2)).replace(/\.0+$/, '') + ' kg');
export const parseNum = (s) => {
  if (s === '' || s == null) return '';
  const n = parseFloat(String(s).replace(',', '.'));
  return isNaN(n) ? '' : n;
};
export const isTimed = (reps) => /s$/.test(String(reps));
export const repsLabel = (reps) => (isTimed(reps) ? parseInt(reps, 10) + ' s' : String(reps));

const TINTS = ['#E4EBD6', '#E6E1F0', '#DDE8EE', '#F0E4DA', '#E9E6D6', '#DCEBE4'];
export const tint = (id) => {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
};

// ---------- handler registry (event delegation targets) ----------

export const handlers = { click: {}, change: {}, input: {} };
export const on = (type, name, fn) => {
  handlers[type][name] = fn;
};

// ---------- icons (stroke, currentColor) ----------

const svg = (body, size = 18, sw = 1.9) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icon = {
  today: (s) => svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>', s),
  clients: (s) => svg('<path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1"/><circle cx="9.5" cy="8" r="3.5"/><path d="M21 20v-1a4 4 0 0 0-3-3.87M16 4.13a4 4 0 0 1 0 7.75"/>', s),
  dumbbell: (s, sw) => svg('<path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12"/>', s, sw),
  settings: (s) => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', s),
  plus: (s) => svg('<path d="M12 5v14M5 12h14"/>', s, 2.2),
  search: (s) => svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', s, 2),
  copy: (s) => svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>', s),
  edit: (s) => svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>', s),
  left: (s) => svg('<path d="M15 6l-6 6 6 6"/>', s, 2),
  right: (s) => svg('<path d="M9 6l6 6-6 6"/>', s, 2),
  down: (s) => svg('<path d="M6 9l6 6 6-6"/>', s, 2),
  x: (s) => svg('<path d="M6 6l12 12M18 6L6 18"/>', s, 2),
  check: (s) => svg('<path d="M5 12l5 5L20 7"/>', s, 2.2),
  trophy: (s) => svg('<path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>', s),
  blank: (s) => svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>', s),
  arrow: (s) => svg('<path d="M5 12h14M13 6l6 6-6 6"/>', s, 2.2),
  trash: (s) => svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', s),
  up: (s) => svg('<path d="M6 15l6-6 6 6"/>', s, 2),
  clock: (s) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', s),
  download: (s) => svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', s),
  upload: (s) => svg('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>', s),
  share: (s) => svg('<path d="M12 15V3M7 8l5-5 5 5M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>', s),
  file: (s) => svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>', s),
};

// Native-looking select with a chevron overlay.
export const select = (attrs, optionsHtml) =>
  `<span class="select-wrap"><select ${attrs}>${optionsHtml}</select>${icon.down(16)}</span>`;

export const opt = (value, label, selected) =>
  `<option value="${esc(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(label)}</option>`;

// App-level hooks, filled in by app.js (keeps views free of circular imports).
export const app = {
  rerender: () => {},
  toast: () => {},
  modal: () => {},
  closeModal: () => {},
  go: (hash) => {
    location.hash = hash;
  },
};

// UI breakpoints, kept in sync with styles.css.
export const isWide = () => matchMedia('(min-width: 1024px)').matches;
