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
    if (records.some((r) => r.conf < 0.25)) bins.unshift([0, 0.25]); // mission predictions can go below a 4-option guess
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
  const FAMILIES = [['faces', 'convo'], ['scene', 'change', 'witness', 'describe'], ['glance', 'palace', 'numbers'], ['reason', 'estimate']];
  const QUICK = ['glance', 'change', 'numbers', 'reason', 'estimate']; // short drills for commute mode
  function lastPlayed(history, today) {
    const last = {};
    // only rounds before today, so finishing a drill doesn't reshuffle today's plan
    for (const h of history) if (h.date < today && (!last[h.drill] || h.ts > last[h.drill])) last[h.drill] = h.ts;
    return last;
  }
  const leastRecent = (fam, last, rng) => rng.shuffle(fam).reduce((best, d) => ((last[d] || 0) < (last[best] || 0) ? d : best));
  function planWorkout(history, today) {
    const rng = makeRng(seedFrom(today)), last = lastPlayed(history, today);
    return FAMILIES.map((fam) => leastRecent(fam, last, rng));
  }
  // Commute mode: two quick drills, least recently practiced first.
  function planCommute(history, today) {
    const rng = makeRng(seedFrom('c' + today)), last = lastPlayed(history, today);
    const first = leastRecent(QUICK, last, rng);
    return [first, leastRecent(QUICK.filter((d) => d !== first), last, rng)];
  }

  // ---------- drill scoring helpers ----------
  // Numbers: share of digits recalled in the right position (non-digits ignored).
  function digitScore(target, typed) {
    const t = String(target).replace(/\D/g, ''), y = String(typed).replace(/\D/g, '');
    let ok = 0;
    for (let i = 0; i < t.length; i++) if (y[i] === t[i]) ok++;
    return t.length ? ok / t.length : 0;
  }
  // Estimation: the allowed high/low ratio shrinks geometrically from 100x at level 1 to 3x at level 20, so huge "safe" ranges stop paying.
  function maxRatio(level) {
    const t = (Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, level)) - LEVEL_MIN) / (LEVEL_MAX - LEVEL_MIN);
    return Math.pow(100, 1 - t) * Math.pow(3, t);
  }
  function scoreRange(low, high, answer, level) {
    const lo = Math.min(low, high), hi = Math.max(low, high);
    const contained = lo <= answer && answer <= hi;
    const tight = lo > 0 && hi / lo <= maxRatio(level) + 1e-9;
    return { contained, tight, hit: contained && tight };
  }

  // ---------- missions ----------
  // Entry per day: { id, title, done, notes, predict, items, people, got, total, hit, callback, skipped }.
  // predict (0-1) + hit give mission calibration records, derived on demand so editing a check-in can't double-count.
  const blankEntry = (id, title) => ({ id, title, done: false, notes: '', predict: null, items: [], people: [], got: null, total: null, hit: null, callback: null, skipped: [] });
  const missionValue = (m, e) => (e.got == null ? null : m.score.outOf ? (e.total ? e.got / e.total : null) : e.got);
  function missionHit(m, got, total) {
    if (m.score.goal == null || got == null) return null;
    return m.score.outOf ? total > 0 && got / total >= m.score.goal : got >= m.score.goal;
  }
  // Tier 2 of a track opens after 2 finished tier-1 missions in it; tier 3 after 2 finished tier-2 ones.
  function unlockedTier(log, missions, track) {
    const done = [0, 0, 0, 0];
    for (const e of Object.values(log)) { const m = missions.find((x) => x.id === e.id); if (e.done && m && m.track === track) done[m.tier]++; }
    return done[1] < 2 ? 1 : done[2] < 2 ? 2 : 3;
  }
  // Today's track rotates daily. Within it: least recently done unlocked mission, higher tiers first. Other tracks follow (for swaps).
  function pickMission(log, missions, today, exclude) {
    exclude = exclude || [];
    const tracks = [...new Set(missions.map((m) => m.track))];
    const n = tracks.length, track = tracks[((daysBetween('2026-01-05', today) % n) + n) % n];
    const lastDone = {};
    for (const [d, e] of Object.entries(log)) if (e.done && d < today && (!lastDone[e.id] || d > lastDone[e.id])) lastDone[e.id] = d;
    const rng = makeRng(seedFrom(today)), jitter = {};
    missions.forEach((m) => { jitter[m.id] = rng.next(); });
    const tiers = {};
    tracks.forEach((t) => { tiers[t] = unlockedTier(log, missions, t); });
    const open = missions.filter((m) => m.tier <= tiers[m.track]).sort((a, b) =>
      ((a.track !== track) - (b.track !== track)) || (lastDone[a.id] || '').localeCompare(lastDone[b.id] || '') || (b.tier - a.tier) || (jitter[a.id] - jitter[b.id]));
    return open.find((m) => !exclude.includes(m.id)) || open[0];
  }
  function personalBest(log, missions, id, exceptDay) {
    const m = missions.find((x) => x.id === id);
    let best = null;
    if (m) for (const [d, e] of Object.entries(log)) {
      if (d === exceptDay || e.id !== id || !e.done) continue;
      const v = missionValue(m, e);
      if (v != null && (best == null || v > best)) best = v;
    }
    return best;
  }
  // Logged items come back for a recall check a few days later (oldest first).
  function dueCallbacks(log, missions, today) {
    return Object.entries(log).filter(([d, e]) => {
      const m = missions.find((x) => x.id === e.id);
      return m && e.done && !e.callback && e.items.some((x) => x.trim()) && addDays(d, m.callbackDays || 3) <= today;
    }).map(([d]) => d).sort();
  }
  // Older saves stored missions by list position; map those to the new ids by title.
  function upgradeMissions(log, missions, legacyTitles) {
    for (const [d, e] of Object.entries(log)) {
      if (typeof e.id === 'string') continue;
      const title = legacyTitles[e.idx % legacyTitles.length];
      const m = missions.find((x) => x.title === title);
      log[d] = Object.assign(blankEntry(m ? m.id : 'legacy', title), { done: !!e.done, notes: typeof e.notes === 'string' ? e.notes : '' });
    }
    return log;
  }

  // ---------- state / storage ----------
  const DRILLS = ['glance', 'change', 'scene', 'faces', 'palace', 'reason', 'convo', 'witness', 'describe', 'numbers', 'estimate'];
  function defaultState() {
    const levels = {};
    DRILLS.forEach((d) => { levels[d] = 1; });
    return { version: 1, levels, history: [], people: [], palace: { loci: [], last: null }, reason: { seen: {}, calib: [], custom: [] },
      missions: {}, rooms: [], estimate: { asked: 0, contained: 0 }, seenIntro: {}, intention: '' };
  }
  const isCalib = (r) => r && typeof r.conf === 'number' && typeof r.correct === 'boolean';
  const strs = (a, n) => Array.isArray(a) && a.length === n && a.every((x) => typeof x === 'string' && x.trim());
  const isCase = (c) => c && typeof c.id === 'string' && typeof c.text === 'string' && typeof c.q === 'string' && strs(c.options, 4) && typeof c.explain === 'string';
  function migrate(raw) {
    const s = defaultState();
    if (!raw || typeof raw !== 'object') return s;
    // keep a saved field only if it has the same shape as the default (guards against bad imports)
    const kind = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
    for (const k of Object.keys(s)) if (kind(raw[k]) === kind(s[k])) s[k] = raw[k];
    for (const d of DRILLS) if (typeof s.levels[d] !== 'number' || !(s.levels[d] >= LEVEL_MIN && s.levels[d] <= LEVEL_MAX)) s.levels[d] = 1;
    if (!Array.isArray(s.palace.loci)) s.palace = { loci: [], last: null };
    const last = s.palace.last;
    s.palace.last = last && Array.isArray(last.words) && last.words.every((w) => typeof w === 'string') && typeof last.date === 'string'
      && (last.loci == null || (Array.isArray(last.loci) && last.loci.length >= last.words.length)) ? last : null;
    if (!s.reason.seen || typeof s.reason.seen !== 'object' || !Array.isArray(s.reason.calib)) s.reason = { seen: {}, calib: [], custom: [] };
    s.reason.calib = s.reason.calib.filter(isCalib);
    s.reason.custom = Array.isArray(s.reason.custom) ? s.reason.custom.filter(isCase) : [];
    s.rooms = s.rooms.filter((r) => r && typeof r.seed === 'number' && typeof r.level === 'number' && typeof r.date === 'string');
    if (!(s.estimate.asked >= 0 && s.estimate.contained >= 0)) s.estimate = { asked: 0, contained: 0 };
    s.history = s.history.filter((h) => h && typeof h.drill === 'string' && typeof h.date === 'string');
    s.people = s.people.filter((p) => p && typeof p.due === 'string' && (p.source === 'real' ? typeof p.name === 'string' : p.face && typeof p.first === 'string'));
    for (const [d, m] of Object.entries(s.missions)) {
      if (!m || (typeof m.id !== 'string' && typeof m.idx !== 'number')) { delete s.missions[d]; continue; }
      if (typeof m.id !== 'string') continue; // legacy entry: the app upgrades it with upgradeMissions
      s.missions[d] = Object.assign(blankEntry(m.id, ''), m, {
        title: String(m.title || ''), notes: String(m.notes || ''), predict: typeof m.predict === 'number' ? m.predict : null,
        items: Array.isArray(m.items) ? m.items.map(String) : [], people: Array.isArray(m.people) ? m.people.map(String) : [],
        skipped: Array.isArray(m.skipped) ? m.skipped.filter((x) => typeof x === 'string') : [] });
    }
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
    INTERVALS, newCard, reviewCard, isDue, recognitionScore, brier, calibrationTable, daysPracticed, planWorkout, planCommute, FAMILIES, QUICK,
    digitScore, maxRatio, scoreRange, blankEntry, missionValue, missionHit, unlockedTier, pickMission, personalBest, dueCallbacks, upgradeMissions,
    DRILLS, defaultState, migrate, recordRound };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Sharp = root.Sharp || {}).core = api;
})(typeof window !== 'undefined' ? window : globalThis);
