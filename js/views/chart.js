// Progress chart on the client profile: one exercise, one personal-best category,
// one point per completed session, over a chosen date range.

import { esc, on, app, todayISO, fromISO, toISO, fmtShort, select, opt } from '../util.js';
import { doneFor, exName, exerciseSeries, seriesUnit, PB_CATEGORIES } from '../store.js';

const RANGES = [
  ['3m', '3M', 3],
  ['6m', '6M', 6],
  ['1y', '1Y', 12],
  ['all', 'All', 0],
];
const ui = {}; // per client: { exId, key, range }

const monthsAgo = (n) => {
  const d = fromISO(todayISO());
  d.setMonth(d.getMonth() - n);
  return toISO(d);
};
const days = (a, b) => (fromISO(b) - fromISO(a)) / 86400000;
const fmtVal = (v, unit) => (Math.round(v * 10) / 10).toLocaleString('en-GB') + (unit === 'reps' ? ' reps' : ' ' + unit);

// Exercises this client has logged, most-logged first. Ties go to the order of the latest
// session (its first exercise is usually the main lift), then alphabetical.
function loggedExercises(clientId) {
  const done = doneFor(clientId);
  const count = {};
  done.forEach((s) => new Set(s.items.map((it) => it.exId)).forEach((id) => (count[id] = (count[id] || 0) + 1)));
  const latest = done.length ? done[done.length - 1].items.map((it) => it.exId) : [];
  const pos = (id) => (latest.includes(id) ? latest.indexOf(id) : 99);
  return Object.entries(count)
    .map(([id, n]) => ({ id, n, name: exName(id) }))
    .sort((a, b) => b.n - a.n || pos(a.id) - pos(b.id) || a.name.localeCompare(b.name));
}

function stateFor(clientId) {
  const ex = loggedExercises(clientId);
  const st = (ui[clientId] = ui[clientId] || { key: 'heaviest', range: 'all' });
  if (!st.exId || !ex.some((e) => e.id === st.exId)) st.exId = ex[0] && ex[0].id;
  return { st, ex };
}

function points(clientId, st) {
  let pts = exerciseSeries(clientId, st.exId, st.key);
  const r = RANGES.find((x) => x[0] === st.range);
  const from = r[2] ? monthsAgo(r[2]) : pts.length ? pts[0].date : todayISO();
  pts = pts.filter((p) => p.date >= from);
  // Mark sessions that set a new record (vs everything before them, in or out of range).
  let best = -Infinity;
  exerciseSeries(clientId, st.exId, st.key).forEach((p) => {
    const hit = pts.find((q) => q.sessionId === p.sessionId);
    if (p.value > best) {
      if (hit) hit.record = best !== -Infinity;
      best = p.value;
    }
  });
  return { pts, from };
}

function inner(clientId) {
  const { st, ex } = stateFor(clientId);
  if (!ex.length) return `<div class="card-head"><h2>Progress</h2></div><p class="muted pad-y">Charts appear after the first logged session.</p>`;
  const exSelect = select(`aria-label="Exercise" data-change="chartEx" data-client="${clientId}"`, ex.map((e) => opt(e.id, `${e.name} (${e.n})`, st.exId)).join(''));
  const keyTabs = PB_CATEGORIES.map((c) => `<button type="button" class="seg-btn" data-act="chartKey" data-v="${c.key}" data-client="${clientId}" aria-pressed="${st.key === c.key}">${c.label}</button>`).join('');
  const rangeTabs = RANGES.map(([v, label]) => `<button type="button" class="seg-btn" data-act="chartRange" data-v="${v}" data-client="${clientId}" aria-pressed="${st.range === v}">${label}</button>`).join('');
  const { pts } = points(clientId, st);
  const unit = seriesUnit(st.exId, st.key);
  const cat = PB_CATEGORIES.find((c) => c.key === st.key);
  const table = pts.length
    ? `<details class="chart-data"><summary>Show data</summary><table><thead><tr><th>Date</th><th>${esc(cat.label)}</th><th>Detail</th></tr></thead><tbody>${pts
        .slice()
        .reverse()
        .map((p) => `<tr><td>${esc(fmtShort(p.date))}</td><td>${esc(p.display)}</td><td>${esc(p.detail || '—')}${p.record ? ' · new best' : ''}</td></tr>`)
        .join('')}</tbody></table></details>`
    : '';
  return `
    <div class="card-head"><h2>Progress</h2><span class="muted small">${esc(exName(st.exId))} · ${esc(cat.label.toLowerCase())} · ${unit}</span></div>
    <div class="chart-controls">
      <div class="chart-ex">${exSelect}</div>
      <div class="seg" role="group" aria-label="Measure">${keyTabs}</div>
      <div class="seg" role="group" aria-label="Date range">${rangeTabs}</div>
    </div>
    ${
      pts.length
        ? `<div class="chart" id="progress-chart" data-client="${clientId}"><div class="chart-tip" role="status" aria-live="polite"></div></div>
           <div class="chart-key"><span class="key-dot"></span>New personal best at the time</div>`
        : `<p class="muted pad-y">No ${esc(cat.label.toLowerCase())} logged for ${esc(exName(st.exId))} in this period.</p>`
    }
    ${table}`;
}

export function cardHtml(clientId) {
  app.afterRender = draw;
  return `<section class="card progress-card" id="progress-card" aria-label="Progress chart">${inner(clientId)}</section>`;
}

function refresh(clientId) {
  const card = document.getElementById('progress-card');
  if (!card) return;
  card.innerHTML = inner(clientId);
  draw();
}

// Clean axis ticks: ~4 steps of 1/2/2.5/5 × 10^n.
function niceTicks(lo, hi) {
  if (lo === hi) {
    const pad = Math.max(1, Math.abs(lo) * 0.1);
    lo -= pad;
    hi += pad;
  }
  const raw = (hi - lo) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

function monthTicks(from, to, maxTicks) {
  const out = [];
  const d = fromISO(from);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  while (toISO(d) <= to) {
    out.push(toISO(d));
    d.setMonth(d.getMonth() + 1);
  }
  const step = Math.ceil(out.length / maxTicks) || 1;
  return out.filter((_, i) => i % step === 0);
}

function draw() {
  const el = document.getElementById('progress-chart');
  if (!el) return;
  const clientId = el.dataset.client;
  const { st } = stateFor(clientId);
  const { pts, from } = points(clientId, st);
  if (!pts.length) return;
  const unit = seriesUnit(st.exId, st.key);
  const today = todayISO();

  const W = Math.max(280, el.clientWidth);
  const H = W < 500 ? 210 : 250;
  const yTicks = niceTicks(Math.min(...pts.map((p) => p.value)), Math.max(...pts.map((p) => p.value)));
  const fmtTick = (v) => v.toLocaleString('en-GB');
  const padL = 12 + Math.max(...yTicks.map((t) => fmtTick(t).length)) * 7.2;
  const pad = { l: padL, r: 18, t: 26, b: 28 };
  let x0 = from;
  let x1 = today;
  if (days(x0, x1) < 14) x0 = toISO(new Date(fromISO(x1) - 14 * 86400000));
  const sx = (iso) => pad.l + (days(x0, iso) / days(x0, x1)) * (W - pad.l - pad.r);
  const yLo = yTicks[0];
  const yHi = yTicks[yTicks.length - 1];
  const sy = (v) => pad.t + (1 - (v - yLo) / (yHi - yLo)) * (H - pad.t - pad.b);

  const xt = monthTicks(x0, x1, W < 500 ? 4 : 7);
  const spansYears = x0.slice(0, 4) !== x1.slice(0, 4);
  const monthLabel = (iso) => fromISO(iso).toLocaleDateString('en-GB', spansYears || iso.slice(5, 7) === '01' ? { month: 'short', year: '2-digit' } : { month: 'short' });

  const grid = yTicks
    .map((t) => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${sy(t)}" y2="${sy(t)}"/><text class="tick" x="${pad.l - 8}" y="${sy(t) + 4}" text-anchor="end">${fmtTick(t)}</text>`)
    .join('');
  const xAxis = xt.map((t) => `<text class="tick" x="${sx(t)}" y="${H - 8}" text-anchor="middle">${esc(monthLabel(t))}</text>`).join('');
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.date).toFixed(1)},${sy(p.value).toFixed(1)}`).join('');
  const dots = pts
    .map((p) =>
      p.record
        ? `<circle class="dot dot-record" cx="${sx(p.date)}" cy="${sy(p.value)}" r="5.5"/>`
        : `<circle class="dot" cx="${sx(p.date)}" cy="${sy(p.value)}" r="4"/>`
    )
    .join('');

  // Direct labels: the best value and the latest one (only once if they're the same point).
  const maxP = pts.reduce((a, b) => (b.value >= a.value ? b : a));
  const lastP = pts[pts.length - 1];
  const label = (p, text) => {
    const x = sx(p.date);
    const anchor = x > W - 70 ? 'end' : x < pad.l + 40 ? 'start' : 'middle';
    return `<text class="dlabel" x="${x}" y="${sy(p.value) - 11}" text-anchor="${anchor}">${esc(text)}</text>`;
  };
  const labels = label(maxP, 'Best ' + fmtVal(maxP.value, unit)) + (lastP !== maxP && sy(lastP.value) - sy(maxP.value) > 18 ? label(lastP, fmtVal(lastP.value, unit)) : '');

  const svg = `<svg class="chart-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(exName(st.exId))}: ${pts.length} sessions, best ${esc(fmtVal(maxP.value, unit))}">
    ${grid}${xAxis}
    <line class="cross" x1="0" x2="0" y1="${pad.t - 6}" y2="${H - pad.b}" visibility="hidden"/>
    <path class="line" d="${path}"/>
    ${dots}${labels}
    <circle class="dot-hover" r="6.5" visibility="hidden"/>
    <rect class="hit" x="${pad.l - 10}" y="0" width="${W - pad.l - pad.r + 20}" height="${H}" tabindex="0" aria-label="Chart values; use left and right arrow keys"/>
  </svg>`;
  const tip = el.querySelector('.chart-tip');
  el.querySelectorAll('svg').forEach((n) => n.remove());
  el.insertAdjacentHTML('afterbegin', svg);

  // ---- hover / touch / keyboard: snap to the nearest session ----
  const svgEl = el.querySelector('svg');
  const cross = svgEl.querySelector('.cross');
  const hover = svgEl.querySelector('.dot-hover');
  const hit = svgEl.querySelector('.hit');
  let idx = -1;
  const show = (i) => {
    idx = i;
    const p = pts[i];
    const x = sx(p.date);
    const y = sy(p.value);
    cross.setAttribute('x1', x);
    cross.setAttribute('x2', x);
    cross.setAttribute('visibility', 'visible');
    hover.setAttribute('cx', x);
    hover.setAttribute('cy', y);
    hover.setAttribute('visibility', 'visible');
    tip.textContent = '';
    const v = document.createElement('strong');
    v.textContent = p.display;
    const d = document.createElement('span');
    d.textContent = [p.detail, fmtShort(p.date), p.record ? 'New best' : ''].filter(Boolean).join(' · ');
    tip.append(v, d);
    tip.classList.add('show');
    const tw = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(x - tw / 2, 0), W - tw) + 'px';
    tip.style.top = Math.max(y - 64, 0) + 'px';
  };
  const hide = () => {
    idx = -1;
    cross.setAttribute('visibility', 'hidden');
    hover.setAttribute('visibility', 'hidden');
    tip.classList.remove('show');
  };
  const nearest = (clientX) => {
    const r = svgEl.getBoundingClientRect();
    const x = clientX - r.left;
    let bi = 0;
    pts.forEach((p, i) => {
      if (Math.abs(sx(p.date) - x) < Math.abs(sx(pts[bi].date) - x)) bi = i;
    });
    return bi;
  };
  hit.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  hit.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
  hit.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') hide();
  });
  hit.addEventListener('focus', () => show(idx >= 0 ? idx : pts.length - 1));
  hit.addEventListener('blur', hide);
  hit.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      show(Math.min(pts.length - 1, Math.max(0, (idx < 0 ? pts.length - 1 : idx) + (e.key === 'ArrowRight' ? 1 : -1))));
    }
  });
}

// Redraw at the new width when the window resizes or rotates.
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(draw, 120);
});

on('change', 'chartEx', (el) => {
  ui[el.dataset.client].exId = el.value;
  refresh(el.dataset.client);
});
on('click', 'chartKey', (el) => {
  ui[el.dataset.client].key = el.dataset.v;
  refresh(el.dataset.client);
});
on('click', 'chartRange', (el) => {
  ui[el.dataset.client].range = el.dataset.v;
  refresh(el.dataset.client);
});
