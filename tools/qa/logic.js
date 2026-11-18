// Behaviour checks: the recommendations, the library, saved links, live updates and old data.
const { chromium, open, overflow, PAGE_NO: N } = require('./lib');
const SHOTS = process.env.SHOTS || '';
const { rich } = require('./seed');

const results = [];
const ok = (name, cond, detail) => { results.push([!!cond, name, cond ? '' : (detail === undefined ? '' : JSON.stringify(detail))]); };
const picksOf = (page) => page.evaluate(() => { const R = window.__planner.recommend(); return { budget: R.ctx.budget, free: R.ctx.free, total: R.total, energy: R.ctx.energy, study: { act: R.study.act, t: R.study.t, why: R.study.why }, picks: R.picks.map((p) => ({ id: p.it.id, kind: p.it.kind, t: p.t, ts: p.it.ts, m: p.it.m, why: p.why, extra: !!p.extra })), more: R.more.map((p) => p.it.id), heat: Object.keys(R.ctx.heat), n: R.scored.length, scored: R.scored.map((p) => [p.it.id, p.t, p.why.join(' ')]) }; });
const click = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; el.click(); return true; }, sel);

(async () => {
  const browser = await chromium.launch();

  // ---------- A. a brand new phone ----------
  {
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: null });
    const R = await picksOf(page);
    ok('fresh: has a study step and up to three picks', R.study && R.picks.length >= 2 && R.picks.length <= 3, R);
    ok('fresh: one pick of each kind at most', new Set(R.picks.map((p) => (p.kind === 'Watch' || p.kind === 'Listen' ? p.kind : 'Read'))).size === R.picks.length, R.picks);
    ok('fresh: every pick says why', R.picks.every((p) => p.why.length >= 1 && p.why.every((w) => w.length > 10)), R.picks);
    ok('fresh: picks point at what is due soon', R.picks.some((p) => R.heat.includes(p.t)), R);
    ok('fresh: page told the app it works', await page.evaluate((n) => window.__calls.some((c) => c[0] === 'pageReady' && c[1] === n), N));
    ok('fresh: self-test passes and changes nothing', await page.evaluate(() => { const P = window.__planner; const a = JSON.stringify(P.state); const r0 = P.route; const good = P.selfTest(); return good && JSON.stringify(P.state) === a && P.route === r0; }));
    ok('fresh: page number read from the head', N > 0 && await page.evaluate(() => window.__planner.PAGE) === N);
    const cat = await page.evaluate(() => window.__planner.catalogue().map((x) => ({ id: x.id, kind: x.kind, link: x.link || '', t: x.t, ts: x.ts, m: x.m, title: x.title })));
    const ids = cat.map((x) => x.id);
    ok('catalogue: ids are unique', new Set(ids).size === ids.length, ids.filter((x, i) => ids.indexOf(x) !== i));
    const topics = await page.evaluate(() => Object.keys(window.__planner.TOPICS));
    ok('catalogue: every topic is a real topic', cat.every((x) => x.ts.every((t) => topics.includes(t))), cat.filter((x) => !x.ts.every((t) => topics.includes(t))));
    ok('catalogue: every online link is https and unique', (() => { const links = cat.filter((x) => x.link).map((x) => x.link); return links.every((l) => /^https:\/\/[^\s"<>]+$/.test(l)) && new Set(links).size === links.length; })());
    ok('catalogue: every topic has at least two online items', topics.every((t) => cat.filter((x) => x.link && x.ts.includes(t)).length >= 2), topics.map((t) => [t, cat.filter((x) => x.link && x.ts.includes(t)).length]));
    ok('catalogue: every topic has something to watch or listen to', topics.every((t) => cat.some((x) => (x.kind === 'Watch' || x.kind === 'Listen') && x.ts.includes(t))), topics.filter((t) => !cat.some((x) => (x.kind === 'Watch' || x.kind === 'Listen') && x.ts.includes(t))));
    ok('catalogue: minutes are sensible', cat.every((x) => x.m >= 1 && x.m <= 240));
    const hubs = await page.evaluate(() => window.__planner.HUBS.map((h) => h.url));
    ok('hubs: the Padlet and Ann Gravells links are the ones asked for', hubs[0] === 'https://padlet.com/ltegroup/ite-reading-website-and-resources-list-tagxk7ayowk78d6l' && hubs[1] === 'https://www.anngravells.com/information/reading-list', hubs);

    // open the Padlet from the Library: it must go to the in-app reader
    await page.evaluate(() => window.__planner.go('library'));
    await click(page, '[data-act="hub"][data-id="hub-padlet"]');
    ok('library: Padlet opens in the in-app reader', await page.evaluate(() => window.__calls.some((c) => c[0] === 'openReader' && c[1].startsWith('https://padlet.com/ltegroup/'))));
    await click(page, '[data-act="hub"][data-id="hub-gravells"]');
    ok('library: Ann Gravells list opens in the in-app reader', await page.evaluate(() => window.__calls.some((c) => c[0] === 'openReader' && c[1] === 'https://www.anngravells.com/information/reading-list')));
    // a PDF goes to the browser, not the reader
    await page.evaluate(() => { window.__calls.length = 0; window.__opened.length = 0; window.__planner.sub.lf = 'All'; window.__planner.sub.q = 'IQA cycle'; window.__planner.go('library'); });
    await click(page, '#screen [data-act="res"][data-id="on38"]');
    await click(page, '#layer [data-act="res-open"]');
    ok('library: a PDF opens outside the reader', await page.evaluate(() => window.__opened.length === 1 && /\.pdf$/.test(window.__opened[0]) && !window.__calls.some((c) => c[0] === 'openReader')), await page.evaluate(() => [window.__opened, window.__calls]));

    // finish a pick: it leaves the list, study time and "what works" update
    await page.evaluate(() => { window.__planner.sub.q = ''; window.__planner.sub.stab = 'foryou'; window.__planner.go('study'); });
    const before = await picksOf(page);
    const target = before.picks[0];
    const studied0 = await page.evaluate(() => Object.values(window.__planner.state.study).reduce((a, b) => a + b, 0));
    await click(page, `#screen [data-act="res-open"][data-id="${target.id}"]`);
    ok('for you: Open marks it opened', await page.evaluate((id) => !!(window.__planner.state.res[id] || {}).open, target.id));
    ok('for you: opened card shows the nudge', await page.evaluate(() => /Opened today/.test(document.querySelector('#screen').textContent)));
    await click(page, `#screen [data-act="res-done"][data-id="${target.id}"]`);
    ok('for you: Done asks if it stuck', await page.evaluate(() => /Did it stick/.test((document.querySelector('#layer .sheet') || {}).textContent || '')));
    await click(page, '#layer [data-act="res-stick"][data-v="Yes"]');
    const after = await picksOf(page);
    ok('for you: a finished pick leaves the list', !after.picks.some((p) => p.id === target.id) && !after.more.includes(target.id), after.picks);
    ok('for you: study minutes went up by the length', await page.evaluate(([s0, m]) => Object.values(window.__planner.state.study).reduce((a, b) => a + b, 0) === s0 + m, [studied0, target.m]));
    ok('for you: the kind of resource was rated', await page.evaluate((k) => { const f = window.__planner.state.formats[{ Read: 'Reading', Watch: 'Short video', Listen: 'Podcast', File: 'Reading' }[k]]; return f && f.n === 1 && f.yes === 1; }, target.kind));
    ok('for you: unchecked mastery is not invented by reading', await page.evaluate((t) => window.__planner.state.mastery[t] == null, target.t));
    ok('for you: the decision is in the log', await page.evaluate(() => /^Finished:/.test(window.__planner.state.log[0].what)));
    ok('for you: lock-it-in sheet offers a check', await page.evaluate(() => /Lock it in/.test((document.querySelector('#layer .sheet') || {}).textContent || '')));
    // the 3-question check
    const hasCheck = await click(page, '#layer [data-act="res-check"]');
    if (hasCheck) {
      ok('check: goes to a 3-question quiz', await page.evaluate(() => window.__planner.route === 'study' && /Question 1 of 3/.test(document.querySelector('#screen').textContent)));
      for (let i = 0; i < 3; i++) { await click(page, '#screen [data-act="ans"][data-id="0"]'); await click(page, '#screen [data-act="quiz-next"]'); }
      ok('check: finishes with results and a way back', await page.evaluate(() => /Quiz complete/.test(document.querySelector('#screen').textContent) && !!document.querySelector('#screen [data-act="fy-open"]')));
      ok('check: mastery is now set for that topic', await page.evaluate((ts) => ts.some((t) => window.__planner.state.mastery[t] != null), target.ts));
      await click(page, '#screen [data-act="fy-open"]');
      ok('check: back on For you', await page.evaluate(() => /For you/.test(document.querySelector('#screen .label').textContent)));
    } else ok('check: offered', false, target);
    // skip and undo
    const R2 = await picksOf(page);
    const skip = R2.picks[0];
    await click(page, `#screen [data-act="res-skip"][data-id="${skip.id}"]`);
    ok('for you: Not for me hides it', !(await picksOf(page)).picks.some((p) => p.id === skip.id));
    ok('for you: Not for me offers Undo', await click(page, '#toast [data-act="res-unskip"]'));
    ok('for you: Undo brings it back', (await picksOf(page)).picks.some((p) => p.id === skip.id) || (await picksOf(page)).more.includes(skip.id));
    // time chips
    await click(page, '#screen [data-act="fy-mins"][data-id="60"]');
    const R60 = await picksOf(page);
    ok('for you: 60 minutes fits more than 10', R60.budget === 60 && R60.total >= before.total, [R60.budget, R60.total, before.total]);
    await click(page, '#screen [data-act="fy-why"]');
    ok('for you: Why these explains itself', await page.evaluate(() => /Weakest topics/.test((document.querySelector('#layer .sheet') || {}).textContent || '') && /What sticks for you/.test(document.querySelector('#layer .sheet').textContent)));
    await click(page, '#layer [data-act="close-sheet"]');
    // the favourite star
    const fav = (await picksOf(page)).picks[0].id;
    await click(page, `#screen .rec [data-act="fav"][data-id="${fav}"]`);
    ok('for you: star adds a favourite', await page.evaluate((id) => window.__planner.state.favs[id] === true, fav));
    await page.evaluate(() => { window.__planner.sub.lf = 'Favourites'; window.__planner.sub.lt = ''; window.__planner.go('library'); });
    ok('library: Favourites filter shows it', await page.evaluate((id) => !!document.querySelector(`#screen [data-act="res"][data-id="${id}"]`), fav));
    await page.evaluate(() => { window.__planner.sub.lf = 'Done'; window.__planner.go('library'); });
    ok('library: Done filter shows the finished one', await page.evaluate((id) => !!document.querySelector(`#screen [data-act="res"][data-id="${id}"]`), target.id));
    // search keeps the caret and narrows
    await page.evaluate(() => { window.__planner.sub.lf = 'All'; window.__planner.go('library'); });
    await page.click('#libq');
    await page.keyboard.type('metacog', { delay: 5 });
    ok('library: search narrows and keeps focus', await page.evaluate(() => document.activeElement && document.activeElement.id === 'libq' && document.activeElement.value === 'metacog' && document.querySelectorAll('#screen [data-act="res"]').length >= 1 && document.querySelectorAll('#screen [data-act="res"]').length <= 4), await page.evaluate(() => [document.activeElement && document.activeElement.id, document.querySelectorAll('#screen [data-act="res"]').length]));
    await page.fill('#libq', 'zzzzqq');
    ok('library: no match is said plainly', await page.evaluate(() => /Nothing here yet/.test(document.querySelector('#screen').textContent)));
    await page.fill('#libq', '');
    await page.selectOption('#lib-topic', 'qa');
    ok('library: topic filter works', await page.evaluate(() => { const n = document.querySelectorAll('#screen [data-act="res"]').length; return n >= 2 && n <= 8; }));
    // add a link: the app guesses the kind and topic, and tidies the link
    await page.selectOption('#lib-topic', '');
    await click(page, '#appbar [data-act="lib-add"]');
    await page.fill('#l-title', 'Kotter 8 steps explained video');
    await page.fill('#l-link', 'youtu.be/abc123');
    ok('add: guesses Leading change and Video', await page.evaluate(() => document.querySelector('#l-topic').value === 'change' && document.querySelector('#l-kind').value === 'Watch'), await page.evaluate(() => [document.querySelector('#l-topic').value, document.querySelector('#l-kind').value]));
    await click(page, '#layer [data-act="lib-save"]');
    ok('add: saved with https and its kind', await page.evaluate(() => { const u = window.__planner.state.library.find((x) => /Kotter/.test(x.title)); return u && u.link === 'https://youtu.be/abc123' && u.kind === 'Watch' && u.t === 'change'; }));
    await click(page, '#appbar [data-act="lib-add"]');
    await page.fill('#l-title', 'Same again');
    await page.fill('#l-link', 'https://youtu.be/abc123');
    await click(page, '#layer [data-act="lib-save"]');
    ok('add: the same link twice is refused', await page.evaluate(() => window.__planner.state.library.filter((x) => x.link === 'https://youtu.be/abc123').length === 1 && !!document.querySelector('#layer .sheet')));
    await page.fill('#l-link', 'javascript:alert(1)');
    await click(page, '#layer [data-act="lib-save"]');
    ok('add: a script link is refused', await page.evaluate(() => !window.__planner.state.library.some((x) => /^javascript/i.test(x.link || ''))));
    await page.fill('#l-link', '');
    await page.fill('#l-title', '<img src=x onerror="window.__xss=1"> note');
    await page.selectOption('#l-kind', 'Note');
    await click(page, '#layer [data-act="lib-save"]');
    await page.evaluate(() => { window.__planner.sub.lf = 'Mine'; window.__planner.go('library'); });
    await page.waitForTimeout(50);
    ok('add: a title with markup is shown as text, not run', await page.evaluate(() => !window.__xss && !document.querySelector('#screen img') && /onerror/.test(document.querySelector('#screen').textContent)));
    const mineId = await page.evaluate(() => window.__planner.state.library.find((x) => /Kotter/.test(x.title)).id);
    await click(page, `#screen [data-act="res"][data-id="${mineId}"]`);
    await page.selectOption('#le-topic', 'qa');
    ok('mine: topic can be changed', await page.evaluate((id) => { const u = window.__planner.state.library.find((x) => x.id === id); return u.t === 'qa' && u.c === 'assess'; }, mineId));
    await click(page, `#layer [data-act="lib-del"]`);
    ok('mine: delete removes it', await page.evaluate((id) => !window.__planner.state.library.some((x) => x.id === id), mineId));
    // home card and tutor text
    await page.evaluate(() => window.__planner.go('home'));
    ok('home: has the For you card', await page.evaluate(() => Array.from(document.querySelectorAll('#screen .label')).some((x) => /^For you/.test(x.textContent))));
    ok('tutor: the week text names weak topics and picks', await page.evaluate(() => { const t = window.__planner.weekText(); return /Weakest topics in my quizzes:/.test(t) && /Suggested from my library tonight:/.test(t) && /My question: $/.test(t); }));
    ok('fresh: no script errors', errors.length === 0, errors);
    ok('fresh: state survives a reload', await (async () => { const a = await page.evaluate(() => JSON.stringify(window.__planner.state.res)); await page.reload(); await page.waitForSelector('#nav button'); const b = await page.evaluate(() => JSON.stringify(window.__planner.state.res)); return a === b && a.length > 10; })());
    await ctx.close();
  }

  // ---------- B. an existing phone's data (old shape) ----------
  {
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: rich });
    const st = await page.evaluate(() => ({ res: window.__planner.state.res, lib: window.__planner.catalogue().filter((x) => x.src === 'mine').map((x) => [x.id, x.kind, x.t]), mast: window.__planner.state.mastery.retrieval, done: Object.keys(window.__planner.state.done).length }));
    ok('old data: carries over untouched', st.mast === 42 && st.done === 5 && JSON.stringify(st.res) === '{}', st);
    ok('old data: saved links get a kind, and an old topic is refiled', JSON.stringify(st.lib) === JSON.stringify([['u1', 'Read', 'retrieval'], ['u2', 'Note', 'vacsr'], ['u3', 'File', 'reflect']]), st.lib);
    const R = await picksOf(page);
    ok('old data: the weakest checked topic with slips leads', R.study.t === 'vacsr' || R.study.t === 'retrieval' || R.study.act === 'cards', R.study);
    ok('old data: your own saved link leads its topic and says why', (() => { const mine = R.scored.find((x) => x[0] === 'u1'); const firstOnTopic = R.scored.find((x) => x[1] === 'retrieval'); return mine && firstOnTopic[0] === 'u1' && /From the pages you saved|slipped/.test(mine[2]); })(), R.scored.filter((x) => x[1] === 'retrieval'));
    ok('old data: your own note or file without a link is never recommended', !R.scored.some((x) => x[0] === 'u2' || x[0] === 'u3'));
    ok('old data: the three picks are not all for one deadline or topic', new Set(R.picks.map((p) => p.t)).size >= 2, R.picks.map((p) => [p.id, p.t]));
    ok('old data: a strong topic is not what gets picked', !R.picks.some((p) => p.t === 'methods' || p.t === 'memory'), R.picks);
    // low energy changes the mix
    await page.evaluate(() => { window.__planner.state.energy['2026-11-18'] = 'low'; });
    const low = await picksOf(page);
    ok('low energy: the list is short', low.budget <= 20, low.budget);
    ok('low energy: listening or watching comes first', low.picks.length && low.picks[0].kind !== 'Read' && low.picks[0].kind !== 'File', low.picks);
    await page.evaluate(() => { window.__planner.state.energy['2026-11-18'] = 'high'; });
    const high = await picksOf(page);
    ok('good energy: more time than low', high.budget >= low.budget, [high.budget, low.budget]);
    ok('old data: no script errors', errors.length === 0, errors);
    await ctx.close();
  }

  // ---------- C. broken or odd saved data ----------
  {
    const bad = JSON.parse(JSON.stringify(rich));
    bad.res = ['not', 'an', 'object']; bad.fy = 'yesterday'; bad.library = [null, 5, { id: 'u9', title: 'Good one', type: 'Link', link: 'https://example.org/a', t: 'afl', c: 'pgce' }, { title: 'no id' }]; bad.formats = null; bad.mistakes = 'none'; bad.favs = [];
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: bad });
    ok('odd data: loads and repairs itself', await page.evaluate(() => { const s = window.__planner.state; return !Array.isArray(s.res) && s.fy === null || (s.fy && typeof s.fy === 'object'); }) && await page.evaluate(() => window.__planner.state.library.length === 1));
    for (const r of ['home', 'study', 'library', 'progress', 'settings']) await page.evaluate((x) => window.__planner.go(x), r);
    ok('odd data: no script errors', errors.length === 0, errors);
    await ctx.close();
  }

  // ---------- D. dates: what is due moves the picks ----------
  for (const [when, expect] of [['2026-11-27T19:30:00', ['records', 'decisions', 'planning']], ['2026-12-05T10:00:00', ['records', 'law', 'standards', 'reflect', 'ofsted']], ['2027-02-13T19:30:00', ['qa', 'decisions']], ['2027-08-02T19:30:00', null]]) {
    const { ctx, page, errors } = await open(browser, { app: true, now: when, state: null });
    const R = await picksOf(page);
    if (expect) ok(`dates ${when.slice(0, 10)}: picks follow what is due (${expect.join(', ')})`, R.picks.some((p) => expect.includes(p.t)) && expect.some((t) => R.heat.includes(t)), { picks: R.picks.map((p) => [p.id, p.t]), heat: R.heat });
    else ok(`dates ${when.slice(0, 10)}: still recommends when nothing is due`, R.picks.length >= 2 && R.heat.length === 0, R);
    await page.evaluate(() => { window.__planner.sub.stab = 'foryou'; window.__planner.go('study'); });
    ok(`dates ${when.slice(0, 10)}: wording matches the day`, await page.evaluate(() => { const d = new Date(window.__NOW).getDay(); const t = document.querySelector('#screen h3').textContent; return (d === 0 || d === 6) ? /today$/.test(t) : /tonight$/.test(t); }));
    ok(`dates ${when.slice(0, 10)}: no script errors`, errors.length === 0, errors);
    await ctx.close();
  }

  // ---------- E. pages saved in the reader ----------
  {
    const savedLinks = [
      { url: 'https://evidenceintoaction.podbean.com/e/some-new-episode-on-feedback/', title: 'Feedback: what works | Evidence into Action podcast' },
      { url: 'https://www.learningscientists.org/blog/2019/11/28-1', title: 'Six Strategies' },
      { url: 'http://insecure.example.com/x', title: 'Not secure' },
      { url: 'https://example.org/page', title: '<script>window.__xss2=1</script>Internal quality assurance sampling plan' },
      { url: 'https://example.org/unknown', title: 'Something with no clue' }
    ];
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: null, savedLinks });
    const lib = await page.evaluate(() => window.__planner.state.library.map((x) => ({ kind: x.kind, t: x.t, link: x.link, meta: x.meta })));
    ok('saved: three new pages filed, one known one starred, one insecure one dropped', lib.length === 3 && await page.evaluate(() => window.__planner.state.favs.on01 === true), lib);
    ok('saved: a podcast about feedback is filed as Listen under feedback', lib[0].kind === 'Listen' && lib[0].t === 'afl', lib[0]);
    ok('saved: a quality assurance page is filed under quality assurance', lib[1].t === 'qa', lib[1]);
    ok('saved: a page with no clue still gets a topic', !!lib[2].t, lib[2]);
    await page.evaluate(() => { window.__planner.sub.lf = 'Mine'; window.__planner.go('library'); });
    ok('saved: titles are shown as text, not run', await page.evaluate(() => !window.__xss2 && !document.querySelector('#screen script')));
    ok('saved: taken once only', await page.evaluate(() => window.__planner.takeSavedLinks() === 0));
    ok('saved: no script errors', errors.length === 0, errors);
    await ctx.close();
  }

  // ---------- F. live updates ----------
  {
    // a newer page is waiting at start: shown straight away, once
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: null, live: { waiting: N + 1, bundled: N } });
    await page.waitForTimeout(4400);
    ok('live: a waiting update is shown at start', await page.evaluate(() => window.__calls.filter((c) => c[0] === 'applyUpdate').length === 1));
    await page.reload(); await page.waitForSelector('#nav button'); await page.waitForTimeout(4400);
    ok('live: it does not loop if the newer page does not come up', await page.evaluate(() => window.__calls.filter((c) => c[0] === 'applyUpdate').length === 0));
    ok('live: no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    // the note that an update was tried must survive the reload even when session storage forgets it
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: null, live: { waiting: N + 1, bundled: N } });
    await page.waitForTimeout(4400);
    await page.evaluate(() => sessionStorage.removeItem('capgown-applied'));
    await page.reload(); await page.waitForSelector('#nav button'); await page.waitForTimeout(4400);
    ok('live: it does not loop even when session storage forgets', await page.evaluate(() => window.__calls.filter((c) => c[0] === 'applyUpdate').length === 0));
    await ctx.close();
  }
  {
    // a tap just before the update arrives: it is offered, not forced under your finger
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: null, live: { waiting: N + 1, bundled: N } });
    await page.waitForTimeout(2500);
    await page.evaluate(() => document.querySelector('#nav button').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await page.waitForTimeout(2200);
    ok('live: no reload under your finger just after a tap', await page.evaluate(() => !window.__calls.some((c) => c[0] === 'applyUpdate') && !document.querySelector('#toast').hidden && !!document.querySelector('#toast [data-act="live-apply"]')));
    ok('live: no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    // two copies of the saved data, the phone's and the app's: the one written last wins
    const older = { settings: {}, updatedAt: 1000, done: { a: 1 } };
    const newer = { settings: {}, updatedAt: 2000, done: { a: 1, b: 2 } };
    let o = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: older, nativeState: JSON.stringify(newer) });
    ok("data: the app's copy is used when it was written last", await o.page.evaluate(() => !!window.__planner.state.done.b));
    await o.ctx.close();
    o = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: newer, nativeState: JSON.stringify(older) });
    ok("data: the phone's copy is used when it was written last", await o.page.evaluate(() => !!window.__planner.state.done.b));
    await o.ctx.close();
    o = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: newer, nativeState: '{broken' });
    ok("data: a broken app copy is ignored", await o.page.evaluate(() => !!window.__planner.state.done.b) && o.errors.length === 0, o.errors);
    await o.ctx.close();
  }
  {
    // mid-quiz: offer it instead of interrupting
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: null, live: { waiting: 0, bundled: N } });
    await page.evaluate(() => { window.__planner.sub.stab = 'quiz'; window.__planner.go('study'); });
    await click(page, '#screen [data-act="quiz-start"]');
    await page.evaluate((n) => window.__capgownUpdateReady(n), N + 1);
    ok('live: no interruption in the middle of a quiz', await page.evaluate(() => !window.__calls.some((c) => c[0] === 'applyUpdate') && !document.querySelector('#toast').hidden && !!document.querySelector('#toast [data-act="live-apply"]')));
    await click(page, '#toast [data-act="live-apply"]');
    ok('live: Show it now applies it', await page.evaluate(() => window.__calls.some((c) => c[0] === 'applyUpdate')));
    await page.evaluate(() => window.__planner.go('settings'));
    ok('live: Settings shows the version and a check button', await page.evaluate((n) => document.querySelector('#updates').textContent.includes('This is version ' + n) && !!document.querySelector('#updates [data-act="live-check"]') && !document.querySelector('#updates [data-act="live-revert-ask"]'), N));
    await click(page, '#updates [data-act="live-check"]');
    ok('live: Check asks the app', await page.evaluate(() => window.__calls.some((c) => c[0] === 'checkUpdate') && /Checking/.test(document.querySelector('#updates').textContent)));
    await page.evaluate(() => window.__capgownUpdateResult('none', 0));
    ok('live: "none" says you have the latest', await page.evaluate(() => /You have the latest version/.test(document.querySelector('#updates').textContent)));
    await page.evaluate(() => window.__capgownUpdateResult('error', 0));
    ok('live: an error says so plainly', await page.evaluate(() => /Could not check/.test(document.querySelector('#updates').textContent)));
    await click(page, '#updates [data-act="live-auto"]');
    ok('live: the switch turns automatic updates off', await page.evaluate(() => window.__live.auto === false && document.querySelector('#updates [role="switch"]').getAttribute('aria-checked') === 'false'));
    ok('live: no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    // running a downloaded page: the way back is offered and confirmed
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: null, live: { waiting: 0, bundled: N - 1, page: N } });
    await page.evaluate(() => window.__planner.go('settings'));
    ok('live: a downloaded page offers the way back', await page.evaluate(() => /newer than the one that came with the app/.test(document.querySelector('#updates').textContent)));
    await click(page, '#updates [data-act="live-revert-ask"]');
    ok('live: going back asks first', await page.evaluate(() => !window.__calls.some((c) => c[0] === 'revertUpdate') && !!document.querySelector('#updates [data-act="live-revert"]')));
    await click(page, '#updates [data-act="live-revert"]');
    ok('live: going back tells the app', await page.evaluate(() => window.__calls.some((c) => c[0] === 'revertUpdate')));
    ok('live: no script errors', errors.length === 0, errors);
    await ctx.close();
  }

  // ---------- G. an app without the new features, and a plain browser ----------
  {
    const { ctx, page, errors } = await open(browser, { app: true, oldApp: true, now: '2026-11-18T19:30:00', state: null });
    await page.evaluate(() => window.__planner.go('library'));
    await click(page, '[data-act="hub"][data-id="hub-padlet"]');
    ok('older app: links still open (outside)', await page.evaluate(() => window.__opened.length === 1 && window.__opened[0].startsWith('https://padlet.com/')));
    await page.evaluate(() => window.__planner.go('settings'));
    ok('older app: no Updates card', await page.evaluate(() => !document.querySelector('#updates')));
    ok('older app: no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await open(browser, { app: false, now: '2026-11-18T19:30:00', state: null });
    await page.evaluate(() => { window.__planner.sub.stab = 'foryou'; window.__planner.go('study'); });
    const id = (await picksOf(page)).picks[0].id;
    await click(page, `#screen [data-act="res-open"][data-id="${id}"]`);
    ok('browser: a pick opens in a new tab', await page.evaluate(() => window.__opened.length === 1 && /^https:\/\//.test(window.__opened[0])));
    ok('browser: no script errors', errors.length === 0, errors);
    await ctx.close();
  }

  // ---------- H. looks: dark, dyslexia display, small and large phones ----------
  for (const look of [{ name: 'dark', dark: true, width: 360 }, { name: 'dys', width: 360, dys: true }, { name: 'wide', width: 430 }, { name: 'narrow', width: 320 }]) {
    const state = JSON.parse(JSON.stringify(rich));
    if (look.dys) state.settings.dys = true;
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state, dark: look.dark, width: look.width, dpr: 2 });
    const bad = [];
    for (const [r, sub] of [['study', { stab: 'foryou' }], ['library', {}], ['home', {}], ['settings', {}], ['learn', { topic: 'afl', fmt: 'Short video' }]]) {
      await page.evaluate(([x, s]) => { Object.assign(window.__planner.sub, s); window.__planner.go(x); }, [r, sub]);
      const ov = await overflow(page);
      if (ov.length) bad.push(`${r}: ${ov.join(' | ')}`);
      if (SHOTS && (r === 'study' || r === 'library')) await page.screenshot({ path: require('path').join(SHOTS, `${look.name}-${r}.png`) });
    }
    await page.evaluate(() => { window.__planner.sub.stab = 'foryou'; window.__planner.go('study'); });
    await click(page, '#screen [data-act="fy-why"]');
    const ov = await overflow(page);
    if (ov.length) bad.push(`why sheet: ${ov.join(' | ')}`);
    ok(`looks ${look.name} ${look.width}px: nothing off the side`, bad.length === 0, bad);
    ok(`looks ${look.name}: no script errors`, errors.length === 0, errors);
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r[0]);
  results.forEach((r) => console.log(`${r[0] ? 'PASS' : 'FAIL'}  ${r[1]}${r[2] ? '\n      ' + r[2].slice(0, 700) : ''}`));
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILED', e); process.exit(2); });
