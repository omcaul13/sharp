const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/core.js');
const content = require('../js/content.js');
const { MISSIONS } = content;

const done = (id, extra) => Object.assign(core.blankEntry(id, ''), { done: true }, extra);

test('missions are well-formed', () => {
  const ids = new Set();
  for (const m of MISSIONS) {
    assert.ok(!ids.has(m.id), 'duplicate ' + m.id); ids.add(m.id);
    assert.ok(content.TRACKS[m.track], m.id);
    assert.ok([1, 2, 3].includes(m.tier), m.id);
    assert.ok(m.title && m.text && m.score.label, m.id);
    if (m.score.outOf) assert.ok(m.score.goal == null || (m.score.goal > 0 && m.score.goal <= 1), m.id);
    else assert.ok(m.score.max >= 1 && (m.score.goal == null || (m.score.goal >= 1 && m.score.goal <= m.score.max)), m.id);
    if (m.log) assert.ok(m.log.people >= 1 || (Array.isArray(m.log.items) && m.log.items.length >= 1), m.id);
  }
  // every track can unlock: at least 2 missions at tiers 1 and 2, at least 1 at tier 3
  for (const t of Object.keys(content.TRACKS)) {
    const n = (tier) => MISSIONS.filter((m) => m.track === t && m.tier === tier).length;
    assert.ok(n(1) >= 2 && n(2) >= 2 && n(3) >= 1, t);
  }
});

test('tiers unlock after two finished missions at the tier below', () => {
  const log = {};
  assert.equal(core.unlockedTier(log, MISSIONS, 'names'), 1);
  log['2026-11-01'] = done('name-harvest');
  assert.equal(core.unlockedTier(log, MISSIONS, 'names'), 1);
  log['2026-11-02'] = done('name-it-back');
  assert.equal(core.unlockedTier(log, MISSIONS, 'names'), 2);
  log['2026-11-03'] = done('ears-and-marks');
  log['2026-11-04'] = Object.assign(done('team-roll-call'), { done: false });
  assert.equal(core.unlockedTier(log, MISSIONS, 'names'), 2, 'unfinished missions do not count');
  log['2026-11-05'] = done('team-roll-call');
  assert.equal(core.unlockedTier(log, MISSIONS, 'names'), 3);
  assert.equal(core.unlockedTier(log, MISSIONS, 'noticing'), 1, 'tracks unlock separately');
});

test('pickMission rotates tracks, only offers unlocked tiers, and swaps to something new', () => {
  const tracks = new Set();
  for (let i = 0; i < 6; i++) {
    const day = core.addDays('2026-11-16', i), m = core.pickMission({}, MISSIONS, day);
    assert.equal(m.tier, 1);
    assert.deepEqual(m, core.pickMission({}, MISSIONS, day), 'stable within a day');
    tracks.add(m.track);
  }
  assert.equal(tracks.size, 6, 'six days cover all six tracks');
  const first = core.pickMission({}, MISSIONS, '2026-11-16');
  const swapped = core.pickMission({}, MISSIONS, '2026-11-16', [first.id]);
  assert.notEqual(swapped.id, first.id);
  // the least recently done mission in the track comes first
  const day = '2026-11-16', track = first.track;
  const log = { '2026-11-10': done(first.id) };
  assert.notEqual(core.pickMission(log, MISSIONS, day).id, first.id);
  assert.equal(core.pickMission(log, MISSIONS, day).track, track);
  // excluding everything cycles back instead of returning nothing
  assert.ok(core.pickMission({}, MISSIONS, day, MISSIONS.map((m) => m.id)));
});

test('personal bests, goals and callbacks', () => {
  const shoe = MISSIONS.find((m) => m.id === 'shoe-day'), roll = MISSIONS.find((m) => m.id === 'team-roll-call');
  assert.equal(core.missionHit(shoe, 4), true);
  assert.equal(core.missionHit(shoe, 3), false);
  assert.equal(core.missionHit(roll, 9, 10), true);
  assert.equal(core.missionHit(roll, 8, 10), false);
  assert.equal(core.missionHit(MISSIONS.find((m) => m.id === 'prediction-log'), 3), null, 'no goal, no hit');
  const log = { '2026-11-01': done('shoe-day', { got: 3, items: ['a'] }), '2026-11-05': done('shoe-day', { got: 5, items: [''] }), '2026-11-06': done('team-roll-call', { got: 9, total: 10 }) };
  assert.equal(core.personalBest(log, MISSIONS, 'shoe-day', '2026-11-05'), 3);
  assert.equal(core.personalBest(log, MISSIONS, 'shoe-day'), 5);
  assert.equal(core.personalBest(log, MISSIONS, 'team-roll-call'), 0.9);
  assert.equal(core.personalBest(log, MISSIONS, 'exit-check'), null);
  // callbacks: only entries with something logged, after callbackDays
  assert.deepEqual(core.dueCallbacks(log, MISSIONS, '2026-11-03'), []);
  assert.deepEqual(core.dueCallbacks(log, MISSIONS, '2026-11-04'), ['2026-11-01']);
  log['2026-11-01'].callback = { date: '2026-11-04', got: 1, of: 1 };
  assert.deepEqual(core.dueCallbacks(log, MISSIONS, '2026-11-30'), []);
  const thin = { '2026-11-01': done('thin-slice-bet', { items: ['TA is a grad student: 80%'] }) };
  assert.deepEqual(core.dueCallbacks(thin, MISSIONS, '2026-11-20'), [], 'thin-slice bet waits a month');
  assert.deepEqual(core.dueCallbacks(thin, MISSIONS, '2026-12-01'), ['2026-11-01']);
});

test('old mission logs are upgraded by title and bad entries dropped', () => {
  const s = core.migrate({ missions: { '2026-11-15': { idx: 4, done: true, notes: 'blue vans' }, '2026-11-16': { id: 'exit-check', items: 'x' }, bad: { foo: 1 } } });
  assert.equal(s.missions.bad, undefined);
  assert.deepEqual(s.missions['2026-11-16'].items, []);
  core.upgradeMissions(s.missions, MISSIONS, content.LEGACY_MISSION_TITLES);
  assert.equal(s.missions['2026-11-15'].id, 'shoe-day');
  assert.equal(s.missions['2026-11-15'].notes, 'blue vans');
  assert.equal(s.missions['2026-11-15'].done, true);
  for (const t of content.LEGACY_MISSION_TITLES) assert.ok(MISSIONS.some((m) => m.title === t), 'legacy title kept: ' + t);
});

test('migrate validates the new fields', () => {
  const s = core.migrate({ palace: { loci: ['a'], last: { words: [1] } }, reason: { seen: {}, calib: [{ conf: 0.7, correct: true }, { conf: 'x' }], custom: [{ id: 'u1' }] },
    missionCalib: [{ conf: 0.5, correct: false }, null], rooms: [{ seed: 3, level: 2, date: '2026-11-01' }, { seed: 'x' }], estimate: { asked: -1 } });
  assert.equal(s.palace.last, null);
  assert.equal(s.reason.calib.length, 1);
  assert.deepEqual(s.reason.custom, []);
  assert.equal(s.missionCalib.length, 1);
  assert.equal(s.rooms.length, 1);
  assert.deepEqual(s.estimate, { asked: 0, contained: 0 });
  for (const d of core.DRILLS) assert.equal(s.levels[d], 1);
});

test('numbers and estimation scoring', () => {
  assert.equal(core.digitScore('617-555-0193', '6175550193'), 1);
  assert.equal(core.digitScore('1234', '1243'), 0.5);
  assert.equal(core.digitScore('1234', ''), 0);
  assert.equal(Math.round(core.maxRatio(1)), 100);
  assert.equal(Math.round(core.maxRatio(20)), 3);
  assert.deepEqual(core.scoreRange(200, 400, 330, 20), { contained: true, tight: true, hit: true });
  assert.deepEqual(core.scoreRange(400, 200, 330, 20), { contained: true, tight: true, hit: true }, 'reversed bounds are fine');
  assert.equal(core.scoreRange(1, 1000, 330, 20).hit, false, 'too wide at a high level');
  assert.equal(core.scoreRange(10, 1000, 330, 1).hit, true, 'allowed at level 1');
  assert.equal(core.scoreRange(0, 1000, 330, 1).tight, false, 'a zero low end is infinitely wide');
  assert.equal(core.scoreRange(100, 200, 330, 1).contained, false);
});

test('commute plan picks two different quick drills, neglected first', () => {
  const p = core.planCommute([], '2026-11-16');
  assert.equal(p.length, 2);
  assert.notEqual(p[0], p[1]);
  p.forEach((d) => assert.ok(core.QUICK.includes(d)));
  const played = core.QUICK.filter((d) => d !== 'numbers').map((drill) => ({ drill, date: '2026-11-15', ts: 5 }));
  assert.equal(core.planCommute(played, '2026-11-16')[0], 'numbers');
  for (const fam of core.FAMILIES) for (const d of fam) assert.ok(core.DRILLS.includes(d));
});
