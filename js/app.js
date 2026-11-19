// UI: routing, the six drills, missions, People Log, stats, settings. Plain DOM, no framework.
(function () {
  'use strict';
  const { core, faces, scene: sceneLib, content, convo, witness, bank } = window.Sharp;
  const STORE_KEY = 'sharp.v1';
  const TITLES = { glance: 'Glance', change: 'Spot the Change', scene: 'Room Recall', faces: 'Faces & Names', palace: 'Memory Palace', reason: 'Read the Room',
    convo: 'Conversation Recall', witness: 'Witness', describe: 'Describe It', numbers: 'Numbers', estimate: 'Estimation' };
  const BLURBS = { glance: 'Flash memory of objects', change: 'Catch what changed', scene: 'Observe a whole room', faces: 'Remember people', palace: 'Store ordered lists', reason: 'Observation vs. inference',
    convo: 'Remember what people tell you', witness: 'Who did what, in what order', describe: 'Put what you see into words', numbers: 'Phone numbers, codes, dates', estimate: 'Honest 90% ranges' };
  const ALL_CASES = content.CASES.concat(bank ? bank.CASES : []);

  // ---------- state ----------
  // If the saved data can't be read, keep a copy and refuse to save over it until you decide (see the banner at the bottom of this file).
  let unreadable = null;
  let state = load();
  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORE_KEY);
      const s = core.migrate(JSON.parse(raw));
      core.upgradeMissions(s.missions, content.MISSIONS, content.LEGACY_MISSION_TITLES);
      return s;
    } catch (e) {
      if (raw) {
        unreadable = raw;
        const kept = Object.keys(localStorage).some((k) => k.startsWith(STORE_KEY + '.recovered-') && localStorage.getItem(k) === raw);
        try { if (!kept) localStorage.setItem(STORE_KEY + '.recovered-' + Date.now(), raw); } catch (e2) { /* storage full: the banner still offers a download */ }
      }
      return core.defaultState();
    }
  }
  function save() {
    if (unreadable) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { alert('Could not save progress. Export your data from Settings to keep a copy.'); }
  }
  // Another tab saved newer progress: reload it, so this tab never writes stale state over it.
  // Re-render only outside drills, so typing in another tab never restarts a round in progress.
  window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) { state = load(); if (!location.hash.startsWith('#/drill/')) route(); } });
  const niceDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); };
  const today = () => core.dayKey();
  const doneToday = (d) => state.history.some((x) => x.drill === d && x.date === today());

  // ---------- tiny DOM helpers ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  }
  const main = document.getElementById('main');
  function render(...nodes) {
    main.replaceChildren(...nodes.filter(Boolean));
    window.scrollTo(0, 0);
    const f = main.querySelector('[autofocus]');
    if (f) f.focus({ preventScroll: true });
  }
  const card = (...kids) => h('section', { class: 'card' }, ...kids);
  const norm = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
  const normWord = (s) => norm(s).replace(/s$/, ''); // palace recall forgives a plural; names must be exact
  const missionOf = (e) => content.MISSIONS.find((m) => m.id === e.id) || { id: e.id, title: e.title || 'Mission', text: '', track: '', tier: 1, log: null, score: { label: '', max: 1, goal: null }, legacy: true };
  const pct = (x) => Math.round(x * 100) + '%';

  let timers = [];
  function later(fn, ms) { const id = setTimeout(fn, ms); timers.push(id); return id; }
  function every(fn, ms) { const id = setInterval(fn, ms); timers.push(id); return id; }
  function clearTimers() { timers.forEach((id) => { clearTimeout(id); clearInterval(id); }); timers = []; }

  // A shrinking bar; .finish() ends it early.
  function countdown(seconds, onDone) {
    const bar = h('div', { class: 'bar' });
    const label = h('span', { class: 'secs' }, seconds + 's');
    const wrap = h('div', { class: 'timer', role: 'timer', 'aria-label': 'time left' }, bar, label);
    const start = Date.now();
    let done = false;
    const id = every(() => {
      const left = seconds * 1000 - (Date.now() - start);
      bar.style.width = Math.max(0, (left / (seconds * 1000)) * 100) + '%';
      label.textContent = Math.max(0, Math.ceil(left / 1000)) + 's';
      if (left <= 0) wrap.finish();
    }, 100);
    wrap.finish = () => { if (done) return; done = true; clearInterval(id); onDone(); };
    return wrap;
  }

  // ---------- routing ----------
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function route() {
    clearTimers();
    editingMission = false;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    const [, page = '', arg, flag] = location.hash.split('/');
    document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#/' + page));
    if (page === 'drill' && TITLES[arg]) return drillIntro(arg, flag === 'w' || flag === 'c' ? flag : null);
    ({ learn, stats, missions, people: peopleLog, settings, cases: caseEditor }[page] || home)();
  }
  window.addEventListener('hashchange', route);

  // ---------- home ----------
  function home() {
    const t = today();
    const plan = core.planWorkout(state.history, t), commute = core.planCommute(state.history, t);
    const nextUp = plan.find((d) => !doneToday(d)), commuteNext = commute.find((d) => !doneToday(d));
    const realDue = state.people.filter((p) => p.source === 'real' && core.isDue(p, t)).length;
    const e = todaysMission(), m = missionOf(e), callbacks = core.dueCallbacks(state.missions, content.MISSIONS, t).length;
    const intention = state.intention
      ? h('p', { class: 'intention' }, '“' + state.intention + '” ', h('a', { href: '#/settings' }, 'edit'))
      : intentionForm();
    render(
      card(h('h2', {}, 'Today'),
        intention,
        realDue ? h('p', { class: 'due-first' }, h('b', {}, 'First: '), realDue + ' real ' + (realDue === 1 ? 'person' : 'people') + ' from your People Log ' + (realDue === 1 ? 'is' : 'are') + ' due. ',
          h('a', { class: 'button', href: '#/people' }, 'Review now (2 min)')) : null,
        h('ol', { class: 'plan' }, plan.map((d) => h('li', { class: doneToday(d) ? 'done' : '' },
          h('a', { href: '#/drill/' + d + '/w' }, TITLES[d]), h('span', { class: 'muted' }, ' · level ' + state.levels[d])))),
        nextUp
          ? h('button', { class: 'primary big', autofocus: true, onclick: () => go('#/drill/' + nextUp + '/w') }, plan.some(doneToday) ? 'Continue workout' : 'Start today\'s workout (~15 min)')
          : h('p', { class: 'ok' }, 'Workout done for today. Now go do the mission.'),
        nextUp && commuteNext ? h('button', { onclick: () => go('#/drill/' + commuteNext + '/c') }, 'Short on time? 5-minute version: ' + commute.map((d) => TITLES[d]).join(' + ')) : null,
        h('p', { class: 'muted' }, 'Practiced ' + core.daysPracticed(state.history, t, 7) + ' of the last 7 days. ', h('a', { href: '#/stats' }, 'Your week →'))),
      card(h('h2', {}, 'Mission of the day'), missionBadge(m), h('h3', {}, m.title + (e.done ? ' ✓' : '')),
        h('p', {}, m.text),
        e.done ? h('p', { class: e.hit ? 'ok' : 'muted' }, scoreLine(m, e)) : null,
        callbacks ? h('p', { class: 'due-first' }, h('b', {}, 'Callback: '), callbacks + ' past mission' + (callbacks === 1 ? '' : 's') + ' to recall from memory.') : null,
        h('a', { class: 'button', href: '#/missions' }, e.done ? 'View result' : e.predict == null && m.score.goal != null ? 'Predict, then go →' : 'Check in when done →')),
      card(h('h2', {}, 'All drills'), h('div', { class: 'drills' }, core.DRILLS.map((d) => h('a', { class: 'drill', href: '#/drill/' + d },
        h('strong', {}, TITLES[d]), h('span', {}, BLURBS[d]), h('span', { class: 'muted' }, 'Level ' + state.levels[d])))))
    );
  }
  function intentionForm() {
    const inp = h('input', { type: 'text', placeholder: 'e.g. After my first class each day', 'aria-label': 'When will you practice?' });
    return h('form', { class: 'intention-form', onsubmit: (e) => { e.preventDefault(); if (!inp.value.trim()) return; state.intention = 'When ' + inp.value.trim().replace(/^when\s+/i, '') + ', I open Sharp for 15 minutes.'; save(); home(); } },
      h('label', {}, 'Make it a habit. Pick a cue: ', h('b', {}, 'When…'), inp), h('button', {}, 'Set'));
  }

  // ---------- drill intro + finish ----------
  // mode: 'w' = daily workout, 'c' = commute mode, null = a single drill
  function drillIntro(name, mode) {
    if (state.seenIntro[name]) return startDrill(name, mode);
    render(techniqueCard(name, h('button', { class: 'primary big', autofocus: true, onclick: () => { state.seenIntro[name] = true; save(); startDrill(name, mode); } }, 'Start')));
  }
  const planFor = (mode) => (mode === 'c' ? core.planCommute : core.planWorkout)(state.history, today());
  function techniqueCard(name, action) {
    const t = content.TECHNIQUES[name];
    return card(h('h2', {}, t.title), h('p', {}, t.what), h('h3', {}, 'How to do it well'), h('ul', {}, t.how.map((x) => h('li', {}, x))),
      h('p', { class: 'muted why' }, t.why), action);
  }
  function startDrill(name, mode) {
    const runners = { glance: runGlance, change: runChange, scene: runScene, faces: runFaces, palace: runPalace, reason: runReason,
      convo: runConvo, witness: runWitness, describe: runDescribe, numbers: runNumbers, estimate: runEstimate };
    runners[name]((acc, details) => finish(name, acc, details, mode));
  }
  function finish(name, acc, details, mode) {
    const { before, after } = core.recordRound(state, name, acc);
    save();
    const next = mode ? planFor(mode).find((d) => !doneToday(d)) : null;
    const lvl = after > before ? 'Level up → ' + after : after < before ? 'Level eased to ' + after + ' (that\'s the system keeping you in the learning zone)' : 'Level stays at ' + after;
    render(card(h('h2', {}, TITLES[name] + ': ' + pct(acc)), h('p', { class: after > before ? 'ok' : 'muted' }, lvl),
      details || null,
      h('div', { class: 'row' },
        next ? h('button', { class: 'primary', autofocus: true, onclick: () => go('#/drill/' + next + '/' + mode) }, 'Next: ' + TITLES[next] + ' →') : null,
        mode && !next ? h('button', { class: 'primary', autofocus: true, onclick: () => go('#/missions') }, (mode === 'c' ? 'Commute set done' : 'Workout done') + ' → mission') : null,
        h('button', { onclick: () => startDrill(name, mode) }, 'Again'),
        h('button', { onclick: () => render(techniqueCard(name, h('button', { class: 'primary', onclick: () => startDrill(name, mode) }, 'Start'))) }, 'Technique'),
        h('a', { class: 'button', href: '#/' }, 'Home'))));
  }

  // Generic one-question-at-a-time runner with immediate feedback.
  function runSteps(steps, end) {
    let i = 0, right = 0;
    const next = () => (i >= steps.length ? end(right, steps.length) : steps[i++]((ok) => { if (ok) right++; next(); }, i + ' / ' + steps.length));
    next();
  }
  function feedbackBox(ok, answer, explain, done, extra) {
    return h('div', { class: 'feedback', 'aria-live': 'polite' },
      h('p', { class: ok ? 'ok' : 'bad' }, ok ? 'Correct.' : 'Not quite. Answer: ' + answer),
      explain ? h('p', {}, explain) : null, extra || null,
      h('button', { class: 'primary', autofocus: true, onclick: () => done(ok) }, 'Continue'));
  }
  function mcStep({ prompt, visual, options, answer, explain, context, after }) {
    return (done, progress) => {
      const fb = h('div');
      const btns = options.map((o) => h('button', { class: 'opt', onclick: () => choose(o) }, o));
      function choose(o) {
        const ok = o === answer;
        btns.forEach((b, i) => { b.disabled = true; if (options[i] === answer) b.classList.add('right'); else if (options[i] === o) b.classList.add('wrong'); });
        if (after) after(ok);
        fb.replaceWith(feedbackBox(ok, answer, explain, done));
        main.querySelector('.feedback button').focus();
      }
      render(card(h('div', { class: 'muted' }, progress), context ? h('p', { class: 'context' }, context) : null,
        visual ? h('div', { class: 'visual', html: visual }) : null, h('h3', {}, prompt), h('div', { class: 'opts' }, btns), fb));
      btns[0].focus();
    };
  }
  function typedStep({ prompt, visual, answer, explain, after }) {
    return (done, progress) => {
      const inp = h('input', { type: 'text', autocomplete: 'off', autofocus: true, 'aria-label': prompt });
      const form = h('form', { onsubmit: (e) => {
        e.preventDefault();
        const ok = norm(inp.value) === norm(answer);
        inp.disabled = true;
        if (after) after(ok);
        form.replaceWith(feedbackBox(ok, answer, explain, done));
        main.querySelector('.feedback button').focus();
      } }, inp, h('button', { class: 'primary' }, 'Answer'));
      render(card(h('div', { class: 'muted' }, progress), visual ? h('div', { class: 'visual', html: visual }) : null, h('h3', {}, prompt), form));
    };
  }

  // ---------- Glance (Kim's Game) ----------
  function runGlance(end) {
    const L = state.levels.glance, n = core.byLevel(L, 5, 16), secs = core.byLevel(L, 12, 6);
    const rng = core.makeRng(core.freshSeed());
    const pool = rng.sample(content.EMOJI, n * 2), targets = pool.slice(0, n);
    const cols = Math.ceil(Math.sqrt(n * 1.6)), cells = Array(cols * cols).fill('');
    rng.sample([...cells.keys()], n).forEach((c, i) => { cells[c] = targets[i]; });
    const grid = h('div', { class: 'grid', style: '--cols:' + cols }, cells.map((e) => h('div', { class: 'cell' }, e)));
    const timer = countdown(secs, pick);
    render(card(h('div', { class: 'row' }, h('h3', {}, 'Memorize these ' + n + ' items'), h('button', { onclick: () => timer.finish() }, 'Ready')), timer, grid));
    function pick() {
      const chosen = new Set();
      const btns = rng.shuffle(pool).map((e) => h('button', { class: 'cell pick', 'aria-pressed': 'false', onclick: (ev) => {
        const b = ev.currentTarget; if (chosen.has(e)) chosen.delete(e); else chosen.add(e); b.setAttribute('aria-pressed', String(chosen.has(e)));
      } }, e));
      render(card(h('h3', {}, 'Select the ' + n + ' you saw'), h('p', { class: 'muted' }, 'Wrong picks cancel right ones, so skip the ones you\'re unsure of.'),
        h('div', { class: 'grid', style: '--cols:' + Math.ceil(Math.sqrt(n * 2)) }, btns),
        h('button', { class: 'primary', onclick: () => {
          const acc = core.recognitionScore(targets, [...chosen]);
          const hits = targets.filter((t) => chosen.has(t)).length, fa = [...chosen].filter((c) => !targets.includes(c)).length;
          end(acc, h('div', {}, h('p', {}, hits + ' of ' + n + ' found, ' + fa + ' false alarm' + (fa === 1 ? '' : 's') + '.'),
            h('p', { class: 'muted' }, 'Missed: ' + (targets.filter((t) => !chosen.has(t)).join(' ') || 'none'))));
        } }, 'Done')));
    }
  }

  // ---------- Spot the Change ----------
  function runChange(end) {
    const L = state.levels.change, g = core.byLevel(L, 3, 6), filled = Math.min(g * g - 2, core.byLevel(L, 5, 22)), view = core.byLevel(L, 5, 2);
    const total = 5;
    let trial = 0, correct = 0;
    const rng = core.makeRng(core.freshSeed());
    const gridOf = (cells, onClick, mark) => h('div', { class: 'grid', style: '--cols:' + g }, cells.map((e, i) =>
      onClick ? h('button', { class: 'cell' + (mark && mark.includes(i) ? ' changed' : ''), 'aria-label': 'cell ' + (i + 1) + (e ? ' ' + e : ' empty'), onclick: () => onClick(i) }, e || '')
        : h('div', { class: 'cell' + (mark && mark.includes(i) ? ' changed' : '') }, e || '')));
    function next() {
      if (trial === total) return end(correct / total, h('p', {}, correct + ' of ' + total + ' changes caught.'));
      trial++;
      const all = [...Array(g * g).keys()];
      const A = Array(g * g).fill(null), idx = rng.sample(all, filled), items = rng.sample(content.EMOJI, filled + 1);
      idx.forEach((c, i) => { A[c] = items[i]; });
      const B = A.slice(), empties = all.filter((c) => !A[c]);
      const type = rng.pick(['replace', 'remove', 'add', 'move']);
      let changed;
      if (type === 'replace') { const c = rng.pick(idx); B[c] = items[filled]; changed = [c]; }
      else if (type === 'remove') { const c = rng.pick(idx); B[c] = null; changed = [c]; }
      else if (type === 'add') { const c = rng.pick(empties); B[c] = items[filled]; changed = [c]; }
      else { const from = rng.pick(idx), to = rng.pick(empties); B[to] = B[from]; B[from] = null; changed = [from, to]; }
      const head = h('div', { class: 'muted' }, 'Change ' + trial + ' / ' + total);
      render(card(head, h('h3', {}, 'Memorize'), countdown(view, () => {}), gridOf(A)));
      later(() => {
        render(card(head, h('h3', {}, '…'), gridOf(Array(g * g).fill(null))));
        later(() => render(card(head, h('h3', {}, 'What changed? Click it.'), gridOf(B, (i) => {
          const ok = changed.includes(i);
          if (ok) correct++;
          render(card(head, h('p', { class: ok ? 'ok' : 'bad' }, ok ? 'Got it.' : 'Missed: it was a ' + (type === 'move' ? 'move (both cells marked)' : type) + '.'),
            h('div', { class: 'pair' }, h('div', {}, h('div', { class: 'muted' }, 'Before'), gridOf(A, null, changed)), h('div', {}, h('div', { class: 'muted' }, 'After'), gridOf(B, null, changed))),
            h('button', { class: 'primary', autofocus: true, onclick: next }, 'Next')));
        }))), 700);
      }, view * 1000);
    }
    next();
  }

  // ---------- Room Recall ----------
  function runScene(end) {
    const t = today(), L = state.levels.scene, seed = core.freshSeed(), rng = core.makeRng(core.freshSeed());
    const s = sceneLib.makeScene(core.makeRng(seed), L), qs = sceneLib.makeQuestions(s, rng), svg = sceneLib.sceneSvg(s);
    // A room from 2+ days ago comes back with a few changes first. It's a bonus: it doesn't move your level.
    const old = state.rooms.find((r) => !r.revisited && core.daysBetween(r.date, t) >= 2);
    let revisitNote = null;
    if (old) revisit(old, () => study()); else study();
    function revisit(r, then) {
      const k = 1 + (r.level >= 8) + (r.level >= 15);
      const before = sceneLib.makeScene(core.makeRng(r.seed), r.level), mut = sceneLib.mutate(before, rng, k);
      const statements = rng.shuffle(mut.changes.concat(mut.decoys.slice(0, 6 - k))), truth = new Set(mut.changes);
      const look = countdown(before.seconds, ask);
      render(card(h('h2', {}, 'You\'ve been here before'), h('p', {}, 'You studied this room on ' + niceDate(r.date) + '. Since then, ' + (k === 1 ? 'one thing has' : k + ' things have') + ' changed.'),
        look, h('div', { class: 'visual', html: sceneLib.sceneSvg(mut.scene) }), h('button', { onclick: () => look.finish() }, 'Ready')));
      function ask() {
        const boxes = statements.map(() => h('input', { type: 'checkbox' }));
        render(card(h('h3', {}, 'What changed since ' + niceDate(r.date) + '? Tick ' + k + '.'),
          h('div', { class: 'checklist' }, statements.map((x, i) => h('label', { class: 'radio' }, boxes[i], ' ' + x))),
          h('button', { class: 'primary', onclick: () => {
            const chosen = statements.filter((_, i) => boxes[i].checked), sc = core.recognitionScore(mut.changes, chosen);
            r.revisited = true; save();
            revisitNote = h('p', { class: 'muted' }, 'Revisited room from ' + niceDate(r.date) + ': ' + pct(sc) + ' (not counted toward your level).');
            render(card(h('h3', {}, 'Changes: ' + pct(sc)), h('ul', {}, statements.map((x, i) => h('li', { class: truth.has(x) ? 'ok' : boxes[i].checked ? 'bad' : 'muted' },
              (truth.has(x) ? '✓ changed: ' : boxes[i].checked ? '✗ didn\'t change: ' : 'didn\'t change: ') + x))),
              h('div', { class: 'pair' }, h('div', {}, h('div', { class: 'muted' }, 'Then'), h('div', { class: 'visual', html: sceneLib.sceneSvg(before) })),
                h('div', {}, h('div', { class: 'muted' }, 'Now'), h('div', { class: 'visual', html: sceneLib.sceneSvg(mut.scene) }))),
              h('button', { class: 'primary', autofocus: true, onclick: then }, 'On to today\'s room')));
          } }, 'Check')));
      }
    }
    function study() {
    const timer = countdown(s.seconds, freeRecall);
    render(card(h('h3', {}, 'Study the room'), timer, h('div', { class: 'visual', html: svg }), h('p', { class: 'muted' }, 'Narrate under your breath as you scan: "rain outside, clock 3:25, blue triangle, door open…". Describing is the core skill.'), h('button', { onclick: () => timer.finish() }, 'I\'m ready')));
    // Free recall first: producing details from memory is stronger practice than recognizing them in a list.
    function freeRecall() {
      const box = h('textarea', { rows: 5, autofocus: true, placeholder: 'clock 3:25, rainy window, blue triangle, door open, 2 people (one in a cap)…' });
      render(card(h('h3', {}, 'Before the questions: list everything you remember'), h('p', { class: 'muted' }, 'Quick fragments are fine. This part isn\'t scored, but the debrief shows what you got.'),
        box, h('button', { class: 'primary', onclick: () => quiz(box.value) }, 'On to the questions')));
    }
    }
    function quiz(recalled) {
      const said = recalled;
      const fields = qs.map((q, i) => h('fieldset', {}, h('legend', {}, (i + 1) + '. ' + q.q),
        q.options.map((o) => h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'q' + i, value: o }), ' ' + o))));
      render(card(h('h3', {}, 'What do you remember?'), h('form', { onsubmit: (e) => {
        e.preventDefault();
        const answers = qs.map((q, i) => { const c = main.querySelector('input[name="q' + i + '"]:checked'); return c ? c.value : '—'; });
        const right = answers.filter((a, i) => a === qs[i].answer).length;
        const inv = sceneLib.inventory(s);
        state.rooms = state.rooms.concat({ seed, level: L, date: t }).slice(-20);
        end(right / qs.length, h('div', {}, revisitNote,
          h('div', { class: 'visual', html: svg }),
          h('ul', { class: 'answers' }, qs.map((q, i) => h('li', { class: answers[i] === q.answer ? 'ok' : 'bad' }, q.q + ' ', h('b', {}, q.answer), answers[i] === q.answer ? '' : ' (you said ' + answers[i] + ')'))),
          h('h3', {}, 'Full inventory'),
          said.trim() ? h('p', { class: 'muted' }, 'Highlighted: details your free recall mentioned (' + inv.filter((it) => sceneLib.mentioned(it, said)).length + ' of ' + inv.length + '). Keyword matching is rough, so judge for yourself.') : h('p', { class: 'muted' }, 'Try writing a free recall next time. It\'s the strongest part of the exercise.'),
          h('ul', { class: 'inventory' }, inv.map((it) => h('li', { class: said.trim() && sceneLib.mentioned(it, said) ? 'hit' : '' }, it.label)))));
      } }, fields, h('button', { class: 'primary' }, 'Check answers'))));
    }
  }

  // ---------- Faces & Names ----------
  function runFaces(end) {
    const L = state.levels.faces, t = today(), typed = L >= 7;
    const rng = core.makeRng(core.freshSeed());
    const due = rng.shuffle(state.people.filter((p) => p.source === 'drill' && core.isDue(p, t))).slice(0, 6);
    const fresh = faces.makePeople(rng, core.byLevel(L, 3, 8), due.map((p) => p.first));
    // Wrong choices come from the people you met alongside them first, so you can't win by spotting the only familiar name.
    const nameOptions = (p, group) => {
      const near = rng.shuffle(group.map((x) => x.first).filter((f) => f !== p.first));
      const rest = rng.shuffle(faces.FIRST.filter((f) => f !== p.first && !near.includes(f)));
      return rng.shuffle([p.first, ...near.concat(rest).slice(0, 3)]);
    };
    // Feedback shows only the name, so it doesn't give away the job question that follows.
    const nameQ = (p, prompt, group, after) => typed
      ? typedStep({ prompt, visual: faces.faceSvg(p.face, 150), answer: p.first, explain: p.first + ' ' + p.last + '.', after })
      : mcStep({ prompt, visual: faces.faceSvg(p.face, 150), answer: p.first, options: nameOptions(p, group), explain: p.first + ' ' + p.last + '.', after });
    // Real people change how they look, so after the first review a returning face sometimes has new glasses, hair or beard.
    const reviewSteps = due.map((p) => {
      const re = (p.box || 0) >= 1 && rng.next() < 0.5 ? faces.restyle(p.face, rng) : null;
      const shown = re ? Object.assign({}, p, { face: re.face, last: p.last + ' (new look: ' + re.change + ')' }) : p;
      return nameQ(shown, 'You met this person on ' + niceDate(p.met) + '. Who is it?', due, (ok) => {
        Object.assign(p, core.reviewCard(p, ok, t)); save();
      });
    });
    let right = 0, total = 0;
    if (reviewSteps.length) {
      render(card(h('h2', {}, 'First: people you met before'), h('p', {}, due.length + ' ' + (due.length === 1 ? 'person is' : 'people are') + ' due for review. Recall is what makes names stick.'),
        h('button', { class: 'primary', autofocus: true, onclick: () => runSteps(reviewSteps, (r, n) => { right += r; total += n; study(0); }) }, 'Start review')));
    } else study(0);

    function study(i) {
      if (i >= fresh.length) return pause();
      const p = fresh[i];
      const inp = h('input', { type: 'text', autocomplete: 'off', autofocus: true, placeholder: 'Type their first name to say it back', 'aria-label': 'Say the name back' });
      render(card(h('div', { class: 'muted' }, 'Meet ' + (i + 1) + ' / ' + fresh.length),
        h('div', { class: 'visual', html: faces.faceSvg(p.face, 170) }),
        h('p', { class: 'intro-line' }, '“Hi, I\'m ', h('b', {}, p.first + ' ' + p.last), '.”'),
        h('p', {}, p.first + ' is ' + (/^[aeiou]/.test(p.job) ? 'an ' : 'a ') + p.job + ' and ' + p.detail + '.'),
        h('p', { class: 'muted' }, 'Pick one distinctive feature. Say the name back. Link it to the fact.'),
        h('form', { onsubmit: (e) => {
          e.preventDefault();
          // gentle say-back check: one nudge on a mismatch, then move on regardless
          if (norm(inp.value) !== norm(p.first) && !inp.dataset.nudged) { inp.dataset.nudged = '1'; inp.value = ''; inp.placeholder = 'It\'s ' + p.first + '. Type it once to lock it in.'; return; }
          study(i + 1);
        } }, inp, h('button', { class: 'primary' }, 'Next'))));
    }
    function pause() {
      const timer = countdown(15, test);
      render(card(h('h3', {}, 'Before the quiz…'), h('p', {}, 'Silently go through everyone you just met: name, job, detail. A short delay before recalling makes the memory stronger.'),
        timer, h('button', { onclick: () => timer.finish() }, 'Skip wait')));
    }
    function test() {
      const steps = [];
      // Questions are asked from the face alone, so the name never cues the job or detail.
      rng.shuffle(fresh).forEach((p) => {
        steps.push(nameQ(p, 'What is this person\'s first name?', fresh));
        steps.push(mcStep({ prompt: 'What does this person do?', visual: faces.faceSvg(p.face, 110), answer: p.job, options: rng.shuffle([p.job, ...rng.sample(faces.JOBS.filter((j) => j !== p.job), 3)]) }));
        if (L >= 10) steps.push(mcStep({ prompt: 'What else do you know about this person?', visual: faces.faceSvg(p.face, 110), answer: p.detail, options: rng.shuffle([p.detail, ...rng.sample(faces.DETAILS.filter((d) => d !== p.detail), 3)]) }));
      });
      runSteps(steps, (r, n) => {
        right += r; total += n;
        fresh.forEach((p) => state.people.push(Object.assign({ source: 'drill', met: t }, p, core.newCard(t))));
        // keep the review pool bounded: drop the oldest drill people beyond 150
        const drillPeople = state.people.filter((p) => p.source === 'drill');
        if (drillPeople.length > 150) { const drop = new Set(drillPeople.slice(0, drillPeople.length - 150)); state.people = state.people.filter((p) => !drop.has(p)); }
        save();
        end(total ? right / total : 0, h('div', {}, h('p', {}, right + ' of ' + total + ' correct.'),
          h('p', { class: 'muted' }, 'These ' + fresh.length + ' people come back tomorrow for spaced review. Each one you recall gets spaced further out; a miss brings them back the next day.'),
          h('div', { class: 'faces-row' }, fresh.map((p) => h('figure', {}, h('div', { html: faces.faceSvg(p.face, 80) }), h('figcaption', {}, p.first + ' ' + p.last, h('br'), h('small', {}, p.job)))))));
      });
    }
  }

  // ---------- Memory Palace ----------
  function runPalace(end) {
    if (state.palace.loci.length < 5) return palaceSetup(() => runPalace(end));
    const L = state.levels.palace, loci = state.palace.loci;
    const n = Math.min(loci.length, core.byLevel(L, 5, 20)), secs = core.byLevel(L, 8, 3);
    const rng = core.makeRng(core.freshSeed());
    const t = today(), last = state.palace.last;
    const words = rng.sample(content.PALACE_WORDS.filter((w) => !(last && last.words.includes(w))), n);
    let retestNote = null;
    // First, the list from your last round: delayed recall is the real test of a memory palace. Shown once, not counted toward the level.
    if (last && last.date < t) {
      render(card(h('h2', {}, 'Before today\'s list'), h('p', {}, 'On ' + niceDate(last.date) + ' you stored ' + last.words.length + ' items on your route. Walk it again: what was at each stop?'),
        h('div', { class: 'row' }, h('button', { class: 'primary', autofocus: true, onclick: () => recallForm(last.loci || loci, last.words, 'From ' + niceDate(last.date) + ': what was at each stop?', (right, table) => {
          retestNote = h('div', {}, h('p', { class: 'muted' }, 'Delayed recall of the ' + niceDate(last.date) + ' list: ' + right + ' of ' + last.words.length + ' (not counted toward your level).'));
          state.palace.last = null; save();
          render(card(h('h3', {}, 'Delayed recall: ' + right + ' of ' + last.words.length), table, h('button', { class: 'primary', autofocus: true, onclick: () => show(0) }, 'Now today\'s list')));
        }) }, 'Recall it'), h('button', { onclick: () => { state.palace.last = null; save(); show(0); } }, 'Skip'))));
    } else show(0);
    function show(i) {
      if (i >= n) return recall();
      const timer = countdown(secs, () => show(i + 1));
      render(card(h('div', { class: 'muted' }, 'Stop ' + (i + 1) + ' / ' + n), h('p', { class: 'locus' }, 'At the ', h('b', {}, loci[i]), '…'),
        h('p', { class: 'word' }, words[i]), timer, h('p', { class: 'muted' }, 'Make it vivid, exaggerated and interacting with the place.'),
        h('button', { onclick: () => timer.finish() }, 'Next')));
    }
    function recall() {
      recallForm(loci, words, 'Walk your route. What was at each stop?', (right, table) => {
        state.palace.last = { words, loci: loci.slice(0, n), date: t }; save();
        end(right / n, h('div', {}, retestNote, table));
      });
    }
  }
  function recallForm(loci, words, title, done) {
    const check = h('button', { class: 'primary' }, 'Check');
    // Enter walks down the list instead of submitting; on the last line it lands on Check, so one more Enter submits.
    const nextField = (i) => (e) => { if (e.key === 'Enter') { e.preventDefault(); (inputs[i + 1] || check).focus(); } };
    const inputs = words.map((_, i) => h('input', { type: 'text', autocomplete: 'off', 'aria-label': 'Item at ' + loci[i], autofocus: i === 0, onkeydown: nextField(i) }));
    render(card(h('h3', {}, title), h('form', { onsubmit: (e) => {
      e.preventDefault();
      const ok = (i) => normWord(inputs[i].value) === normWord(words[i]);
      done(words.filter((_, i) => ok(i)).length, h('table', { class: 'table' }, h('tr', {}, h('th', {}, 'Stop'), h('th', {}, 'Item'), h('th', {}, 'You')),
        words.map((w, i) => h('tr', { class: ok(i) ? 'ok' : 'bad' }, h('td', {}, loci[i]), h('td', {}, w), h('td', {}, inputs[i].value || '—')))));
    } }, h('ol', { class: 'recall' }, inputs.map((inp, i) => h('li', {}, h('label', {}, loci[i] + ' ', inp)))), check)));
  }
  function palaceSetup(then) {
    const ta = h('textarea', { rows: 12, value: state.palace.loci.join('\n'), placeholder: 'front door\nshoe rack\ncoat hook\n…' });
    render(card(h('h2', {}, 'Build your memory palace'),
      h('p', {}, 'List 10–20 stops along a route you know cold, one per line, in walking order: your apartment, your parents\' house, your walk to class. You\'ll reuse this route every time, so make it a place you can picture vividly.'),
      ta, h('div', { class: 'row' },
        h('button', { onclick: () => { ta.value = content.SAMPLE_LOCI.join('\n'); } }, 'Fill with a sample (edit it to match a real place)'),
        h('button', { class: 'primary', onclick: () => {
          const loci = ta.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 20);
          if (loci.length < 5) return alert('Add at least 5 stops.');
          state.palace.loci = loci; save(); then();
        } }, 'Save route'))));
  }

  // ---------- Conversation Recall ----------
  const canSpeak = () => 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
  // Prefer a voice installed on the device: Chrome's and Edge's online voices can fail silently and never work offline.
  const pickVoice = () => {
    const en = speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
    return en.find((v) => v.localService && /^en[-_]US$/i.test(v.lang)) || en.find((v) => v.localService) || null;
  };
  function runConvo(end) {
    if (canSpeak()) speechSynthesis.getVoices(); // Chrome fills the voice list asynchronously; ask early so it's ready by "Listen"
    const L = state.levels.convo, rng = core.makeRng(core.freshSeed()), p = convo.params(L), intro = convo.makeIntro(rng, L);
    const face = faces.makePeople(rng, 1, [])[0].face;
    let replays = p.replays;
    const go2 = h('button', { class: 'primary', onclick: () => quiz() }, 'I\'m done listening');
    let started = false;
    function listen() {
      // Cancel only when something is queued: Safari can silently drop a speak() issued right after cancel().
      if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
      started = false;
      const voice = pickVoice();
      // one utterance per sentence: long single utterances get cut off in some browsers
      intro.sentences.forEach((text, i) => {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = p.rate; u.lang = 'en-US';
        if (voice) u.voice = voice;
        u.onstart = () => { started = true; };
        if (i === intro.sentences.length - 1) u.onend = () => { go2.textContent = 'On to the questions'; go2.focus(); };
        speechSynthesis.speak(u);
      });
      speechSynthesis.resume(); // Chrome can leave the queue paused after a tab was in the background
      // A muted phone or a missing voice fails without any error, so check whether speech actually began.
      later(() => { if (!started && main.querySelector('.hear')) main.querySelector('.hear').replaceChildren(
        h('b', {}, 'No sound is playing. '), 'Check your volume, and on an iPhone make sure the side switch isn\'t on silent. Or ',
        h('button', { class: 'small primary', onclick: () => start('read') }, 'read it instead')); }, 2500);
    }
    const replayBtn = h('button', { onclick: () => { if (replays-- > 0) listen(); if (replays <= 0) replayBtn.remove(); } }, 'Replay once');
    function start(mode) {
      if (mode === 'read') {
        const secs = Math.max(15, Math.round(intro.text.split(' ').length / 3)); // about speaking pace
        if (canSpeak()) speechSynthesis.cancel();
        go2.textContent = 'I\'m done reading';
        render(card(h('div', { class: 'visual', html: faces.faceSvg(face, 130) }), h('p', { class: 'muted center' }, intro.setting),
          countdown(secs, quiz), h('p', { class: 'spoken' }, intro.text), go2));
        go2.focus();
      } else {
        render(card(h('div', { class: 'visual', html: faces.faceSvg(face, 150) }), h('p', { class: 'muted center' }, intro.setting + '. Listen; the words won\'t be shown.'),
          h('div', { class: 'row center' }, go2, replays > 0 ? replayBtn : null),
          h('p', { class: 'muted center hear', 'aria-live': 'polite' }, 'Can\'t hear anything? ', h('button', { class: 'small', onclick: () => start('read') }, 'Read it instead'))));
        go2.focus();
        listen();
      }
    }
    function quiz() {
      if (canSpeak()) speechSynthesis.cancel();
      clearTimers();
      const steps = intro.questions.map((q) => mcStep({ prompt: q.q, options: q.options, answer: q.answer }));
      runSteps(steps, (r, n) => end(r / n, h('div', {}, h('p', {}, r + ' of ' + n + ' correct.'), h('h3', {}, 'What they said'), h('p', { class: 'spoken' }, intro.text))));
    }
    render(card(h('h2', {}, 'Someone introduces themselves'), h('p', {}, 'Setting: ' + intro.setting + '. Afterward you\'ll be asked what they told you: names, places, numbers, plans.'),
      h('div', { class: 'row' }, canSpeak() ? h('button', { class: 'primary big', autofocus: true, onclick: () => start('listen') }, '▶ Listen') : null,
        h('button', { class: canSpeak() ? '' : 'primary big', onclick: () => start('read') }, canSpeak() ? 'Read it instead' : 'Start (read it)')),
      canSpeak() ? h('p', { class: 'muted' }, 'Turn your sound on. Listening is closer to real life than reading.') : h('p', { class: 'muted' }, 'This browser can\'t speak text aloud, so you\'ll read it.')));
  }

  // ---------- Witness ----------
  function runWitness(end) {
    const L = state.levels.witness, rng = core.makeRng(core.freshSeed()), w = witness.makeWitness(rng, L);
    render(card(h('h2', {}, 'Witness'), h('p', {}, 'People will come in, handle the objects on the table, and leave. You get one viewing, then questions.'),
      h('p', { class: 'muted' }, 'Label each person as they come in ("green shirt"), narrate what they do, and keep track of who holds what.'),
      h('button', { class: 'primary big', autofocus: true, onclick: watch }, 'I\'m ready')));
    function watch() {
      const stage = h('div', { class: 'visual', html: witness.svg(w) }), count = h('p', { class: 'countdown', 'aria-live': 'polite' }, '3');
      render(card(h('h3', {}, 'Watch closely. No replays.'), count, stage));
      const root = stage.querySelector('svg');
      let i = 0, n = 3;
      const tick = every(() => {
        if (--n > 0) { count.textContent = String(n); return; }
        clearInterval(tick); count.textContent = 'Go';
        const id = every(() => {
          i++;
          witness.applyBeat(root, w, i);
          if (i >= w.beats.length - 1) { clearInterval(id); later(quiz, w.params.beatMs + 400); }
        }, w.params.beatMs);
      }, 800);
    }
    function quiz() {
      // number answers read best in order (0, 1, 2), not shuffled
      const sorted = (opts) => (opts.every((o) => /^\d+$/.test(o)) ? opts.slice().sort((a, b) => a - b) : opts);
      const steps = w.questions.map((q) => mcStep({ prompt: q.q, options: sorted(q.options), answer: q.answer }));
      runSteps(steps, (r, n) => end(r / n, h('div', {}, h('p', {}, r + ' of ' + n + ' correct.'), h('h3', {}, 'What happened'), h('ol', {}, witness.narration(w).map((x) => h('li', {}, x))))));
    }
  }

  // ---------- Describe It ----------
  function runDescribe(end) {
    const L = state.levels.describe, s = sceneLib.makeScene(core.makeRng(core.freshSeed()), L), svg = sceneLib.sceneSvg(s);
    const box = h('textarea', { rows: 6, placeholder: /* no autofocus: on a phone the keyboard would cover the room */ 'rain outside, clock 3:25, red mug on the table, door open, woman in a green shirt with glasses…' });
    const timer = countdown(core.byLevel(L, 90, 40), check);
    render(card(h('h3', {}, 'Describe everything you see'), timer, h('div', { class: 'visual', html: svg }), box,
      h('p', { class: 'muted' }, 'Facts, not stories: colors, counts, times, what\'s open or on. The room stays visible the whole time.'),
      h('button', { class: 'primary', onclick: () => timer.finish() }, 'Done')));
    function check() {
      const said = box.value, inv = sceneLib.inventory(s);
      const ticks = inv.map((it) => h('input', { type: 'checkbox', checked: said.trim() && sceneLib.mentioned(it, said) ? true : null }));
      render(card(h('h3', {}, 'What did your description cover?'),
        h('p', { class: 'muted' }, 'Pre-ticked items are what keyword matching found. Fix it honestly: tick what you described, untick what you didn\'t.'),
        h('div', { class: 'visual', html: svg }), h('p', { class: 'spoken' }, said || '(nothing written)'),
        h('div', { class: 'checklist' }, inv.map((it, k) => h('label', { class: 'radio' }, ticks[k], ' ' + it.label))),
        h('button', { class: 'primary', onclick: () => {
          const got = ticks.filter((t) => t.checked).length;
          end(got / inv.length, h('div', {}, h('div', { class: 'visual', html: svg }), h('p', {}, 'You described ' + got + ' of ' + inv.length + ' things in the room.'),
            h('p', { class: 'muted' }, 'Missed: ' + (inv.filter((_, k) => !ticks[k].checked).map((it) => it.label).join(', ') || 'nothing'))));
        } }, 'Score it')));
    }
  }

  // ---------- Numbers ----------
  const KINDS = ['Phone number', 'Part number', 'Locker combo', 'Order number', 'Room code', 'Serial number'];
  const chunk = (d) => (d.length <= 4 ? d : d.length % 3 === 1 ? chunk(d.slice(0, -4)) + ' ' + d.slice(-4) : d.slice(0, 3) + ' ' + chunk(d.slice(3)));
  function runNumbers(end) {
    const L = state.levels.numbers, rng = core.makeRng(core.freshSeed()), digits = core.byLevel(L, 4, 14);
    const secs = Math.ceil(digits * (1.5 - 0.8 * (L - 1) / 19)), hold = core.byLevel(L, 2, 8), total = 3;
    const scores = [], rows = [];
    next(0);
    function next(k) {
      if (k >= total) return end(scores.reduce((a, b) => a + b, 0) / total, h('table', { class: 'table' }, h('tr', {}, h('th', {}, 'Number'), h('th', {}, 'You typed'), h('th', {}, 'Digits right')), rows));
      const num = Array.from({ length: digits }, (_, i) => (i === 0 ? 1 + rng.int(9) : rng.int(10))).join(''), kind = rng.pick(KINDS);
      const head = h('div', { class: 'muted' }, 'Number ' + (k + 1) + ' / ' + total + ' · ' + digits + ' digits');
      const timer = countdown(secs, blank);
      render(card(head, h('h3', {}, kind), timer, h('p', { class: 'digits' }, chunk(num)),
        L <= 5 ? h('p', { class: 'muted' }, 'Major system: 0 s/z · 1 t/d · 2 n · 3 m · 4 r · 5 l · 6 j/sh · 7 k/g · 8 f/v · 9 p/b') : null,
        h('button', { onclick: () => timer.finish() }, 'Ready')));
      function blank() {
        render(card(head, h('h3', {}, 'Hold it…'), countdown(hold, ask), h('p', { class: 'muted' }, 'Keep it in your head for a few seconds, like walking to where you\'ll write it down.')));
      }
      function ask() {
        const inp = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', autofocus: true, 'aria-label': 'Type the number' });
        render(card(head, h('h3', {}, 'Type the ' + kind.toLowerCase()), h('form', { onsubmit: (e) => {
          e.preventDefault();
          const sc = core.digitScore(num, inp.value);
          scores.push(sc); rows.push(h('tr', { class: sc === 1 ? 'ok' : 'bad' }, h('td', {}, chunk(num)), h('td', {}, inp.value || '—'), h('td', {}, pct(sc))));
          const typed = inp.value.replace(/\D/g, '');
          render(card(head, h('p', { class: sc === 1 ? 'ok' : 'bad' }, sc === 1 ? 'Exactly right.' : pct(sc) + ' of the digits in the right place.'),
            h('p', { class: 'digits' }, num.split('').map((d, i) => h('span', { class: typed[i] === d ? 'ok' : 'bad' }, d))),
            h('button', { class: 'primary', autofocus: true, onclick: () => next(k + 1) }, 'Next')));
        } }, inp, h('button', { class: 'primary' }, 'Check'))));
      }
    }
  }

  // ---------- Estimation ----------
  function runEstimate(end) {
    const L = state.levels.estimate, rng = core.makeRng(core.freshSeed()), est = state.estimate;
    est.seen = est.seen && typeof est.seen === 'object' ? est.seen : {};
    let pool = bank.ESTIMATES.filter((q) => !est.seen[q.id]);
    if (pool.length < 5) { est.seen = {}; pool = bank.ESTIMATES; }
    const qs = rng.sample(pool, 5), ratio = core.maxRatio(L);
    const num = (v) => Number(String(v).replace(/,/g, '').trim());
    const fmt = (x) => (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString() : String(Math.round(x * 1000) / 1000));
    const steps = qs.map((q) => (done, progress) => {
      const hi = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'High end' });
      const lo = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', autofocus: true, 'aria-label': 'Low end',
        onkeydown: (ev) => { if (ev.key === 'Enter' && !hi.value.trim()) { ev.preventDefault(); hi.focus(); } } });
      const msg = h('p', { class: 'bad', 'aria-live': 'polite' });
      const form = h('form', { onsubmit: (e) => {
        e.preventDefault();
        const a = num(lo.value), b = num(hi.value);
        if (!isFinite(a) || !isFinite(b) || lo.value.trim() === '' || hi.value.trim() === '') { msg.textContent = 'Enter a number for both ends.'; return; }
        const r = core.scoreRange(a, b, q.answer, L);
        est.seen[q.id] = true; est.asked++; if (r.contained) est.contained++; save();
        form.replaceWith(feedbackBox(r.hit, fmt(q.answer) + ' ' + q.unit,
          r.contained ? (r.tight ? 'Inside your range, and tight enough to count.' : 'Inside your range, but too wide to count at this level (high ÷ low must be at most ' + Math.round(ratio * 10) / 10 + ').')
            : 'Outside your range. If this keeps happening, your 90% ranges are really 50% ranges: widen them.', done, h('p', { class: 'muted' }, 'Source: ' + q.source)));
        main.querySelector('.feedback button').focus();
      } }, h('div', { class: 'range-in' }, h('label', {}, 'Low', lo), h('label', {}, 'High', hi), h('span', { class: 'unit' }, q.unit)), msg, h('button', { class: 'primary' }, 'Lock in'));
      render(card(h('div', { class: 'muted' }, progress), h('h3', {}, q.q), h('p', { class: 'muted' }, 'Give a range you\'re 90% sure contains it (' + q.unit + '). Max width at your level: high ÷ low ≤ ' + Math.round(ratio * 10) / 10 + '.'), form));
    });
    runSteps(steps, (r, n) => end(r / n, h('div', {}, h('p', {}, r + ' of ' + n + ' ranges counted.'),
      h('p', { class: 'muted' }, 'All time, your ranges contained the true answer ' + est.contained + ' of ' + est.asked + ' times (' + pct(est.contained / est.asked) + '). Aim for about 90%.'))));
  }

  // ---------- Read the Room ----------
  function runReason(end) {
    const L = state.levels.reason, rng = core.makeRng(core.freshSeed());
    const target = Math.min(3, 1 + Math.floor((L - 1) / 5));
    // Your own cases start out "seen", so they only come up once you've worked through the built-in ones.
    const cases = ALL_CASES.concat(state.reason.custom);
    const unseen = cases.filter((c) => !state.reason.seen[c.id]);
    const pool = unseen.length ? unseen : cases;
    const c = pool.filter((x) => x.d === target)[0] ? rng.pick(pool.filter((x) => x.d === target)) : rng.pick(pool);
    const set = rng.pick(content.OI_SETS);
    const steps = rng.sample(set.items, 4).map(([text, kind]) => mcStep({ context: set.scene, prompt: '“' + text + '” Is this an observation or an inference?',
      options: ['Observation', 'Inference'], answer: kind === 'O' ? 'Observation' : 'Inference',
      explain: kind === 'O' ? 'You could check this directly with your senses.' : 'This goes beyond what was seen. It might be true, but other explanations fit too.' }));
    let caseRight = 0; // the level tracks the case + next-question; the warm-up items are too easy to steer it
    steps.push((done, prog) => caseStep(c, rng)((ok) => { if (ok) caseRight++; done(ok); }, prog));
    const caseItems = c.next ? 2 : 1; // a case you wrote may have no follow-up question
    if (c.next) steps.push(mcStep({ context: c.text, prompt: c.next.q, options: rng.shuffle(c.next.options), answer: c.next.options[0], explain: c.next.explain, after: (ok) => { if (ok) caseRight++; } }));
    rng.sample(content.BARNUM, 2).forEach(([text, barnum]) => steps.push(mcStep({ prompt: 'A "reader" tells you: “' + text + '” Would this fit most people?',
      options: ['Fits most people (Barnum)', 'Specific to a few'], answer: barnum ? 'Fits most people (Barnum)' : 'Specific to a few',
      explain: barnum ? 'Statements like this feel personal but apply to nearly everyone. That\'s the engine of cold reading.' : 'This is specific and checkable. A real hit on this would mean something.' })));
    // Case questions count double: they're what the level is about, but 2 items alone would make it jump every round.
    runSteps(steps, (r, n) => end((2 * caseRight + (r - caseRight)) / (2 * caseItems + n - caseItems), h('div', {}, h('p', {}, 'Case: ' + caseRight + ' of ' + caseItems + '. Warm-ups (observation/inference, Barnum): ' + (r - caseRight) + ' of ' + (n - caseItems) + '.'),
      h('p', { class: 'muted' }, 'Case questions count double toward your level. Calibration builds up in Stats. ', h('a', { href: '#/cases' }, 'Write your own case →')))));
  }
  function caseStep(c, rng) {
    return (done, progress) => {
      const best = c.options[0], opts = rng.shuffle(c.options);
      const firstTime = !state.reason.seen[c.id]; // remembered answers would inflate calibration
      let choice = null;
      const conf = h('input', { type: 'range', min: 25, max: 100, step: 5, value: 60, 'aria-label': 'How sure are you?' });
      const out = h('output', {}, '60%');
      conf.addEventListener('input', () => { out.textContent = conf.value + '%'; });
      const lock = h('button', { class: 'primary', disabled: true }, 'Lock in');
      const rows = opts.map((o) => ({ o, el: h('label', { class: 'opt radio' }, h('input', { type: 'radio', name: 'case', onchange: () => { choice = o; lock.disabled = false; } }), ' ' + o) }));
      const fb = h('div');
      lock.addEventListener('click', () => {
        const ok = choice === best;
        lock.remove(); conf.disabled = true;
        rows.forEach((r) => { r.el.querySelector('input').disabled = true; if (r.o === best) r.el.classList.add('right'); else if (r.o === choice) r.el.classList.add('wrong'); });
        if (firstTime) state.reason.calib.push({ conf: conf.value / 100, correct: ok });
        state.reason.seen[c.id] = true; save();
        fb.replaceWith(feedbackBox(ok, best, c.explain, done, c.alt ? h('p', { class: 'muted' }, 'Also consider: ' + c.alt) : null));
        main.querySelector('.feedback button').focus();
      });
      render(card(h('div', { class: 'muted' }, progress), h('p', { class: 'context' }, c.text), h('h3', {}, c.q),
        h('div', { class: 'opts' }, rows.map((r) => r.el)),
        h('label', { class: 'conf' }, 'How sure are you? ', conf, ' ', out), lock, fb));
    };
  }

  // ---------- missions ----------
  function todaysMission() {
    const t = today();
    if (!state.missions[t]) { const m = core.pickMission(state.missions, content.MISSIONS, t); state.missions[t] = core.blankEntry(m.id, m.title); save(); }
    return state.missions[t];
  }
  const goalText = (m) => (m.score.outOf ? 'at least ' + pct(m.score.goal) : m.score.goal + ' of ' + m.score.max);
  const valueText = (m, v) => (m.score.outOf ? pct(v) : String(v));
  function scoreLine(m, e) {
    if (e.got == null) return 'Done.';
    return (m.score.outOf ? e.got + ' / ' + e.total : e.got + ' / ' + m.score.max) + (e.hit === true ? ' · goal reached' : e.hit === false ? ' · goal missed' : '');
  }
  function missionBadge(m) {
    if (m.legacy) return null;
    return h('div', { class: 'badges' }, h('span', { class: 'badge' }, content.TRACKS[m.track] + ' · tier ' + m.tier), m.partner ? h('span', { class: 'badge partner' }, 'with a friend') : null);
  }
  const missionCalib = () => Object.values(state.missions).filter((e) => e.done && e.predict != null && e.hit != null).map((e) => ({ conf: e.predict, correct: e.hit }));

  let editingMission = false; // editing a finished check-in only changes it on "Save changes"
  function missions() {
    const t = today(), e = todaysMission(), m = missionOf(e);
    const due = core.dueCallbacks(state.missions, content.MISSIONS, t);
    const past = Object.entries(state.missions).filter(([d]) => d !== t).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 30);
    render(
      due.length ? callbackCard(due[0], due.length) : null,
      card(missionBadge(m), h('h2', {}, m.title), h('p', {}, m.text), e.done && !editingMission ? missionResult(m, e) : checkIn(m, e)),
      tracksCard(),
      past.length ? card(h('h2', {}, 'Mission log'), h('ul', { class: 'log' }, past.map(([d, x]) => {
        const pm = missionOf(x);
        return h('li', {}, h('b', {}, niceDate(d) + ' · ' + pm.title + (x.done ? ' ✓' : '')), x.done ? h('span', { class: 'muted' }, ' ' + scoreLine(pm, x)) : null,
          !x.items.some((i) => i.trim()) ? null : x.callback || pm.legacy ? h('p', {}, x.items.filter((i) => i.trim()).join(' · ')) : h('p', { class: 'muted' }, '(what you logged stays hidden until its callback)'), x.notes ? h('p', { class: 'muted' }, x.notes) : null);
      }))) : null);
  }

  function checkIn(m, e) {
    const t = today();
    const nodes = [];
    // Predict before doing it: a probability that feeds your calibration score.
    const predicted = () => h('p', { class: 'muted' }, 'Your prediction: ' + pct(e.predict) + ' that you\'ll reach ' + goalText(m) + '.');
    if (m.score.goal != null) {
      if (e.predict == null && !e.done) { // never after you've seen how it went
        const conf = h('input', { type: 'range', min: 5, max: 95, step: 5, value: 50, 'aria-label': 'Chance you reach the goal' });
        const out = h('output', {}, '50%');
        conf.addEventListener('input', () => { out.textContent = conf.value + '%'; });
        const box = h('div', { class: 'predict' }, h('h3', {}, 'Predict first'), h('p', {}, 'How likely are you to reach the goal: ' + goalText(m) + '?'),
          h('label', { class: 'conf' }, conf, ' ', out), h('button', { autofocus: true, onclick: () => { e.predict = conf.value / 100; save(); box.replaceWith(predicted()); } }, 'Lock in prediction'),
          h('p', { class: 'muted' }, 'Optional, but it\'s what turns a mission into a calibration check. Lock it in before you start.'));
        nodes.push(box);
      } else if (e.predict != null) nodes.push(predicted());
    }
    // What to log: people go to the People Log; items come back later as a callback.
    const people = m.log && m.log.people ? Array.from({ length: m.log.people }, (_, i) => ({
      name: h('input', { type: 'text', autocomplete: 'off', value: e.people[i] || '', 'aria-label': 'Name ' + (i + 1) }),
      told: h('input', { type: 'text', autocomplete: 'off', value: (e.told || [])[i] || '', placeholder: 'something they told you', 'aria-label': 'What person ' + (i + 1) + ' told you' }) })) : [];
    const items = m.log && m.log.items ? m.log.items.map((label, i) => h('input', { type: 'text', autocomplete: 'off', value: e.items[i] || '', 'aria-label': label, placeholder: label })) : [];
    const max = m.score.max;
    let got = e.got;
    const pills = !m.score.outOf && max <= 10
      ? h('div', { class: 'pills', role: 'group', 'aria-label': m.score.label }, Array.from({ length: max + 1 }, (_, v) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(got === v),
        onclick: (ev) => { got = v; ev.currentTarget.parentNode.querySelectorAll('.pill').forEach((b, j) => b.setAttribute('aria-pressed', String(j === v))); } }, v)))
      : null;
    const gotIn = pills ? null : h('input', { type: 'number', min: 0, max: m.score.outOf ? null : max, inputmode: 'numeric', value: e.got == null ? '' : e.got, 'aria-label': m.score.outOf ? 'How many you got' : m.score.label });
    const totalIn = m.score.outOf ? h('input', { type: 'number', min: 1, inputmode: 'numeric', value: e.total == null ? '' : e.total, 'aria-label': 'Out of how many' }) : null;
    const notes = h('textarea', { rows: 3, value: e.notes, placeholder: 'Optional: what did you notice? What surprised you?', oninput: (ev) => { e.notes = ev.target.value; save(); } });
    const msg = h('p', { class: 'bad', 'aria-live': 'polite' });
    const form = h('form', { class: 'stack checkin', onsubmit: (ev) => {
      ev.preventDefault();
      const g = pills ? got : gotIn.value === '' ? null : Number(gotIn.value);
      const tot = totalIn ? Number(totalIn.value) : null;
      if (g == null || !(g >= 0) || (!m.score.outOf && g > max) || (m.score.outOf && !(tot >= 1 && g <= tot))) {
        msg.textContent = !m.score.outOf ? 'Pick your score first.' : tot >= 1 && g > tot ? 'You can\'t get more than the total.' : 'Enter how many you got and out of how many (at least 1).'; return;
      }
      if (!e.done) e.tierBefore = core.unlockedTier(state.missions, content.MISSIONS, m.track); // an edit keeps the original "before"
      e.items = items.map((x) => x.value.trim());
      const named = people.filter((p) => p.name.value.trim());
      // On an edit, only names not already logged from this check-in are added, so nobody is added twice.
      const before = new Set(e.people);
      named.filter((p) => !before.has(p.name.value.trim())).forEach((p) => state.people.push(Object.assign({ id: 'r' + Date.now() + Math.random().toString(36).slice(2, 6), source: 'real', met: t,
        name: p.name.value.trim(), context: 'Mission: ' + m.title, detail: p.told.value.trim(), feature: '' }, core.newCard(t))));
      e.people = named.map((p) => p.name.value.trim());
      e.told = named.map((p) => p.told.value.trim());
      Object.assign(e, { got: g, total: tot, hit: core.missionHit(m, g, tot), done: true, title: m.title });
      editingMission = false; save(); missions();
    } },
      h('h3', {}, 'Check in'),
      people.length ? h('div', {}, h('p', { class: 'muted' }, 'Log them from memory. They go straight into your People Log for spaced review.'),
        people.map((p, i) => h('div', { class: 'pair-in' }, h('label', {}, 'Person ' + (i + 1), p.name), h('label', {}, 'What they told you', p.told)))) : null,
      items.length ? h('div', {}, h('p', { class: 'muted' }, 'Write these from memory. They come back in ' + (m.callbackDays || 3) + ' days for a recall check.'),
        items.map((x, i) => h('label', {}, (items.length > 1 ? (i + 1) + '. ' : '') + m.log.items[i], x))) : null,
      h('label', {}, m.score.label + (m.score.goal != null ? ' (goal: ' + goalText(m) + ')' : ''), pills || h('div', { class: 'row' }, gotIn, totalIn ? h('span', {}, ' out of ') : null, totalIn)),
      h('label', {}, 'Notes', notes), msg,
      h('div', { class: 'row' }, h('button', { class: 'primary big' }, e.done ? 'Save changes' : 'Complete mission'),
        e.done ? h('button', { type: 'button', onclick: () => { editingMission = false; missions(); } }, 'Cancel') : h('button', { type: 'button', onclick: () => {
          e.skipped = e.skipped.concat(e.id);
          let next = core.pickMission(state.missions, content.MISSIONS, t, e.skipped);
          if (e.skipped.includes(next.id)) { e.skipped = [e.id]; next = core.pickMission(state.missions, content.MISSIONS, t, e.skipped); } // went through them all: start over
          state.missions[t] = Object.assign(core.blankEntry(next.id, next.title), { skipped: e.skipped });
          save(); missions();
        } }, 'Swap mission')));
    // Enter moves to the next field (like Memory Palace) instead of submitting a half-filled check-in.
    const fields = [...form.querySelectorAll('input[type=text], input[type=number]')];
    fields.forEach((el, i) => el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); (fields[i + 1] || form.querySelector('button.primary')).focus(); } }));
    nodes.push(form);
    return h('div', {}, nodes);
  }

  function missionResult(m, e) {
    const t = today(), v = core.missionValue(m, e), pb = core.personalBest(state.missions, content.MISSIONS, m.id, t);
    const tierNow = core.unlockedTier(state.missions, content.MISSIONS, m.track);
    const lines = [];
    if (e.hit != null) lines.push(h('p', { class: e.hit ? 'ok' : 'muted' }, e.hit ? 'Goal reached (' + goalText(m) + ').' : 'Goal not reached this time (' + goalText(m) + '). Same mission, another day.'));
    if (e.predict != null && e.hit != null) lines.push(h('p', {}, 'You gave it ' + pct(e.predict) + (e.hit ? ' and made it.' : ' and missed.') + ' This counts toward your calibration in Stats.'));
    if (v != null) lines.push(h('p', {}, pb == null ? 'First time: this sets your personal best.' : v > pb ? h('b', { class: 'ok' }, 'New personal best! (was ' + valueText(m, pb) + ')')
      : v === pb ? 'Tied your personal best (' + valueText(m, pb) + ').' : 'Personal best: ' + valueText(m, pb) + '.'));
    if (!m.legacy) {
      if (e.tierBefore && tierNow > e.tierBefore) lines.push(h('p', { class: 'ok' }, h('b', {}, content.TRACKS[m.track] + ' tier ' + tierNow + ' unlocked.'), ' Harder missions in this track can now come up.'));
      else if (tierNow < 3) { const n = Math.min(2, doneAtTier(m.track, tierNow)); lines.push(h('div', { class: 'progress' }, h('span', { style: 'width:' + (n * 50) + '%' }), h('small', {}, n + ' of 2 toward ' + content.TRACKS[m.track] + ' tier ' + (tierNow + 1)))); }
    }
    const logged = e.items.filter((x) => x.trim());
    if (e.people.length) lines.push(h('p', {}, 'In your People Log: ' + e.people.join(', ') + '. First review: tomorrow.'));
    if (logged.length) lines.push(h('p', { class: 'muted' }, 'You logged: ' + logged.join(' · ') + '. In ' + (m.callbackDays || 3) + ' days you\'ll be asked to recall it without looking.'));
    return h('div', { class: 'result' },
      h('div', { class: 'score-big' + (e.hit ? ' celebrate' : '') }, e.got == null ? '✓' : m.score.outOf ? e.got + ' / ' + e.total : e.got + ' / ' + m.score.max),
      h('p', { class: 'muted center' }, m.score.label + (m.score.outOf && e.total ? ' · ' + pct(e.got / e.total) : '')), lines,
      h('div', { class: 'row' }, h('a', { class: 'button primary', href: '#/', autofocus: true }, 'Done'),
        h('button', { onclick: () => { editingMission = true; missions(); } }, 'Edit check-in')));
  }
  const doneAtTier = (track, k) => Object.values(state.missions).filter((e) => e.done && content.MISSIONS.some((m) => m.id === e.id && m.track === track && m.tier === k)).length;

  // A few days later: recall what you logged, then compare.
  function callbackCard(day, count) {
    const e = state.missions[day], m = missionOf(e), labels = m.log && m.log.items ? m.log.items : [];
    const same = labels.length > 1 && labels.every((l) => l === labels[0]); // "Shoes, what they suggest…" ×5 reads better as Item 1–5
    const logged = e.items.map((x, i) => [same ? 'Item ' + (i + 1) : labels[i] || '', x]).filter(([, x]) => x.trim());
    const days = core.daysBetween(day, today());
    const reveal = h('div', {}, h('button', { class: 'primary', autofocus: true, onclick: () => reveal.replaceChildren(
      h('ul', {}, logged.map(([label, x]) => h('li', {}, logged.length > 1 && label ? h('span', { class: 'muted' }, label + ': ') : null, x))),
      h('p', {}, 'How many did you remember?'),
      h('div', { class: 'pills' }, Array.from({ length: logged.length + 1 }, (_, v) => h('button', { class: 'pill', onclick: () => {
        e.callback = { date: today(), got: v, of: logged.length }; save();
        reveal.replaceChildren(h('p', { class: v === logged.length ? 'ok' : '' }, h('b', {}, v + ' of ' + logged.length + ' recalled after ' + days + ' days.'),
          v === logged.length ? ' It stuck.' : ' Those are the ones to re-encode next time: name it, picture it, recall it once that evening.'),
          h('button', { class: 'primary', autofocus: true, onclick: () => missions() }, 'Continue'));
        reveal.querySelector('button').focus();
      } }, v)))) }, 'Reveal what you logged'));
    return card(h('h2', {}, 'Callback' + (count > 1 ? ' (' + count + ' waiting)' : '')),
      h('p', {}, 'On ' + niceDate(day) + ' you did ', h('b', {}, m.title), '. Without looking: what did you log?'),
      h('ul', { class: 'muted' }, logged.map(([label]) => h('li', {}, label || 'item'))),
      h('p', { class: 'muted' }, 'Say or jot it from memory first. Delayed recall is the real test of whether it stuck.'), reveal);
  }

  function tracksCard() {
    return card(h('h2', {}, 'Tracks'), h('p', { class: 'muted' }, 'Finish two missions at a tier to unlock the next one in that track. One track comes up each day; swapping can pull from any.'),
      h('ul', { class: 'tracks' }, Object.entries(content.TRACKS).map(([id, name]) => {
        const tier = core.unlockedTier(state.missions, content.MISSIONS, id);
        return h('li', {}, h('b', {}, name), ' ', [1, 2, 3].map((k) => h('span', { class: 'tier' + (k <= tier ? ' open' : '') }, k <= tier ? 'Tier ' + k + ': ' + doneAtTier(id, k) + ' done' : 'Tier ' + k + ' 🔒')));
      })));
  }

  // ---------- People Log (real people) ----------
  function peopleLog() {
    const t = today();
    const real = state.people.filter((p) => p.source === 'real');
    const due = real.filter((p) => core.isDue(p, t));
    const f = { name: h('input', { required: true, autocomplete: 'off' }), context: h('input', { placeholder: 'e.g. VEX meeting, Tuesday', autocomplete: 'off' }),
      detail: h('input', { placeholder: 'e.g. mech-E sophomore from Austin', autocomplete: 'off' }), feature: h('input', { placeholder: 'e.g. round glasses, laughs loudly', autocomplete: 'off' }) };
    render(
      due.length ? card(h('h2', {}, 'Review (' + due.length + ' due)'), h('button', { class: 'primary', autofocus: true, onclick: () => reviewReal(due, 0) }, 'Start review')) : null,
      card(h('h2', {}, 'Add someone you met'), h('p', { class: 'muted' }, 'Real names, reviewed at growing intervals, are the most direct route to remembering everyone.'),
        h('form', { class: 'stack', onsubmit: (e) => {
          e.preventDefault();
          if (!f.name.value.trim()) return f.name.focus();
          state.people.push(Object.assign({ id: 'r' + Date.now(), source: 'real', met: t, name: f.name.value.trim(), context: f.context.value.trim(), detail: f.detail.value.trim(), feature: f.feature.value.trim() }, core.newCard(t)));
          save(); peopleLog();
        } }, h('label', {}, 'Name ', f.name), h('label', {}, 'Where / when you met ', f.context), h('label', {}, 'Something they told you ', f.detail), h('label', {}, 'Distinctive feature ', f.feature), h('button', { class: 'primary' }, 'Add'))),
      real.length ? card(h('h2', {}, 'Everyone (' + real.length + ')'), h('ul', { class: 'log' }, real.slice().reverse().map((p) => h('li', {},
        h('b', {}, p.name), ' ' + [p.context, p.detail, p.feature].filter(Boolean).map((x) => '· ' + x).join(' ') + ' ', h('span', { class: 'muted' }, core.isDue(p, t) ? '(due now) ' : '(next review ' + niceDate(p.due) + ') '),
        h('button', { class: 'small', onclick: () => { if (confirm('Remove ' + p.name + ' from your log?')) { state.people = state.people.filter((x) => x !== p); save(); peopleLog(); } } }, 'Remove'))))) : null);
  }
  function reviewReal(list, i) {
    if (i >= list.length) return peopleLog();
    const p = list[i];
    const grade = (ok) => { Object.assign(p, core.reviewCard(p, ok, today())); save(); reviewReal(list, i + 1); };
    // Alternate direction on odd boxes: name → what they told you. Remembering what people said matters as much as names.
    const reverse = p.detail && p.box % 2 === 1;
    const answer = reverse ? p.detail : p.name;
    const reveal = h('div', {}, h('button', { class: 'primary', autofocus: true, onclick: () => { reveal.replaceChildren(
      h('p', { class: reverse ? 'answer' : 'word' }, answer), h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => grade(true) }, 'I remembered'), h('button', { onclick: () => grade(false) }, 'I didn\'t')));
      reveal.querySelector('button').focus(); } }, reverse ? 'Show what they told you' : 'Show name'));
    const clues = reverse
      ? h('ul', {}, h('li', {}, h('b', {}, p.name)), p.context ? h('li', {}, 'Met: ' + p.context) : null)
      : h('ul', {}, p.context ? h('li', {}, 'Met: ' + p.context) : null, p.detail ? h('li', {}, 'Told you: ' + p.detail) : null, p.feature ? h('li', {}, 'Looks: ' + p.feature) : null, h('li', { class: 'muted' }, 'Added ' + niceDate(p.met)));
    render(card(h('div', { class: 'muted' }, (i + 1) + ' / ' + list.length), h('h3', {}, reverse ? 'What did they tell you?' : 'Who is this?'), clues,
      h('p', { class: 'muted' }, 'Say it out loud before revealing it.'), reveal));
  }

  // ---------- write your own cases ----------
  // Writing a case is practice too: you have to find the clue that separates the explanations. A friend can also write cases for you.
  function caseEditor(justSaved) {
    const f = (ph, rows) => (rows ? h('textarea', { rows, placeholder: ph }) : h('input', { type: 'text', autocomplete: 'off', placeholder: ph }));
    const fld = { text: f('What you see: concrete observations only (who, what, where, marks, objects, times)', 4), q: f('What is the most likely explanation?'),
      best: f('The best-supported answer'), w1: f('Another option'), w2: f('Another option'), w3: f('Another option'),
      explain: f('Why the best answer wins: which clues point to it', 3), alt: f('Optional: the strongest alternative, and why it loses'),
      nq: f('Optional follow-up: which question or check would tell them apart?'), nbest: f('The best check'), n1: f('Another check'), n2: f('Another check'), n3: f('Another check'),
      nexplain: f('Why that check is the most informative') };
    fld.q.value = 'What is the most likely explanation?';
    const msg = h('p', { class: 'bad', 'aria-live': 'polite' });
    const mine = state.reason.custom;
    render(card(h('h2', {}, 'Write a case'), justSaved === true ? h('p', { class: 'ok', role: 'status' }, 'Saved. You can see it in the list below.') : null, h('p', { class: 'muted' }, 'Your cases join Read the Room once you\'ve worked through the built-in ones. Calibration ignores them, since you know the answers. Have a friend write some for you too.'),
      h('form', { class: 'stack', onsubmit: (e) => {
        e.preventDefault();
        const v = (k) => fld[k].value.trim();
        const opts = [v('best'), v('w1'), v('w2'), v('w3')], nopts = [v('nbest'), v('n1'), v('n2'), v('n3')];
        if (!v('text') || !v('q') || !v('explain') || opts.some((o) => !o)) { msg.textContent = 'Fill in the situation, the question, all four answers and why.'; return; }
        if (new Set(opts).size < 4) { msg.textContent = 'The four answers need to be different.'; return; }
        const hasNext = v('nq') || nopts.some(Boolean);
        if (hasNext && (!v('nq') || nopts.some((o) => !o) || new Set(nopts).size < 4)) { msg.textContent = 'For the follow-up, fill in the question and four different checks, or leave it all empty.'; return; }
        const c = { id: 'u' + Date.now(), d: 2, text: v('text'), q: v('q'), options: opts, explain: v('explain'), alt: v('alt') };
        if (hasNext) c.next = { q: v('nq'), options: nopts, explain: v('nexplain') };
        state.reason.custom.push(c); state.reason.seen[c.id] = true; save(); caseEditor(true);
      } },
        h('label', {}, 'Situation', fld.text), h('label', {}, 'Question', fld.q), h('label', {}, 'Best answer', fld.best),
        h('label', {}, 'Other answers (plausible, but less supported)', fld.w1, fld.w2, fld.w3), h('label', {}, 'Explanation', fld.explain), h('label', {}, 'Strongest alternative', fld.alt),
        h('details', {}, h('summary', {}, 'Add a follow-up question (optional)'), h('label', {}, 'Follow-up question', fld.nq), h('label', {}, 'Best check', fld.nbest),
          h('label', {}, 'Other checks', fld.n1, fld.n2, fld.n3), h('label', {}, 'Why', fld.nexplain)),
        msg, h('button', { class: 'primary' }, 'Save case'))),
      mine.length ? card(h('h2', {}, 'Your cases (' + mine.length + ')'), h('ul', { class: 'log' }, mine.map((c) => h('li', {}, h('p', {}, c.text), h('p', { class: 'muted' }, 'Best answer: ' + c.options[0]),
        h('button', { class: 'small', onclick: () => { if (confirm('Delete this case?')) { state.reason.custom = state.reason.custom.filter((x) => x !== c); save(); caseEditor(); } } }, 'Delete'))))) : null);
  }

  // ---------- learn ----------
  function learn() {
    render(card(h('h2', {}, 'The science, honestly'), content.SCIENCE.map(([title, items]) => h('div', {}, h('h3', {}, title), h('ul', {}, items.map((x) => h('li', {}, x)))))),
      ...core.DRILLS.map((d) => techniqueCard(d, h('a', { class: 'button', href: '#/drill/' + d }, 'Practice'))));
  }

  // ---------- stats ----------
  function sparkline(values) {
    if (values.length < 2) return '';
    const w = 120, hgt = 28, max = Math.max(5, ...values);
    const pts = values.map((v, i) => (i / (values.length - 1) * w).toFixed(1) + ',' + (hgt - (v / max) * hgt).toFixed(1)).join(' ');
    return '<svg viewBox="0 0 ' + w + ' ' + hgt + '" width="' + w + '" height="' + hgt + '" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  }
  function stats() {
    const rows = core.DRILLS.map((d) => {
      const hs = state.history.filter((x) => x.drill === d);
      const last = hs.slice(-10);
      return h('tr', {}, h('td', {}, TITLES[d]), h('td', {}, state.levels[d]), h('td', {}, hs.length),
        h('td', {}, last.length ? pct(last.reduce((s, x) => s + x.acc, 0) / last.length) : '—'), h('td', { html: sparkline(hs.map((x) => x.level).concat(state.levels[d])) }));
    });
    const caseCalib = state.reason.calib, mCalib = missionCalib(), calib = caseCalib.concat(mCalib), b = core.brier(calib), est = state.estimate;
    render(
      weekCard(),
      card(h('h2', {}, 'Progress'), h('p', { class: 'muted' }, 'Practiced ' + core.daysPracticed(state.history, today(), 30) + ' of the last 30 days. ' + state.history.length + ' rounds total.'),
        h('div', { class: 'scroll' }, h('table', { class: 'table' }, h('tr', {}, h('th', {}, 'Drill'), h('th', {}, 'Level'), h('th', {}, 'Rounds'), h('th', {}, 'Last 10 avg'), h('th', {}, 'Level trend')), rows))),
      card(h('h2', {}, 'Calibration'),
        h('p', {}, calib.length ? (calib.length < 5 ? 'Only ' + calib.length + ' call' + (calib.length === 1 ? '' : 's') + ' so far. The score gets meaningful after 10 or more. ' : '') + 'Brier score: ' + b.toFixed(3) + ' (' + caseCalib.length + ' case' + (caseCalib.length === 1 ? '' : 's') + ', ' + mCalib.length + ' mission prediction' + (mCalib.length === 1 ? '' : 's') + '). 0 is perfect. Always answering at 60% confidence and being right 60% of the time scores 0.24. Lower is better.' : 'Do some Read the Room rounds, or predict a mission, to see how well your confidence matches reality.'),
        calib.length ? h('table', { class: 'table' }, h('tr', {}, h('th', {}, 'When you said'), h('th', {}, 'Calls'), h('th', {}, 'You were right')),
          core.calibrationTable(calib).map((r) => h('tr', {}, h('td', {}, r.label), h('td', {}, r.n), h('td', {}, r.hitRate == null ? '—' : pct(r.hitRate))))) : null,
        est.asked ? h('p', {}, 'Estimation: your 90% ranges contained the true answer ' + est.contained + ' of ' + est.asked + ' times (' + pct(est.contained / est.asked) + ').') : null,
        h('p', { class: 'muted' }, 'Well calibrated means your 90% calls are right about 90% of the time. Overconfidence (right much less often than you claimed) is the usual pattern, and the one Patrick Jane would have.')));
  }
  // The weekly debrief: what the last 7 days added up to.
  function weekCard() {
    const t = today(), from = core.addDays(t, -6), inWeek = (d) => d >= from && d <= t;
    const rounds = state.history.filter((x) => inWeek(x.date));
    const moved = core.DRILLS.map((d) => { const first = rounds.find((x) => x.drill === d); return first && state.levels[d] !== first.level ? TITLES[d] + ' ' + first.level + ' → ' + state.levels[d] : null; }).filter(Boolean);
    const week = Object.entries(state.missions).filter(([d, e]) => inWeek(d) && e.done);
    const pbs = week.filter(([d, e]) => { const m = missionOf(e), v = core.missionValue(m, e); if (m.legacy || v == null) return false;
      const prior = Object.entries(state.missions).filter(([d2, e2]) => d2 < d && e2.id === e.id && e2.done).map(([, e2]) => core.missionValue(m, e2)).filter((x) => x != null);
      return prior.length && v > Math.max(...prior); });
    const met = state.people.filter((p) => p.source === 'real' && inWeek(p.met)).length;
    const cbs = Object.values(state.missions).filter((e) => e.callback && inWeek(e.callback.date));
    const li = (label, value) => h('li', {}, label + ': ', h('b', {}, value));
    return card(h('h2', {}, 'Your week'), h('p', { class: 'muted' }, niceDate(from) + ' – ' + niceDate(t)),
      h('ul', { class: 'week' },
        li('Days practiced', core.daysPracticed(state.history, t, 7) + ' of 7'), li('Drill rounds', rounds.length),
        li('Missions done', week.length + (week.length ? ' (goal reached in ' + week.filter(([, e]) => e.hit).length + ')' : '')),
        li('Real people added to your People Log', met),
        pbs.length ? li('Personal bests', pbs.map(([, e]) => missionOf(e).title).join(', ')) : null,
        cbs.length ? li('Callback items recalled', cbs.reduce((s, e) => s + e.callback.got, 0) + ' of ' + cbs.reduce((s, e) => s + e.callback.of, 0)) : null),
      moved.length ? h('p', {}, 'Levels moved: ' + moved.join(' · ')) : h('p', { class: 'muted' }, 'No level changes this week yet.'));
  }

  // ---------- settings ----------
  function settings() {
    const intent = h('input', { type: 'text', value: state.intention, 'aria-label': 'Practice cue' });
    const file = h('input', { type: 'file', accept: 'application/json', 'aria-label': 'Import backup' });
    file.addEventListener('change', () => {
      if (!file.files[0]) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const raw = JSON.parse(fr.result);
          if (!raw || raw.version !== 1) throw new Error('not a backup');
          const next = core.migrate(raw);
          core.upgradeMissions(next.missions, content.MISSIONS, content.LEGACY_MISSION_TITLES);
          if (confirm('Replace your current progress with this backup?')) { state = next; save(); go('#/'); }
        } catch (e) { alert('That file isn\'t a valid Sharp backup.'); }
        file.value = '';
      };
      fr.readAsText(file.files[0]);
    });
    render(
      card(h('h2', {}, 'Habit cue'), h('div', { class: 'row' }, intent, h('button', { onclick: (e) => { state.intention = intent.value.trim(); save(); e.target.textContent = 'Saved ✓'; } }, 'Save'))),
      card(h('h2', {}, 'Your Read the Room cases'), h('p', { class: 'muted' }, state.reason.custom.length + ' written so far.'), h('a', { class: 'button', href: '#/cases' }, 'Write or manage cases')),
      card(h('h2', {}, 'Memory palace route'), h('p', {}, state.palace.loci.length ? state.palace.loci.join(' → ') : 'Not set up yet.'), h('button', { onclick: () => palaceSetup(settings) }, 'Edit route')),
      card(h('h2', {}, 'Your data'), h('p', { class: 'muted' }, 'Progress lives only in this browser (localStorage). Export a backup now and then, especially before clearing browser data.'),
        h('div', { class: 'row' },
          h('button', { onclick: () => {
            const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })), download: 'sharp-backup-' + today() + '.json' });
            document.body.append(a); a.click(); a.remove();
          } }, 'Export backup'),
          h('label', { class: 'button' }, 'Import backup ', file),
          h('button', { class: 'danger', onclick: () => { if (confirm('Erase ALL progress? Export a backup first if you might want it.')) { state = core.defaultState(); save(); go('#/'); } } }, 'Reset everything'))));
  }

  if (unreadable) {
    const bar = h('div', { class: 'card warn', role: 'alert' }, h('b', {}, 'Your saved progress couldn\'t be read, so nothing will be saved until you choose. '),
      'A copy was kept. Download it, then reload (an update may still be loading) or start fresh.',
      h('div', { class: 'row' },
        h('button', { onclick: () => {
          const a = h('a', { href: URL.createObjectURL(new Blob([unreadable], { type: 'application/json' })), download: 'sharp-unreadable-' + today() + '.json' });
          document.body.append(a); a.click(); a.remove();
        } }, 'Download the saved copy'),
        h('button', { onclick: () => location.reload() }, 'Reload'),
        h('button', { class: 'danger', onclick: () => { if (confirm('Start fresh? Your old data stays only in the file you downloaded.')) { unreadable = null; bar.remove(); save(); } } }, 'Start fresh')));
    main.before(bar);
  }
  // Ask the browser not to clear this site's storage on its own (Safari can, after a week without visits).
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  route();
})();
