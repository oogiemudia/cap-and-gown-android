// A small phone, the phone's text size turned up (Android enlarges the app's text to match), and the
// dyslexia-friendly font: nothing may run off the edge of the screen.
const { chromium, open, overflow } = require('./lib');
const { rich } = require('./seed');
const ROUTES = ['home', 'plan', 'study', 'portfolio', 'progress', 'more', 'courses', 'learn', 'library', 'terms', 'goals', 'log', 'settings', 'about', 'deadlines', 'add', 'paper', 'voice', 'coach'];
const STABS = ['foryou', 'quiz', 'cards', 'mistakes', 'papers'];
const PPAGES = ['overview', 'review', 'ksb', 'hours', 'obs', 'meetings', 'placements', 'records', 'pd'];
(async () => {
  const browser = await chromium.launch();
  const problems = [];
  let n = 0;
  for (const look of [{ zoom: 1, dys: true }, { zoom: 1.3, dys: false }, { zoom: 1.3, dys: true }, { zoom: 1.3, dys: false, font: 'DejaVu Sans' }]) for (const width of [320, 360]) {
    const st = JSON.parse(JSON.stringify(rich));
    st.settings = Object.assign({}, st.settings, { dys: look.dys });
    st.custom = [{ id: 'cown2', custom: true, course: 'assess', kind: 'event', title: 'Observation with assessor and internal quality assurer', due: '2026-11-27', dueTime: '13:30', status: 'confirmed', how: 'Workshop 2', note: 'Room 4', template: 'observation', chunks: [{ id: 'cown2a', date: '2026-11-18', mins: 45, title: 'Prepare the assessment plan and the paperwork', tip: 'Print two copies' }] }];
    st.portfolio.obsInfo = { 2: { date: '2026-11-12', spoken: '[Thu 12 Nov, 15:40]\nThe starter went well but the plenary was rushed.', targets: 'Stretch the higher learners', refl: '' } };
    const { ctx, page, errors } = await open(browser, { app: true, width, now: '2026-11-18T19:30:00', state: st, zoom: look.zoom, font: look.font, listenResumed: true });
    const where = `text x${look.zoom}${look.dys ? ' dys' : ''}${look.font ? ' wide letters' : ''} at ${width}px`;
    const check = async (label) => { const ov = await overflow(page); if (ov.length) problems.push(`${where} ${label}: ${ov.join(' | ')}`); while (errors.length) problems.push(`${where} ${label}: ${errors.shift()}`); n++; };
    for (const r of ROUTES) { await page.evaluate((x) => window.__planner.go(x), r); await check(r); }
    for (const t of STABS) { await page.evaluate((x) => { window.__planner.go('home'); window.__planner.sub.stab = x; window.__planner.go('study'); }, t); await check('study/' + t); }
    for (const p of PPAGES) { await page.evaluate((x) => { window.__planner.go('home'); window.__planner.sub.ppage = x; window.__planner.go('portfolio'); }, p); await check('portfolio/' + p); }
    // the coach: its three tabs, a workbook question at each step (the longest wording, the ones with headings), and its help sheet
    for (const p of ['aw', 'ksb', 'cp']) { await page.evaluate((x) => { const P = window.__planner; P.go('home'); P.sub.cq = null; P.sub.cpath = x; P.go('coach'); }, p); await check('coach/' + p); }
    for (const [q, stp] of [['4.3', 'learn'], ['2.1', 'check'], ['2.1', 'plan'], ['8.1', 'plan'], ['5.2', 'write']]) {
      await page.evaluate(([id, s]) => {
        const P = window.__planner; P.go('home'); P.sub.cpath = 'aw'; P.sub.cq = id; P.sub.cs = s; P.sub.cn = 9; P.go('coach');
        if (s === 'check') for (let i = 0; i < 2; i++) { const b = document.querySelector(`#screen [data-act="co-ans"][data-i="${i}"][data-o="0"]`); if (b) b.click(); }
      }, [q, stp]);
      await check(`coach ${q} ${stp}`);
    }
    await page.evaluate(() => { const P = window.__planner; P.sub.cq = null; P.go('coach'); document.querySelector('#screen [data-act="co-how"]').click(); });
    await check('coach help sheet');
    // PebblePad: the sheet on its own, carrying a reflection across, and as an older app words it
    await page.evaluate(() => { const P = window.__planner; P.go('home'); P.sub.cq = null; P.sub.ppage = 'obs'; P.go('portfolio'); document.querySelector('#appbar [data-act="pebblepad"]').click(); });
    await check('PebblePad sheet');
    await page.evaluate(() => { const P = window.__planner; document.querySelector('[data-act="close-sheet"]').click(); P.state.portfolio.obsInfo[2].refl = 'The starter went well. Next time I will shorten the plenary.'; document.querySelector('#screen [data-act="obs"][data-id="2"]').click(); document.querySelector('#layer [data-act="pp-take"]').click(); });
    await check('PebblePad sheet, taking a reflection across');
    await page.evaluate(() => { const P = window.__planner; const keep = { has: window.AndroidApp.hasPebblePad, open: window.AndroidApp.openPebblePad }; delete window.AndroidApp.hasPebblePad; delete window.AndroidApp.openPebblePad; document.querySelector('[data-act="close-sheet"]').click(); P.state.portfolio.obsInfo[2].refl = ''; document.querySelector('#appbar [data-act="pebblepad"]').click(); window.__keepPP = keep; });
    await check('PebblePad sheet, older app');
    await page.evaluate(() => { document.querySelector('[data-act="close-sheet"]').click(); window.__planner.go('settings'); });
    await check('settings, older app without the PebblePad link');
    await page.evaluate(() => { window.AndroidApp.hasPebblePad = window.__keepPP.has; window.AndroidApp.openPebblePad = window.__keepPP.open; window.__planner.go('home'); });
    // Mentor meetings: the sheet before listening (as an older app words it, the longest), listening with words
    // coming in, paused, the notes with Claude's draft and the delete question, and the record with every heading
    const meet = (fn) => page.evaluate(fn).then(() => page.evaluate(() => new Promise((r) => setTimeout(r, 40))));
    await meet(() => { const P = window.__planner; P.go('home'); P.sub.ppage = 'meetings'; P.go('portfolio'); window.__keepMeet = window.AndroidApp.meetingStart; delete window.AndroidApp.meetingStart; document.querySelector('#screen [data-act="meet-listen"]').click(); });
    await check('mentor meeting, before listening, older app');
    await meet(() => { window.AndroidApp.meetingStart = window.__keepMeet; window.__keepBg = window.AndroidApp.meetingInBackground; delete window.AndroidApp.meetingInBackground; document.querySelector('[data-act="close-sheet"]').click(); document.querySelector('#screen [data-act="meet-listen"]').click(); });
    await check('mentor meeting, before listening, the app before locked listening');
    await meet(() => { window.AndroidApp.meetingInBackground = window.__keepBg; document.querySelector('[data-act="close-sheet"]').click(); document.querySelector('#screen [data-act="meet-listen"]').click(); });
    await check('mentor meeting, before listening');
    await meet(() => { document.querySelector('#mt-ok').click(); document.querySelector('#layer [data-act="meet-start"]').click(); });
    await meet(() => { window.__say('we talked about the starter activity and how the learners settled quickly into the practical'); window.__say('and the learners were engaged all the way through the practical task which is exactly what I wanted to see from this group', 'partial'); window.__planner.state.portfolio.meetNotes.secs = 5399; window.__planner.meetTick(); });
    await check('mentor meeting, listening');
    await meet(() => window.__capgownDictate('wait', 'busy'));
    await check('mentor meeting, waiting for the speech service');
    for (const r of ['home', 'settings', 'plan']) { await meet(() => 0); await page.evaluate((x) => window.__planner.go(x), r); await check(r + ' with the meeting bar, waiting'); }
    await meet(() => { const P = window.__planner; P.sub.ppage = 'meetings'; P.go('portfolio'); });
    await meet(() => document.querySelector('#screen [data-act="meet-pause"]').click());
    await check('mentor meeting, paused');
    await meet(() => { const P = window.__planner; document.querySelector('#screen [data-act="meet-finish"]').click(); const n = P.state.portfolio.meetNotes; n.sent = 1; n.draft = 'WHO WAS THERE:\nMe and my mentor\nWHAT WE DISCUSSED:\nThe starter went well.\nTARGETS AND ACTIONS:\n- Shorten the plenary'; P.MEET.why = 'quiet'; P.sub.mtDrop = true; P.go('home'); P.sub.ppage = 'meetings'; P.go('portfolio'); });
    await check('mentor meeting, the notes with Claude’s draft');
    await meet(() => document.querySelector('#screen [data-act="meet-fill"]').click());
    await check('mentor meeting, check your record');
    await meet(() => { document.querySelector('#layer [data-act="pp-take"][data-k="meet"]').click(); });
    await check('mentor meeting, taking the record to PebblePad');
    await meet(() => { const P = window.__planner; document.querySelector('[data-act="close-sheet"]').click(); P.sub.mtDrop = false; P.go('home'); P.sub.ppage = 'meetings'; P.go('portfolio'); });
    await check('mentor meeting, saved and in the list');
    // The app's own listening: the offer, the sizes, the question on mobile data, downloading, a download that
    // failed, on with its sizes and the remove question, off after it could not start, the sheet, and listening
    const own = (fn) => meet(fn).then(() => meet(() => { const P = window.__planner; P.go('home'); P.sub.ppage = 'meetings'; P.go('portfolio'); }));
    await own(() => 0);
    await check('own listening, the offer');
    await own(() => { window.__planner.sub.ownMore = true; });
    await check('own listening, the sizes');
    await own(() => { const s = window.__planner.sub; window.__own.metered = true; s.ownMore = false; s.ownSize = 'medium'; s.ownAsk = 'medium'; });
    await check('own listening, the question on mobile data');
    await own(() => { const s = window.__planner.sub; s.ownAsk = ''; Object.assign(window.__own, { metered: false, busy: 'medium', done: 131596288, total: 263192576 }); });
    await check('own listening, downloading');
    await own(() => { Object.assign(window.__own, { busy: '', error: 'space' }); window.__planner.sub.ownMore = true; });
    await check('own listening, a download that failed');
    await own(() => { const W = window.__own; W.sizes.small.ready = true; W.sizes.tiny.ready = true; W.use = 'small'; W.error = 'offline'; const s = window.__planner.sub; s.ownMore = true; s.ownDel = 'tiny'; window.__keepStatus = window.AndroidApp.status; window.AndroidApp.status = () => JSON.stringify(Object.assign(JSON.parse(window.__keepStatus()), { battery: false })); });
    await check('own listening, on, with the sizes and the remove question');
    await own(() => { window.AndroidApp.status = window.__keepStatus; const W = window.__own; W.broken = true; W.error = ''; const s = window.__planner.sub; s.ownMore = false; s.ownDel = ''; });
    await check('own listening, off after it could not start');
    await own(() => { window.__own.broken = false; });
    await meet(() => document.querySelector('#screen [data-act="meet-listen"]').click());
    await check('own listening, before listening');
    await meet(() => { document.querySelector('#mt-ok').click(); document.querySelector('#layer [data-act="meet-start"]').click(); });
    await meet(() => { window.__say('we talked about the starter activity and how the learners settled quickly into the practical'); });
    await check('own listening, listening');
    await meet(() => document.querySelector('#screen [data-act="meet-finish"]').click());
    await meet(() => { const P = window.__planner; P.state.portfolio.meetNotes = null; window.__keepOwn = window.AndroidApp.ownListen; delete window.AndroidApp.ownListen; P.go('home'); P.sub.ppage = 'meetings'; P.go('portfolio'); });
    await check('own listening, the app before it');
    await own(() => { window.AndroidApp.ownListen = window.__keepOwn; window.__own.supported = false; });
    await check('own listening, a phone that cannot run it');
    await own(() => { const W = window.__own; W.supported = true; W.use = ''; W.sizes.small.ready = false; W.sizes.tiny.ready = false; });
    // the rows that only show after a tap: change a date, delete, a step's sheet, a library item, the add sheet, updates
    const taps = [['deadlines', '[data-act="edit-due"]'], ['deadlines', '[data-act="ask-delete"]'], ['home', '[data-act="step"]'], ['plan', '[data-act="step"]'], ['library', '[data-act="res"]'], ['library', '[data-act="lib-add"]'], ['study', '[data-act="fy-why"]'], ['settings', '[data-act="live-revert-ask"]'], ['settings', '[data-act="ask-reset"]'], ['goals', '[data-act]'], ['portfolio', '[data-act="ev-new"]']];
    for (const [r, sel] of taps) {
      await page.evaluate(([x, s]) => { const c = document.querySelector('[data-act="close-sheet"]'); if (c) c.click(); window.__planner.go('home'); window.__planner.sub.stab = 'foryou'; window.__planner.go(x); const el = document.querySelector('#screen ' + s); if (el) el.click(); }, [r, sel]);
      await check(`${r} > ${sel}`);
    }
    // Listen and Speak: an observation with its three boxes, the microphone on with words coming in, a refusal
    // message, and the player bar (at its widest: a long title, "Start again" and the count) over three screens
    await page.evaluate(() => { const c = document.querySelector('[data-act="close-sheet"]'); if (c) c.click(); window.__planner.go('home'); window.__planner.sub.ppage = 'obs'; window.__planner.go('portfolio'); document.querySelector('#screen [data-act="obs"][data-id="2"]').click(); });
    await check('observation sheet');
    await page.evaluate(() => { document.querySelector('#o-spoken + .vbar [data-act="dictate"]').click(); return new Promise((r) => setTimeout(r, 30)); });
    await page.evaluate(() => window.__say('and the learners were engaged all the way through the practical task which is exactly what I wanted to see from this group', 'partial'));
    await check('observation sheet, speaking');
    await page.evaluate(() => { window.__dictateEnd('denied'); });
    await check('observation sheet, microphone refused');
    await page.evaluate(() => { document.querySelector('[data-act="close-sheet"]').click(); window.__planner.listen('Assessment for learning in further education and skills: a practical guide for new teachers', 'One sentence. Two sentences. Three sentences.'); return new Promise((r) => setTimeout(r, 30)); });
    for (const r of ['home', 'voice', 'learn']) { await page.evaluate((x) => window.__planner.go(x), r); await check(r + ' with the player'); }
    const fab = await page.evaluate(() => { const f = document.querySelector('#fab').getBoundingClientRect(); const p = document.querySelector('#player'); return p.hidden ? 'the player is not showing' : f.bottom > p.getBoundingClientRect().top + 1 ? 'Ask tutor covers the player' : ''; });
    if (fab) problems.push(`${where}: ${fab}`);
    // a video: its sheet with the browser choice, the question on coming back, the cards it brings, a card of your own
    await page.evaluate(() => { const P = window.__planner; const c = document.querySelector('[data-act="close-sheet"]'); if (c) c.click(); P.go('home'); P.go('library'); P.resSheet('on53'); });
    await check('video sheet, before watching');
    await page.evaluate(() => window.__planner.resDoneSheet('on53', true));
    await check('video, back from it');
    await page.evaluate(() => document.querySelector('#layer [data-act="res-stick"][data-v="Yes"]').click());
    await check('video, lock it in with its cards');
    await page.evaluate(() => document.querySelector('#layer [data-act="vid-card-add"]').click());
    await check('video, a card in your own words');
    await page.evaluate(() => { document.querySelector('#vc-f').value = 'What should a learner know before an assessment, who tells them, and when is that agreed with the employer and the workplace mentor?'; document.querySelector('#vc-b').value = 'The criteria, the method, the date, time and place, what to prepare or bring, and how to appeal a decision.'; document.querySelector('#layer [data-act="vid-card-save"]').click(); });
    await check('video sheet, its cards and one of your own');
    await page.evaluate(() => document.querySelector('#layer [data-act="vid-cards-off"]').click());
    await check('video sheet, its cards taken out');
    await page.evaluate(() => { document.querySelector('#layer [data-act="vid-cards-on"]').click(); document.querySelector('#layer [data-act="vid-cards"]').click(); });
    await check('cards, from one video');
    await page.evaluate(() => document.querySelector('#screen [data-act="card-src"]').click());
    await check('cards, with the video a card came from');
    await ctx.close();
  }
  await browser.close();
  const uniq = [...new Set(problems)];
  console.log(`${n} screens on small phones with large text.`);
  console.log(uniq.length ? uniq.join('\n') + `\n${uniq.length} problem(s)` : 'BIGTEXT OK');
  process.exit(uniq.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILED', e); process.exit(1); });
