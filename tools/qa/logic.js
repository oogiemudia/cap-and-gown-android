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
    // the course Padlet's items are in the library, filterable, and say where they come from
    const pad = await page.evaluate(() => { const P = window.__planner; const on = P.ONLINE.filter((o) => o.p); return { n: on.length, ok: on.every((o) => o.kind && o.t.every((t) => P.TOPICS[t]) && o.note), ids: on.map((o) => o.id) }; });
    ok('padlet: at least 100 of its items are in the library, each with topics and a note', pad.n >= 100 && pad.ok, pad.n);
    await page.evaluate(() => { window.__planner.sub.lf = 'Padlet'; window.__planner.sub.q = ''; window.__planner.go('library'); });
    ok('padlet: the Padlet filter shows exactly its items', await page.evaluate((n) => document.querySelectorAll('#screen .card .list [data-act="res"]').length === n, pad.n));
    await click(page, '#screen [data-act="res"][data-id="pd01"]');
    ok('padlet: a library book says it needs the college sign-in', await page.evaluate(() => /On your course Padlet\. A book in the college library/.test((document.querySelector('#layer .sheet') || {}).textContent || '')));
    await page.evaluate(() => { const c = document.querySelector('[data-act="close-sheet"]'); if (c) c.click(); window.__planner.sub.lf = 'All'; window.__planner.sub.q = 'keeping children safe'; window.__planner.go('library'); });
    ok('padlet: search finds Keeping children safe in education', await page.evaluate(() => /Keeping children safe in education/.test(document.querySelector('#screen').textContent)));
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

  // ---------- I. Listen and Speak ----------
  const tick = (page) => page.evaluate(() => new Promise((r) => setTimeout(r, 30)));
  const calls = (page, name) => page.evaluate((n) => window.__calls.filter((c) => c[0] === n).map((c) => c.slice(1)), name);
  const live = (page, box) => page.evaluate((b) => { const ta = document.querySelector(b); const bar = ta && ta.nextElementSibling; const l = bar && bar.querySelector('.vlive'); return l ? l.textContent : null; }, box);
  const speakBtn = (box) => `${box} + .vbar [data-act="dictate"]`;
  const voiceState = () => { const st = JSON.parse(JSON.stringify(rich)); st.library.push({ id: 'u9', type: 'Note', kind: 'Note', title: 'My thoughts on feedback', link: '', c: 'pgce', t: 'afl', meta: 'Yours', note: 'Feedback works when learners act on it.', text: '' }); return st; };
  {
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: voiceState(), width: 320 });
    // the screen and its tile
    await page.evaluate(() => window.__planner.go('more'));
    await click(page, '#screen [data-go="voice"]');
    ok('voice: More has a Listen & speak tile that opens the screen', await page.evaluate(() => window.__planner.route === 'voice' && /Listen/.test(document.querySelector('#appbar h2').textContent) && !!document.querySelector('#v-pad')));
    ok('voice: no "install the newest app" notice in the new app', await page.evaluate(() => !document.querySelector('#screen [data-act="get-app"]')));

    // Listen to a lesson
    await page.evaluate(() => { window.__planner.sub.topic = 'afl'; window.__planner.go('learn'); });
    await click(page, '#screen [data-act="listen-lesson"]');
    await tick(page);
    const lesson = await page.evaluate(() => ({ text: window.__lastListen, want: window.__planner.lessonText('afl'), name: window.__planner.TOPICS.afl.name, sum: window.__planner.LESSONS.afl.sum, steps: window.__planner.LESSONS.afl.steps.length }));
    ok('listen: a lesson is read in full (name, summary and every step)', lesson.text === lesson.want && lesson.text.startsWith(lesson.name) && lesson.text.includes(lesson.sum) && lesson.text.split('\n').length === lesson.steps + 2, lesson);
    ok('listen: the phone is asked to read it under the topic name', (await calls(page, 'listenStart')).some((c) => c[0] === lesson.name));
    const bar = () => page.evaluate(() => { const p = document.querySelector('#player'); const fab = document.querySelector('#fab').getBoundingClientRect(); const pr = p.getBoundingClientRect(); return { hidden: p.hidden, on: document.body.classList.contains('listening'), text: p.textContent, toggle: (p.querySelector('[data-act="pl-toggle"]') || { getAttribute: () => '' }).getAttribute('aria-label'), fabClear: fab.bottom <= pr.top + 1, navBelow: document.querySelector('#nav').getBoundingClientRect().top >= pr.bottom - 1 }; });
    let b = await bar();
    ok('listen: the player bar shows, with the title and the place', !b.hidden && b.on && b.text.includes(lesson.name) && /1 of \d+/.test(b.text) && b.toggle === 'Pause', b);
    ok('listen: Ask tutor sits above the bar and the tabs below it', b.fabClear && b.navBelow, b);
    ok('listen: nothing off the side with the bar showing (320px)', (await overflow(page)).length === 0, await overflow(page));
    await click(page, '#player [data-act="pl-toggle"]'); await tick(page);
    b = await bar();
    ok('listen: Pause pauses and the button becomes Play', (await calls(page, 'listenPause')).length === 1 && b.toggle === 'Play' && !b.hidden, b);
    await click(page, '#player [data-act="pl-toggle"]'); await tick(page);
    ok('listen: Play carries on', (await calls(page, 'listenResume')).length === 1 && (await bar()).toggle === 'Pause');
    await click(page, '#player [data-act="pl-next"]'); await tick(page);
    ok('listen: Forward moves on a part', /2 of \d+/.test((await bar()).text), (await bar()).text);
    await click(page, '#player [data-act="pl-back"]'); await tick(page);
    ok('listen: Back goes back a part', /1 of \d+/.test((await bar()).text));
    await click(page, '#player [data-act="pl-rate"]'); await tick(page);
    ok('listen: the speed button steps up and is remembered', (await calls(page, 'listenRate')).some((c) => c[0] === 1.25) && /1\.25×/.test((await bar()).text) && await page.evaluate(() => window.__planner.state.settings.listenRate === 1.25));
    await page.evaluate(() => window.__listenEnd(true)); await tick(page);
    ok('listen: at the end the bar goes and it says Finished', (await bar()).hidden && !(await bar()).on && await page.evaluate(() => /Finished/.test(document.querySelector('#toast').textContent)));
    await click(page, '#screen [data-act="listen-lesson"]'); await tick(page);
    await page.evaluate(() => window.__listenEnd(false, 'The phone voice stopped.')); await tick(page);
    ok('listen: a problem with the voice is shown', await page.evaluate(() => /The phone voice stopped/.test(document.querySelector('#toast').textContent)));
    await click(page, '#screen [data-act="listen-lesson"]'); await tick(page);
    await click(page, '#player [data-act="pl-stop"]'); await tick(page);
    ok('listen: Stop stops and hides the bar', (await bar()).hidden && (await calls(page, 'listenStop')).length === 1);
    // the Audio summary button
    await page.evaluate(() => { window.__calls.length = 0; window.__planner.sub.topic = 'vacsr'; window.__planner.sub.fmt = 'Audio summary'; window.__planner.go('learn'); });
    await click(page, '#screen [data-act="speak"]'); await tick(page);
    ok('listen: Audio summary reads the summary', await page.evaluate(() => window.__lastListen === window.__planner.LESSONS.vacsr.sum));
    await click(page, '#player [data-act="pl-stop"]'); await tick(page);

    // the Library: web pages to read can be listened to; videos, PDFs and sign-in books cannot
    const canHear = (id) => page.evaluate((x) => { const P = window.__planner; const c = document.querySelector('[data-act="close-sheet"]'); if (c) c.click(); P.sub.lf = 'All'; P.sub.q = ''; P.sub.lt = ''; P.go('library'); const row = document.querySelector(`#screen [data-act="res"][data-id="${x}"]`); if (!row) return 'no row'; row.click(); return !!document.querySelector('#layer [data-act="res-listen"]'); }, id);
    const cat2 = await page.evaluate(() => window.__planner.catalogue().map((x) => ({ id: x.id, kind: x.kind, link: x.link || '', lib: x.lib, post: x.post, w: x.w, src: x.src })));
    const read = cat2.find((x) => x.src === 'online' && x.kind === 'Read' && !/\.pdf/i.test(x.link) && !x.lib && !x.post && !x.w);
    const watch = cat2.find((x) => x.kind === 'Watch' && x.link);
    ok('listen: a web page to read has Listen', await canHear(read.id) === true, read);
    await page.evaluate(() => { window.__calls.length = 0; });
    await click(page, '#layer [data-act="res-listen"]');
    ok('listen: it opens in the reader, reading aloud', (await calls(page, 'listenTo')).some((c) => c[0] === read.link) && await page.evaluate((id) => (window.__planner.state.res[id] || {}).n === 1, read.id));
    ok('listen: a video has no Listen', await canHear(watch.id) === false, watch);
    ok('listen: a PDF has no Listen', await canHear('on38') === false);
    ok('listen: a college library book has no Listen', await canHear('pd01') === false);
    ok('listen: my own note has Listen', await canHear('u9') === true);
    await click(page, '#layer [data-act="res-listen"]'); await tick(page);
    ok('listen: my own note is read', await page.evaluate(() => /Feedback works when learners act on it/.test(window.__lastListen)));
    await page.evaluate(() => window.AndroidApp.listenStop()); await tick(page);

    // Speak: every writing box has the bar
    await page.evaluate(() => { window.__planner.sub.ppage = 'obs'; window.__planner.go('portfolio'); });
    ok('speak: the observations page says what to do straight after one', await page.evaluate(() => /Just been observed\?/.test(document.querySelector('#screen').textContent)));
    await click(page, '#screen [data-act="obs"][data-id="2"]');
    ok('speak: every box on the observation has Speak and Listen under it', await page.evaluate(() => { const t = Array.from(document.querySelectorAll('#layer textarea')); return t.length === 3 && t[0].id === 'o-spoken' && t.every((x) => x.nextElementSibling && x.nextElementSibling.classList.contains('vbar') && x.nextElementSibling.querySelector('[data-act="dictate"]') && x.nextElementSibling.querySelector('[data-act="hear"]')); }));
    ok('speak: the observation sheet fits (320px)', (await overflow(page)).length === 0, await overflow(page));
    await page.evaluate(() => { window.__calls.length = 0; });
    await click(page, speakBtn('#o-spoken')); await tick(page);
    ok('speak: tapping Speak starts the microphone and says it is listening', (await calls(page, 'dictateStart')).length === 1 && /Listening/.test(await live(page, '#o-spoken')) && await page.evaluate((s) => { const x = document.querySelector(s); return x.classList.contains('on') && /Stop/.test(x.textContent) && x.getAttribute('aria-pressed') === 'true'; }, speakBtn('#o-spoken')));
    await page.evaluate(() => window.__say('i thought the starter', 'partial'));
    ok('speak: words show while they are still being heard', /i thought the starter/.test(await live(page, '#o-spoken')));
    await page.evaluate(() => window.__say('I thought the starter went well full stop the learners were engaged'));
    await page.evaluate(() => window.__say('new paragraph'));
    await page.evaluate(() => window.__say('next time I would shorten the plenary'));
    const said = await page.evaluate(() => document.querySelector('#o-spoken').value);
    ok('speak: speech becomes text with the date, sentences and paragraphs', said === '[Wed 18 Nov, 19:30]\nI thought the starter went well. The learners were engaged.\n\nNext time I would shorten the plenary.', said);
    await click(page, speakBtn('#o-spoken')); await tick(page);
    ok('speak: Stop stops, and the words are kept with the observation', (await calls(page, 'dictateStop')).length === 1 && /saved/.test(await live(page, '#o-spoken')) && await page.evaluate((v) => { const b = document.querySelector('#o-spoken + .vbar [data-act="dictate"]'); return !b.classList.contains('on') && /Speak/.test(b.textContent) && window.__planner.state.portfolio.obsInfo['2'].spoken === v && JSON.parse(window.AndroidApp.loadState()).portfolio.obsInfo['2'].spoken === v; }, said));
    // a second go later the same day adds to it under a new time
    await page.evaluate(() => { window.__NOW = '2026-11-18T21:05:00'; });
    await click(page, speakBtn('#o-spoken')); await tick(page);
    await page.evaluate(() => window.__say('one more thought about the questioning'));
    await page.evaluate(() => window.__dictateEnd('quiet')); await tick(page);
    const said2 = await page.evaluate(() => document.querySelector('#o-spoken').value);
    ok('speak: a later go adds under a new time, and a quiet stop says so', said2 === said + '\n\n[Wed 18 Nov, 21:05]\nOne more thought about the questioning.' && /went quiet/.test(await live(page, '#o-spoken')), [said2, await live(page, '#o-spoken')]);
    await page.evaluate(() => { window.__NOW = '2026-11-18T19:30:00'; });

    // build the reflection from the spoken notes
    await click(page, '#layer [data-act="obs-use-spoken"]');
    const refl = await page.evaluate(() => ({ v: document.querySelector('#o-refl').value, saved: window.__planner.state.portfolio.obsInfo['2'].refl, wc: document.querySelector('#o-wc').textContent }));
    ok('reflection: spoken notes become the first draft, without the times', refl.v === 'I thought the starter went well. The learners were engaged.\n\nNext time I would shorten the plenary.\n\nOne more thought about the questioning.' && refl.saved === refl.v && /^23 words/.test(refl.wc), refl);
    await click(page, '#layer [data-act="obs-use-spoken"]');
    ok('reflection: tapping again does not add them twice', await page.evaluate((v) => document.querySelector('#o-refl').value === v && /already in the reflection/.test(document.querySelector('#toast').textContent), refl.v));
    await page.evaluate(() => { const t = document.querySelector('#o-targets'); t.value = 'Stretch the higher learners'; t.dispatchEvent(new Event('input', { bubbles: true })); window.__calls.length = 0; });
    await click(page, '#layer [data-act="ask-shape"]');
    await page.waitForTimeout(400);
    const prompt = await page.evaluate(() => window.__lastInsert || '');
    ok('reflection: the tutor is given my spoken words and the targets, and told not to write it for me', /What I said straight after the observation/.test(prompt) && !/\[Wed 18 Nov/.test(prompt) && /I thought the starter went well\. The learners were engaged\./.test(prompt) && /Stretch the higher learners/.test(prompt) && /My reflection so far:/.test(prompt) && /Do not write the reflection for me\.$/.test(prompt), prompt);
    const whole = await page.evaluate(() => window.__planner.state.portfolio.obsInfo['2']);
    await page.evaluate(() => { const c = document.querySelector('[data-act="close-tutor"]'); if (c) c.click(); window.__planner.sub.ppage = 'obs'; window.__planner.go('portfolio'); });
    ok('reflection: the feedback targets are saved beside the spoken notes', whole.targets === 'Stretch the higher learners' && whole.spoken === said2, whole);

    // hear it back; listening pauses while speaking; switching box; a box that closes
    await click(page, '#screen [data-act="obs"][data-id="2"]');
    await page.evaluate(() => { window.__calls.length = 0; });
    await click(page, '#o-refl + .vbar [data-act="hear"]'); await tick(page);
    ok('listen: Listen under a box reads that box back', (await calls(page, 'listenStart')).some((c) => c[0] === 'Your reflection' && c[1] === refl.v));
    await click(page, speakBtn('#o-spoken')); await tick(page);
    ok('speak: reading pauses while the microphone is on', (await calls(page, 'listenPause')).length === 1 && await page.evaluate(() => window.__planner.DICT.on && window.__planner.LS.state === 'paused'));
    await click(page, speakBtn('#o-targets')); await tick(page); await tick(page);
    ok('speak: tapping Speak on another box moves the microphone there', await page.evaluate(() => window.__planner.DICT.on && window.__planner.DICT.sel === '#o-targets' && document.querySelector('#o-targets + .vbar [data-act="dictate"]').classList.contains('on') && !document.querySelector('#o-spoken + .vbar [data-act="dictate"]').classList.contains('on')) && (await calls(page, 'dictateStart')).length === 2);
    await page.evaluate(() => window.__say('and use more open questions'));
    ok('speak: words go into the box the microphone moved to', await page.evaluate(() => document.querySelector('#o-targets').value === 'Stretch the higher learners And use more open questions.' && window.__planner.state.portfolio.obsInfo['2'].targets === 'Stretch the higher learners And use more open questions.'), await page.evaluate(() => document.querySelector('#o-targets').value));
    await click(page, '#layer [data-act="close-sheet"]'); await tick(page);
    ok('speak: closing the sheet turns the microphone off', (await calls(page, 'dictateStop')).length === 2 && await page.evaluate(() => !window.__planner.DICT.on));
    await page.evaluate(() => window.__say('some late words'));
    ok('speak: words that arrive after the box has closed go to the notepad', await page.evaluate(() => window.__planner.state.voicePad === 'Some late words.'));
    await page.evaluate(() => window.AndroidApp.listenStop()); await tick(page);

    // the Listen & speak screen
    await page.evaluate(() => { window.__calls.length = 0; window.__planner.go('voice'); });
    ok('voice: the notepad shows what was kept', await page.evaluate(() => document.querySelector('#v-pad').value === 'Some late words.'));
    ok('voice: the screen fits (320px)', (await overflow(page)).length === 0, await overflow(page));
    await click(page, '#screen [data-act="v-rate"][data-id="1.5"]'); await tick(page);
    ok('voice: reading speed is set and shown', (await calls(page, 'listenRate')).some((c) => c[0] === 1.5) && await page.evaluate(() => document.querySelector('[data-act="v-rate"][data-id="1.5"]').getAttribute('aria-pressed') === 'true' && document.querySelector('[data-act="v-rate"][data-id="1"]').getAttribute('aria-pressed') === 'false' && window.__planner.state.settings.listenRate === 1.5));
    await page.evaluate(() => { const t = document.querySelector('#v-pad'); t.value = 'Typed by hand'; t.dispatchEvent(new Event('input', { bubbles: true })); });
    ok('voice: typing in the notepad is saved', await page.evaluate(() => window.__planner.state.voicePad === 'Typed by hand'));
    await click(page, '#screen [data-act="pad-ask"]'); await page.waitForTimeout(400);
    ok('voice: the tutor is asked to tidy the notepad', await page.evaluate(() => /Typed by hand/.test((window.__calls.find((c) => c[0] === 'chatInsert') || [])[1] || '')));
    await page.evaluate(() => { const c = document.querySelector('[data-act="close-tutor"]'); if (c) c.click(); });
    await click(page, '#screen [data-act="pad-clear-ask"]');
    await click(page, '#screen [data-act="pad-clear"]');
    ok('voice: Clear asks first, then clears', await page.evaluate(() => window.__planner.state.voicePad === '' && document.querySelector('#v-pad').value === ''));
    ok('voice: "Just been observed" offers the next observation without notes', await page.evaluate(() => document.querySelector('#v-obs').value === '1' && /has spoken notes/.test(document.querySelector('#v-obs option[value="2"]').textContent)));
    await page.evaluate(() => { window.__calls.length = 0; document.querySelector('#v-obs').value = '3'; });
    await click(page, '#screen [data-act="obs-speak"]'); await tick(page);
    ok('voice: "Speak my reflection now" opens that observation with the microphone on', (await calls(page, 'dictateStart')).length === 1 && await page.evaluate(() => window.__planner.DICT.sel === '#o-spoken' && document.querySelector('#o-spoken').dataset.obs === '3'));
    await page.evaluate(() => window.__say('observation three went fine'));
    await page.evaluate(() => window.__capgownBack()); await tick(page);
    ok('voice: the back button stops the microphone and keeps the words', await page.evaluate(() => !window.__planner.DICT.on && /Observation three went fine\.$/.test(window.__planner.state.portfolio.obsInfo['3'].spoken)));

    // switching Listen or Speak off in Settings
    await page.evaluate(() => { window.__planner.go('settings'); });
    await click(page, '#screen [data-act="set-toggle"][data-id="dictate"]');
    await page.evaluate(() => { window.__planner.sub.ppage = 'obs'; window.__planner.go('portfolio'); document.querySelector('#screen [data-act="obs"][data-id="2"]').click(); });
    ok('settings: Speak off removes the microphones, Listen stays', await page.evaluate(() => !document.querySelector('#layer [data-act="dictate"]') && document.querySelectorAll('#layer [data-act="hear"]').length === 3));
    await page.evaluate(() => { document.querySelector('[data-act="close-sheet"]').click(); window.__planner.go('settings'); });
    await click(page, '#screen [data-act="set-toggle"][data-id="readAloud"]');
    await page.evaluate(() => { window.__planner.sub.topic = 'afl'; window.__planner.sub.fmt = 'Worked example'; window.__planner.go('learn'); });
    ok('settings: Listen off removes the Listen buttons', await page.evaluate(() => !document.querySelector('#screen [data-act="listen-lesson"]') && window.__planner.listen('x', 'Some words') === false));
    ok('voice: no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    // it carries on from the place it stopped; a refused microphone; a phone with no speech recogniser
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: voiceState(), listenResumed: true, micDenied: true });
    await page.evaluate(() => { window.__planner.sub.topic = 'afl'; window.__planner.go('learn'); });
    await click(page, '#screen [data-act="listen-lesson"]'); await tick(page);
    ok('listen: it carries on from where it stopped, and says so', await page.evaluate(() => /Carrying on from where you stopped/.test(document.querySelector('#toast').textContent) && /4 of 9/.test(document.querySelector('#player').textContent) && !!document.querySelector('#player [data-act="pl-restart"]')));
    await click(page, '#player [data-act="pl-restart"]'); await tick(page);
    ok('listen: Start again goes back to the beginning', (await calls(page, 'listenRestart')).length === 1 && await page.evaluate(() => /1 of 9/.test(document.querySelector('#player').textContent) && !document.querySelector('#player [data-act="pl-restart"]')));
    await page.evaluate(() => window.AndroidApp.listenStop()); await tick(page);
    await page.evaluate(() => window.__planner.go('voice'));
    await click(page, speakBtn('#v-pad')); await tick(page);
    ok('speak: a refused microphone is explained, with a way to allow it', /not allowed to use the microphone/.test(await live(page, '#v-pad')) && await page.evaluate(() => !window.__planner.DICT.on && !!document.querySelector('#v-pad + .vbar [data-act="mic-fix"]')));
    await click(page, '#v-pad + .vbar [data-act="mic-fix"]');
    ok('speak: "Open the app’s settings" opens them', (await calls(page, 'fix')).some((c) => c[0] === 'app'));
    ok('voice (refused): no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: null, noRecogniser: true });
    await page.evaluate(() => window.__planner.go('voice'));
    ok('speak: a phone with no speech recogniser is told what to install', await page.evaluate(() => /no speech recogniser turned on/.test(document.querySelector('#screen').textContent)));
    await click(page, speakBtn('#v-pad')); await tick(page);
    ok('speak: and Speak says the same', /no speech recogniser turned on/.test(await live(page, '#v-pad')));
    ok('voice (no recogniser): no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    // the app as it was before Listen and Speak, showing this newer page
    const { ctx, page, errors } = await open(browser, { app: true, app4: true, now: '2026-11-18T19:30:00', state: voiceState() });
    await page.evaluate(() => window.__planner.go('voice'));
    ok('older app: the screen says one more install is needed', await page.evaluate(() => /One more install/.test(document.querySelector('#screen').textContent) && !!document.querySelector('#screen [data-act="get-app"]')));
    await click(page, '#screen [data-act="get-app"]');
    ok('older app: "Get the newest app" opens the download', await page.evaluate(() => window.__opened.length === 1 && window.__opened[0] === 'https://github.com/oogiemudia/cap-and-gown-android/releases/download/latest/CapAndGown.apk'), await page.evaluate(() => window.__opened));
    await click(page, speakBtn('#v-pad')); await tick(page);
    ok('older app: Speak says it needs the newest app', /Speak needs the newest app/.test(await live(page, '#v-pad')) && await page.evaluate(() => !window.__planner.DICT.on));
    await page.evaluate(() => { window.__planner.sub.topic = 'afl'; window.__planner.go('learn'); });
    await click(page, '#screen [data-act="listen-lesson"]');
    ok('older app: a lesson is still read, the short way', await page.evaluate(() => { const c = window.__calls.find((x) => x[0] === 'speak'); return !!c && c[1].length > 20 && document.querySelector('#player').hidden && /newest app/.test(document.querySelector('#toast').textContent); }));
    ok('older app: a long text is cut to what that app can read', await page.evaluate(() => { window.__calls.length = 0; const long = Array.from({ length: 200 }, (x, i) => `Sentence number ${i} is here.`).join(' '); window.__planner.listen('Long', long); const c = window.__calls.find((x) => x[0] === 'speak'); window.__spoken = c ? c[1] : ''; return !!c; }) && await page.evaluate(() => window.__calls.length === 1));
    await page.evaluate(() => { const P = window.__planner; P.sub.lf = 'All'; P.sub.q = ''; P.go('library'); const it = P.catalogue().find((x) => x.src === 'online' && x.kind === 'Read' && !/\.pdf/i.test(x.link) && !x.lib && !x.post && !x.w); document.querySelector(`#screen [data-act="res"][data-id="${it.id}"]`).click(); });
    await click(page, '#layer [data-act="res-listen"]');
    ok('older app: Listen on a web page says it needs the newest app', await page.evaluate(() => /needs the newest app/.test(document.querySelector('#toast').textContent)));
    ok('older app (listen and speak): no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    // a plain browser, with stand-ins for its voice and its speech recognition
    const init = `window.__utter = [];
      window.SpeechSynthesisUtterance = function (t) { this.text = t; };
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() { window.__cancelled = (window.__cancelled || 0) + 1; }, speak(u) { window.__utter.push(u); } } });
      window.SpeechRecognition = window.webkitSpeechRecognition = function () { window.__sr = this; this.start = () => setTimeout(() => this.onstart && this.onstart(), 0); this.stop = () => setTimeout(() => this.onend && this.onend(), 0); };`;
    const { ctx, page, errors } = await open(browser, { app: false, now: '2026-11-18T19:30:00', state: voiceState(), init });
    await page.evaluate(() => { window.__planner.sub.topic = 'afl'; window.__planner.go('learn'); });
    await click(page, '#screen [data-act="listen-lesson"]');
    const parts = await page.evaluate(() => window.__planner.splitParts(window.__planner.lessonText('afl')));
    ok('browser: the lesson is read a part at a time', await page.evaluate((p) => window.__utter.length === 1 && window.__utter[0].text === p[0] && window.__utter[0].lang === 'en-GB' && new RegExp(`1 of ${p.length}`).test(document.querySelector('#player').textContent), parts), parts.length);
    await page.evaluate(() => window.__utter[0].onend());
    ok('browser: when a part ends the next one starts', await page.evaluate((p) => window.__utter.length === 2 && window.__utter[1].text === p[1] && new RegExp(`2 of ${p.length}`).test(document.querySelector('#player').textContent), parts));
    await click(page, '#player [data-act="pl-toggle"]');
    ok('browser: Pause stops the voice', await page.evaluate(() => window.__planner.LS.state === 'paused' && window.__utter.length === 2));
    await page.evaluate(() => window.__utter[1].onend());
    ok('browser: a part cut off by Pause does not move the place on', await page.evaluate(() => window.__utter.length === 2 && window.__planner.LS.i === 2));
    await click(page, '#player [data-act="pl-rate"]');
    await click(page, '#player [data-act="pl-toggle"]');
    ok('browser: Play reads that part again, at the new speed', await page.evaluate((p) => window.__utter.length === 3 && window.__utter[2].text === p[1] && window.__utter[2].rate === 1.25, parts));
    await page.evaluate((n) => { for (let i = 2; i <= n; i++) { const u = window.__utter[window.__utter.length - 1]; u.onend(); } }, parts.length);
    ok('browser: after the last part it says Finished and the bar goes', await page.evaluate(() => document.querySelector('#player').hidden && /Finished/.test(document.querySelector('#toast').textContent) && window.__planner.LS.state === 'idle'), await page.evaluate(() => [window.__utter.length, window.__planner.LS]));
    await page.evaluate(() => window.__planner.go('voice'));
    await click(page, speakBtn('#v-pad')); await tick(page);
    ok('browser: Speak uses the browser’s speech recognition', await page.evaluate(() => !!window.__sr && window.__sr.lang === 'en-GB' && window.__sr.continuous === true && window.__planner.DICT.on) && /Listening/.test(await live(page, '#v-pad')));
    await page.evaluate(() => { const r = [Object.assign([{ transcript: 'hello from the browser' }], { isFinal: true }), Object.assign([{ transcript: ' still talking' }], { isFinal: false })]; window.__sr.onresult({ resultIndex: 0, results: r }); });
    ok('browser: finished words go in the box, unfinished ones show underneath', await page.evaluate(() => document.querySelector('#v-pad').value === 'Hello from the browser.' && window.__planner.state.voicePad === 'Hello from the browser.') && /still talking/.test(await live(page, '#v-pad')));
    await click(page, speakBtn('#v-pad')); await tick(page);
    ok('browser: Stop ends it', await page.evaluate(() => !window.__planner.DICT.on));
    await click(page, speakBtn('#v-pad')); await tick(page);
    await page.evaluate(() => { window.__sr.onerror({ error: 'not-allowed' }); window.__sr.onend(); });
    ok('browser: a blocked microphone is explained', /not allowed to use the microphone/.test(await live(page, '#v-pad')));
    ok('browser (listen and speak): no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    // the pieces on their own, and damaged saved data
    const st = JSON.parse(JSON.stringify(rich));
    st.voicePad = 123; st.settings.listenRate = 'fast'; st.settings.dictate = 'yes';
    st.portfolio.obsInfo = { 1: { spoken: 5, refl: null, targets: ['x'] }, 2: 'nonsense', 3: { spoken: 'Kept words', date: '2026-11-12' } };
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: st });
    const got = await page.evaluate(() => { const s = window.__planner.state; return { pad: s.voicePad, rate: s.settings.listenRate, o1: s.portfolio.obsInfo['1'], o2: s.portfolio.obsInfo['2'], o3: s.portfolio.obsInfo['3'] }; });
    ok('damaged data: spoken notes, the notepad and the speed are put right, sound notes are kept', got.pad === '123' && got.rate === 1 && got.o1.spoken === '5' && typeof got.o1.targets === 'string' && got.o2 === undefined && got.o3.spoken === 'Kept words' && got.o3.date === '2026-11-12', got);
    await page.evaluate(() => { window.__planner.sub.ppage = 'obs'; window.__planner.go('portfolio'); document.querySelector('#screen [data-act="obs"][data-id="1"]').click(); });
    ok('damaged data: that observation still opens', await page.evaluate(() => document.querySelector('#o-spoken').value === '5'));
    const U = await page.evaluate(() => { const P = window.__planner; const long = 'word '.repeat(400).trim(); return {
      split: P.splitParts('One. Two! Three?\n\nA new paragraph that is here.'),
      splitLong: P.splitParts(long).map((x) => x.length),
      splitJoin: P.splitParts(long).join(' ') === long,
      splitNone: P.splitParts(' \n ... \n'),
      a: P.spokenText('  hello   world  '), b: P.spokenText('is this right question mark yes comma it is'), c: P.spokenText('new line'), d: P.spokenText('first point new paragraph second point'), e: P.spokenText('full stop'), f: P.spokenText(''), g: P.spokenText('Already ends well!'),
      plain: P.spokenPlain('[Wed 18 Nov, 19:30]\nOne.\n\n[Thu 19 Nov, 08:05]\nTwo.\n[not a stamp because it is far too long to be one, it goes on]')
    }; });
    ok('pieces: text is cut into parts at sentence ends, short enough to pause between', JSON.stringify(U.split) === JSON.stringify(['One. Two! Three?', 'A new paragraph that is here.']) && U.splitLong.every((n) => n <= 900) && U.splitLong.length >= 3 && U.splitJoin && U.splitNone.length === 0, U);
    ok('pieces: spoken punctuation becomes punctuation', U.a === 'Hello world.' && U.b === 'Is this right? Yes, it is.' && U.c === '\n' && U.d === 'First point\n\nSecond point.' && U.e === '' && U.f === '' && U.g === 'Already ends well!', U);
    ok('pieces: date stamps are taken out for the draft, other brackets are kept', U.plain === 'One.\n\nTwo.\n[not a stamp because it is far too long to be one, it goes on]', U.plain);
    ok('pieces: no script errors', errors.length === 0, errors);
    await ctx.close();
  }

  // ---------- I. podcasts play inside the app ----------
  {
    const wait = (page, ms) => page.evaluate((m) => new Promise((r) => setTimeout(r, m)), ms || 60);
    const calls = (page, name) => page.evaluate((n) => window.__calls.filter((c) => c[0] === n).map((c) => c.slice(1)), name);
    const toastText = (page) => page.evaluate(() => { const t = document.querySelector('#toast'); return t && !t.hidden ? t.textContent : ''; });
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: rich });
    // every podcast in the library knows its show, and each finds its own episode in the show's list
    const M = await page.evaluate(async () => {
      const P = window.__planner;
      const out = {};
      for (const it of P.catalogue().filter((x) => x.kind === 'Listen' && x.src === 'online')) {
        const p = P.podOf(it);
        if (!p) { out[it.id] = null; continue; }
        const d = await P.podFeed(p.key);
        const i = P.epFor(d, it, p);
        out[it.id] = { whole: p.whole, ep: i >= 0 ? d.eps[i].t : '' };
      }
      return out;
    });
    ok('podcasts: every podcast in the library plays in the app', Object.values(M).length >= 12 && Object.values(M).every(Boolean), M);
    const want = { on03: 'Episode 2: Retrieval Practice', on05: 'Ep 6: Cognitive science in the classroom', on11: 'Effective professional development in 16-19 settings', on14: 'Ep 18: Special educational needs and disabilities', on16: 'Exploring disadvantage in 16–19 settings', on21: 'Metacognition: moving forward with new evidence', on27: 'Teaching: an art or science? Part 3', on48: 'Renewed Education Inspections' };
    ok('podcasts: each episode is matched by its page, or its title when the link is a news page', Object.entries(want).every(([id, t]) => M[id] && !M[id].whole && M[id].ep === t), Object.fromEntries(Object.keys(want).map((k) => [k, M[k]])));
    ok('podcasts: a whole show plays its newest episode', ['pd12', 'pd13', 'pd35', 'pd36'].every((id) => M[id] && M[id].whole && M[id].ep) && M.pd13.ep === 'Our favourite studies, with John Hattie', M);
    const reqs = (await calls(page, 'podFeed')).map((c) => c[1]);
    ok('podcasts: shows are asked for by feed, then Apple id; InnerDrive by its id only', reqs.some((q) => q.feeds[0] === 'https://feed.podbean.com/evidenceintoaction/feed.xml' && q.term === 'Evidence into Action') && reqs.some((q) => q.apple === '1875223587' && q.term === '' && q.feeds.length === 0), reqs);
    ok('podcasts: a list is fetched once and kept', reqs.filter((q) => q.feeds[0] === 'https://feed.podbean.com/evidenceintoaction/feed.xml').length === 1, reqs.length);

    // For you and Home: the day's podcast has a Play button
    await page.evaluate(() => { window.__planner.setEnergy('low'); window.__planner.sub.stab = 'foryou'; window.__planner.go('study'); });
    const R = await page.evaluate(() => { const r = window.__planner.recommend(); const l = r.picks.find((x) => x.it.kind === 'Listen'); return l ? l.it.id : ''; });
    ok('podcasts: a low-energy evening has a podcast in For you', !!R, R);
    ok('podcasts: its card says Play here', await page.evaluate((id) => !!document.querySelector(`#screen [data-act="pod-go"][data-id="${id}"]`) && /Play here/.test(document.querySelector(`#screen [data-act="pod-go"][data-id="${id}"]`).textContent), R));
    await page.evaluate(() => window.__planner.go('home'));
    ok('podcasts: Home offers to play today’s podcast', await page.evaluate((id) => { const b = document.querySelector(`#screen [data-act="pod-go"][data-id="${id}"]`); return !!b && /today’s podcast/.test(b.textContent); }, R));
    await click(page, `#screen [data-act="pod-go"][data-id="${R}"]`);
    await wait(page, 120);
    const played = (await calls(page, 'podPlay')).map((c) => c[0]);
    const st = await page.evaluate(() => ({ pod: window.__planner.POD.state, bar: !document.querySelector('#player').hidden, text: document.querySelector('#player').textContent, listening: document.body.classList.contains('listening'), time: (document.querySelector('#pod-time') || {}).textContent }));
    ok('podcasts: Play finds the episode and plays it in the app', played.length === 1 && played[0].id === R && /^https:\/\/audio\.example\//.test(played[0].url) && played[0].show && st.pod === 'playing', { played, st });
    ok('podcasts: the player bar shows the episode and the time', st.bar && st.listening && st.text.includes(played[0] && played[0].title) && /0:00 \/ \d+:\d\d/.test(st.time), st);
    ok('podcasts: playing counts as opening it', await page.evaluate((id) => { const r = window.__planner.state.res[id]; return !!(r && r.open && r.ep); }, R));
    await click(page, '#player [data-act="pod-fwd"]'); await wait(page);
    await click(page, '#player [data-act="pod-fwd"]'); await wait(page);
    await click(page, '#player [data-act="pod-back"]'); await wait(page);
    ok('podcasts: back 15 and forward 30 seconds', JSON.stringify(await calls(page, 'podSkip')) === JSON.stringify([[30], [30], [-15]]) && await page.evaluate(() => window.__planner.POD.pos === 45000 && document.querySelector('#pod-time').textContent.startsWith('0:45')));
    await click(page, '#player [data-act="pod-rate"]'); await wait(page);
    ok('podcasts: speed goes up a step', JSON.stringify(await calls(page, 'podRate')) === '[[1.25]]' && /1\.25×/.test(await page.evaluate(() => document.querySelector('#player [data-act="pod-rate"]').textContent)));
    await page.evaluate(() => { const r = document.querySelector('#pod-seek'); r.value = '600'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
    await wait(page);
    ok('podcasts: dragging the bar moves to that place', JSON.stringify(await calls(page, 'podSeek')) === '[[600000]]' && await page.evaluate(() => window.__pod.pos === 600000));
    await click(page, '#player [data-act="pod-toggle"]'); await wait(page);
    ok('podcasts: pause', await page.evaluate(() => window.__pod.state === 'paused' && window.__planner.POD.state === 'paused' && document.querySelector('#player [data-act="pod-toggle"]').getAttribute('aria-label') === 'Play'));
    await click(page, '#player [data-act="pod-toggle"]'); await wait(page);
    ok('podcasts: play again', (await calls(page, 'podResume')).length === 1 && await page.evaluate(() => window.__planner.POD.state === 'playing'));
    // the ticker keeps the time right while it plays
    await page.evaluate(() => { window.__pod.pos = 754000; });
    await wait(page, 1150);
    ok('podcasts: the time follows the phone every second', /^12:34/.test(await page.evaluate(() => document.querySelector('#pod-time').textContent)));
    // the title opens the episode's sheet, with its controls
    await click(page, '#player [data-act="pod-sheet"]'); await wait(page);
    ok('podcasts: the bar’s title opens the episode', await page.evaluate(() => !!document.querySelector('#layer [data-podpanel] [data-act="pod-toggle"]')));
    await page.evaluate(() => { const c = document.querySelector('[data-act="close-sheet"]'); if (c) c.click(); });
    // Listen (the phone's voice) and a podcast never play together
    await page.evaluate(() => window.__planner.listen('A note', 'Some words to read.'));
    await wait(page);
    ok('podcasts: starting Listen stops the episode and shows Listen’s bar', await page.evaluate(() => window.__planner.POD.state === 'idle' && window.__planner.LS.state === 'playing' && !document.querySelector('#pod-time') && /Some|A note/.test(document.querySelector('#player').textContent)));
    await page.evaluate(() => window.__planner.listenCmd('stop'));
    // finishing an episode
    await page.evaluate((id) => window.__planner.podQuick(id), R); await wait(page, 120);
    ok('podcasts: playing it again carries on from where it stopped', await page.evaluate(() => window.__pod.resumed && window.__pod.pos === 754000) && /Carrying on from 12:34/.test(await toastText(page)));
    await page.evaluate(() => window.__podEnd(true)); await wait(page);
    ok('podcasts: the end says so and asks if it stuck', /Finished/.test(await toastText(page)) && await page.evaluate(() => !!document.querySelector('#toast [data-act="res-done"]') && document.querySelector('#player').hidden && !document.body.classList.contains('listening')));
    ok('podcasts: a finished episode is remembered', await page.evaluate((id) => { const r = window.__planner.state.res[id]; return Array.isArray(r.heard) && r.heard.includes(window.__pod.url); }, R));
    // a dropped connection
    await page.evaluate((id) => window.__planner.podQuick(id), R); await wait(page, 120);
    await page.evaluate(() => window.__podEnd(false, 'The episode stopped loading. Check your connection, then tap Play to carry on from the same place.')); await wait(page);
    ok('podcasts: a dropped connection is explained, with the episode page to fall back on', /stopped loading/.test(await toastText(page)) && await page.evaluate(() => !!document.querySelector('#toast [data-act="open-url"]')));

    // a podcast's sheet: this episode, where you got to, and the rest of the show
    await page.evaluate(() => { window.__podPlaces['https://audio.example/exploring-disadvantage-in-16-19-settings-evidence-into-action.mp3'] = 600000; window.__planner.go('library'); });
    await page.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'res'; b.dataset.id = 'on16'; document.querySelector('#screen').appendChild(b); b.click(); b.remove(); });
    await wait(page);
    const S = await page.evaluate(() => { const box = document.querySelector('#layer [data-podpanel="on16"]'); return box ? { text: box.textContent, rows: box.querySelectorAll('.list [data-act="pod-ep"]').length, start: !!box.querySelector('[data-act="pod-ep"][data-t="start"]'), more: !!box.querySelector('[data-act="pod-more"]'), page: (document.querySelector('#layer [data-act="res-open"]') || {}).textContent } : null; });
    ok('podcasts: the sheet shows this episode with Carry on from 10:00 and From the start', S && /This episode/.test(S.text) && /Exploring disadvantage/.test(S.text) && /Carry on from 10:00/.test(S.text) && S.start, S);
    ok('podcasts: the sheet lists more of the show, with more on request', S && S.rows === 6 && S.more && /More from Evidence into Action/.test(S.text) && /Open the episode’s page/.test(S.page), S);
    await click(page, '#layer [data-act="pod-more"]'); await wait(page);
    ok('podcasts: Show more lists every episode', await page.evaluate(() => document.querySelectorAll('#layer [data-podpanel] .list [data-act="pod-ep"]').length === 7 && !document.querySelector('#layer [data-act="pod-more"]')));
    await page.evaluate(() => { window.__calls.length = 0; });
    await click(page, '#layer [data-act="pod-ep"][data-t="start"]'); await wait(page);
    const fromStart = (await calls(page, 'podPlay')).map((c) => c[0]);
    ok('podcasts: From the start plays from 0:00', fromStart.length === 1 && fromStart[0].at === 0 && fromStart[0].id === 'on16', fromStart);
    ok('podcasts: the open sheet now shows Pause for it', await page.evaluate(() => /Pause/.test(document.querySelector('#layer [data-podpanel]').textContent)));
    await page.evaluate(() => { window.__calls.length = 0; document.querySelectorAll('#layer .list [data-act="pod-ep"]')[2].click(); });
    await wait(page);
    const other = (await calls(page, 'podPlay')).map((c) => c[0]);
    ok('podcasts: tapping another episode plays that one', other.length === 1 && other[0].id === 'on16' && other[0].at === undefined && !/exploring/.test(other[0].url), other);
    await page.evaluate(() => { const c = document.querySelector('[data-act="close-sheet"]'); if (c) c.click(); window.__planner.podCmd('stop'); });
    // a whole show: where you got to, else the newest you have not heard
    const W = await page.evaluate(async () => {
      const P = window.__planner;
      const it = P.catalogue().find((x) => x.id === 'pd13');
      const p = P.podOf(it);
      const d = await P.podFeed(p.key);
      const r = (P.state.res.pd13 = { heard: [d.eps[0].u] });
      const a = d.eps[P.epFor(d, it, p)].t;
      r.ep = d.eps[0].u; r.heard = [];
      const b = d.eps[P.epFor(d, it, p)].t;
      delete P.state.res.pd13;
      return { a, b };
    });
    ok('podcasts: a whole show skips what you have heard and carries on with what you started', W.a === 'An introduction' && W.b === 'Our favourite studies, with John Hattie', W);
    ok('podcasts (app): no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    // a show that cannot be reached
    const { SAMPLE_FEEDS } = require('./lib');
    const feeds = Object.assign({}, SAMPLE_FEEDS, { 'https://feed.podbean.com/evidenceintoaction/feed.xml': 'fail' });
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: rich, feeds });
    await page.evaluate(() => window.__planner.podQuick('on16'));
    await page.evaluate(() => new Promise((r) => setTimeout(r, 120)));
    ok('podcasts offline: Play explains and offers the episode page', await page.evaluate(() => /Could not reach Evidence into Action/.test(document.querySelector('#toast').textContent) && !!document.querySelector('#toast [data-act="res-open"]') && document.querySelector('#player').hidden));
    await page.evaluate(() => { window.__planner.go('library'); const b = document.createElement('button'); b.dataset.act = 'res'; b.dataset.id = 'on16'; document.querySelector('#screen').appendChild(b); b.click(); b.remove(); });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 80)));
    ok('podcasts offline: the sheet says so, with Try again', await page.evaluate(() => /Could not reach Evidence into Action/.test(document.querySelector('#layer [data-podpanel]').textContent) && !!document.querySelector('#layer [data-act="pod-retry"]')));
    ok('podcasts offline: other shows still play', await page.evaluate(async () => { const P = window.__planner; P.podQuick('on48'); await new Promise((r) => setTimeout(r, 120)); return P.POD.state === 'playing' && /Renewed/.test(P.POD.title); }));
    ok('podcasts offline: no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    // the app before this version: podcasts open their page, and the newest app is offered
    const { ctx, page, errors } = await open(browser, { app: true, app5: true, now: '2026-11-18T19:30:00', state: rich });
    await page.evaluate(() => { window.__planner.setEnergy('low'); window.__planner.sub.stab = 'foryou'; window.__planner.go('study'); });
    ok('older app: no Play buttons it cannot keep', await page.evaluate(() => !document.querySelector('[data-act="pod-go"]')));
    await page.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'res'; b.dataset.id = 'on16'; document.querySelector('#screen').appendChild(b); b.click(); b.remove(); });
    ok('older app: the sheet offers the newest app and still opens the episode page', await page.evaluate(() => /needs the newest app/.test(document.querySelector('#layer [data-podpanel]').textContent) && !!document.querySelector('#layer [data-act="get-app"]') && !!document.querySelector('#layer [data-act="res-open"]')));
    await page.evaluate(() => { document.querySelector('[data-act="close-sheet"]').click(); window.__planner.podQuick('on16'); });
    ok('older app: Play opens the page in the reader', await page.evaluate(() => window.__calls.some((c) => c[0] === 'openReader' && /exploring-disadvantage/.test(c[1])) && !window.__calls.some((c) => c[0] === 'podPlay')));
    ok('older app: no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    // a browser: no app, so the page tries the feed itself (blocked here) and says so
    const { ctx, page, errors } = await open(browser, { app: false, now: '2026-11-18T19:30:00', state: rich });
    await page.evaluate(() => window.__planner.podQuick('on16'));
    await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
    ok('browser: Play tries, then explains', /Could not reach/.test(await page.evaluate(() => document.querySelector('#toast').textContent)));
    ok('browser (podcasts): no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    // small phones: the player bar fits
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: rich, width: 320 });
    await page.evaluate(() => window.__planner.podQuick('on14'));
    await page.evaluate(() => new Promise((r) => setTimeout(r, 120)));
    await page.evaluate(() => { window.__pod.pos = 3725000; window.__pod.dur = 4080000; window.__planner.podState(JSON.parse(JSON.stringify(window.__pod)), true); window.__planner.go('home'); });
    const ov = await overflow(page);
    const fit = await page.evaluate(() => { const b = document.querySelector('#player'); const r = b.getBoundingClientRect(); return { w: r.width, right: Array.from(b.querySelectorAll('*')).every((x) => x.getBoundingClientRect().right <= r.right + 1), time: document.querySelector('#pod-time').textContent }; });
    ok('podcasts 320px: the bar fits, with an hour-long time', ov.length === 0 && fit.right && fit.time === '1:02:05 / 1:08:00', { ov, fit });
    if (SHOTS) await page.screenshot({ path: require('path').join(SHOTS, 'podcast-bar-320.png') });
    ok('podcasts 320px: no script errors', errors.length === 0, errors);
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
