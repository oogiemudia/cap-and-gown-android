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
    await ctx.close();
  }
  await browser.close();
  const uniq = [...new Set(problems)];
  console.log(`${n} screens on small phones with large text.`);
  console.log(uniq.length ? uniq.join('\n') + `\n${uniq.length} problem(s)` : 'BIGTEXT OK');
  process.exit(uniq.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILED', e); process.exit(1); });
