# Sharp — observe · remember · reason

A daily ~15-minute trainer for observation, memory for people and details, and honest "reading people" reasoning. No install, no dependencies, works offline.

## Use it

- **On your phone:** open the GitHub Pages link, then add it to your home screen (iPhone: Share → Add to Home Screen; Android/Chrome: ⋮ → Add to Home screen / Install app). It then opens full-screen and works offline.
- **On a computer:** double-click `index.html` in File Explorer so it opens in Chrome or Edge, or serve the folder with `python -m http.server 8765` and open http://localhost:8765. (The Claude app's built-in file preview can't load the scripts; use a real browser or the local server.)

Progress is saved in that browser only (localStorage), so your phone and your computer each keep their own. To move progress between them, use **Settings → Export backup** on one and **Import backup** on the other. Export now and then anyway.

## What's in it

- **11 drills**, each with levels 1–20 that adapt to keep you near 75–85% accuracy: Glance, Spot the Change, Room Recall (rooms come back days later, changed), Faces & Names (spaced reviews; people sometimes come back with a new look), Memory Palace (with delayed recall of your last list), Read the Room (40 deduction cases plus your own), Conversation Recall (spoken self-introductions), Witness, Describe It, Numbers (major system) and Estimation (90% ranges).
- **Daily workout** of four drills from different skill families, or a **5-minute commute version**.
- **Missions** in six tracks (Names, Noticing, Listening, Memory, Deduction, Interviews) with tiers that unlock: predict your odds, do it in real life, check in with a score, and get callback quizzes on what you logged days later.
- **People Log** for real people you meet, reviewed at growing intervals.
- **Stats**: your week, level trends, and calibration (do your 70% calls come true 70% of the time?).

## Develop

`npm test` runs Node's built-in test runner (no dependencies). Code is plain classic scripts in `js/`: `core.js` (logic, tested), `content.js` and `bank.js` (writing), `faces.js`, `scene.js`, `convo.js`, `witness.js` (generators), `app.js` (screens). `sw.js` adds offline support when served over http(s).
