// Pure logic shared by the app and the Node tests: randomness, difficulty, spacing, scoring, storage.
(function (root) {
  'use strict';

  // ---------- seeded randomness (mulberry32) ----------
  function makeRng(seed) {
    let s = seed >>> 0;
    function next() {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function int(n) { return Math.floor(next() * n); }
    function pick(arr) { return arr[int(arr.length)]; }
    function shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = int(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    }
    function sample(arr, k) { return shuffle(arr).slice(0, k); }
    return { next, int, pick, shuffle, sample };
  }
  function seedFrom(str) { // FNV-1a
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const freshSeed = () => (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0;

  // ---------- adaptive difficulty ----------
  // Up after a strong round, down after a weak one; settles near ~75-85% accuracy,
  // the zone where practice is hard enough to teach but not discouraging.
  const LEVEL_MIN = 1, LEVEL_MAX = 20, UP_AT = 0.85, DOWN_BELOW = 0.65;
  function nextLevel(level, accuracy) {
    if (accuracy >= UP_AT) return Math.min(LEVEL_MAX, level + 1);
    if (accuracy < DOWN_BELOW) return Math.max(LEVEL_MIN, level - 1);
    return level;
  }
  // Linear interpolation of a parameter across levels 1..20, rounded.
  function byLevel(level, atMin, atMax) {
    const t = (Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, level)) - LEVEL_MIN) / (LEVEL_MAX - LEVEL_MIN);
    return Math.round(atMin + (atMax - atMin) * t);
  }

  // ---------- dates (local calendar days as 'YYYY-MM-DD') ----------
  const pad = (n) => String(n).padStart(2, '0');
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDay(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(key, n) { const d = parseDay(key); d.setDate(d.getDate() + n); return dayKey(d); }
  function daysBetween(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 86400000); }

  // ---------- spaced repetition (Leitner boxes) ----------
  const INTERVALS = [1, 3, 7, 14, 30, 60, 120]; // days until next review for each box
  function newCard(today) { return { box: 0, due: addDays(today, 1) }; }
  function reviewCard(card, correct, today) {
    const box = correct ? Math.min((card.box || 0) + 1, INTERVALS.length - 1) : 0;
    return Object.assign({}, card, { box, due: addDays(today, INTERVALS[box]) });
  }
  const isDue = (card, today) => card.due <= today; // ISO day keys compare correctly as strings

  // ---------- scoring ----------
  // Recognition with distractors: hits minus false alarms, so "select everything" scores 0.
  function recognitionScore(targets, chosen) {
    const t = new Set(targets);
    let hits = 0, fa = 0;
    for (const c of chosen) { if (t.has(c)) hits++; else fa++; }
    return Math.max(0, (hits - fa) / t.size);
  }
  // Brier score for confidence judgements: 0 is perfect, 0.25 is a coin flip at 50%.
  function brier(records) {
    if (!records.length) return null;
    return records.reduce((s, r) => s + Math.pow(r.conf - (r.correct ? 1 : 0), 2), 0) / records.length;
  }
  // Cases have 4 options, so honest confidence ranges from 25% (pure guess) to 100%.
  function calibrationTable(records) {
    const bins = [[0.25, 0.5], [0.5, 0.7], [0.7, 0.9], [0.9, 1.01]];
    return bins.map(([lo, hi]) => {
      const rs = records.filter((r) => r.conf >= lo && r.conf < hi);
      return { label: Math.round(lo * 100) + '–' + Math.min(100, Math.round(hi * 100) - 1) + '%', n: rs.length,
        hitRate: rs.length ? rs.filter((r) => r.correct).length / rs.length : null };
    });
  }

  // ---------- consistency (forgiving: counts days, no streak to break) ----------
  function daysPracticed(history, today, window) {
    const from = addDays(today, -(window - 1));
    return new Set(history.filter((h) => h.date >= from && h.date <= today).map((h) => h.date)).size;
  }

  // ---------- daily workout ----------
  // One drill from each skill family, interleaved; within a family pick the least recently practiced.
  const FAMILIES = [['faces'], ['scene', 'change'], ['glance', 'palace'], ['reason']];
  function planWorkout(history, today) {
    const rng = makeRng(seedFrom(today));
    const last = {};
    // only rounds before today, so finishing a drill doesn't reshuffle today's plan
    for (const h of history) if (h.date < today && (!last[h.drill] || h.ts > last[h.drill])) last[h.drill] = h.ts;
    return FAMILIES.map((fam) => {
      const shuffled = rng.shuffle(fam);
      return shuffled.reduce((best, d) => ((last[d] || 0) < (last[best] || 0) ? d : best), shuffled[0]);
    });
  }

  // ---------- state / storage ----------
  const DRILLS = ['glance', 'change', 'scene', 'faces', 'palace', 'reason'];
  function defaultState() {
    const levels = {};
    DRILLS.forEach((d) => { levels[d] = 1; });
    return { version: 1, levels, history: [], people: [], palace: { loci: [] }, reason: { seen: {}, calib: [] },
      missions: {}, seenIntro: {}, intention: '' };
  }
  function migrate(raw) {
    const s = defaultState();
    if (!raw || typeof raw !== 'object') return s;
    // keep a saved field only if it has the same shape as the default (guards against bad imports)
    const kind = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
    for (const k of Object.keys(s)) if (kind(raw[k]) === kind(s[k])) s[k] = raw[k];
    for (const d of DRILLS) if (typeof s.levels[d] !== 'number' || !(s.levels[d] >= LEVEL_MIN && s.levels[d] <= LEVEL_MAX)) s.levels[d] = 1;
    if (!Array.isArray(s.palace.loci)) s.palace = { loci: [] };
    if (!s.reason.seen || typeof s.reason.seen !== 'object' || !Array.isArray(s.reason.calib)) s.reason = { seen: {}, calib: [] };
    s.history = s.history.filter((h) => h && typeof h.drill === 'string' && typeof h.date === 'string');
    s.people = s.people.filter((p) => p && typeof p.due === 'string' && (p.source === 'real' ? typeof p.name === 'string' : p.face && typeof p.first === 'string'));
    for (const [d, m] of Object.entries(s.missions)) if (!m || typeof m.idx !== 'number') delete s.missions[d];
    return s;
  }
  // Record a finished round and return the level change.
  function recordRound(state, drill, accuracy, now) {
    now = now || new Date();
    const before = state.levels[drill] || 1;
    const after = nextLevel(before, accuracy);
    state.levels[drill] = after;
    state.history.push({ drill, date: dayKey(now), ts: now.getTime(), acc: Math.round(accuracy * 1000) / 1000, level: before });
    return { before, after };
  }

  const api = { makeRng, seedFrom, freshSeed, nextLevel, byLevel, LEVEL_MIN, LEVEL_MAX, dayKey, addDays, daysBetween,
    INTERVALS, newCard, reviewCard, isDue, recognitionScore, brier, calibrationTable, daysPracticed, planWorkout, FAMILIES,
    DRILLS, defaultState, migrate, recordRound };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Sharp = root.Sharp || {}).core = api;
})(typeof window !== 'undefined' ? window : globalThis);
