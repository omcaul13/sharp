// UI: routing, the six drills, missions, People Log, stats, settings. Plain DOM, no framework.
(function () {
  'use strict';
  const { core, faces, scene: sceneLib, content } = window.Sharp;
  const STORE_KEY = 'sharp.v1';
  const TITLES = { glance: 'Glance', change: 'Spot the Change', scene: 'Room Recall', faces: 'Faces & Names', palace: 'Memory Palace', reason: 'Read the Room' };
  const BLURBS = { glance: 'Flash memory of objects', change: 'Catch what changed', scene: 'Observe a whole room', faces: 'Remember people', palace: 'Store ordered lists', reason: 'Observation vs. inference' };

  // ---------- state ----------
  let state = load();
  function load() {
    try { return core.migrate(JSON.parse(localStorage.getItem(STORE_KEY))); } catch (e) { return core.defaultState(); }
  }
  function save() {
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
  const missionAt = (m) => content.MISSIONS[m.idx % content.MISSIONS.length];
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
    const [, page = '', arg, flag] = location.hash.split('/');
    document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#/' + page));
    if (page === 'drill' && TITLES[arg]) return drillIntro(arg, flag === 'w');
    ({ learn, stats, missions, people: peopleLog, settings }[page] || home)();
  }
  window.addEventListener('hashchange', route);

  // ---------- home ----------
  function home() {
    const t = today();
    const plan = core.planWorkout(state.history, t);
    const nextUp = plan.find((d) => !doneToday(d));
    const realDue = state.people.filter((p) => p.source === 'real' && core.isDue(p, t)).length;
    const m = todaysMission();
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
        h('p', { class: 'muted' }, 'Practiced ' + core.daysPracticed(state.history, t, 7) + ' of the last 7 days.')),
      card(h('h2', {}, 'Mission of the day'), h('h3', {}, missionAt(m)[0] + (m.done ? ' ✓' : '')),
        h('p', {}, missionAt(m)[1]), h('a', { href: '#/missions' }, m.done ? 'View notes' : 'Log it when done →')),
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
  function drillIntro(name, inWorkout) {
    if (state.seenIntro[name]) return startDrill(name, inWorkout);
    render(techniqueCard(name, h('button', { class: 'primary big', autofocus: true, onclick: () => { state.seenIntro[name] = true; save(); startDrill(name, inWorkout); } }, 'Start')));
  }
  function techniqueCard(name, action) {
    const t = content.TECHNIQUES[name];
    return card(h('h2', {}, t.title), h('p', {}, t.what), h('h3', {}, 'How to do it well'), h('ul', {}, t.how.map((x) => h('li', {}, x))),
      h('p', { class: 'muted why' }, t.why), action);
  }
  function startDrill(name, inWorkout) {
    const runners = { glance: runGlance, change: runChange, scene: runScene, faces: runFaces, palace: runPalace, reason: runReason };
    runners[name]((acc, details) => finish(name, acc, details, inWorkout));
  }
  function finish(name, acc, details, inWorkout) {
    const { before, after } = core.recordRound(state, name, acc);
    save();
    const next = inWorkout ? core.planWorkout(state.history, today()).find((d) => !doneToday(d)) : null;
    const lvl = after > before ? 'Level up → ' + after : after < before ? 'Level eased to ' + after + ' (that\'s the system keeping you in the learning zone)' : 'Level stays at ' + after;
    render(card(h('h2', {}, TITLES[name] + ': ' + pct(acc)), h('p', { class: after > before ? 'ok' : 'muted' }, lvl),
      details || null,
      h('div', { class: 'row' },
        next ? h('button', { class: 'primary', autofocus: true, onclick: () => go('#/drill/' + next + '/w') }, 'Next: ' + TITLES[next] + ' →') : null,
        inWorkout && !next ? h('button', { class: 'primary', autofocus: true, onclick: () => go('#/missions') }, 'Workout done → mission') : null,
        h('button', { onclick: () => startDrill(name, inWorkout) }, 'Again'),
        h('button', { onclick: () => render(techniqueCard(name, h('button', { class: 'primary', onclick: () => startDrill(name, inWorkout) }, 'Start'))) }, 'Technique'),
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
    const rng = core.makeRng(core.freshSeed());
    const s = sceneLib.makeScene(rng, state.levels.scene), qs = sceneLib.makeQuestions(s, rng), svg = sceneLib.sceneSvg(s);
    const timer = countdown(s.seconds, freeRecall);
    render(card(h('h3', {}, 'Study the room'), timer, h('div', { class: 'visual', html: svg }), h('p', { class: 'muted' }, 'Narrate under your breath as you scan: "rain outside, clock 3:25, blue triangle, door open…". Describing is the core skill.'), h('button', { onclick: () => timer.finish() }, 'I\'m ready')));
    // Free recall first: producing details from memory is stronger practice than recognizing them in a list.
    function freeRecall() {
      const box = h('textarea', { rows: 5, autofocus: true, placeholder: 'clock 3:25, rainy window, blue triangle, door open, 2 people (one in a cap)…' });
      render(card(h('h3', {}, 'Before the questions: list everything you remember'), h('p', { class: 'muted' }, 'Quick fragments are fine. This part isn\'t scored, but the debrief shows what you got.'),
        box, h('button', { class: 'primary', onclick: () => quiz(box.value) }, 'On to the questions')));
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
        end(right / qs.length, h('div', {},
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
    const reviewSteps = due.map((p) => nameQ(p, 'You met this person on ' + niceDate(p.met) + '. Who is it?', due, (ok) => {
      Object.assign(p, core.reviewCard(p, ok, t)); save();
    }));
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
    const words = rng.sample(content.PALACE_WORDS, n);
    show(0);
    function show(i) {
      if (i >= n) return recall();
      const timer = countdown(secs, () => show(i + 1));
      render(card(h('div', { class: 'muted' }, 'Stop ' + (i + 1) + ' / ' + n), h('p', { class: 'locus' }, 'At the ', h('b', {}, loci[i]), '…'),
        h('p', { class: 'word' }, words[i]), timer, h('p', { class: 'muted' }, 'Make it vivid, exaggerated and interacting with the place.'),
        h('button', { onclick: () => timer.finish() }, 'Next')));
    }
    function recall() {
      const check = h('button', { class: 'primary' }, 'Check');
      // Enter walks down the list instead of submitting; on the last line it lands on Check, so one more Enter submits.
      const nextField = (i) => (e) => { if (e.key === 'Enter') { e.preventDefault(); (inputs[i + 1] || check).focus(); } };
      const inputs = words.map((_, i) => h('input', { type: 'text', autocomplete: 'off', 'aria-label': 'Item at ' + loci[i], autofocus: i === 0, onkeydown: nextField(i) }));
      render(card(h('h3', {}, 'Walk your route. What was at each stop?'), h('form', { onsubmit: (e) => {
        e.preventDefault();
        const right = words.filter((w, i) => normWord(inputs[i].value) === normWord(w)).length;
        end(right / n, h('table', { class: 'table' }, h('tr', {}, h('th', {}, 'Stop'), h('th', {}, 'Item'), h('th', {}, 'You')),
          words.map((w, i) => h('tr', { class: normWord(inputs[i].value) === normWord(w) ? 'ok' : 'bad' }, h('td', {}, loci[i]), h('td', {}, w), h('td', {}, inputs[i].value || '—')))));
      } }, h('ol', { class: 'recall' }, inputs.map((inp, i) => h('li', {}, h('label', {}, loci[i] + ' ', inp)))), check)));
    }
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

  // ---------- Read the Room ----------
  function runReason(end) {
    const L = state.levels.reason, rng = core.makeRng(core.freshSeed());
    const target = Math.min(3, 1 + Math.floor((L - 1) / 5));
    const unseen = content.CASES.filter((c) => !state.reason.seen[c.id]);
    const pool = unseen.length ? unseen : content.CASES;
    const c = pool.filter((x) => x.d === target)[0] ? rng.pick(pool.filter((x) => x.d === target)) : rng.pick(pool);
    const set = rng.pick(content.OI_SETS);
    const steps = rng.sample(set.items, 4).map(([text, kind]) => mcStep({ context: set.scene, prompt: '“' + text + '” Is this an observation or an inference?',
      options: ['Observation', 'Inference'], answer: kind === 'O' ? 'Observation' : 'Inference',
      explain: kind === 'O' ? 'You could check this directly with your senses.' : 'This goes beyond what was seen. It might be true, but other explanations fit too.' }));
    let caseRight = 0; // the level tracks the case + next-question; the warm-up items are too easy to steer it
    steps.push((done, prog) => caseStep(c, rng)((ok) => { if (ok) caseRight++; done(ok); }, prog));
    steps.push(mcStep({ context: c.text, prompt: c.next.q, options: rng.shuffle(c.next.options), answer: c.next.options[0], explain: c.next.explain, after: (ok) => { if (ok) caseRight++; } }));
    rng.sample(content.BARNUM, 2).forEach(([text, barnum]) => steps.push(mcStep({ prompt: 'A "reader" tells you: “' + text + '” Would this fit most people?',
      options: ['Fits most people (Barnum)', 'Specific to a few'], answer: barnum ? 'Fits most people (Barnum)' : 'Specific to a few',
      explain: barnum ? 'Statements like this feel personal but apply to nearly everyone. That\'s the engine of cold reading.' : 'This is specific and checkable. A real hit on this would mean something.' })));
    // Case questions count double: they're what the level is about, but 2 items alone would make it jump every round.
    runSteps(steps, (r, n) => end((2 * caseRight + (r - caseRight)) / (4 + n - 2), h('div', {}, h('p', {}, 'Case: ' + caseRight + ' of 2. Warm-ups (observation/inference, Barnum): ' + (r - caseRight) + ' of ' + (n - 2) + '.'),
      h('p', { class: 'muted' }, 'Case questions count double toward your level. Calibration builds up in Stats.'))));
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
        fb.replaceWith(feedbackBox(ok, best, c.explain, done, h('p', { class: 'muted' }, 'Also consider: ' + c.alt)));
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
    if (!state.missions[t]) { state.missions[t] = { idx: core.seedFrom(t) % content.MISSIONS.length, done: false, notes: '' }; save(); }
    return state.missions[t];
  }
  function missions() {
    const m = todaysMission();
    const notes = h('textarea', { rows: 5, value: m.notes, placeholder: 'What did you notice? What surprised you? What would you do differently?', oninput: (e) => { m.notes = e.target.value; save(); } });
    const past = Object.entries(state.missions).filter(([d]) => d !== today()).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 30);
    render(card(h('h2', {}, 'Mission of the day'), h('h3', {}, missionAt(m)[0]), h('p', {}, missionAt(m)[1]), notes,
      h('div', { class: 'row' },
        h('button', { class: m.done ? '' : 'primary', onclick: () => { m.done = !m.done; save(); missions(); } }, m.done ? '✓ Done (undo)' : 'Mark done'),
        h('button', { onclick: () => { m.idx = (m.idx + 1) % content.MISSIONS.length; m.done = false; m.notes = ''; save(); missions(); } }, 'Swap mission')),
      h('p', { class: 'muted' }, 'Missions are where the skill moves into real life. Drills alone mostly make you better at drills.')),
    past.length ? card(h('h2', {}, 'Mission log'), h('ul', { class: 'log' }, past.map(([d, x]) => h('li', {}, h('b', {}, d + ' · ' + missionAt(x)[0] + (x.done ? ' ✓' : '')), x.notes ? h('p', {}, x.notes) : null)))) : null);
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
    const reveal = h('div', {}, h('button', { class: 'primary', autofocus: true, onclick: () => reveal.replaceChildren(
      h('p', { class: reverse ? 'answer' : 'word' }, answer), h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => grade(true) }, 'I remembered'), h('button', { onclick: () => grade(false) }, 'I didn\'t'))) }, reverse ? 'Show what they told you' : 'Show name'));
    const clues = reverse
      ? h('ul', {}, h('li', {}, h('b', {}, p.name)), p.context ? h('li', {}, 'Met: ' + p.context) : null)
      : h('ul', {}, p.context ? h('li', {}, 'Met: ' + p.context) : null, p.detail ? h('li', {}, 'Told you: ' + p.detail) : null, p.feature ? h('li', {}, 'Looks: ' + p.feature) : null, h('li', { class: 'muted' }, 'Added ' + p.met));
    render(card(h('div', { class: 'muted' }, (i + 1) + ' / ' + list.length), h('h3', {}, reverse ? 'What did they tell you?' : 'Who is this?'), clues,
      h('p', { class: 'muted' }, 'Say it out loud before revealing it.'), reveal));
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
    const calib = state.reason.calib, b = core.brier(calib);
    render(
      card(h('h2', {}, 'Progress'), h('p', { class: 'muted' }, 'Practiced ' + core.daysPracticed(state.history, today(), 30) + ' of the last 30 days. ' + state.history.length + ' rounds total.'),
        h('div', { class: 'scroll' }, h('table', { class: 'table' }, h('tr', {}, h('th', {}, 'Drill'), h('th', {}, 'Level'), h('th', {}, 'Rounds'), h('th', {}, 'Last 10 avg'), h('th', {}, 'Level trend')), rows))),
      card(h('h2', {}, 'Calibration'),
        h('p', {}, calib.length ? (calib.length < 5 ? 'Only ' + calib.length + ' case' + (calib.length === 1 ? '' : 's') + ' so far. The score gets meaningful after 10 or more. ' : '') + 'Brier score: ' + b.toFixed(3) + '. 0 is perfect. Always answering at 60% confidence and being right 60% of the time scores 0.24. Lower is better.' : 'Do some Read the Room rounds to see how well your confidence matches reality.'),
        calib.length ? h('table', { class: 'table' }, h('tr', {}, h('th', {}, 'When you said'), h('th', {}, 'Cases'), h('th', {}, 'You were right')),
          core.calibrationTable(calib).map((r) => h('tr', {}, h('td', {}, r.label), h('td', {}, r.n), h('td', {}, r.hitRate == null ? '—' : pct(r.hitRate))))) : null,
        h('p', { class: 'muted' }, 'Well calibrated means your 90% calls are right about 90% of the time. Overconfidence (right much less often than you claimed) is the usual pattern, and the one Patrick Jane would have.')));
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
          if (confirm('Replace your current progress with this backup?')) { state = next; save(); go('#/'); }
        } catch (e) { alert('That file isn\'t a valid Sharp backup.'); }
        file.value = '';
      };
      fr.readAsText(file.files[0]);
    });
    render(
      card(h('h2', {}, 'Habit cue'), h('div', { class: 'row' }, intent, h('button', { onclick: (e) => { state.intention = intent.value.trim(); save(); e.target.textContent = 'Saved ✓'; } }, 'Save'))),
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

  route();
})();
