// A small phone, the phone's text size turned up (Android enlarges the app's text to match), and the
// dyslexia-friendly font: nothing may run off the edge of the screen.
const { chromium, open, overflow } = require('./lib');
const { rich } = require('./seed');
const ROUTES = ['home', 'plan', 'study', 'portfolio', 'progress', 'more', 'courses', 'learn', 'library', 'terms', 'goals', 'log', 'settings', 'about', 'deadlines', 'add', 'paper', 'voice', 'coach', 'module', 'assessment'];
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
    // Module 2: the list, a week at each step (answers picked, a moved date, notes typed), the longest titles,
    // the weeks with no fixed time, and its two sheets
    await page.evaluate(() => { document.querySelector('[data-act="close-sheet"]').click(); const P = window.__planner; P.go('home'); P.sub.mw = null; P.go('module'); });
    await check('module list');
    for (const [wn, stp] of [[11, 'learn'], [11, 'check'], [11, 'ask'], [11, 'after'], [18, 'learn'], [18, 'check'], [4, 'ask'], [6, 'check'], [32, 'learn'], [33, 'after'], [34, 'learn']]) {
      await page.evaluate(([num, s]) => {
        const P = window.__planner; P.go('home'); P.sub.mw = num; P.sub.ms = s; P.go('module');
        if (s === 'check') { P.M2_BY[num].check.forEach((c, i) => { const b = document.querySelector(`#screen [data-act="m2-ans"][data-i="${i}"][data-o="${i === 0 ? (c[2] + 1) % 3 : c[2]}"]`); if (b) b.click(); }); const f = document.querySelector('#screen [data-act="m2-conf"][data-n="1"]'); if (f) f.click(); }
        if (s === 'ask') { const u = P.m2Set(num); u.a[0] = true; u.own = 'How much of the theory belongs on the slides, and how much in what I say?'; P.go('home'); P.go('module'); }
        if (s === 'after') { const u = P.m2Set(num); u.d = '2026-12-03'; u.p = '2026-11-18'; u.took = 'The strongest exemplar weighed its own limits on every slide.'; u.fog = 'I am not sure how much theory the first outcome needs.'; u.pn = 'Tried a five-question round with the Thursday group.'; P.go('home'); P.go('module'); }
      }, [wn, stp]);
      await check(`module week ${wn} ${stp}`);
    }
    await page.evaluate(() => { const P = window.__planner; delete P.state.m2.w[11].d; delete P.state.m2.w[33]; P.go('home'); P.sub.mw = null; P.go('module'); });
    await check('module list, with weeks revised and tried');
    await page.evaluate(() => document.querySelector('#screen [data-act="m2-ladder"]').click());
    await check('module ladder sheet');
    await page.evaluate(() => { document.querySelector('[data-act="close-sheet"]').click(); document.querySelector('#screen [data-act="m2-how"]').click(); });
    await check('module lessons sheet');
    await page.evaluate(() => { document.querySelector('[data-act="close-sheet"]').click(); const P = window.__planner; P.sub.stab = 'cards'; P.sub.cardSrc = 'm2w11'; P.go('study'); });
    await check('review cards from a Module 2 week');
    await page.evaluate(() => { const P = window.__planner; P.sub.cardSrc = null; P.go('home'); });
    await check('home with the class card');
    // Assessment: the list before and after the early plan is switched on (with its list of moves open), and each
    // of the four pages, Module 2 with every outcome rated and a tick
    await page.evaluate(() => { const P = window.__planner; delete P.state.ax.early; delete P.state.ax.since; P.go('home'); });
    await check('home with the early plan card');
    await page.evaluate(() => { const P = window.__planner; P.sub.ax = null; P.go('assessment'); document.querySelector('#ax-early details').open = true; });
    await check('assessment list, plan offered');
    await page.evaluate(() => { document.querySelector('#ax-early [data-act="ax-early-on"]').click(); document.querySelector('#ax-early details').open = true; });
    await check('assessment list, plan on');
    for (const id of ['m2', 'm3', 'wb', 'ev']) {
      await page.evaluate((x) => { const P = window.__planner; P.go('home'); P.sub.ax = x; if (x === 'm2') { P.state.ax.rate = { 1: 3, 2: 4, 3: 2, 4: 1 }; P.state.ax.must['m2-a'] = true; P.state.ax.must['m2-g'] = true; } P.go('assessment'); }, id);
      await check('assessment ' + id);
    }
    await page.evaluate(() => { const P = window.__planner; P.sub.ax = null; P.state.ax.early = false; delete P.state.ax.since; P.go('log'); });
    await check('how it adapts, with the early plan entry');
    await page.evaluate(() => window.__planner.go('home'));
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
    // the app's own video player: carry on from where you stopped, the sheet after a video ends, and the For you card
    await page.evaluate(() => { const P = window.__planner; P.go('home'); P.go('library'); P.state.res.on54 = { open: Date.parse('2026-11-18T19:00:00'), n: 1, pos: 4295, len: 5400 }; P.resSheet('on54'); });
    await check('video sheet, carry on from where you stopped');
    await page.evaluate(() => { document.querySelector('[data-act="close-sheet"]').click(); window.__videoLeft = JSON.stringify({ id: 'on55', v: 'x', t: 600, d: 600, ended: true, page: false }); window.__planner.videoTaken(); });
    await check('video, watched to the end in the player');
    const carry = await page.evaluate(() => {
      const P = window.__planner; document.querySelector('[data-act="close-sheet"]').click();
      // hide the videos the player does not take (other sites, playlists) until the video pick is a YouTube lesson
      let w = null;
      for (let i = 0; i < 20; i++) { w = P.recommend().picks.find((x) => x.it.kind === 'Watch'); if (!w || P.playsHere(w.it)) break; (P.state.res[w.it.id] = P.state.res[w.it.id] || {}).skip = Date.parse('2026-11-18T19:00:00'); }
      if (w) P.state.res[w.it.id] = { open: Date.parse('2026-11-18T19:10:00'), n: 1, pos: 515, len: 590 };
      P.go('home'); P.sub.stab = 'foryou'; P.go('study');
      const b = w && document.querySelector(`#screen .card.rec [data-act="res-open"][data-id="${w.it.id}"]`);
      return b ? b.closest('.card').textContent : '';
    });
    if (!/Carry on at 8:35/.test(carry) || !/Watch it to the end and the app marks it done/.test(carry)) problems.push(`${where}: the For you card of a video to carry on with is not showing (${carry.slice(0, 120)})`);
    await check('For you, a video to carry on with');
    // the app before it had its own player: the sheet says what the newest app adds
    await page.evaluate(() => { const P = window.__planner; window.__keepPlay = window.AndroidApp.videoPlay; delete window.AndroidApp.videoPlay; P.go('home'); P.go('library'); P.resSheet('on56'); });
    await check('video sheet, the app before its own player');
    await page.evaluate(() => { window.AndroidApp.videoPlay = window.__keepPlay; document.querySelector('[data-act="close-sheet"]').click(); });
    // an earlier week's note that is one long unbroken word (a pasted link, say) wraps and does not push the screen sideways
    await page.evaluate(() => { const P = window.__planner; P.saveReflection('2026-11-02', 'https://example.org/' + 'x'.repeat(300), ['Confident', 'Stuck'], 'same'); P.go('home'); P.go('goals'); });
    await check('goals, an earlier week with one long unbroken note');
    await ctx.close();
  }
  await browser.close();
  const uniq = [...new Set(problems)];
  console.log(`${n} screens on small phones with large text.`);
  console.log(uniq.length ? uniq.join('\n') + `\n${uniq.length} problem(s)` : 'BIGTEXT OK');
  process.exit(uniq.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILED', e); process.exit(1); });
