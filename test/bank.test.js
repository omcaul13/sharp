const test = require('node:test');
const assert = require('node:assert/strict');
const bank = require('../js/bank.js');
const content = require('../js/content.js');

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

test('bank cases follow the content.CASES schema', () => {
  assert.equal(bank.CASES.length, 22);
  const ids = new Set(content.CASES.map((c) => c.id));
  for (const c of bank.CASES) {
    assert.ok(nonEmpty(c.id) && !ids.has(c.id), 'unique id ' + c.id); ids.add(c.id);
    assert.ok([1, 2, 3].includes(c.d), c.id + ' difficulty');
    for (const k of ['text', 'q', 'explain', 'alt']) assert.ok(nonEmpty(c[k]), c.id + ' ' + k);
    assert.ok(nonEmpty(c.next.q) && nonEmpty(c.next.explain), c.id + ' next');
    for (const opts of [c.options, c.next.options]) {
      assert.equal(opts.length, 4, c.id + ' four options');
      assert.equal(new Set(opts).size, 4, c.id + ' options unique');
      assert.ok(opts.every(nonEmpty), c.id + ' options non-empty');
    }
  }
});

test('estimates are well formed', () => {
  assert.equal(bank.ESTIMATES.length, 40);
  assert.equal(new Set(bank.ESTIMATES.map((e) => e.id)).size, 40, 'unique ids');
  for (const e of bank.ESTIMATES) {
    assert.ok(nonEmpty(e.id) && nonEmpty(e.q) && nonEmpty(e.unit) && nonEmpty(e.source), e.id);
    assert.ok(Number.isFinite(e.answer) && e.answer > 0, e.id + ' answer');
  }
});
