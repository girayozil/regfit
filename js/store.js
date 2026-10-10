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
//
// Realistic-looking history so lists and charts have something to show:
// - each client alternates A/B workouts per focus, months of history, a holiday gap, missed sessions
// - double progression: reps climb through a range, then the weight goes up and reps reset
// - a lighter (deload) week every seventh week, the odd bad day
// - varied set shapes: warm-up ramp, pyramid, top set + back-offs, drop set, tired last set
// A seeded random generator keeps the demo identical every time it's loaded.

// [exercise id, base weight (strength factor 1), rep range, weight step, set shape, sets]
// Rep- and time-tracked exercises use '' weight; their "reps" progress instead (seconds for time).
const EX = {
  'chest-press-machine': [55, [8, 12], 2.5, 'ramp', 4],
  'lat-pulldown': [50, [8, 12], 2.5, 'straight', 3],
  'seated-cable-row': [45, [8, 12], 2.5, 'straight', 3],
  'lateral-raise': [6, [10, 15], 1, 'drop', 3],
  'bicep-curl': [12, [8, 12], 1, 'straight', 3],
  'tricep-pushdown': [20, [10, 15], 2.5, 'straight', 3],
  'barbell-bench-press': [55, [5, 8], 2.5, 'top', 3],
  'pull-up': ['', [4, 10], 1, 'straight', 3],
  'dumbbell-row': [22, [8, 12], 2, 'straight', 3],
  'overhead-press': [30, [6, 10], 2.5, 'pyramid', 3],
  'face-pull': [15, [12, 15], 2.5, 'straight', 3],
  'hammer-curl': [12, [8, 12], 1, 'straight', 3],
  'skull-crusher': [20, [8, 12], 2.5, 'straight', 3],
  'leg-press': [120, [8, 12], 10, 'ramp', 4],
  'romanian-deadlift': [60, [8, 10], 5, 'straight', 3],
  'walking-lunge': [12, [10, 12], 2, 'straight', 3],
  'lying-leg-curl': [30, [10, 12], 2.5, 'straight', 3],
  'standing-calf-raise': [50, [12, 15], 5, 'drop', 3],
  'plank': ['', [45, 90], 15, 'straight', 3],
  'back-squat': [70, [5, 8], 2.5, 'top', 3],
  'hip-thrust': [70, [8, 12], 5, 'pyramid', 3],
  'bulgarian-split-squat': [10, [8, 12], 2, 'straight', 3],
  'leg-extension': [35, [10, 15], 2.5, 'drop', 3],
  'hanging-leg-raise': ['', [6, 15], 1, 'straight', 3],
  'side-plank': ['', [30, 60], 10, 'straight', 2],
  'deadlift': [90, [3, 6], 5, 'top', 3],
  'incline-dumbbell-press': [20, [8, 12], 2, 'straight', 3],
  'goblet-squat': [20, [10, 12], 4, 'straight', 3],
  'dead-bug': ['', [8, 15], 1, 'straight', 3],
};
const TIMED_EX = new Set(['plank', 'side-plank']);

const PROGRAMS = {
  'Upper body': [
    ['chest-press-machine', 'lat-pulldown', 'seated-cable-row', 'lateral-raise', 'bicep-curl', 'tricep-pushdown'],
    ['barbell-bench-press', 'pull-up', 'dumbbell-row', 'overhead-press', 'face-pull', 'hammer-curl', 'skull-crusher'],
  ],
  'Lower body': [
    ['leg-press', 'romanian-deadlift', 'walking-lunge', 'lying-leg-curl', 'standing-calf-raise', 'plank'],
    ['back-squat', 'hip-thrust', 'bulgarian-split-squat', 'leg-extension', 'hanging-leg-raise', 'side-plank'],
  ],
  'Full body': [
    ['back-squat', 'barbell-bench-press', 'dumbbell-row', 'hip-thrust', 'dead-bug'],
    ['deadlift', 'incline-dumbbell-press', 'lat-pulldown', 'goblet-squat', 'plank'],
  ],
};

// Small deterministic PRNG (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const roundLoad = (w, step) => {
  if (step < 2.5) return Math.max(1, Math.round(w));
  return Math.max(step, Math.round(w / step) * step);
};

// Sets for one exercise from its working weight `w` and reps `r`, in the exercise's set shape.
function shapeSets(key, w, r, rand, light) {
  const [base, , step, shape, count] = EX[key];
  const timed = TIMED_EX.has(key);
  const repsOf = (n) => (timed ? Math.round(n / 5) * 5 + 's' : Math.max(1, Math.round(n)));
  if (base === '') {
    const sets = Array.from({ length: count }, () => ({ reps: repsOf(r), weight: '' }));
    if (rand() < 0.4) sets[count - 1].reps = repsOf(r - (timed ? 10 : 2));
    return sets;
  }
  const load = (f) => roundLoad(w * f * (light ? 0.85 : 1), step);
  let sets;
  if (shape === 'ramp') sets = [{ reps: r + 2, weight: load(0.8) }, ...Array.from({ length: count - 1 }, () => ({ reps: r, weight: load(1) }))];
  else if (shape === 'pyramid') sets = [{ reps: r + 2, weight: load(0.85) }, { reps: r + 1, weight: load(0.93) }, { reps: r, weight: load(1) }];
  else if (shape === 'top') sets = [{ reps: r, weight: load(1) }, { reps: r + 2, weight: load(0.88) }, { reps: r + 2, weight: load(0.88) }];
  else if (shape === 'drop') sets = [...Array.from({ length: count - 1 }, () => ({ reps: r, weight: load(1) })), { reps: r + 4, weight: load(0.7) }];
  else sets = Array.from({ length: count }, () => ({ reps: r, weight: load(1) }));
  // Tired last set: a rep or two short.
  if (shape !== 'drop' && rand() < 0.35) sets[sets.length - 1].reps = Math.max(1, sets[sets.length - 1].reps - (rand() < 0.5 ? 1 : 2));
  return sets;
}

export function demoData() {
  const today = todayISO();
  const clients = [
    // key, first, last, age, sex, height, weight, strength, weekdays (Mon=0), times, plan, history (days), holiday start (days ago), notes
    ['marco', 'Marco', 'Rossi', 41, 'Male', 182, 86.5, 1.0, [1, 3], ['09:30', '09:30'], 'split', 365, 70, 'Goal: build strength before ski season. Mild lower-back tightness — warm up well.'],
    ['sarah', 'Sarah', 'Collins', 29, 'Female', 168, 61, 0.6, [0, 3, 5], ['07:00', '07:00', '08:00'], 'split', 270, 120, 'Half-marathon in March. Keep legs fresh on long-run weeks.'],
    ['ana', 'Ana', 'Lopes', 36, 'Female', 163, 58, 0.55, [0, 2], ['12:00', '12:00'], 'full', 180, 60, ''],
    ['james', 'James', 'Okafor', 33, 'Male', 188, 92, 1.15, [1, 3], ['16:30', '16:30'], 'split', 420, 200, 'Plays Sunday league football.'],
    ['elif', 'Elif', 'Demir', 27, 'Female', 170, 63, 0.65, [2, 4], ['08:00', '08:00'], 'full', 240, 90, ''],
    ['priya', 'Priya', 'Shah', 45, 'Female', 160, 66, 0.45, [4, 5], ['18:00', '10:00'], 'split', 120, 45, 'Shoulder impingement history — no overhead pressing.'],
    ['tom', 'Tom', 'Becker', 52, 'Male', 178, 84, 0.8, [0, 5], ['11:00', '11:00'], 'split', 300, 150, ''],
    ['lucas', 'Lucas', 'Martin', 38, 'Male', 180, 79, 0.9, [1, 4], ['17:00', '17:00'], 'split', 140, -1, 'Paused training in August — follow up.'],
  ];
  const out = { version: 2, exercises: libraryExercises(), clients: [], sessions: [] };

  clients.forEach(([key, first, last, age, sex, height, weight, factor, days, times, plan, history, holiday, notes], ci) => {
    const id = 'c-' + key;
    const rand = rng(1000 + ci * 7919);
    const start = addDays(today, -history);
    out.clients.push({ id, first, last, age, sex, height, weight, notes, createdAt: start });

    // Working weight and reps per exercise; starts a little under the base for gradual gains.
    const state = {};
    const stateOf = (ex) => {
      if (!state[ex]) {
        const [base, [lo]] = EX[ex];
        state[ex] = { w: base === '' ? 0 : base * factor * (0.82 + rand() * 0.06), r: lo };
      }
      return state[ex];
    };
    // Next performance of an exercise: sets now, then progress for next time.
    const perform = (ex, light, bad) => {
      const st = stateOf(ex);
      const [base, [lo, hi], step] = EX[ex];
      const sets = shapeSets(ex, st.w, bad ? st.r - 1 : st.r, rand, light);
      if (!light && !bad && rand() < 0.85) {
        if (base === '') st.r = Math.min(hi, st.r + step);
        else if (st.r < hi) st.r = Math.min(hi, st.r + (rand() < 0.35 ? 2 : 1));
        else {
          st.w += step;
          st.r = lo;
        }
      }
      return { id: uid('it'), exId: 'ex-' + ex, sets };
    };
    const preview = (ex) => {
      const st = stateOf(ex);
      return { id: uid('it'), exId: 'ex-' + ex, sets: shapeSets(ex, st.w, st.r, rng(1), false) };
    };

    const focuses = plan === 'full' ? ['Full body'] : ['Upper body', 'Lower body'];
    const variant = {};
    const lastDoneOn = {};
    let turn = ci % 2;
    const end = key === 'lucas' ? -45 : 6; // Lucas stopped coming six weeks ago
    for (let off = -history; off <= end; off++) {
      const date = addDays(today, off);
      const dow = (fromISO(date).getDay() + 6) % 7;
      const di = days.indexOf(dow);
      if (di === -1) continue;
      const past = off < 0;
      if (past && holiday > 0 && off >= -holiday && off < -holiday + 12) continue; // holiday
      if (past && rand() < 0.08) continue; // missed session
      const focus = focuses[turn++ % focuses.length];
      const v = (variant[focus] = ((variant[focus] ?? -1) + 1) % 2);
      // Priya's notes rule out overhead pressing.
      const list = PROGRAMS[focus][v].filter((ex) => !(key === 'priya' && ex === 'overhead-press'));
      const session = { id: uid('s'), clientId: id, date, time: times[di], duration: 60, focus, status: past ? 'done' : 'planned', started: past, copiedFrom: null, items: [] };
      if (past) {
        const week = Math.floor((off + history) / 7);
        const light = week % 7 === 6;
        const bad = !light && rand() < 0.1;
        session.items = list.map((ex) => perform(ex, light, bad));
        lastDoneOn[focus + v] = date;
      } else if (off <= 2) {
        // Planned in the next few days: already built from the matching previous workout.
        session.items = list.map(preview);
        session.started = true;
        if (lastDoneOn[focus + v]) session.copiedFrom = fmtShort(lastDoneOn[focus + v]) + ' · ' + focus;
      }
      out.sessions.push(session);
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

// One point per completed session for a chart: that session's value in a personal-best category.
export function exerciseSeries(clientId, exId, key) {
  const tracking = trackingOf(exId);
  const out = [];
  doneFor(clientId).forEach((s) => {
    let best = null;
    s.items
      .filter((it) => it.exId === exId)
      .forEach((it) => {
        const r = itemRecords(it, tracking)[key];
        if (r && (!best || better(r.sc, best.sc))) best = r;
      });
    if (best) out.push({ date: s.date, sessionId: s.id, value: best.sc[0], display: best.display, detail: best.detail });
  });
  return out;
}

// Unit of a series' values: weight for weight-tracked exercises and for "Heaviest", else reps / seconds.
export function seriesUnit(exId, key) {
  const tracking = trackingOf(exId);
  if (tracking === 'Weight × reps' || key === 'heaviest') return 'kg';
  return tracking === 'Reps only' ? 'reps' : 's';
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
