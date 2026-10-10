// Data layer: persistence in localStorage, demo seed data, and derived queries
// (personal bests, last-time hints, next/last sessions).

import { uid, todayISO, addDays, fromISO, fmtShort, fmtKg, isTimed, repsLabel, timeToMin, nowMinutes } from './util.js';

const KEY = 'regfit.data.v1';

export const MUSCLES = {
  Upper: ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Traps'],
  Lower: ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Adductors'],
  Core: ['Abs', 'Obliques', 'Lower back'],
};
export const REGION_NAME = { Upper: 'Upper body', Lower: 'Lower body', Core: 'Core' };
export const EQUIPMENT = ['Barbell', 'Dumbbells', 'Machine', 'Cable', 'Kettlebell', 'Plate', 'Bodyweight', 'Band', 'Smith machine'];
export const TRACKING = ['Weight × reps', 'Reps only', 'Time'];

const LIBRARY = [
  ['Barbell Bench Press', 'Upper', 'Chest, Triceps, Shoulders', 'Barbell'],
  ['Chest Press (Machine)', 'Upper', 'Chest, Triceps', 'Machine'],
  ['Incline Dumbbell Press', 'Upper', 'Chest, Shoulders', 'Dumbbells'],
  ['Cable Fly', 'Upper', 'Chest', 'Cable'],
  ['Push-Up', 'Upper', 'Chest, Triceps', 'Bodyweight', 'Reps only'],
  ['Lat Pulldown', 'Upper', 'Back, Biceps', 'Cable'],
  ['Pull-Up', 'Upper', 'Back, Biceps', 'Bodyweight', 'Reps only'],
  ['Seated Cable Row', 'Upper', 'Back, Biceps', 'Cable'],
  ['Dumbbell Row', 'Upper', 'Back, Biceps', 'Dumbbells'],
  ['Overhead Press', 'Upper', 'Shoulders, Triceps', 'Barbell'],
  ['Lateral Raise', 'Upper', 'Shoulders', 'Dumbbells'],
  ['Face Pull', 'Upper', 'Shoulders, Traps', 'Cable'],
  ['Shrug', 'Upper', 'Traps, Forearms', 'Dumbbells'],
  ['Bicep Curl', 'Upper', 'Biceps', 'Dumbbells'],
  ['Hammer Curl', 'Upper', 'Biceps, Forearms', 'Dumbbells'],
  ['Tricep Pushdown', 'Upper', 'Triceps', 'Cable'],
  ['Skull Crusher', 'Upper', 'Triceps', 'Barbell'],
  ['Back Squat', 'Lower', 'Quads, Glutes', 'Barbell'],
  ['Goblet Squat', 'Lower', 'Quads, Glutes', 'Kettlebell'],
  ['Leg Press', 'Lower', 'Quads, Glutes', 'Machine'],
  ['Romanian Deadlift', 'Lower', 'Hamstrings, Glutes, Lower back', 'Barbell'],
  ['Deadlift', 'Lower', 'Hamstrings, Glutes, Back', 'Barbell'],
  ['Walking Lunge', 'Lower', 'Quads, Glutes', 'Dumbbells'],
  ['Bulgarian Split Squat', 'Lower', 'Quads, Glutes', 'Dumbbells'],
  ['Leg Extension', 'Lower', 'Quads', 'Machine'],
  ['Lying Leg Curl', 'Lower', 'Hamstrings', 'Machine'],
  ['Hip Thrust', 'Lower', 'Glutes, Hamstrings', 'Barbell'],
  ['Standing Calf Raise', 'Lower', 'Calves', 'Machine'],
  ['Hip Adduction', 'Lower', 'Adductors', 'Machine'],
  ['Plank', 'Core', 'Abs', 'Bodyweight', 'Time'],
  ['Side Plank', 'Core', 'Obliques', 'Bodyweight', 'Time'],
  ['Dead Bug', 'Core', 'Abs', 'Bodyweight', 'Reps only'],
  ['Hanging Leg Raise', 'Core', 'Abs', 'Bodyweight', 'Reps only'],
  ['Cable Woodchopper', 'Core', 'Obliques', 'Cable'],
  ['Russian Twist', 'Core', 'Obliques, Abs', 'Plate'],
  ['Back Extension', 'Core', 'Lower back, Glutes', 'Bodyweight', 'Reps only'],
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const libraryExercises = () =>
  LIBRARY.map(([name, region, muscles, equipment, tracking]) => ({
    id: 'ex-' + slug(name),
    name,
    region,
    muscles: muscles.split(', '),
    equipment,
    tracking: tracking || 'Weight × reps',
    cues: '',
  }));

// ---------- demo seed ----------

const TEMPLATES = {
  'Upper body': [['chest-press-machine', 3, 10, 70], ['lat-pulldown', 3, 12, 65], ['seated-cable-row', 3, 10, 57.5], ['lateral-raise', 3, 12, 8], ['bicep-curl', 3, 12, 16], ['tricep-pushdown', 3, 12, 25]],
  'Lower body': [['leg-press', 3, 10, 160], ['romanian-deadlift', 3, 10, 80], ['walking-lunge', 3, 12, 16], ['lying-leg-curl', 3, 12, 40], ['standing-calf-raise', 3, 15, 60], ['plank', 3, '60s', '']],
  'Full body': [['back-squat', 3, 8, 80], ['barbell-bench-press', 3, 8, 60], ['dumbbell-row', 3, 10, 26], ['hip-thrust', 3, 10, 90], ['dead-bug', 3, 10, '']],
};

const roundLoad = (w) => (w < 20 ? Math.round(w) : Math.round(w / 2.5) * 2.5);

const buildItems = (focus, factor, k) =>
  TEMPLATES[focus].map(([ex, count, reps, w], i) => {
    const r = isTimed(reps) ? (k >= 2 ? '75s' : reps) : reps;
    const load = w === '' ? '' : roundLoad(w * factor * (1 + 0.025 * k));
    const sets = Array.from({ length: count }, () => ({ reps: r, weight: load }));
    // First exercise ramps up: a lighter, higher-rep opening set.
    if (i === 0 && load !== '') sets[0] = { reps: r + 2, weight: roundLoad(load * 0.85) };
    return { id: uid('it'), exId: 'ex-' + ex, sets };
  });

export function demoData() {
  const today = todayISO();
  const clients = [
    // id, first, last, age, sex, height, weight, strength factor, weekdays (Mon=0), times, plan, notes
    ['marco', 'Marco', 'Rossi', 41, 'Male', 182, 86.5, 1.0, [1, 3], ['09:30', '09:30'], 'split', 'Goal: build strength before ski season. Mild lower-back tightness — warm up well.'],
    ['sarah', 'Sarah', 'Collins', 29, 'Female', 168, 61, 0.6, [0, 3, 5], ['07:00', '07:00', '08:00'], 'split', 'Half-marathon in March. Keep legs fresh on long-run weeks.'],
    ['ana', 'Ana', 'Lopes', 36, 'Female', 163, 58, 0.55, [0, 2], ['12:00', '12:00'], 'full', ''],
    ['james', 'James', 'Okafor', 33, 'Male', 188, 92, 1.15, [1, 3], ['16:30', '16:30'], 'split', 'Plays Sunday league football.'],
    ['elif', 'Elif', 'Demir', 27, 'Female', 170, 63, 0.65, [2, 4], ['08:00', '08:00'], 'full', ''],
    ['priya', 'Priya', 'Shah', 45, 'Female', 160, 66, 0.45, [4, 5], ['18:00', '10:00'], 'split', 'Shoulder impingement history — no overhead pressing.'],
    ['tom', 'Tom', 'Becker', 52, 'Male', 178, 84, 0.8, [0, 5], ['11:00', '11:00'], 'split', ''],
    ['lucas', 'Lucas', 'Martin', 38, 'Male', 180, 79, 0.9, [], [], 'split', ''],
  ];
  const out = { version: 2, exercises: libraryExercises(), clients: [], sessions: [] };
  clients.forEach(([key, first, last, age, sex, height, weight, factor, days, times, plan, notes], ci) => {
    const id = 'c-' + key;
    out.clients.push({ id, first, last, age, sex, height, weight, notes, createdAt: addDays(today, -60 - ci * 17) });
    const focusCount = { 'Upper body': 0, 'Lower body': 0, 'Full body': 0 };
    const lastDoneOn = {};
    let alt = ci % 2;
    const add = (date, time, isPast) => {
      const focus = plan === 'full' ? 'Full body' : alt++ % 2 ? 'Lower body' : 'Upper body';
      const k = focusCount[focus]++;
      const soon = date <= addDays(today, 2);
      out.sessions.push({
        id: uid('s'),
        clientId: id,
        date,
        time,
        duration: 60,
        focus,
        status: isPast ? 'done' : 'planned',
        started: isPast || soon,
        copiedFrom: !isPast && soon && lastDoneOn[focus] ? fmtShort(lastDoneOn[focus]) + ' · ' + focus : null,
        items: isPast || soon ? buildItems(focus, factor, k) : [],
      });
      if (isPast) lastDoneOn[focus] = date;
    };
    if (key === 'lucas') {
      add(addDays(today, -19), '17:00', true);
      add(addDays(today, -17), '17:00', true);
      return;
    }
    for (let off = -21; off <= 6; off++) {
      const date = addDays(today, off);
      const dow = (fromISO(date).getDay() + 6) % 7;
      const i = days.indexOf(dow);
      if (i !== -1) add(date, times[i], off < 0);
    }
  });
  return out;
}

export function emptyData() {
  return { version: 2, exercises: libraryExercises(), clients: [], sessions: [] };
}

// ---------- persistence ----------

export let db = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (isValidBackup(d)) {
        migrate(d);
        persist(d);
        return d;
      }
    }
  } catch (e) {
    /* fall through to demo data */
  }
  const d = demoData();
  persist(d);
  return d;
}

function persist(d) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    return true;
  } catch (e) {
    return false;
  }
}

export const save = () => persist(db);

export function replaceData(d) {
  migrate(d);
  db = d;
  save();
}

export function isValidBackup(d) {
  return !!d && Array.isArray(d.clients) && Array.isArray(d.sessions) && Array.isArray(d.exercises);
}

// v1 stored one sets/reps/weight per exercise; v2 stores a list of sets, each with its own
// reps and weight. Old items become N identical sets, so nothing is lost.
function migrate(d) {
  d.sessions.forEach((s) => {
    (s.items || []).forEach((it) => {
      if (Array.isArray(it.sets)) return;
      const n = Math.max(1, parseInt(it.sets, 10) || 1);
      it.sets = Array.from({ length: n }, () => ({ reps: it.reps ?? 10, weight: it.weight ?? '' }));
      delete it.reps;
      delete it.weight;
    });
  });
  d.version = 2;
}

// ---------- lookups ----------

export const exById = (id) => db.exercises.find((e) => e.id === id);
export const exName = (id) => (exById(id) || {}).name || 'Deleted exercise';
export const clientById = (id) => db.clients.find((c) => c.id === id);
export const sessionById = (id) => db.sessions.find((s) => s.id === id);

const chrono = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);

export const sessionsFor = (clientId) => db.sessions.filter((s) => s.clientId === clientId).sort(chrono);
export const doneFor = (clientId) => sessionsFor(clientId).filter((s) => s.status === 'done');
export const sessionsOn = (date) => db.sessions.filter((s) => s.date === date).sort(chrono);

export const sessionEnded = (s) => {
  const t = todayISO();
  return s.date < t || (s.date === t && timeToMin(s.time) + (s.duration || 60) <= nowMinutes());
};

export function nextSession(clientId) {
  const t = todayISO();
  return sessionsFor(clientId).find((s) => s.status === 'planned' && s.date >= t) || null;
}

export function lastDone(clientId) {
  const d = doneFor(clientId);
  return d[d.length - 1] || null;
}

export const sessionNumber = (s) => sessionsFor(s.clientId).findIndex((x) => x.id === s.id) + 1;

export const usageCount = (exId) => db.sessions.filter((s) => s.items.some((it) => it.exId === exId)).length;

// ---------- sets ----------

export const trackingOf = (exId) => (exById(exId) || {}).tracking || 'Weight × reps';
export const setCount = (it) => it.sets.length;
export const totalSets = (items) => items.reduce((n, it) => n + it.sets.length, 0);
export const isUniform = (it) => it.sets.every((x) => String(x.reps) === String(it.sets[0].reps) && String(x.weight) === String(it.sets[0].weight));
export const newSets = (n = 3, reps = 10, weight = '') => Array.from({ length: n }, () => ({ reps, weight }));

// Whole exercise: "70 kg × 10" when every set is the same, else each set: "60 kg × 12, 70 kg × 10, …".
export function itemSummary(it) {
  const tracking = trackingOf(it.exId);
  if (!it.sets.length) return '';
  if (isUniform(it)) return describe(it.sets[0], tracking);
  return it.sets.map((x) => describe(x, tracking)).join(', ');
}

// Compact parts for tables: work = "3 × 10" or "12 · 10 · 10", load = "70 kg" or "60–70 kg".
export function itemParts(it) {
  const tracking = trackingOf(it.exId);
  const n = it.sets.length;
  const reps = it.sets.map((x) => repsLabel(x.reps));
  const sameReps = reps.every((r) => r === reps[0]);
  const work = sameReps ? n + ' × ' + reps[0] : reps.join(' · ');
  const ws = it.sets.map((x) => x.weight).filter((w) => w !== '' && w != null && +w > 0).map(Number);
  let load = '—';
  if (ws.length) {
    const lo = Math.min(...ws);
    const hi = Math.max(...ws);
    load = (tracking === 'Weight × reps' ? '' : '+') + (lo === hi ? fmtKg(lo) : fmtKg(lo).replace(' kg', '') + '–' + fmtKg(hi));
  } else if (tracking === 'Weight × reps') load = 'Bodyweight';
  return { work, load };
}

// ---------- personal bests ----------
//
// Three categories per exercise:
//   heaviest    — heaviest weight in a single set (ties: more reps)
//   bestSet     — most weight × reps in a single set
//   bestSession — most weight × reps summed over every set of the exercise in one session
// Exercises tracked by reps or time use reps / seconds in place of weight × reps.

export const PB_CATEGORIES = [
  { key: 'heaviest', label: 'Heaviest', help: 'Heaviest weight in one set' },
  { key: 'bestSet', label: 'Best set', help: 'Most weight × reps in one set' },
  { key: 'bestSession', label: 'Best session', help: 'Most weight × reps across all sets in one session' },
];

const repsNum = (r) => (isTimed(r) ? 0 : +r || 0);
const secsNum = (r) => (isTimed(r) ? parseInt(r, 10) || 0 : 0);
const fmtNum = (n) => (Math.round(n * 10) / 10).toLocaleString('en-GB');
const fmtSecs = (t) => (t < 120 ? t + ' s' : Math.floor(t / 60) + ' min' + (t % 60 ? ' ' + (t % 60) + ' s' : ''));
const better = (a, b) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);

// One set, e.g. "70 kg × 10", "12 reps", "60 s".
export function describe(item, tracking) {
  if (tracking === 'Time') return repsLabel(item.reps);
  if (tracking === 'Reps only') return repsLabel(item.reps) + (isTimed(item.reps) ? '' : ' reps');
  return (item.weight === '' || item.weight == null ? 'BW' : fmtKg(item.weight)) + ' × ' + repsLabel(item.reps);
}

// This exercise's best candidate per category within one session: { key: { sc, display, detail } }.
function itemRecords(it, tracking) {
  const out = {};
  const take = (key, sc, display, detail = '') => {
    if (sc[0] > 0 && (!out[key] || better(sc, out[key].sc))) out[key] = { sc, display, detail };
  };
  let total = 0;
  it.sets.forEach((set) => {
    const w = +set.weight || 0;
    const r = repsNum(set.reps);
    const t = secsNum(set.reps);
    if (tracking === 'Weight × reps') {
      take('heaviest', [w, r], fmtKg(w) + ' × ' + repsLabel(set.reps));
      take('bestSet', [w * r, w], fmtNum(w * r) + ' kg', fmtKg(w) + ' × ' + r);
      total += w * r;
    } else if (tracking === 'Reps only') {
      take('heaviest', [w, r], '+' + fmtKg(w) + ' × ' + r);
      take('bestSet', [r, w], r + ' reps', w > 0 ? '+' + fmtKg(w) : '');
      total += r;
    } else {
      take('heaviest', [w, t], '+' + fmtKg(w) + ' × ' + t + ' s');
      take('bestSet', [t, w], fmtSecs(t), w > 0 ? '+' + fmtKg(w) : '');
      total += t;
    }
  });
  const n = it.sets.length + (it.sets.length === 1 ? ' set' : ' sets');
  if (tracking === 'Weight × reps') take('bestSession', [total, 0], fmtNum(total) + ' kg', n);
  else if (tracking === 'Reps only') take('bestSession', [total, 0], total + ' reps', n);
  else take('bestSession', [total, 0], fmtSecs(total), n);
  return out;
}

// Returns [{ exId, name, tracking, isNew, heaviest, bestSet, bestSession }], each category
// { display, detail, date, isNew } or null when it doesn't apply (e.g. no weight ever used).
export function personalBests(clientId) {
  const done = doneFor(clientId);
  const lastDate = done.length ? done[done.length - 1].date : null;
  const best = {};
  done.forEach((s) => {
    s.items.forEach((it) => {
      const recs = itemRecords(it, trackingOf(it.exId));
      const b = (best[it.exId] = best[it.exId] || {});
      Object.entries(recs).forEach(([key, rec]) => {
        const cur = b[key];
        if (!cur || better(rec.sc, cur.sc)) {
          // "improved" = beat a record from an earlier session (not just an earlier set today).
          const improved = !cur ? false : cur.date !== s.date ? true : cur.improved;
          b[key] = { ...rec, date: s.date, improved };
        }
      });
    });
  });
  return Object.entries(best)
    .map(([exId, b]) => {
      const pb = { exId, name: exName(exId), tracking: trackingOf(exId) };
      PB_CATEGORIES.forEach(({ key }) => {
        const r = b[key];
        pb[key] = r ? { display: r.display, detail: r.detail, date: r.date, isNew: r.improved && r.date === lastDate } : null;
      });
      pb.isNew = PB_CATEGORIES.some(({ key }) => pb[key] && pb[key].isNew);
      return pb;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The single headline best for an exercise (shown in the session builder).
export function bestFor(clientId, exId) {
  const pb = personalBests(clientId).find((p) => p.exId === exId);
  if (!pb) return null;
  return (pb.heaviest || pb.bestSet || {}).display || null;
}

// Most recent logged item for this exercise, from a done session other than `session`.
export function lastFor(session, exId) {
  const done = doneFor(session.clientId).filter((s) => s.id !== session.id);
  for (let i = done.length - 1; i >= 0; i--) {
    const it = done[i].items.find((x) => x.exId === exId);
    if (it) return { display: itemSummary(it), date: done[i].date, item: it };
  }
  return null;
}

// ---------- mutations ----------

export function createClient(fields) {
  const c = { id: uid('c'), notes: '', createdAt: todayISO(), ...fields };
  db.clients.push(c);
  save();
  return c;
}

export function deleteClient(id) {
  db.clients = db.clients.filter((c) => c.id !== id);
  db.sessions = db.sessions.filter((s) => s.clientId !== id);
  save();
}

export function createSession(clientId, date, time) {
  const s = { id: uid('s'), clientId, date, time, duration: 60, focus: '', status: 'planned', started: false, copiedFrom: null, items: [] };
  db.sessions.push(s);
  save();
  return s;
}

export function copyItems(fromSession) {
  return fromSession.items.map((it) => ({ ...it, id: uid('it'), sets: it.sets.map((x) => ({ ...x })) }));
}

export function deleteSession(id) {
  db.sessions = db.sessions.filter((s) => s.id !== id);
  save();
}

// Default slot for a new session: same time as the client's last session, else next half hour.
export function suggestTime(clientId, date) {
  const prev = clientId && sessionsFor(clientId).slice(-1)[0];
  if (prev) return prev.time;
  if (date === todayISO()) {
    const m = Math.min(Math.ceil((nowMinutes() + 1) / 30) * 30, 21 * 60);
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  return '09:00';
}
