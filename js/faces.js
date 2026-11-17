// Procedural people: an SVG face plus a name, job and personal detail.
(function (root) {
  'use strict';

  const SKIN = ['#f6d7c3', '#eac09a', '#d09a6e', '#a8714a', '#7c4f31', '#5a3825'];
  const HAIR_COLORS = { black: '#1c1714', brown: '#5b3a22', blonde: '#d9b46a', red: '#a8442a', gray: '#9a9a9a', blue: '#3b6fd1' };
  const SHIRTS = { red: '#c8423b', blue: '#2f62b8', green: '#2f8a4f', yellow: '#e2b52e', purple: '#7b4bb0', orange: '#e07a2b', white: '#f2f2f2', black: '#2a2a2a' };
  const HAIR_STYLES = ['bald', 'short', 'sidepart', 'curly', 'bun', 'spiky', 'long'];
  const GLASSES = ['none', 'none', 'round', 'square'];
  const FACIAL = ['none', 'none', 'mustache', 'beard', 'stubble'];
  const HATS = ['none', 'none', 'none', 'cap', 'beanie'];

  const FIRST = ['Maya', 'Jamal', 'Priya', 'Lucas', 'Sofia', 'Omar', 'Hannah', 'Diego', 'Aiko', 'Ethan', 'Fatima', 'Noah',
    'Grace', 'Mateo', 'Leila', 'Owen', 'Chloe', 'Kwame', 'Ingrid', 'Ravi', 'Elena', 'Marcus', 'Yuki', 'Theo', 'Amara',
    'Felix', 'Nadia', 'Caleb', 'Rosa', 'Samir', 'Iris', 'Tobias', 'Zara', 'Henry', 'Mei', 'Andre', 'Lucia', 'Dmitri',
    'Ava', 'Kofi', 'Sienna', 'Rafael', 'Hazel', 'Arjun', 'Clara', 'Malik', 'Freya', 'Jonah', 'Imani', 'Victor', 'Paloma',
    'Emmett', 'Nora', 'Tariq', 'Wren', 'Gabriel', 'Esme', 'Hugo', 'Talia', 'Isaac'];
  const LAST = ['Torres', 'Okafor', 'Patel', 'Bennett', 'Nakamura', 'Haddad', 'Lindqvist', 'Moreno', 'Chen', 'Walsh',
    'Mensah', 'Kowalski', 'Rivera', 'Abbott', 'Sato', 'Delgado', 'Fischer', 'Nguyen', 'Osei', 'Brennan', 'Castillo',
    'Ibrahim', 'Novak', 'Kim', 'Duarte', 'Hughes', 'Romero', 'Adeyemi', 'Larsen', 'Shah', 'Murphy', 'Volkov', 'Reyes',
    'Tanaka', 'Bishop', 'Ortiz', 'Sinclair', 'Mbeki', 'Costa', 'Weber'];
  const JOBS = ['nurse', 'electrician', 'architect', 'chef', 'paramedic', 'librarian', 'pilot', 'pharmacist', 'welder',
    'teacher', 'lawyer', 'dentist', 'carpenter', 'journalist', 'veterinarian', 'accountant', 'physicist', 'barista',
    'firefighter', 'photographer', 'mechanic', 'translator', 'florist', 'surgeon', 'software engineer', 'baker',
    'park ranger', 'tattoo artist', 'civil engineer', 'radio DJ'];
  const DETAILS = ['grew up in Duluth', 'has a dog named Biscuit', 'plays the cello', 'just got back from Iceland',
    'runs marathons', 'has twin sisters', 'collects vinyl records', 'is learning Japanese', 'restores old motorcycles',
    'keeps bees', 'is allergic to cats', 'coaches youth soccer', 'grew up on a farm', 'has climbed Kilimanjaro',
    'brews their own kombucha', 'is a huge Red Sox fan', 'builds model trains', 'moved here from Lisbon',
    'plays in a jazz band', 'has a parrot named Kiwi', 'does stand-up comedy', 'is training for a triathlon',
    'grows chili peppers', 'once met a president', 'speaks four languages', 'paints watercolors', 'bakes sourdough',
    'rides a unicycle', 'volunteers at an animal shelter', 'grew up in Nairobi'];

  function makeFace(rng) {
    return {
      skin: rng.int(SKIN.length),
      hair: rng.pick(HAIR_STYLES),
      hairColor: rng.pick(Object.keys(HAIR_COLORS)),
      glasses: rng.pick(GLASSES),
      facial: rng.pick(FACIAL),
      hat: rng.pick(HATS),
      earring: rng.next() < 0.3,
      freckles: rng.next() < 0.25,
      thickBrows: rng.next() < 0.5,
      shirt: rng.pick(Object.keys(SHIRTS)),
    };
  }
  // How many visible features differ: used to keep faces in one set tellable apart.
  const KEYS = ['skin', 'hair', 'hairColor', 'glasses', 'facial', 'hat', 'earring', 'shirt'];
  const faceDistance = (a, b) => KEYS.filter((k) => a[k] !== b[k]).length;

  function makePeople(rng, n, exclude) {
    const usedFirst = new Set(exclude || []);
    const people = [];
    let guard = 0;
    while (people.length < n && guard++ < 5000) {
      const first = rng.pick(FIRST);
      if (usedFirst.has(first)) continue;
      const face = makeFace(rng);
      if (people.some((p) => faceDistance(p.face, face) < 3)) continue;
      usedFirst.add(first);
      people.push({ id: first + '-' + rng.int(1e9), first, last: rng.pick(LAST), job: rng.pick(JOBS), detail: rng.pick(DETAILS), face });
    }
    return people;
  }

  // Plain-English description used by scene questions and accessibility labels.
  function describe(f) {
    const bits = [f.shirt + ' shirt'];
    if (f.hat !== 'none') bits.push(f.hat);
    if (f.glasses !== 'none') bits.push(f.glasses + ' glasses');
    if (f.facial !== 'none') bits.push(f.facial);
    if (f.hair !== 'bald' && f.hat === 'none') bits.push(f.hairColor + ' ' + (f.hair === 'sidepart' ? 'side-parted' : f.hair) + ' hair');
    if (f.hair === 'bald' && f.hat === 'none') bits.push('bald');
    return 'Person with ' + bits.join(', ');
  }

  // SVG markup for a face, in a 100 x 120 box.
  function faceSvg(f, size) {
    const skin = SKIN[f.skin], hair = HAIR_COLORS[f.hairColor], shirt = SHIRTS[f.shirt];
    const p = [];
    const shirtStroke = f.shirt === 'white' ? ' stroke="#bbb"' : '';
    p.push('<path d="M12 120 Q16 92 50 90 Q84 92 88 120 Z" fill="' + shirt + '"' + shirtStroke + '/>');
    p.push('<rect x="42" y="74" width="16" height="20" fill="' + skin + '"/>');
    if (f.hair === 'long') p.push('<path d="M23 42 Q18 96 30 102 L70 102 Q82 96 77 42 Z" fill="' + hair + '"/>');
    p.push('<circle cx="24" cy="54" r="6" fill="' + skin + '"/><circle cx="76" cy="54" r="6" fill="' + skin + '"/>');
    p.push('<ellipse cx="50" cy="52" rx="26" ry="31" fill="' + skin + '"/>');
    if (f.earring) p.push('<circle cx="23" cy="62" r="2.6" fill="#e8c34a" stroke="#a88a20" stroke-width="0.6"/>');
    // hair on top (hidden under a hat except the long back part)
    if (f.hat === 'none') {
      const top = {
        short: 'M24 46 Q23 19 50 19 Q77 19 76 46 Q71 30 50 29 Q29 30 24 46 Z',
        sidepart: 'M24 48 Q22 17 52 18 Q78 20 76 46 Q72 28 40 30 Q30 36 24 48 Z',
        long: 'M23 50 Q22 18 50 18 Q78 18 77 50 Q70 28 50 28 Q30 28 23 50 Z',
        spiky: 'M24 44 L26 22 L33 30 L37 14 L44 27 L50 11 L56 27 L63 14 L67 30 L74 22 L76 44 Q70 30 50 29 Q30 30 24 44 Z',
        bun: 'M24 46 Q23 19 50 19 Q77 19 76 46 Q71 30 50 29 Q29 30 24 46 Z',
      }[f.hair];
      if (top) p.push('<path d="' + top + '" fill="' + hair + '"/>');
      if (f.hair === 'bun') p.push('<circle cx="50" cy="15" r="9" fill="' + hair + '"/>');
      if (f.hair === 'curly') for (let i = 0; i <= 8; i++) {
        const a = Math.PI * (1 - i / 8);
        p.push('<circle cx="' + (50 + 26 * Math.cos(a)).toFixed(1) + '" cy="' + (44 - 25 * Math.sin(a)).toFixed(1) + '" r="8" fill="' + hair + '"/>');
      }
      if (f.hair === 'bald') p.push('<path d="M25 52 Q24 44 27 40 M75 52 Q76 44 73 40" stroke="' + hair + '" stroke-width="3" fill="none"/>');
    }
    const bw = f.thickBrows ? 3.2 : 1.6;
    p.push('<path d="M34 42 Q40 39 45 42 M55 42 Q60 39 66 42" stroke="#3a2a20" stroke-width="' + bw + '" fill="none" stroke-linecap="round"/>');
    p.push('<circle cx="40" cy="51" r="2.8" fill="#222"/><circle cx="60" cy="51" r="2.8" fill="#222"/>');
    p.push('<path d="M50 54 Q47 63 51 64" stroke="#00000055" stroke-width="1.5" fill="none"/>');
    if (f.freckles) [[34, 60], [37, 63], [31, 63], [66, 60], [63, 63], [69, 63]].forEach(([x, y]) => p.push('<circle cx="' + x + '" cy="' + y + '" r="0.9" fill="#8a5a3a"/>'));
    if (f.facial === 'beard') p.push('<path d="M25 58 Q27 86 50 87 Q73 86 75 58 Q70 76 50 77 Q30 76 25 58 Z" fill="' + hair + '"/>');
    if (f.facial === 'stubble') p.push('<path d="M27 60 Q30 84 50 84 Q70 84 73 60 Q68 76 50 77 Q32 76 27 60 Z" fill="#00000030"/>');
    if (f.facial === 'mustache' || f.facial === 'beard') p.push('<path d="M40 67 Q50 62 60 67 Q50 66 40 67 Z" fill="' + hair + '" stroke="' + hair + '" stroke-width="2"/>');
    p.push('<path d="M42 71 Q50 76 58 71" stroke="#7a3a30" stroke-width="1.8" fill="none" stroke-linecap="round"/>');
    if (f.glasses === 'round') p.push('<g stroke="#222" stroke-width="1.6" fill="none"><circle cx="40" cy="51" r="7"/><circle cx="60" cy="51" r="7"/><path d="M47 51 L53 51 M33 50 L26 48 M67 50 L74 48"/></g>');
    if (f.glasses === 'square') p.push('<g stroke="#222" stroke-width="1.8" fill="none"><rect x="32" y="45" width="15" height="11" rx="1"/><rect x="53" y="45" width="15" height="11" rx="1"/><path d="M47 50 L53 50 M32 49 L26 47 M68 49 L74 47"/></g>');
    if (f.hat === 'cap') p.push('<path d="M23 40 Q24 14 50 14 Q76 14 77 40 Z" fill="' + shirt + '" stroke="#00000040"/><path d="M50 38 Q78 34 92 42 Q78 44 50 42 Z" fill="' + shirt + '" stroke="#00000040"/>');
    if (f.hat === 'beanie') p.push('<path d="M22 42 Q22 10 50 10 Q78 10 78 42 Z" fill="#555c66"/><rect x="21" y="36" width="58" height="8" rx="3" fill="#434951"/><circle cx="50" cy="9" r="5" fill="#434951"/>');
    const s = size || 100;
    const label = describe(f).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    return '<svg viewBox="0 0 100 120" width="' + s + '" height="' + Math.round(s * 1.2) + '" role="img" aria-label="' + label + '" xmlns="http://www.w3.org/2000/svg">' + p.join('') + '</svg>';
  }

  // A returning person with one visible style change; identity features (skin, ears, brows, freckles, shirt, hat) stay.
  function restyle(face, rng) {
    const f = Object.assign({}, face);
    const other = (arr, v) => rng.pick(arr.filter((x) => x !== v));
    // hair color shows only where hair is drawn: not bald, and not fully under a hat
    if (f.hair !== 'bald' && (f.hat === 'none' || f.hair === 'long') && rng.next() < 0.1) {
      f.hairColor = other(Object.keys(HAIR_COLORS), f.hairColor); return { face: f, change: 'new hair color' };
    }
    const kinds = ['glasses', 'facial'].concat(f.hat === 'none' ? ['hair'] : []); // a hat hides the haircut
    const kind = rng.pick(kinds);
    if (kind === 'glasses') {
      if (f.glasses === 'none') f.glasses = rng.pick(['round', 'square']);
      else f.glasses = rng.next() < 0.5 ? 'none' : f.glasses === 'round' ? 'square' : 'round';
      return { face: f, change: f.glasses === 'none' ? 'no glasses now' : 'new glasses' };
    }
    if (kind === 'hair') {
      f.hair = other(HAIR_STYLES, f.hair);
      return { face: f, change: f.hair === 'bald' ? 'shaved head' : 'a new haircut' };
    }
    if (f.facial === 'beard' || f.facial === 'mustache') { const was = f.facial; f.facial = 'none'; return { face: f, change: 'shaved the ' + was }; }
    f.facial = f.facial === 'stubble' ? 'beard' : rng.pick(['beard', 'mustache']); // stubble is too faint to be the change itself
    return { face: f, change: 'grew a ' + f.facial };
  }

  const api = { makeFace, makePeople, faceSvg, faceDistance, describe, restyle, SHIRTS, HAIR_COLORS, JOBS, DETAILS, FIRST };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Sharp = root.Sharp || {}).faces = api;
})(typeof window !== 'undefined' ? window : globalThis);
