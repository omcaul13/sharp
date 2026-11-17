const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/core.js');
const faces = require('../js/faces.js');
const scene = require('../js/scene.js');

const has = (s, t) => s.table.some((x) => x.type === t);
const colorOf = (s, t) => s.table.find((x) => x.type === t).color;

// Independent truth of a statement, from the before/after models. Also checks the statement
// is consistent with the changed room (so it can't be judged from the new picture alone).
function truth(st, a, b) {
  let m;
  if ((m = st.match(/^The (\w+) is a different color\.$/))) { assert.ok(has(b, m[1]), st); return has(a, m[1]) && colorOf(a, m[1]) !== colorOf(b, m[1]); }
  if ((m = st.match(/^The (\w+) is gone\.$/))) { assert.ok(!has(b, m[1]), st); return has(a, m[1]); }
  if ((m = st.match(/^There's a new (\w+)\.$/))) { assert.ok(has(b, m[1]), st); return !has(a, m[1]); }
  if ((m = st.match(/^Something unusual appeared: (.+)\.$/))) { assert.equal(scene.ODDS[b.odd], m[1], st); return a.odd !== b.odd; }
  const fixed = {
    'The clock shows a different time.': () => a.clock.h !== b.clock.h || a.clock.m !== b.clock.m,
    'The weather outside changed.': () => a.weather !== b.weather,
    'The framed picture shows a different shape.': () => a.frame.shape !== b.frame.shape,
    'The shape in the framed picture is a different color.': () => a.frame.color !== b.frame.color,
    'The door was opened or closed.': () => a.door !== b.door,
    'The floor lamp was switched on or off.': () => a.lamp !== b.lamp,
    'The sticky note shows a different number.': () => { assert.ok(b.note); return a.note !== b.note; },
    'The calendar shows a different date.': () => { assert.ok(b.calendar); return a.calendar.month !== b.calendar.month || a.calendar.day !== b.calendar.day; },
    "Someone's shirt is a different color.": () => a.people.length === b.people.length && a.people.some((f, i) => f.shirt !== b.people[i].shirt),
    'One person is missing.': () => b.people.length === a.people.length - 1,
    'Something unusual that was here is gone.': () => { assert.equal(b.odd, 'nothing'); return a.odd !== 'nothing'; },
  };
  assert.ok(fixed[st], 'unknown statement: ' + st);
  return fixed[st]();
}

test('makeScene is deterministic for the same seed and level', () => {
  for (let level = 1; level <= 20; level++) {
    assert.deepEqual(scene.makeScene(core.makeRng(99 + level), level), scene.makeScene(core.makeRng(99 + level), level));
  }
});

test('mutate makes exactly k true, visible changes with false decoys', () => {
  for (let level = 1; level <= 20; level++) {
    for (let seed = 0; seed < 30; seed++) {
      const k = 1 + (seed % 3);
      const before = scene.makeScene(core.makeRng(seed * 17 + level), level);
      const r = scene.mutate(before, core.makeRng(seed + 1000 * level), k);
      const tag = 'level ' + level + ' seed ' + seed;
      assert.deepEqual(before, scene.makeScene(core.makeRng(seed * 17 + level), level), 'input untouched ' + tag);
      assert.deepEqual(r, scene.mutate(before, core.makeRng(seed + 1000 * level), k), 'deterministic ' + tag);
      assert.equal(r.changes.length, k, tag);
      assert.ok(r.decoys.length >= 6 - k, tag);
      const all = r.changes.concat(r.decoys);
      assert.equal(new Set(all).size, all.length, 'unique ' + tag);
      assert.notEqual(scene.sceneSvg(before), scene.sceneSvg(r.scene), tag);
      for (const c of r.changes) assert.equal(truth(c, before, r.scene), true, 'change true: ' + c + ' ' + tag);
      for (const d of r.decoys) assert.equal(truth(d, before, r.scene), false, 'decoy false: ' + d + ' ' + tag);
    }
  }
});

test('each change kind alone renders differently', () => {
  // k = 1 over many seeds hits every kind; each single change must alter the picture
  const seen = new Set();
  for (let seed = 0; seed < 400; seed++) {
    const before = scene.makeScene(core.makeRng(seed), 1 + (seed % 20));
    const r = scene.mutate(before, core.makeRng(seed + 7), 1);
    seen.add(r.changes[0].replace(new RegExp('\\b(' + scene.ITEMS.join('|') + ')\\b'), 'X').replace(/:.*/, ''));
    assert.notEqual(scene.sceneSvg(before), scene.sceneSvg(r.scene), r.changes[0]);
  }
  assert.equal(seen.size, 15, [...seen].join(' | ')); // all 15 change kinds occur
});

test('restyle changes exactly one style field, keeps identity, and renders differently', () => {
  const STYLE = ['glasses', 'hair', 'facial', 'hairColor'];
  const changes = new Set();
  for (let seed = 0; seed < 600; seed++) {
    const face = faces.makeFace(core.makeRng(seed));
    const copy = Object.assign({}, face);
    const r = faces.restyle(face, core.makeRng(seed + 5));
    assert.deepEqual(face, copy, 'input untouched');
    const diff = Object.keys(face).filter((key) => face[key] !== r.face[key]);
    assert.equal(diff.length, 1, 'seed ' + seed + ': ' + diff);
    assert.ok(STYLE.includes(diff[0]), diff[0]);
    assert.notEqual(faces.faceSvg(face), faces.faceSvg(r.face), r.change);
    assert.ok(typeof r.change === 'string' && r.change.length);
    changes.add(r.change);
  }
  assert.ok(changes.has('new glasses') && changes.has('no glasses now') && changes.has('a new haircut') && changes.has('new hair color'), [...changes].join(', '));
});
