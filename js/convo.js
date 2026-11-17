// Conversation recall: a generated spoken self-introduction plus questions about what the person said.
(function (root) {
  'use strict';
  const core = typeof module === 'object' && module.exports ? require('./core.js') : root.Sharp.core;
  const faces = typeof module === 'object' && module.exports ? require('./faces.js') : root.Sharp.faces;
  const FIRST = faces.FIRST;

  const LAST = ['Ortiz', 'Okafor', 'Patel', 'Bennett', 'Nakamura', 'Haddad', 'Lindqvist', 'Moreno', 'Chen', 'Walsh',
    'Mensah', 'Kowalski', 'Rivera', 'Sato', 'Delgado', 'Fischer', 'Nguyen', 'Osei', 'Brennan', 'Novak', 'Kim', 'Shah'];
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const SETTINGS = [
    ['robotics club meeting', "This is my first robotics club meeting, so I figured I'd introduce myself."],
    ['lab', "I just got the bench next to yours, so I guess we're lab neighbors this semester."],
    ['internship first day', "It's my first day on the internship too, so I'm trying to meet everyone."],
    ['dorm floor', "I just moved in down the hall, so I'm knocking on doors to say hi."],
    ['career fair', 'I saw you over by the booths and wanted to say hi before the lines got long.'],
    ['team meeting', "I'm new to the team, and they told me to introduce myself before the meeting starts."],
    ['study group', "Someone said this was the study group for the midterm, so I hope I'm in the right room."],
  ];
  const GREET = ["Hi, I'm %.", "Hey! I'm %, nice to meet you.", "Hi there, I'm %.", "Oh, hey, I'm %."];
  const CLOSE = ["Anyway, it's really nice to meet you.", "So yeah, that's me. What about you?",
    "Okay, I've talked enough. Your turn!", "Anyway, I'm glad we finally met."];

  const CITIES = ['Denver', 'Tucson', 'Buffalo', 'Albuquerque', 'Sacramento', 'Savannah', 'Duluth', 'Omaha', 'Providence', 'Spokane'];
  const MAJORS = ['mechanical engineering', 'computer science', 'biology', 'industrial design', 'economics',
    'chemical engineering', 'physics', 'nursing', 'journalism'];
  const YEARS = ['first-year', 'sophomore', 'junior', 'senior', 'grad student'];
  // Human relatives are gender-neutral because faces.FIRST carries no gender. First three are human.
  const REL = ['cousin', 'younger sibling', 'older sibling', 'dog', 'cat', 'rabbit'];
  const AGE = { cousin: [6, 20], 'younger sibling': [8, 10], 'older sibling': [22, 8] }; // [min, span]
  const FILLER = ["Sorry if I'm rambling, I always talk too much when I meet new people.",
    "It's been a really long week, so I'm running mostly on coffee right now.",
    "I'm still learning everyone's names, so bear with me if I forget yours.",
    "I promised myself I'd actually talk to people this semester instead of hiding."];
  const PETS = ['Biscuit', 'Pickles', 'Mochi', 'Waffles', 'Pepper', 'Ziggy', 'Noodle', 'Bean'];
  const HOBBIES = ['rock climbing', 'baking sourdough', 'thrifting', 'birdwatching', 'playing pickup soccer',
    'fixing old bikes', 'playing bass', 'cooking curry'];
  const PROJECTS = ['a line-following robot', 'a 3D-printed prosthetic hand', 'a weather station', 'a budgeting app',
    'an electric skateboard', 'a solar phone charger', 'a mini wind tunnel', 'a drone frame'];
  const FOODS = ['pho', 'ramen', 'tacos al pastor', 'pierogi', 'jollof rice', 'dumplings', 'shawarma', 'pad thai'];
  const EVENTS = ['hackathon', 'job interview', 'robotics scrimmage', 'career fair', 'ski trip', 'concert',
    'dentist appointment', 'design review'];
  const JOBS = ['a bike shop', 'a summer camp', 'an ice cream shop', 'a machine shop', 'a hardware store', 'a marina',
    'a print shop', 'a pizza place'];
  const ACTS = ['rowing', 'playing piano', 'doing robotics', 'swimming', 'drawing', 'playing chess', 'skateboarding', 'running'];
  const LINKS_REL = ['roommate', 'lab partner', 'teammate', 'best friend'];
  const LINKS = ['is on your robotics team', 'was in your calc section', 'lives on your floor', 'sits next to you in lab',
    'mentors the same FIRST team as you', 'told me to come say hi'];

  // Numbers near n, so number distractors are plausible.
  const nums = (n) => Array.from({ length: 10 }, (_, i) => String(Math.max(1, n - 4) + i));

  function params(level) {
    return {
      facts: core.byLevel(level, 4, 9),
      questions: core.byLevel(level, 4, 8),
      replays: level <= 5 ? 1 : 0,
      rate: core.byLevel(level, 95, 110) / 100,
    };
  }

  // Each fact: a sentence, its main value (for ordering / not-mentioned) with the pool it came from,
  // easy questions and harder ones, as [question, answer, distractor pool].
  const FACTS = {
    hometown(r) {
      const v = r.pick(CITIES);
      return { main: v, pool: CITIES, easy: [['Where did they grow up?', v, CITIES]],
        s: r.pick([`I grew up in ${v}, and I still go back every summer.`, `I'm originally from ${v}, which people always ask me about.`]) };
    },
    major(r) {
      const v = r.pick(MAJORS), yr = r.pick(YEARS);
      return { main: v, pool: MAJORS, easy: [['What are they studying?', v, MAJORS]],
        s: r.pick([`I'm a ${yr} studying ${v}.`, `I'm a ${yr} in ${v}, which keeps me pretty busy.`]) };
    },
    family(r, name) {
      const rel = r.pick(REL), human = REL.indexOf(rel) < 3;
      const who = human ? name() : r.pick(PETS), age = human ? AGE[rel][0] + r.int(AGE[rel][1]) : 1 + r.int(10);
      return { main: who, pool: human ? FIRST : PETS, easy: [['Which family member or pet did they mention?', rel, REL]],
        hard: [[`What is the name of their ${rel}?`, who, human ? FIRST : PETS], [`How old is their ${rel}?`, String(age), nums(age)]],
        s: r.pick([`Back home there's my ${rel} ${who}, who is ${age} and basically runs the house.`,
          `My ${rel} ${who} just turned ${age}, and honestly I miss home a little.`].slice(rel === 'cousin' ? 1 : 0)) }; // cousins don't live at home
    },
    hobby(r) {
      const v = r.pick(HOBBIES);
      return { main: v, pool: HOBBIES, easy: [['What do they do for fun?', v, HOBBIES]],
        s: r.pick([`On weekends I'm usually ${v}.`, `My big hobby is ${v}; I'm kind of obsessed.`]) };
    },
    project(r) {
      const v = r.pick(PROJECTS);
      return { main: v, pool: PROJECTS, easy: [['What are they building right now?', v, PROJECTS]],
        s: r.pick([`Right now I'm building ${v} in my free time.`, `My current project is ${v}, and it's about half working.`]) };
    },
    food(r) {
      const v = r.pick(FOODS);
      return { main: v, pool: FOODS, easy: [['What food did they mention?', v, FOODS]],
        s: r.pick([`If you need food recs, I'm obsessed with ${v}.`, `My comfort food is ${v}, no contest.`]) };
    },
    plan(r) {
      const v = r.pick(EVENTS), weekdayOnly = ['job interview', 'career fair', 'dentist appointment', 'design review'].includes(v);
      const day = r.pick(weekdayOnly ? DAYS.slice(0, 5) : DAYS);
      return { main: v, pool: EVENTS, easy: [['What do they have coming up?', v, EVENTS]],
        hard: [[`What day is the ${v}?`, day, DAYS]],
        s: r.pick([`On ${day} I have a ${v}, so wish me luck.`, `This ${day} I've got a ${v} that I'm a little nervous about.`]) };
    },
    pastJob(r) {
      const v = r.pick(JOBS);
      return { main: v, pool: JOBS, easy: [['Where did they work before?', v, JOBS]],
        s: r.pick([`Last summer I worked at ${v}, which was more fun than it sounds.`, `Before this, I had a job at ${v} for a while.`]) };
    },
    years(r) {
      const v = r.pick(ACTS), n = 2 + r.int(7);
      return { main: v, pool: ACTS, easy: [[`What have they been doing for ${n} years?`, v, ACTS]],
        hard: [[`How many years have they been ${v}?`, String(n), nums(n)]],
        s: r.pick([`I've been ${v} for ${n} years now.`, `Fun fact: I've been ${v} for ${n} years.`]) };
    },
    connection(r, name) {
      const rel = r.pick(LINKS_REL), who = name(), link = r.pick(LINKS);
      return { main: who, pool: FIRST, easy: [[`What did they say about their ${rel}?`, link, LINKS]],
        hard: [[`What is the name of their ${rel}?`, who, FIRST]],
        s: r.pick([`Oh, and my ${rel} ${who} ${link}, so small world.`, `Also, small world: my ${rel} ${who} ${link}.`]) };
    },
  };
  const KINDS = Object.keys(FACTS);

  function makeIntro(rng, level) {
    const p = params(level);
    const used = new Set();
    const name = () => { const n = rng.pick(FIRST.filter((f) => !used.has(f))); used.add(n); return n; };
    const speaker = { first: name(), last: rng.pick(LAST) };
    const [setting, settingLine] = rng.pick(SETTINGS);
    const facts = rng.sample(KINDS, p.facts).map((k) => FACTS[k](rng, name));
    const sentences = [rng.pick(GREET).replace('%', speaker.first + ' ' + speaker.last), settingLine]
      .concat(facts.map((f) => f.s), rng.pick(FILLER), rng.pick(CLOSE));
    const text = sentences.join(' ');

    const mc = (q, answer, pool) => ({ q, answer,
      options: rng.shuffle([answer].concat(rng.sample(pool.filter((v) => v !== answer), 3))) });
    const easy = [['What was their first name?', speaker.first, FIRST]].concat(...facts.map((f) => f.easy));
    const hard = level < 6 ? [] : [['What was their last name?', speaker.last, LAST]].concat(...facts.map((f) => f.hard || []));
    if (level >= 9) { // facts are in spoken order, so the lowest index among the sampled four was said first
      const four = rng.sample(facts.map((f, i) => [f.main, i]), 4);
      const first = four.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
      hard.push({ q: 'Which of these did they mention first?', answer: first, options: four.map((x) => x[0]) });
    }
    if (level >= 12) {
      const three = rng.sample(facts, 3);
      const answer = rng.pick(three[0].pool.filter((v) => !text.includes(v)));
      hard.push({ q: 'Which of these did they NOT mention?', answer, options: rng.shuffle(three.map((f) => f.main).concat(answer)) });
    }
    const chosen = rng.sample(hard, level < 6 ? 0 : core.byLevel(level, 0, 6));
    const rest = rng.shuffle(easy.concat(hard.filter((h) => !chosen.includes(h))));
    const questions = rng.shuffle(chosen.concat(rest).slice(0, p.questions))
      .map((x) => (Array.isArray(x) ? mc(x[0], x[1], x[2]) : x));
    return { speaker, setting, sentences, text, questions };
  }

  const api = { params, makeIntro, FACTS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Sharp = root.Sharp || {}).convo = api;
})(typeof window !== 'undefined' ? window : globalThis);
