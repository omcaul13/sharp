// Witness mode: people walk into a room, move objects around a table and leave; then eyewitness questions about it.
(function (root) {
  'use strict';
  const core = typeof module === 'object' && module.exports ? require('./core.js') : root.Sharp.core;

  const SHIRTS = { red: '#c8423b', blue: '#2f62b8', green: '#2f8a4f', yellow: '#e2b52e', purple: '#7b4bb0', orange: '#e07a2b', pink: '#e46aa6' };
  const EDGE = ' stroke="#000000b0" stroke-width="3"';
  // Each drawn with its bottom centre at 0,0 so it can sit on the table or be held at the chest.
  const OBJECTS = {
    bag: '<rect x="-30" y="-46" width="60" height="46" rx="7" fill="#8a5a2b"' + EDGE + '/><path d="M-16 -46 q16 -32 32 0" stroke="#5a3a1a" stroke-width="6" fill="none"/>',
    umbrella: '<path d="M0 -88 L16 -28 L-16 -28 Z" fill="#2f62b8"' + EDGE + '/><path d="M0 -28 V-8 q0 9 -10 6" stroke="#333" stroke-width="6" fill="none"/>',
    phone: '<rect x="-16" y="-56" width="32" height="56" rx="5" fill="#222"' + EDGE + '/><rect x="-11" y="-49" width="22" height="40" rx="2" fill="#6fb3e0"/>',
    cup: '<rect x="-19" y="-42" width="38" height="42" rx="4" fill="#f4f4f4"' + EDGE + '/><path d="M19 -34 q17 7 0 21" stroke="#555" stroke-width="6" fill="none"/>',
    book: '<rect x="-30" y="-50" width="60" height="50" rx="3" fill="#2f8a4f"' + EDGE + '/><rect x="-24" y="-41" width="48" height="10" fill="#f4efe1"/>',
    keys: '<circle cx="0" cy="-44" r="13" fill="none" stroke="#b8901c" stroke-width="6"/><rect x="-5" y="-32" width="10" height="32" fill="#e2b52e"' + EDGE + '/><rect x="5" y="-14" width="10" height="6" fill="#e2b52e"/><rect x="5" y="-5" width="8" height="5" fill="#e2b52e"/>',
    box: '<rect x="-32" y="-50" width="64" height="50" fill="#c99a5b"' + EDGE + '/><rect x="-32" y="-31" width="64" height="8" fill="#e9d7a8"/>',
  };
  const OUT = 1090, Y = 150, TABLE_Y = 330, HELD_Y = 300; // OUT is past the right edge, beyond the door
  const SLOTS = { 2: [230, 770], 3: [150, 280, 760], 4: [130, 270, 730, 860] }; // beside the table, never behind it
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function params(level) {
    return { people: core.byLevel(level, 2, 4), events: core.byLevel(level, 3, 9), beatMs: core.byLevel(level, 1600, 800), questions: core.byLevel(level, 4, 7) };
  }

  function makeWitness(rng, level) {
    const p = params(level);
    const cast = rng.sample(Object.keys(SHIRTS), p.people).map((c, i) => ({ id: 'p' + i, color: SHIRTS[c], colorName: c, hat: rng.next() < 0.4, label: 'the person in the ' + c + ' shirt' }));
    const objects = rng.sample(Object.keys(OBJECTS), p.people + 1).map((name, i) => ({ id: 'o' + i, name }));
    const who = (id) => cast.find((c) => c.id === id).label, thing = (id) => 'the ' + objects.find((o) => o.id === id).name;
    const TEXT = {
      enter: (e) => who(e.who) + ' walks in.',
      pickup: (e) => who(e.who) + ' picks up ' + thing(e.obj) + '.',
      putdown: (e) => who(e.who) + ' puts down ' + thing(e.obj) + '.',
      give: (e) => who(e.who) + ' gives ' + thing(e.obj) + ' to ' + who(e.to) + '.',
      leave: (e) => who(e.who) + (e.obj ? ' leaves with ' + thing(e.obj) : ' leaves') + '.',
    };
    // status: out (not yet in) | in | gone; holder: person id or null (on the table). A gone holder means "left with".
    const st = { status: {}, holder: {} };
    cast.forEach((c) => { st.status[c.id] = 'out'; });
    objects.forEach((o) => { st.holder[o.id] = null; });
    const beats = [JSON.parse(JSON.stringify(st))], events = [];
    for (let k = 0; k < p.events; k++) {
      const left = p.events - k;
      const ids = (s) => cast.filter((c) => st.status[c.id] === s).map((c) => c.id);
      const ins = ids('in'), outs = ids('out');
      const held = (id) => objects.find((o) => st.holder[o.id] === id);
      const cands = outs.map((id) => [2, { type: 'enter', who: id }]);
      if (left > outs.length) { // otherwise everyone still outside must use the remaining beats to come in
        for (const id of ins) {
          const h = held(id);
          if (h) {
            cands.push([1, { type: 'putdown', who: id, obj: h.id }]);
            for (const to of ins) if (to !== id && !held(to)) cands.push([2, { type: 'give', who: id, obj: h.id, to }]);
          } else for (const o of objects) if (st.holder[o.id] === null) cands.push([1, { type: 'pickup', who: id, obj: o.id }]);
          // never empty the room for good before the last beat
          if (ins.length > 1 || outs.length || left === 1) cands.push([h ? 2 : 1, Object.assign({ type: 'leave', who: id }, h && { obj: h.id })]);
        }
      }
      if (!cands.length) break;
      let r = rng.next() * cands.reduce((s, c) => s + c[0], 0);
      const ev = (cands.find((c) => (r -= c[0]) < 0) || cands[cands.length - 1])[1];
      if (ev.type === 'enter') st.status[ev.who] = 'in';
      else if (ev.type === 'leave') st.status[ev.who] = 'gone';
      else st.holder[ev.obj] = ev.type === 'pickup' ? ev.who : ev.type === 'give' ? ev.to : null;
      ev.text = cap(TEXT[ev.type](ev));
      events.push(ev);
      beats.push(JSON.parse(JSON.stringify(st)));
    }
    const w = { params: p, cast, objects, events, beats };
    w.questions = makeQuestions(w, rng, level, p.questions);
    return w;
  }

  // ---- questions: each builder returns {q, answer, options} or null when it would be unanswerable or ambiguous ----
  function ask(q, answer, pool, rng) {
    const others = rng.sample([...new Set(pool)].filter((x) => x !== answer), 3);
    return others.length ? { q, answer, options: rng.shuffle([answer].concat(others)) } : null;
  }
  const label = (w, id) => w.cast.find((c) => c.id === id).label;
  const entered = (w) => w.events.filter((e) => e.type === 'enter').map((e) => e.who);
  const final = (w) => w.beats[w.beats.length - 1];
  const BUILDERS = {
    enteredFirst(w, rng) { const ent = entered(w); return ent.length < 2 ? null : ask('Who walked in first?', label(w, ent[0]), ent.map((id) => label(w, id)), rng); },
    enteredLast(w, rng) { const ent = entered(w); return ent.length < 2 ? null : ask('Who walked in last?', label(w, ent[ent.length - 1]), ent.map((id) => label(w, id)), rng); },
    endCount(w, rng) {
      const n = w.cast.filter((c) => final(w).status[c.id] === 'in').length;
      return ask('How many people were in the room at the end?', String(n), w.cast.map((c, i) => String(i)).concat(String(w.cast.length)), rng);
    },
    pickedUp(w, rng) {
      const picks = (c) => w.events.filter((e) => e.type === 'pickup' && e.who === c.id);
      const c = w.cast.filter((x) => picks(x).length === 1);
      if (!c.length) return null;
      const person = rng.pick(c), o = w.objects.find((x) => x.id === picks(person)[0].obj);
      return ask('What did ' + person.label + ' pick up?', 'the ' + o.name, w.objects.map((x) => 'the ' + x.name), rng);
    },
    leftWith(w, rng) {
      const f = final(w), os = w.objects.filter((o) => f.holder[o.id] && f.status[f.holder[o.id]] === 'gone');
      if (!os.length) return null;
      const o = rng.pick(os);
      return ask('Who left with the ' + o.name + '?', label(w, f.holder[o.id]), entered(w).map((id) => label(w, id)), rng);
    },
    gave(w, rng) {
      const gives = w.events.filter((e) => e.type === 'give');
      const once = gives.filter((g) => gives.filter((x) => x.obj === g.obj).length === 1);
      if (!once.length) return null;
      const g = rng.pick(once), short = (id) => w.cast.find((c) => c.id === id).colorName + ' shirt', pair = (a, b) => short(a) + ' to ' + short(b);
      const ent = entered(w), pool = [];
      ent.forEach((a) => ent.forEach((b) => { if (a !== b) pool.push(pair(a, b)); }));
      return ask('Who gave the ' + w.objects.find((o) => o.id === g.obj).name + ' to whom?', pair(g.who, g.to), pool, rng);
    },
    afterEvent(w, rng) {
      const texts = w.events.map((e) => e.text);
      const idx = texts.slice(0, -1).map((t, i) => i).filter((i) => texts.indexOf(texts[i]) === texts.lastIndexOf(texts[i]));
      if (!idx.length) return null;
      const i = rng.pick(idx);
      return ask('What happened right after this: "' + texts[i] + '"', texts[i + 1], texts.filter((t) => t !== texts[i]), rng);
    },
    whereEnd(w, rng) {
      const f = final(w), o = rng.pick(w.objects), h = f.holder[o.id];
      const pool = ['on the table'];
      entered(w).forEach((id) => pool.push('held by ' + label(w, id), 'left with ' + label(w, id)));
      const ans = h === null ? 'on the table' : (f.status[h] === 'gone' ? 'left with ' : 'held by ') + label(w, h);
      return ask('Where ' + (o.name === 'keys' ? 'were' : 'was') + ' the ' + o.name + ' at the end?', ans, pool, rng);
    },
  };
  function makeQuestions(w, rng, level, n) {
    const allowed = ['enteredFirst', 'endCount', 'pickedUp', 'leftWith', 'whereEnd'].concat(level >= 4 ? ['enteredLast', 'gave'] : [], level >= 7 ? ['afterEvent'] : []);
    const order = rng.shuffle(allowed).concat(Array.from({ length: 30 }, () => rng.pick(allowed)));
    const out = [], seen = new Set();
    for (const key of order) {
      if (out.length >= n) break;
      const q = BUILDERS[key](w, rng);
      if (q && !seen.has(q.q)) { seen.add(q.q); out.push(Object.assign({ key }, q)); }
    }
    return out;
  }

  // ---- rendering (1000 x 520 SVG); people and objects are moved with CSS transforms so beats animate ----
  function personAt(w, b, i) { return w.beats[b].status[w.cast[i].id] === 'in' ? [SLOTS[w.cast.length][i], Y] : [OUT, Y]; }
  function objectAt(w, b, i) {
    const h = w.beats[b].holder[w.objects[i].id];
    if (h === null) return [Math.round(500 + (i - (w.objects.length - 1) / 2) * 66), TABLE_Y];
    return [personAt(w, b, w.cast.findIndex((c) => c.id === h))[0], HELD_Y];
  }
  const tf = (xy) => 'translate(' + xy[0] + 'px,' + xy[1] + 'px)';
  function personSvg(c) {
    return '<rect x="-36" y="190" width="28" height="100" rx="6" fill="#3b3f4a"/><rect x="8" y="190" width="28" height="100" rx="6" fill="#3b3f4a"/>' +
      '<rect x="-46" y="40" width="92" height="160" rx="26" fill="' + c.color + '"' + EDGE + '/><circle r="34" fill="#e8b996"' + EDGE + '/>' +
      (c.hat ? '<rect x="-30" y="-68" width="60" height="42" rx="7" fill="#222"/><rect x="-48" y="-32" width="96" height="12" rx="5" fill="#222"/>' : '');
  }
  function svg(w) {
    const ms = Math.round(0.7 * w.params.beatMs);
    const g = (id, xy, body) => '<g id="witness-' + id + '" style="transform: ' + tf(xy) + '; transition: transform ' + ms + 'ms ease-in-out">' + body + '</g>';
    const p = ['<rect width="1000" height="400" fill="#e9dfcc"/><rect y="400" width="1000" height="120" fill="#9c7650"/><rect y="392" width="1000" height="10" fill="#7d5c3d"/>',
      '<rect x="900" y="150" width="88" height="250" fill="#3a2c22" stroke="#5d3f28" stroke-width="6"/><path d="M900 150 L862 170 L862 385 L900 400 Z" fill="#a8744b" stroke="#5d3f28" stroke-width="3"/>',
      '<rect x="320" y="330" width="360" height="18" fill="#6b4a2e"/><rect x="340" y="348" width="14" height="120" fill="#5d3f28"/><rect x="646" y="348" width="14" height="120" fill="#5d3f28"/>'];
    w.cast.forEach((c, i) => p.push(g(c.id, personAt(w, 0, i), personSvg(c))));
    w.objects.forEach((o, i) => p.push(g(o.id, objectAt(w, 0, i), OBJECTS[o.name])));
    return '<svg viewBox="0 0 1000 520" class="scene witness" role="img" aria-label="A room with a door on the right and a table in the middle. Watch who comes in, what they do with the objects, and who leaves." xmlns="http://www.w3.org/2000/svg">' + p.join('') + '</svg>';
  }
  function applyBeat(svgRoot, w, i) {
    const b = Math.max(0, Math.min(w.beats.length - 1, i));
    const set = (id, xy) => { const el = svgRoot.querySelector('#witness-' + id); if (el) el.style.transform = tf(xy); };
    w.cast.forEach((c, k) => set(c.id, personAt(w, b, k)));
    w.objects.forEach((o, k) => set(o.id, objectAt(w, b, k)));
  }
  const narration = (w) => w.events.map((e) => e.text);

  const api = { params, makeWitness, svg, applyBeat, narration, BUILDERS, SHIRTS, OBJECTS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Sharp = root.Sharp || {}).witness = api;
})(typeof window !== 'undefined' ? window : globalThis);
