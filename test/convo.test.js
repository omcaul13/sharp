const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/core.js');
const convo = require('../js/convo.js');

test('params scale across levels', () => {
  assert.deepEqual(convo.params(1), { facts: 4, questions: 4, replays: 1, rate: 0.95 });
  assert.deepEqual(convo.params(20), { facts: 9, questions: 8, replays: 0, rate: 1.1 });
  // every fact gives an easy question, plus the first-name one, so questions never run short
  for (let l = 1; l <= 20; l++) assert.ok(convo.params(l).questions <= convo.params(l).facts + 1);
});

test('conversation intros and questions are well formed at every level', () => {
  for (let level = 1; level <= 20; level++) {
    const p = convo.params(level);
    for (let seed = 0; seed < 30; seed++) {
      const it = convo.makeIntro(core.makeRng(seed * 31 + level), level);
      const tag = 'level ' + level + ' seed ' + seed;
      assert.equal(it.sentences.join(' '), it.text, tag);
      assert.ok(!/undefined|null|NaN/.test(it.text), tag + ': ' + it.text);
      assert.ok(it.text.startsWith('H') || it.text.startsWith('O'), tag + ': greeting first');
      assert.ok(it.text.includes(it.speaker.first + ' ' + it.speaker.last), tag);
      assert.equal(it.sentences.length, p.facts + 4, tag);
      assert.equal(it.questions.length, p.questions, tag); // == min(questions, possible): possible >= facts + 1
      for (const q of it.questions) {
        assert.equal(q.options.length, 4, tag + ' ' + q.q);
        assert.equal(new Set(q.options).size, 4, tag + ' ' + q.q + ' ' + q.options);
        assert.ok(q.options.includes(q.answer), tag + ' ' + q.q);
        if (/NOT/.test(q.q)) {
          assert.ok(!it.text.includes(q.answer), tag + ' not-mentioned answer absent');
          for (const o of q.options) if (o !== q.answer) assert.ok(it.text.includes(o), tag + ' others present: ' + o);
        } else assert.ok(it.text.includes(q.answer), tag + ' ' + q.q + ' -> ' + q.answer);
      }
    }
  }
});

test('intros are deterministic per seed and level', () => {
  for (const level of [1, 10, 20]) {
    assert.deepEqual(convo.makeIntro(core.makeRng(42), level), convo.makeIntro(core.makeRng(42), level));
  }
  assert.notDeepEqual(convo.makeIntro(core.makeRng(1), 5).text, convo.makeIntro(core.makeRng(2), 5).text);
});

test('harder question types appear at high levels', () => {
  const qs = [];
  for (let seed = 0; seed < 30; seed++) qs.push(...convo.makeIntro(core.makeRng(seed), 20).questions.map((q) => q.q));
  assert.ok(qs.some((q) => q.includes('mention first')));
  assert.ok(qs.some((q) => q.includes('NOT mention')));
  assert.ok(qs.some((q) => q.startsWith('How old') || q.startsWith('How many years')));
  assert.ok(qs.some((q) => q.startsWith('What day')));
  const low = convo.makeIntro(core.makeRng(3), 1).questions.map((q) => q.q);
  assert.ok(!low.some((q) => /NOT|first\?|How old|How many|What day|last name/.test(q)));
});

test('ordering question answer was said before the other options', () => {
  for (let seed = 0; seed < 30; seed++) {
    const it = convo.makeIntro(core.makeRng(seed), 15);
    const q = it.questions.find((x) => x.q.includes('mention first'));
    if (!q) continue;
    const at = (o) => it.sentences.findIndex((s) => s.includes(o));
    for (const o of q.options) assert.ok(at(q.answer) <= at(o), 'seed ' + seed);
  }
});
