// Client summary PDF (A4) built with jsPDF. Shares only the client's name —
// never age, sex, height or weight.
//
// prepare() loads jsPDF and the fonts ahead of time so that building the PDF is
// synchronous and the share sheet still counts as a direct response to the tap
// (iOS rejects navigator.share after a slow await).

import { fullName, fromISO, todayISO, fmtKg, repsLabel } from './util.js';
import { doneFor, personalBests, PB_CATEGORIES, exName, trackingOf, isUniform, totalSets } from './store.js';

let ready = null;
let fonts = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}

async function fontBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not load ' + url);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function prepare() {
  if (!ready) {
    ready = Promise.all([
      window.jspdf ? null : loadScript('vendor/jspdf.umd.min.js'),
      fontBase64('fonts/Manrope-Medium.ttf'),
      fontBase64('fonts/Manrope-ExtraBold.ttf'),
    ])
      .then(([, regular, bold]) => {
        fonts = { regular, bold };
      })
      .catch((e) => {
        ready = null;
        throw e;
      });
  }
  return ready;
}

export const isPrepared = () => !!(fonts && window.jspdf);

// ---------- data ----------

const fmtDate = (iso) => fromISO(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtShortDate = (iso) => fromISO(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const fmtDay = (iso) => fromISO(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export function sessionsInRange(clientId, from, to) {
  return doneFor(clientId)
    .filter((s) => s.date >= from && s.date <= to)
    .reverse();
}

const setLoad = (set, tracking) => {
  const w = set.weight;
  if (tracking === 'Weight × reps') return w === '' || w == null ? 'Bodyweight' : fmtKg(w);
  return w !== '' && w != null && +w > 0 ? '+' + fmtKg(w) : '—';
};

// One table row per exercise; when sets differ, also one sub-row per set.
function itemCells(it) {
  const tracking = trackingOf(it.exId);
  const name = exName(it.exId);
  if (isUniform(it)) {
    const first = it.sets[0];
    return { name, work: it.sets.length + ' × ' + repsLabel(first.reps), load: setLoad(first, tracking), sets: null, note: it.note || '' };
  }
  return {
    name,
    note: it.note || '',
    work: it.sets.length + ' sets',
    load: '',
    sets: it.sets.map((set, i) => ({
      label: 'Set ' + (i + 1),
      work: repsLabel(set.reps) + (tracking === 'Time' ? '' : ' reps'),
      load: setLoad(set, tracking),
    })),
  };
}

// ---------- drawing ----------

const C = { ink: '#121413', ink2: '#3D423F', muted: '#646B66', line: '#E3E5DF', soft: '#F2F3EF', accent: '#C6F24E' };
const PAGE_W = 210;
const PAGE_H = 297;
const M = 18;
const BOTTOM = PAGE_H - 22;

export function buildClientPdf(client, opts) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('Manrope-Medium.ttf', fonts.regular);
  doc.addFont('Manrope-Medium.ttf', 'Manrope', 'normal');
  doc.addFileToVFS('Manrope-ExtraBold.ttf', fonts.bold);
  doc.addFont('Manrope-ExtraBold.ttf', 'Manrope', 'bold');

  const name = fullName(client);
  const W = PAGE_W - 2 * M;
  let y = M;

  const font = (weight, size, color = C.ink) => {
    doc.setFont('Manrope', weight);
    doc.setFontSize(size);
    doc.setTextColor(color);
  };
  const rule = (yy, color = C.line, width = 0.25) => {
    doc.setDrawColor(color);
    doc.setLineWidth(width);
    doc.line(M, yy, PAGE_W - M, yy);
  };
  const fit = (text, width) => {
    if (doc.getTextWidth(text) <= width) return text;
    let t = text;
    while (t.length > 1 && doc.getTextWidth(t + '…') > width) t = t.slice(0, -1);
    return t + '…';
  };
  const brand = (x, yy, size) => {
    doc.setFillColor(C.accent);
    doc.roundedRect(x, yy, size, size, size * 0.3, size * 0.3, 'F');
    // dumbbell mark, drawn on a 24-unit grid inside the square
    const u = (size * 0.62) / 24;
    const off = (size - 24 * u) / 2;
    const P = (px, py) => [x + off + px * u, yy + off + py * u];
    doc.setDrawColor(C.ink);
    doc.setLineWidth(2.4 * u);
    doc.setLineCap('round');
    [[6, 7, 6, 17], [3, 9.5, 3, 14.5], [18, 7, 18, 17], [21, 9.5, 21, 14.5], [6, 12, 18, 12]].forEach(([x1, y1, x2, y2]) => {
      doc.line(...P(x1, y1), ...P(x2, y2));
    });
    doc.setLineCap('butt');
  };

  const newPage = () => {
    doc.addPage();
    font('bold', 9, C.ink2);
    doc.text(name, M, M + 3);
    font('normal', 9, C.muted);
    doc.text('Training summary', PAGE_W - M, M + 3, { align: 'right' });
    rule(M + 7);
    y = M + 16;
  };
  const ensure = (h) => {
    if (y + h > BOTTOM) newPage();
  };
  // `keep` = space needed for the title plus the first rows, so a title never sits alone at a page end.
  const sectionTitle = (title, aside, keep = 30) => {
    ensure(keep);
    font('bold', 15);
    doc.text(title, M, y);
    if (aside) {
      font('normal', 9.5, C.muted);
      doc.text(aside, PAGE_W - M, y, { align: 'right' });
    }
    y += 4;
    rule(y, C.ink, 0.4);
    y += 7;
  };
  const colHead = (cols) => {
    font('bold', 7.5, C.muted);
    cols.forEach(([text, x, align]) => doc.text(text.toUpperCase(), x, y, align ? { align } : undefined));
    y += 3;
    rule(y);
    y += 5.5;
  };

  // ---- header ----
  brand(M, y, 9);
  font('bold', 13);
  doc.text('RegFit', M + 12, y + 6.3);
  font('normal', 9, C.muted);
  doc.text('Created ' + fmtDate(todayISO()), PAGE_W - M, y + 6, { align: 'right' });
  y += 26;

  font('bold', 28);
  doc.text(name, M, y);
  y += 8;
  font('normal', 11, C.muted);
  doc.text(opts.history ? 'Training summary · ' + fmtDate(opts.from) + ' – ' + fmtDate(opts.to) : 'Training summary', M, y);
  y += 10;

  const sessions = opts.history ? sessionsInRange(client.id, opts.from, opts.to) : [];
  const pbs = personalBests(client.id);

  // ---- summary tiles (training numbers only) ----
  if (opts.history) {
    const sets = sessions.reduce((n, s) => n + totalSets(s.items), 0);
    // Exercises with a record (any category) set within the range.
    const pbsInRange = pbs.filter((p) => PB_CATEGORIES.some(({ key }) => p[key] && p[key].date >= opts.from && p[key].date <= opts.to)).length;
    const tiles = [
      ['Sessions', String(sessions.length)],
      ['Total sets', String(sets)],
      ['Personal bests set', String(pbsInRange)],
    ];
    const gap = 4;
    const tw = (W - gap * 2) / 3;
    tiles.forEach(([label, value], i) => {
      const x = M + i * (tw + gap);
      doc.setFillColor(i === 2 && pbsInRange ? C.accent : C.soft);
      doc.roundedRect(x, y, tw, 20, 3, 3, 'F');
      font('normal', 8.5, i === 2 && pbsInRange ? C.ink2 : C.muted);
      doc.text(label, x + 5, y + 7);
      font('bold', 16);
      doc.text(value, x + 5, y + 15.5);
    });
    y += 32;
  } else {
    y += 4;
  }

  // ---- personal bests ----
  if (opts.pbs) {
    sectionTitle('Personal bests', pbs.length ? pbs.length + ' exercises · all time' : '');
    if (!pbs.length) {
      font('normal', 10.5, C.muted);
      doc.text('No personal bests yet.', M, y);
      y += 12;
    } else {
      // Exercise name, then one column per category: value on top, detail + date beneath.
      const nameW = W * 0.31;
      const colW = (W - nameW) / 3;
      const colX = PB_CATEGORIES.map((_, i) => M + nameW + i * colW);
      colHead([['Exercise', M], ...PB_CATEGORIES.map((c, i) => [c.label, colX[i]])]);
      pbs.forEach((p) => {
        ensure(12);
        font('bold', 10);
        doc.text(fit(p.name, nameW - 4), M, y);
        PB_CATEGORIES.forEach(({ key }, i) => {
          const r = p[key];
          if (!r) {
            font('normal', 10, C.muted);
            doc.text('—', colX[i], y);
            return;
          }
          font('bold', 10);
          doc.text(fit(r.display, colW - 3), colX[i], y);
          font('normal', 7.5, C.muted);
          doc.text(fit((r.detail ? r.detail + ' · ' : '') + fmtShortDate(r.date), colW - 3), colX[i], y + 4);
        });
        y += 6.5;
        rule(y);
        y += 5.5;
      });
      font('normal', 8, C.muted);
      ensure(10);
      PB_CATEGORIES.forEach((c) => {
        doc.text(c.label + ': ' + c.help.charAt(0).toLowerCase() + c.help.slice(1) + '.', M, y);
        y += 4;
      });
      y += 6;
    }
  }

  // ---- notes ----
  if (opts.notes && client.notes) {
    sectionTitle('Notes');
    font('normal', 10.5, C.ink2);
    const lines = doc.splitTextToSize(client.notes, W);
    lines.forEach((line) => {
      ensure(6);
      doc.text(line, M, y);
      y += 5.4;
    });
    y += 8;
  }

  // ---- exercise history ----
  if (opts.history) {
    sectionTitle('Exercise history', sessions.length + ' session' + (sessions.length === 1 ? '' : 's'), 52);
    if (!sessions.length) {
      font('normal', 10.5, C.muted);
      doc.text('No completed sessions in this period.', M, y);
      y += 12;
    }
    const xWork = M + W * 0.62;
    sessions.forEach((s) => {
      const rows = s.items.map(itemCells);
      // Exercise notes only when the Notes section is switched on.
      if (opts.notes) {
        font('normal', 8.5);
        rows.forEach((r) => (r.noteLines = r.note ? doc.splitTextToSize('Note: ' + r.note, W - 14) : []));
      } else rows.forEach((r) => (r.noteLines = []));
      // Keep a session on one page when it fits on a page at all; otherwise at least its first rows.
      const blockH = 11 + rows.reduce((h, r) => h + 7.5 + (r.sets ? r.sets.length * 5.6 + 1 : 0) + r.noteLines.length * 4.4, 0);
      ensure(blockH <= BOTTOM - (M + 16) ? blockH : 11 + 2 * 7.5);
      const sets = totalSets(s.items);
      doc.setFillColor(C.soft);
      doc.roundedRect(M, y - 5.5, W, 9, 2, 2, 'F');
      font('bold', 10.5);
      const day = fmtDay(s.date);
      doc.text(day, M + 4, y);
      if (s.focus) {
        const dx = doc.getTextWidth(day);
        font('normal', 10, C.muted);
        doc.text('·  ' + s.focus, M + 4 + dx + 2.5, y);
      }
      font('normal', 9, C.muted);
      doc.text(rows.length + ' exercises · ' + sets + ' sets', PAGE_W - M - 4, y, { align: 'right' });
      y += 9;
      rows.forEach((r, i) => {
        ensure(7.5);
        font('normal', 10, C.ink);
        doc.text(fit(r.name, xWork - M - 8), M + 4, y);
        font('normal', 10, C.muted);
        doc.text(r.work, xWork, y);
        font('bold', 10);
        doc.text(r.load, PAGE_W - M - 4, y, { align: 'right' });
        if (r.sets) {
          r.sets.forEach((set) => {
            y += 5.6;
            ensure(5.6);
            font('normal', 9, C.muted);
            doc.text(set.label, M + 10, y);
            doc.text(set.work, xWork, y);
            font('bold', 9, C.ink2);
            doc.text(set.load, PAGE_W - M - 4, y, { align: 'right' });
          });
          y += 1;
        }
        r.noteLines.forEach((line) => {
          y += 4.4;
          ensure(4.4);
          font('normal', 8.5, C.ink2);
          doc.text(line, M + 10, y);
        });
        y += 2.6;
        if (i < rows.length - 1) {
          doc.setDrawColor(C.line);
          doc.setLineWidth(0.2);
          doc.line(M + 4, y, PAGE_W - M - 4, y);
        }
        y += 4.9;
      });
      y += 6;
    });
  }

  // ---- footer on every page ----
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    rule(PAGE_H - 14);
    font('normal', 8, C.muted);
    doc.text('Shared from RegFit', M, PAGE_H - 9);
    doc.text('Page ' + i + ' of ' + pages, PAGE_W - M, PAGE_H - 9, { align: 'right' });
  }

  doc.setProperties({ title: name + ' – Training summary', creator: 'RegFit' });
  return doc.output('blob');
}

export const pdfFileName = (client) => (fullName(client) + ' – Training summary.pdf').replace(/[\\/:*?"<>|]/g, '');
