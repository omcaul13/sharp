const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/core.js');
const faces = require('../js/faces.js');
const scene = require('../js/scene.js');
const content = require('../js/content.js');

test('difficulty moves up on strong rounds, down on weak ones, and stays in bounds', () => {
  assert.equal(core.nextLevel(5, 0.9), 6);
  assert.equal(core.nextLevel(5, 0.75), 5);
  assert.equal(core.nextLevel(5, 0.5), 4);
  assert.equal(core.nextLevel(1, 0), 1);
  assert.equal(core.nextLevel(20, 1), 20);
  assert.equal(core.byLevel(1, 30, 10), 30);
  assert.equal(core.byLevel(20, 30, 10), 10);
});

test('dates roll over months and years', () => {
  assert.equal(core.addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(core.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(core.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(core.daysBetween('2026-11-15', '2026-12-15'), 30);
});

test('spaced repetition expands on success and resets on failure', () => {
  let c = core.newCard('2026-11-15');
  assert.equal(c.due, '2026-11-16');
  c = core.reviewCard(c, true, '2026-11-16');
  assert.deepEqual([c.box, c.due], [1, '2026-11-19']);
  c = core.reviewCard(c, true, '2026-11-19');
  assert.deepEqual([c.box, c.due], [2, '2026-11-26']);
  c = core.reviewCard(c, false, '2026-11-26');
  assert.deepEqual([c.box, c.due], [0, '2026-11-27']);
  assert.ok(core.isDue(c, '2026-11-27') && !core.isDue(c, '2026-11-26'));
});

test('recognition score penalizes guessing everything', () => {
  assert.equal(core.recognitionScore(['a', 'b'], ['a', 'b']), 1);
  assert.equal(core.recognitionScore(['a', 'b'], ['a', 'b', 'c', 'd']), 0);
  assert.equal(core.recognitionScore(['a', 'b', 'c', 'd'], ['a', 'x']), 0);
  assert.equal(core.recognitionScore(['a', 'b', 'c', 'd'], ['a', 'b', 'c']), 0.75);
});

test('brier and calibration table', () => {
  assert.equal(core.brier([]), null);
  assert.equal(core.brier([{ conf: 1, correct: true }]), 0);
  assert.ok(Math.abs(core.brier([{ conf: 0.6, correct: true }, { conf: 0.6, correct: false }]) - 0.26) < 1e-9);
  const t = core.calibrationTable([{ conf: 0.95, correct: true }, { conf: 1, correct: false }, { conf: 0.3, correct: true }]);
  assert.equal(t.length, 4);
  assert.deepEqual([t[3].n, t[3].hitRate], [2, 0.5]);
  assert.equal(t[0].n, 1);
});

test('days practiced counts distinct days in the window', () => {
  const hist = ['2026-11-15', '2026-11-15', '2026-11-13', '2026-11-08'].map((date) => ({ date }));
  assert.equal(core.daysPracticed(hist, '2026-11-15', 7), 2);
  assert.equal(core.daysPracticed(hist, '2026-11-15', 8), 3);
});

test('workout has one drill per family, is stable for a day, and prefers neglected drills', () => {
  const a = core.planWorkout([], '2026-11-15');
  assert.deepEqual(a, core.planWorkout([], '2026-11-15'));
  core.FAMILIES.forEach((fam, i) => assert.ok(fam.includes(a[i])));
  const plan = core.planWorkout([{ drill: 'scene', date: '2026-11-14', ts: 5 }, { drill: 'glance', date: '2026-11-14', ts: 5 }], '2026-11-15');
  assert.equal(plan[1], 'change');
  assert.equal(plan[2], 'palace');
});

test('migrate fills missing fields and survives junk', () => {
  assert.deepEqual(core.migrate(null), core.defaultState());
  const s = core.migrate({ levels: { scene: 7 }, history: [{ drill: 'scene', date: '2026-11-15' }] });
  assert.equal(s.levels.scene, 7);
  assert.equal(s.levels.faces, 1);
  assert.equal(s.history.length, 1);
  assert.deepEqual(s.palace, { loci: [] });
});

test('recordRound logs and adapts', () => {
  const s = core.defaultState();
  const r = core.recordRound(s, 'glance', 1, new Date(2026, 10, 15));
  assert.deepEqual(r, { before: 1, after: 2 });
  assert.equal(s.history[0].date, '2026-11-15');
});

test('generated people are distinct enough to tell apart', () => {
  for (let seed = 1; seed < 40; seed++) {
    const ps = faces.makePeople(core.makeRng(seed), 8, ['Maya']);
    assert.equal(ps.length, 8);
    assert.equal(new Set(ps.map((p) => p.first)).size, 8);
    assert.ok(!ps.some((p) => p.first === 'Maya'));
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert.ok(faces.faceDistance(ps[i].face, ps[j].face) >= 3);
    assert.match(faces.faceSvg(ps[0].face), /^<svg[\s\S]*<\/svg>$/);
  }
});

test('scene questions are well formed at every level', () => {
  for (let level = 1; level <= 20; level++) {
    for (let seed = 0; seed < 30; seed++) {
      const rng = core.makeRng(seed * 31 + level);
      const s = scene.makeScene(rng, level);
      const qs = scene.makeQuestions(s, rng);
      assert.equal(qs.length, s.nQuestions, 'question count at level ' + level);
      assert.equal(new Set(qs.map((q) => q.key)).size, qs.length, 'no duplicate question types');
      for (const q of qs) {
        assert.ok(q.options.includes(q.answer), q.key + ': answer among options');
        assert.equal(new Set(q.options).size, q.options.length, q.key + ': options unique ' + q.options);
        assert.ok(q.options.length >= 2, q.key + ': at least two options');
      }
      assert.ok(scene.sceneSvg(s).includes('</svg>'));
      assert.ok(scene.inventory(s).length >= 8);
    }
  }
});

test('scene answers match the scene model', () => {
  const rng = core.makeRng(7);
  const s = scene.makeScene(rng, 12);
  const b = scene.BUILDERS;
  assert.equal(b.peopleCount(s, rng).answer, String(s.people.length));
  assert.equal(b.itemCount(s, rng).answer, String(s.table.length));
  assert.equal(b.hats(s, rng).answer, String(s.people.filter((f) => f.hat !== 'none').length));
  assert.equal(b.door(s, rng).answer, s.door);
  const ord = b.itemOrder(s, rng);
  const types = s.table.map((t) => t.type);
  const ref = ord.q.match(/RIGHT of the (\w+)\?/)[1];
  assert.equal(types[types.indexOf(ref) + 1], ord.answer);
});

test('inventory keyword matching', () => {
  const s = scene.makeScene(core.makeRng(3), 10);
  const inv = scene.inventory(s);
  const door = inv.find((x) => x.label.startsWith('Door'));
  assert.ok(scene.mentioned(door, 'The DOOR was open'));
  assert.ok(!scene.mentioned(door, 'a window and a clock'));
});

test('content is internally consistent', () => {
  for (const d of core.DRILLS) assert.ok(content.TECHNIQUES[d], 'technique for ' + d);
  const ids = new Set();
  for (const c of content.CASES) {
    assert.ok(!ids.has(c.id)); ids.add(c.id);
    assert.equal(new Set(c.options).size, 4, c.id);
    assert.equal(new Set(c.next.options).size, 4, c.id + ' next');
    assert.ok([1, 2, 3].includes(c.d) && c.explain && c.alt && c.next.explain, c.id);
  }
  for (const set of content.OI_SETS) {
    assert.ok(set.items.length >= 4);
    assert.ok(set.items.some(([, k]) => k === 'O') && set.items.some(([, k]) => k === 'I'));
  }
  assert.equal(new Set(content.PALACE_WORDS).size, content.PALACE_WORDS.length, 'palace words unique');
  assert.equal(new Set(content.EMOJI).size, content.EMOJI.length, 'emoji unique');
  assert.ok(content.EMOJI.length >= 33, 'enough emoji for 16 targets + 16 decoys and change drill');
  assert.ok(content.PALACE_WORDS.length >= 20 && content.MISSIONS.length >= 20);
});

test('plan does not change after finishing a drill today', () => {
  const t = '2026-11-15';
  const before = core.planWorkout([], t);
  const after = core.planWorkout([{ drill: before[1], date: t, ts: Date.now() }, { drill: before[2], date: t, ts: Date.now() }], t);
  assert.deepEqual(after, before);
});

test('migrate rejects wrongly shaped fields from a bad import', () => {
  const s = core.migrate({ history: {}, palace: {}, people: [{ source: 'real' }, null], levels: { scene: 999 }, reason: [], missions: { x: null } });
  assert.deepEqual(s.history, []);
  assert.deepEqual(s.palace, { loci: [] });
  assert.deepEqual(s.people, []);
  assert.equal(s.levels.scene, 1);
  assert.deepEqual(s.reason, { seen: {}, calib: [] });
  assert.deepEqual(s.missions, {});
  assert.deepEqual(core.migrate('x'), core.defaultState());
});

test('face svg escapes untrusted face fields', () => {
  const f = faces.makeFace(core.makeRng(1));
  f.shirt = '"><img src=x onerror=alert(1)>';
  assert.ok(!faces.faceSvg(f).includes('<img'));
});

test('inventory matching uses whole words', () => {
  const item = { keys: ['man', 'door'] };
  assert.ok(!scene.mentioned(item, 'a woman by the window'));
  assert.ok(scene.mentioned(item, 'a man and two doors'));
});
