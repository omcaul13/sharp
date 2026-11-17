// "Walk into a room" scenes: a random model, an SVG rendering of it, and multiple-choice questions about it.
(function (root) {
  'use strict';
  const faces = typeof module === 'object' && module.exports ? require('./faces.js') : root.Sharp.faces;
  const core = typeof module === 'object' && module.exports ? require('./core.js') : root.Sharp.core;

  const COLORS = { red: '#c8423b', blue: '#2f62b8', green: '#2f8a4f', yellow: '#e2b52e', purple: '#7b4bb0', orange: '#e07a2b', white: '#f4f4f4', black: '#2a2a2a' };
  const ITEM_COLORS = {
    mug: Object.keys(COLORS), book: ['red', 'blue', 'green', 'purple', 'orange', 'black'], phone: ['red', 'blue', 'black', 'white', 'purple'],
    bottle: ['blue', 'green', 'orange', 'white'], apple: ['red', 'green', 'yellow'], plant: ['red', 'blue', 'orange', 'white', 'black'],
    candle: ['red', 'white', 'purple', 'yellow'], box: ['red', 'blue', 'green', 'yellow', 'purple'],
  };
  const ITEMS = Object.keys(ITEM_COLORS);
  const WEATHER = ['sunny', 'cloudy', 'rainy', 'night'];
  const SHAPES = ['circle', 'triangle', 'star', 'square'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fmtTime = (h, m) => h + ':' + String(m).padStart(2, '0');

  function params(level) {
    return {
      items: core.byLevel(level, 3, 7),
      people: core.byLevel(level, 1, 4),
      seconds: core.byLevel(level, 30, 10),
      questions: core.byLevel(level, 4, 8),
      extras: level >= 4, // sticky note + calendar
    };
  }

  function makeScene(rng, level) {
    const p = params(level);
    const types = rng.sample(ITEMS, p.items);
    return {
      level, seconds: p.seconds, nQuestions: p.questions,
      clock: { h: 1 + rng.int(12), m: 5 * rng.int(12) },
      weather: rng.pick(WEATHER),
      frame: { shape: rng.pick(SHAPES), color: rng.pick(['red', 'blue', 'green', 'yellow', 'purple', 'orange']) },
      note: p.extras ? String(1000 + rng.int(9000)) : null,
      calendar: p.extras ? { month: rng.int(12), day: 1 + rng.int(28) } : null,
      door: rng.pick(['open', 'closed']),
      lamp: rng.pick(['on', 'off']),
      table: types.map((type) => ({ type, color: rng.pick(ITEM_COLORS[type]) })),
      people: faces.makePeople(rng, p.people).map((x) => x.face),
      // surprise element: teaches you your own miss rate for things you weren't looking for
      odd: rng.next() < 0.4 ? rng.pick(Object.keys(ODDS)) : 'nothing',
    };
  }
  const ODDS = { cat: 'a cat under the table', spider: 'a spider on the wall', umbrella: 'an open umbrella on the floor' };

  // ---- questions ----
  // Each builder returns {q, answer, options} or null if it does not apply to this scene.
  function mc(rng, answer, pool, n) {
    const others = rng.sample(pool.filter((x) => x !== answer), (n || 4) - 1);
    return rng.shuffle([answer].concat(others));
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const BUILDERS = {
    clock(s, rng) {
      const ans = fmtTime(s.clock.h, s.clock.m);
      const pool = new Set();
      while (pool.size < 6) {
        const h = ((s.clock.h - 1 + rng.int(5) - 2 + 12) % 12) + 1;
        const m = (s.clock.m + 5 * (rng.int(7) - 3) + 60) % 60;
        if (fmtTime(h, m) !== ans) pool.add(fmtTime(h, m));
      }
      return { q: 'What time did the wall clock show?', answer: ans, options: mc(rng, ans, [...pool]) };
    },
    weather(s, rng) { return { q: 'What was it like outside the window?', answer: s.weather, options: mc(rng, s.weather, WEATHER) }; },
    frameShape(s, rng) { return { q: 'What shape was in the framed picture?', answer: s.frame.shape, options: mc(rng, s.frame.shape, SHAPES) }; },
    frameColor(s, rng) { return { q: 'What color was the shape in the framed picture?', answer: s.frame.color, options: mc(rng, s.frame.color, ['red', 'blue', 'green', 'yellow', 'purple', 'orange']) }; },
    note(s, rng) {
      if (!s.note) return null;
      const d = s.note.split('');
      const pool = new Set();
      while (pool.size < 3) {
        const v = d.slice();
        const i = rng.int(3);
        if (rng.next() < 0.5) [v[i], v[i + 1]] = [v[i + 1], v[i]]; else v[rng.int(4)] = String(rng.int(10));
        if (v[0] === '0') continue; // keep every option a four-digit number like the real note
        const str = v.join('');
        if (str !== s.note) pool.add(str);
      }
      return { q: 'What number was written on the sticky note?', answer: s.note, options: rng.shuffle([s.note, ...pool]) };
    },
    calendar(s, rng) {
      if (!s.calendar) return null;
      const ans = MONTHS[s.calendar.month] + ' ' + s.calendar.day;
      const pool = new Set();
      while (pool.size < 3) {
        const alt = rng.next() < 0.5
          ? MONTHS[(s.calendar.month + 1 + rng.int(11)) % 12] + ' ' + s.calendar.day
          : MONTHS[s.calendar.month] + ' ' + (1 + ((s.calendar.day - 1 + 1 + rng.int(27)) % 28));
        if (alt !== ans) pool.add(alt);
      }
      return { q: 'What date was the calendar showing?', answer: ans, options: rng.shuffle([ans, ...pool]) };
    },
    door(s, rng) { return { q: 'Was the door open or closed?', answer: s.door, options: rng.shuffle(['open', 'closed']) }; },
    lamp(s, rng) { return { q: 'Was the floor lamp on or off?', answer: s.lamp, options: rng.shuffle(['on', 'off']) }; },
    itemCount(s, rng) {
      const n = s.table.length;
      return { q: 'How many objects were on the table?', answer: String(n), options: mc(rng, String(n), [n - 2, n - 1, n + 1, n + 2].filter((x) => x > 0).map(String).concat(String(n))) };
    },
    itemColor(s, rng) {
      const it = rng.pick(s.table);
      return { q: 'What color was the ' + it.type + '?', answer: it.color, options: mc(rng, it.color, ITEM_COLORS[it.type].length >= 4 ? ITEM_COLORS[it.type] : Object.keys(COLORS)) };
    },
    itemPresent(s, rng) {
      const present = s.table.map((t) => t.type);
      const absent = ITEMS.filter((t) => !present.includes(t));
      if (absent.length < 3) return null;
      const ans = rng.pick(present);
      return { q: 'Which of these was on the table?', answer: ans, options: rng.shuffle([ans, ...rng.sample(absent, 3)]) };
    },
    itemAbsent(s, rng) {
      const present = s.table.map((t) => t.type);
      const absent = ITEMS.filter((t) => !present.includes(t));
      if (present.length < 3 || !absent.length) return null;
      const ans = rng.pick(absent);
      return { q: 'Which of these was NOT on the table?', answer: ans, options: rng.shuffle([ans, ...rng.sample(present, 3)]) };
    },
    itemOrder(s, rng) {
      if (s.table.length < 3) return null;
      const i = rng.int(s.table.length - 1);
      const ans = s.table[i + 1].type;
      return { q: 'On the table, what was directly to the RIGHT of the ' + s.table[i].type + '?', answer: ans,
        options: mc(rng, ans, s.table.map((t) => t.type).filter((t) => t !== s.table[i].type)) };
    },
    peopleCount(s, rng) {
      const n = s.people.length;
      return { q: 'How many people were in the room?', answer: String(n), options: mc(rng, String(n), ['1', '2', '3', '4', '5']) };
    },
    hats(s, rng) {
      const n = s.people.filter((f) => f.hat !== 'none').length;
      return { q: 'How many people were wearing a hat?', answer: String(n), options: mc(rng, String(n), ['0', '1', '2', '3', '4'].slice(0, s.people.length + 1).concat(['0', '1', '2', '3']).filter((v, i, a) => a.indexOf(v) === i)) };
    },
    glasses(s, rng) {
      const n = s.people.filter((f) => f.glasses !== 'none').length;
      return { q: 'How many people were wearing glasses?', answer: String(n), options: mc(rng, String(n), ['0', '1', '2', '3', '4'].slice(0, Math.max(4, s.people.length + 1))) };
    },
    leftShirt(s, rng) {
      if (s.people.length < 2) return null;
      const ans = s.people[0].shirt;
      return { q: 'What color shirt was the person on the far LEFT wearing?', answer: ans, options: mc(rng, ans, Object.keys(faces.SHIRTS)) };
    },
    odd(s, rng) {
      const ans = s.odd === 'nothing' ? 'nothing unusual' : ODDS[s.odd];
      return { q: 'Was there anything unusual in the room?', answer: ans, options: rng.shuffle(Object.values(ODDS).concat('nothing unusual')) };
    },
    beard(s, rng) {
      const has = s.people.some((f) => f.facial === 'beard' || f.facial === 'mustache');
      return { q: 'Did anyone have a beard or mustache?', answer: has ? 'yes' : 'no', options: ['yes', 'no'] };
    },
  };

  function makeQuestions(scene, rng) {
    const built = [];
    for (const key of rng.shuffle(Object.keys(BUILDERS))) {
      const q = BUILDERS[key](scene, rng);
      if (q) built.push(Object.assign({ key }, q));
      if (built.length >= scene.nQuestions) break;
    }
    return built;
  }

  // ---- rendering (1000 x 520 SVG) ----
  function itemSvg(it, x) {
    const c = COLORS[it.color], y = 300, edge = '#000000b0'; // strong outline so items read clearly against a shirt behind them
    switch (it.type) {
      case 'mug': return '<rect x="' + (x - 15) + '" y="' + (y - 32) + '" width="30" height="32" rx="3" fill="' + c + '" stroke="' + edge + '"/><path d="M' + (x + 15) + ' ' + (y - 26) + ' q14 4 0 16" stroke="' + c + '" stroke-width="5" fill="none"/>';
      case 'book': return '<rect x="' + (x - 30) + '" y="' + (y - 16) + '" width="60" height="16" rx="2" fill="' + c + '" stroke="' + edge + '"/><rect x="' + (x - 26) + '" y="' + (y - 5) + '" width="54" height="3" fill="#f4efe1"/>';
      case 'phone': return '<rect x="' + (x - 9) + '" y="' + (y - 34) + '" width="18" height="34" rx="4" fill="' + c + '" stroke="' + edge + '"/><rect x="' + (x - 6) + '" y="' + (y - 30) + '" width="12" height="24" rx="1" fill="#1b2633"/>';
      case 'bottle': return '<rect x="' + (x - 9) + '" y="' + (y - 44) + '" width="18" height="44" rx="5" fill="' + c + '" stroke="' + edge + '" opacity="0.92"/><rect x="' + (x - 4) + '" y="' + (y - 56) + '" width="8" height="13" fill="' + c + '" stroke="' + edge + '"/>';
      case 'apple': return '<circle cx="' + x + '" cy="' + (y - 14) + '" r="14" fill="' + c + '" stroke="' + edge + '"/><path d="M' + x + ' ' + (y - 27) + ' l2 -8" stroke="#5a3a20" stroke-width="2"/><ellipse cx="' + (x + 6) + '" cy="' + (y - 33) + '" rx="5" ry="2.5" fill="#3f8f3a"/>';
      case 'plant': return '<path d="M' + (x - 16) + ' ' + (y - 28) + ' L' + (x + 16) + ' ' + (y - 28) + ' L' + (x + 12) + ' ' + y + ' L' + (x - 12) + ' ' + y + ' Z" fill="' + c + '" stroke="' + edge + '"/><path d="M' + x + ' ' + (y - 28) + ' q-22 -14 -14 -36 q10 18 14 36 q4 -26 18 -34 q4 22 -18 34" fill="#3f8f3a"/>';
      case 'candle': return '<rect x="' + (x - 7) + '" y="' + (y - 38) + '" width="14" height="38" fill="' + c + '" stroke="' + edge + '"/><path d="M' + x + ' ' + (y - 52) + ' q6 8 0 12 q-6 -4 0 -12" fill="#f5a623"/>';
      case 'box': return '<rect x="' + (x - 20) + '" y="' + (y - 30) + '" width="40" height="30" fill="' + c + '" stroke="' + edge + '"/><rect x="' + (x - 3) + '" y="' + (y - 30) + '" width="6" height="30" fill="#ffffffaa"/><rect x="' + (x - 20) + '" y="' + (y - 18) + '" width="40" height="6" fill="#ffffffaa"/>';
    }
    return '';
  }
  function shapeSvg(shape, cx, cy, r, fill) {
    if (shape === 'circle') return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"/>';
    if (shape === 'square') return '<rect x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + 2 * r + '" height="' + 2 * r + '" fill="' + fill + '"/>';
    if (shape === 'triangle') return '<path d="M' + cx + ' ' + (cy - r) + ' L' + (cx + r) + ' ' + (cy + r) + ' L' + (cx - r) + ' ' + (cy + r) + ' Z" fill="' + fill + '"/>';
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1)); }
    return '<polygon points="' + pts.join(' ') + '" fill="' + fill + '"/>';
  }
  function windowSvg(w) {
    const sky = { sunny: '#8ec9f0', cloudy: '#b7c3cc', rainy: '#7d8b96', night: '#1d2340' }[w];
    let s = '<rect x="40" y="30" width="180" height="140" fill="' + sky + '"/>';
    if (w === 'sunny') s += '<circle cx="180" cy="66" r="18" fill="#ffd34d"/>';
    if (w === 'cloudy' || w === 'rainy') s += '<g fill="#eef1f4"><ellipse cx="100" cy="70" rx="34" ry="16"/><ellipse cx="130" cy="62" rx="26" ry="16"/><ellipse cx="160" cy="80" rx="30" ry="13"/></g>';
    if (w === 'rainy') for (let i = 0; i < 14; i++) s += '<path d="M' + (60 + i * 11) + ' ' + (100 + (i % 3) * 18) + ' l-4 12" stroke="#cfe3f5" stroke-width="2"/>';
    if (w === 'night') s += '<circle cx="170" cy="64" r="14" fill="#f2efd8"/><circle cx="177" cy="59" r="12" fill="#1d2340"/><g fill="#fff"><circle cx="80" cy="60" r="1.5"/><circle cx="110" cy="100" r="1.5"/><circle cx="140" cy="50" r="1.5"/><circle cx="70" cy="130" r="1.5"/></g>';
    return s + '<rect x="40" y="30" width="180" height="140" fill="none" stroke="#f5f1e8" stroke-width="8"/><path d="M130 30 V170 M40 100 H220" stroke="#f5f1e8" stroke-width="6"/>';
  }
  function clockSvg(h, m) {
    const ma = (m / 60) * 2 * Math.PI, ha = ((h % 12) / 12 + m / 720) * 2 * Math.PI, cx = 470, cy = 90;
    let s = '<circle cx="' + cx + '" cy="' + cy + '" r="52" fill="#fff" stroke="#333" stroke-width="5"/>';
    for (let i = 0; i < 12; i++) { const a = i / 12 * 2 * Math.PI; s += '<path d="M' + (cx + 42 * Math.sin(a)).toFixed(1) + ' ' + (cy - 42 * Math.cos(a)).toFixed(1) + ' L' + (cx + 47 * Math.sin(a)).toFixed(1) + ' ' + (cy - 47 * Math.cos(a)).toFixed(1) + '" stroke="#333" stroke-width="' + (i % 3 ? 2 : 4) + '"/>'; }
    s += '<path d="M' + cx + ' ' + cy + ' L' + (cx + 26 * Math.sin(ha)).toFixed(1) + ' ' + (cy - 26 * Math.cos(ha)).toFixed(1) + '" stroke="#222" stroke-width="6" stroke-linecap="round"/>';
    s += '<path d="M' + cx + ' ' + cy + ' L' + (cx + 40 * Math.sin(ma)).toFixed(1) + ' ' + (cy - 40 * Math.cos(ma)).toFixed(1) + '" stroke="#222" stroke-width="3" stroke-linecap="round"/>';
    return s + '<circle cx="' + cx + '" cy="' + cy + '" r="4" fill="#222"/>';
  }

  function sceneSvg(s) {
    const p = [];
    p.push('<rect width="1000" height="360" fill="#e9dfcc"/><rect y="360" width="1000" height="160" fill="#9c7650"/><rect y="352" width="1000" height="10" fill="#7d5c3d"/>');
    p.push(windowSvg(s.weather));
    p.push('<rect x="262" y="38" width="100" height="104" fill="#fbfaf6" stroke="#6b4a2e" stroke-width="7"/>' + shapeSvg(s.frame.shape, 312, 90, 30, COLORS[s.frame.color]));
    p.push(clockSvg(s.clock.h, s.clock.m));
    if (s.calendar) p.push('<rect x="560" y="40" width="96" height="104" fill="#fff" stroke="#999"/><rect x="560" y="40" width="96" height="26" fill="#c8423b"/><text x="608" y="59" font-size="14" fill="#fff" text-anchor="middle" font-family="sans-serif">' + MONTHS[s.calendar.month].slice(0, 3).toUpperCase() + '</text><text x="608" y="122" font-size="44" text-anchor="middle" font-family="sans-serif" fill="#222">' + s.calendar.day + '</text>');
    if (s.note) p.push('<g transform="rotate(-4 715 92)"><rect x="680" y="60" width="72" height="62" fill="#fff27a" stroke="#d8c84c"/><text x="716" y="99" font-size="20" text-anchor="middle" font-family="cursive, sans-serif" fill="#2a2a7a">' + s.note + '</text></g>');
    // door
    p.push('<rect x="860" y="130" width="110" height="230" fill="' + (s.door === 'open' ? '#3a2c22' : '#8b5e3c') + '" stroke="#5d3f28" stroke-width="5"/>');
    if (s.door === 'open') p.push('<path d="M860 130 L820 150 L820 345 L860 360 Z" fill="#a8744b" stroke="#5d3f28" stroke-width="3"/>');
    else p.push('<circle cx="950" cy="250" r="6" fill="#e2b52e"/>');
    // lamp
    if (s.lamp === 'on') p.push('<circle cx="790" cy="215" r="60" fill="#fff3b0" opacity="0.55"/>');
    p.push('<rect x="787" y="230" width="6" height="128" fill="#444"/><ellipse cx="790" cy="358" rx="22" ry="5" fill="#444"/><path d="M765 230 L815 230 L803 196 L777 196 Z" fill="' + (s.lamp === 'on' ? '#ffe680' : '#cfc7b5') + '" stroke="#777"/>');
    // people stand behind the table
    const n = s.people.length, slot = 120, x0 = 500 - (n * slot) / 2;
    s.people.forEach((f, i) => {
      p.push('<g transform="translate(' + (x0 + i * slot) + ',158) scale(1.2)">' + faces.faceSvg(f).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + '</g>');
    });
    // table and items
    p.push('<rect x="200" y="300" width="600" height="16" fill="#6b4a2e"/><rect x="220" y="316" width="14" height="110" fill="#5d3f28"/><rect x="766" y="316" width="14" height="110" fill="#5d3f28"/>');
    const k = s.table.length, step = 540 / k;
    s.table.forEach((it, i) => p.push(itemSvg(it, Math.round(230 + step * (i + 0.5)))));
    if (s.odd === 'cat') p.push('<g fill="#6d6d6d"><ellipse cx="520" cy="420" rx="34" ry="16"/><circle cx="556" cy="404" r="13"/><path d="M547 396 L550 383 L556 394 Z M559 394 L565 383 L567 397 Z"/><path d="M487 418 q-22 -6 -18 -30" stroke="#6d6d6d" stroke-width="5" fill="none"/></g><circle cx="552" cy="402" r="1.8" fill="#e2e26a"/><circle cx="561" cy="402" r="1.8" fill="#e2e26a"/>');
    if (s.odd === 'spider') p.push('<path d="M120 180 V246" stroke="#555" stroke-width="1"/><g stroke="#222" stroke-width="2"><path d="M108 244 L132 256 M108 256 L132 244 M106 250 L134 250 M110 240 L130 260"/></g><circle cx="120" cy="250" r="7" fill="#222"/>');
    if (s.odd === 'umbrella') p.push('<path d="M60 440 Q110 380 160 440 Z" fill="#2f62b8"/><path d="M110 440 L110 470 q0 8 -8 6" stroke="#333" stroke-width="3" fill="none"/>');
    return '<svg viewBox="0 0 1000 520" class="scene" role="img" aria-label="A room scene to memorize" xmlns="http://www.w3.org/2000/svg">' + p.join('') + '</svg>';
  }

  // Everything in the room, with words that count as "you mentioned it" in a free-text description.
  // shortcut: plain keyword matching, so synonyms the list doesn't know won't count; extend keys if that bites.
  function inventory(s) {
    const weatherKeys = { sunny: ['sun', 'sunny'], cloudy: ['cloud', 'cloudy', 'overcast'], rainy: ['rain', 'rainy', 'raining'], night: ['night', 'moon', 'dark'] };
    const inv = [
      { label: 'Clock showing ' + fmtTime(s.clock.h, s.clock.m), keys: [fmtTime(s.clock.h, s.clock.m)] }, // credit needs the actual time,
      { label: 'Window: ' + s.weather, keys: ['window'].concat(weatherKeys[s.weather]) },
      { label: 'Framed picture: ' + s.frame.color + ' ' + s.frame.shape, keys: ['frame', 'picture', 'painting', s.frame.shape] },
      s.note && { label: 'Sticky note: ' + s.note, keys: ['note', 'sticky', 'post-it', s.note] },
      s.calendar && { label: 'Calendar: ' + MONTHS[s.calendar.month] + ' ' + s.calendar.day, keys: ['calendar', MONTHS[s.calendar.month].toLowerCase().slice(0, 3)] },
      { label: 'Door ' + s.door, keys: ['door'] },
      { label: 'Floor lamp ' + s.lamp, keys: ['lamp', 'light'] },
      { label: s.people.length + (s.people.length === 1 ? ' person' : ' people'), keys: ['person', 'people', 'man', 'woman', 'guy', 'someone'] },
    ].filter(Boolean);
    s.people.forEach((f, i) => inv.push({ label: 'Person ' + (i + 1) + ': ' + faces.describe(f).replace('Person with ', ''), keys: [f.shirt + ' shirt'].concat(f.hat !== 'none' ? [f.hat] : [], f.glasses !== 'none' ? ['glasses'] : [], f.facial === 'beard' ? ['beard'] : []) }));
    s.table.forEach((t) => inv.push({ label: t.color + ' ' + t.type + ' on the table', keys: [t.type] }));
    if (s.odd !== 'nothing') inv.push({ label: 'Unusual: ' + ODDS[s.odd], keys: [s.odd] });
    return inv;
  }
  // Whole-word match (so "man" doesn't match "woman"), allowing a plural s/es.
  function mentioned(item, text) {
    const t = text.toLowerCase();
    return item.keys.some((k) => new RegExp('(^|[^a-z0-9])' + k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(s|es)?(?![a-z0-9])').test(t));
  }

  const api = { params, makeScene, makeQuestions, sceneSvg, inventory, mentioned, BUILDERS, ITEMS, ODDS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Sharp = root.Sharp || {}).scene = api;
})(typeof window !== 'undefined' ? window : globalThis);
