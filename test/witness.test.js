const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/core.js');
const witness = require('../js/witness.js');

// Replays events from scratch, asserting the event rules, and returns what an eyewitness could know.
function replay(w) {
  const status = {}, holder = {}, firstIn = [], snaps = [];
  w.cast.forEach((c) => { status[c.id] = 'out'; });
  w.objects.forEach((o) => { holder[o.id] = null; });
  const snap = () => snaps.push(JSON.stringify({ status, holder }));
  snap();
  for (const e of w.events) {
    if (e.type === 'enter') { assert.equal(status[e.who], 'out'); status[e.who] = 'in'; firstIn.push(e.who); }
    else {
      assert.equal(status[e.who], 'in', 'acts only while in the room: ' + e.text);
      if (e.type === 'pickup') { assert.equal(holder[e.obj], null); holder[e.obj] = e.who; }
      if (e.type === 'putdown') { assert.equal(holder[e.obj], e.who); holder[e.obj] = null; }
      if (e.type === 'give') { assert.equal(holder[e.obj], e.who); assert.equal(status[e.to], 'in'); assert.notEqual(e.to, e.who); holder[e.obj] = e.to; }
      if (e.type === 'leave') {
        for (const o of w.objects) if (holder[o.id] === e.who) assert.equal(e.obj, o.id, 'leaves with exactly what they hold');
        if (e.obj) assert.equal(holder[e.obj], e.who);
        status[e.who] = 'gone';
      }
    }
    assert.match(e.text, /^The person in the [a-z]+ shirt .+\.$/);
    snap();
  }
  return { status, holder, firstIn, snaps };
}

test('witness scenes are valid, well-formed and answerable at every level', () => {
  for (let level = 1; level <= 20; level++) {
    for (let seed = 1; seed <= 25; seed++) {
      const w = witness.makeWitness(core.makeRng(seed * 7919 + level), level);
      const p = witness.params(level);
      assert.equal(w.events.length, p.events);
      assert.equal(w.beats.length, w.events.length + 1);
      assert.equal(new Set(w.cast.map((c) => c.label)).size, w.cast.length);
      const r = replay(w);
      assert.deepEqual(w.beats.map((b) => JSON.stringify(b)), r.snaps);
      assert.ok(w.questions.length >= 3 && w.questions.length <= p.questions, 'questions at level ' + level + ' seed ' + seed);
      const label = (id) => w.cast.find((c) => c.id === id).label;
      for (const q of w.questions) {
        assert.ok(q.options.length >= 2 && q.options.length <= 4);
        assert.equal(new Set(q.options).size, q.options.length);
        assert.ok(q.options.includes(q.answer), q.q);
        if (q.key === 'enteredFirst') assert.equal(q.answer, label(r.firstIn[0]));
        if (q.key === 'endCount') assert.equal(q.answer, String(Object.values(r.status).filter((s) => s === 'in').length));
        if (q.key === 'leftWith' || q.key === 'gave' || q.key === 'whereEnd') {
          const o = w.objects.find((x) => q.q.includes('the ' + x.name + ' ') || q.q.includes('the ' + x.name + '?'));
          assert.ok(o, q.q);
          const h = r.holder[o.id];
          if (q.key === 'leftWith') { assert.equal(r.status[h], 'gone'); assert.equal(q.answer, label(h)); }
          if (q.key === 'whereEnd') assert.equal(q.answer, h === null ? 'on the table' : (r.status[h] === 'gone' ? 'left with ' : 'held by ') + label(h));
        }
        if (q.key === 'afterEvent') {
          const t = w.events.map((e) => e.text), before = q.q.match(/"(.*)"/)[1];
          assert.equal(t.filter((x) => x === before).length, 1);
          assert.equal(q.answer, t[t.indexOf(before) + 1]);
        }
      }
      const s = witness.svg(w);
      assert.match(s, /^<svg[^>]*role="img"[^>]*aria-label="[^"]+"[\s\S]*<\/svg>$/);
      for (const x of w.cast.concat(w.objects)) assert.ok(s.includes('id="witness-' + x.id + '"'));
      assert.deepEqual(witness.narration(w), w.events.map((e) => e.text));
    }
  }
});

test('witness scenes are deterministic per seed and level', () => {
  for (const level of [1, 8, 20]) {
    const a = witness.makeWitness(core.makeRng(42), level), b = witness.makeWitness(core.makeRng(42), level);
    assert.deepEqual(a, b);
    assert.equal(witness.svg(a), witness.svg(b));
  }
  assert.deepEqual(witness.params(1), { people: 2, events: 3, beatMs: 1600, questions: 4 });
  assert.deepEqual(witness.params(20), { people: 4, events: 9, beatMs: 800, questions: 7 });
});

test('applyBeat moves people and held objects (fake DOM)', () => {
  const w = witness.makeWitness(core.makeRng(5), 10);
  const els = {};
  const root = { querySelector: (sel) => (els[sel] = els[sel] || { style: {} }) };
  witness.applyBeat(root, w, w.events.findIndex((e) => e.type === 'enter') + 1);
  const entered = w.events.find((e) => e.type === 'enter').who;
  assert.doesNotMatch(els['#witness-' + entered].style.transform, /1090px/);
  witness.applyBeat(root, w, 0);
  assert.match(els['#witness-' + entered].style.transform, /^translate\(1090px,150px\)$/);
});
