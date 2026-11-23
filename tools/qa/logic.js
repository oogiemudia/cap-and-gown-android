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

  // ---------- J. the coach: a small step every day ----------
  {
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: null });
    const P = (fn, arg) => page.evaluate(fn, arg);
    const type = (sel, text) => P(([s, t]) => { const el = document.querySelector(s); if (!el) return false; el.value = t; el.dispatchEvent(new Event('input', { bubbles: true })); return true; }, [sel, text]);
    const toastText = () => P(() => document.querySelector('#toast').textContent);
    const words = (t) => t.trim().split(/\s+/).length;
    await P(() => { window.__planner.state.settings.chatTipSeen = true; });
    // the lessons themselves
    const data = await P(() => { const p = window.__planner; return { aw: p.AW, refs: Object.keys(p.REFS), verbs: Object.keys(p.VERBS), topics: Object.keys(p.TOPICS), cp: p.CP_DAILY }; });
    const ids = data.aw.map((q) => q.id);
    ok('coach: all 25 workbook questions, in workbook order, each under its outcome', ids.join(' ') === '1.1 1.2 1.3 1.4 2.1 3.1 3.2 3.3 3.4 3.5 4.1 4.2 4.3 4.4 5.1 5.2 6.1 6.2 6.3 7.1 7.2 8.1 8.2 8.3 8.4' && data.aw.every((q) => q.lo === Number(q.id[0])), ids);
    const thin = data.aw.filter((q) => !(q.q.length > 20 && q.learn.length >= 3 && q.learn.every((l) => l.length === 2 && l[0].length >= 3 && l[1].length > 60) && q.check.length === 2 && q.check.every((c) => c[0].length > 15 && c[1].length === 3 && new Set(c[1]).size === 3 && [0, 1, 2].includes(c[2]) && c[3].length > 20) && q.cover.length >= 3 && q.trap.length > 20 && q.own.length > 20 && q.start.length >= 1 && q.src.length >= 1)).map((q) => q.id);
    ok('coach: every question has a lesson in parts, two checks, a checklist, a slip to avoid, an own-example prompt and starters', thin.length === 0, thin);
    ok('coach: every lesson is short enough for one sitting', data.aw.every((q) => { const w = q.learn.reduce((n, l) => n + l[1].split(/\s+/).length, 0); return w >= 90 && w <= 260; }), data.aw.map((q) => [q.id, q.learn.reduce((n, l) => n + l[1].split(/\s+/).length, 0)]));
    ok('coach: every source is in the reference list, every topic and question word is real', data.aw.every((q) => q.src.every((k) => data.refs.includes(k)) && data.topics.includes(q.t) && data.verbs.includes(q.verb)), data.aw.filter((q) => !(q.src.every((k) => data.refs.includes(k)) && data.topics.includes(q.t) && data.verbs.includes(q.verb))).map((q) => q.id));
    const pos = [0, 1, 2].map((k) => data.aw.reduce((n, q) => n + q.check.filter((c) => c[2] === k).length, 0));
    ok('coach: the right answer is not always in the same place', pos.every((n) => n >= 12), pos);
    ok('coach: the questions with headings in the workbook keep them', data.aw.filter((q) => q.parts).map((q) => q.id).join() === '2.1,5.1,5.2' && data.aw.find((q) => q.id === '2.1').parts.length === 6);
    ok('coach: the lessons speak of the assessor and the candidate, not of teaching a class', data.aw.every((q) => !/\b(my|your) (class|lesson|pupils|students)\b/i.test(JSON.stringify(q.learn))));

    // the plan: what is left, the days to go, so how much today
    const plan = () => P(() => { const p = window.__planner; const A = p.awToday(); return { order: p.awOrder().map((q) => q.id), sit: A.sit.length, end: A.P.end, days: A.P.days, per: A.P.per, quota: A.quota, done: A.done, todo: A.todo.map((x) => x.q.id + ' ' + x.s), today: p.coachToday().map((x) => x.path + ':' + x.id) }; });
    let pl = await plan();
    ok('coach plan: the outcomes whose hand-in is still ahead come first', pl.order.slice(0, 7).join(' ') === '7.1 7.2 8.1 8.2 8.3 8.4 1.1', pl.order);
    ok('coach plan: 50 short sittings spread to the planner’s own aim for the workbook', pl.sit === 50 && pl.end === '2026-12-18' && pl.days === 31 && pl.per === 2 && pl.quota === 2, pl);
    ok('coach plan: today is learn 7.1, write 7.1, one KSB (the first gap after the Strong baseline) and five minutes on the change project', pl.todo.join() === '7.1 learn,7.1 write' && pl.today.join() === 'aw:7.1,aw:7.1,ksb:S18,cp:', pl);
    await P(() => { window.__planner.state.energy['2026-11-18'] = 'low'; });
    pl = await plan();
    ok('coach plan: low energy keeps one light step', pl.quota === 1 && pl.todo.join() === '7.1 learn', pl);
    await P(() => { window.__planner.state.coach.aw['7.1'] = { k: '2026-11-17' }; });
    pl = await plan();
    ok('coach plan: low energy never asks for writing while a lesson is waiting', pl.todo.join() === '7.2 learn', pl);
    await P(() => { delete window.__planner.state.coach.aw['7.1']; window.__planner.state.energy['2026-11-18'] = 'high'; });
    pl = await plan();
    ok('coach plan: good energy adds one more', pl.quota === 3 && pl.todo.length === 3, pl);
    await P(() => { delete window.__planner.state.energy['2026-11-18']; });

    // Home and More lead to it
    await P(() => window.__planner.go('home'));
    const card = await P(() => (document.querySelector('#coach-card') || { textContent: '' }).textContent);
    ok('coach on Home: tonight’s first step, and how many more', /7\.1 Learn it · 10 min/.test(card) && /All 4 for today/.test(card) && /Explain the importance of following procedures/.test(card), card);
    await P(() => window.__planner.go('more'));
    ok('coach on More: a tile that says how many steps today', await P(() => /Coach\s*4 small steps today/.test(document.querySelector('#screen').textContent)));
    await P(() => window.__planner.go('home'));
    await click(page, '#coach-card [data-act="co-go"][data-path="aw"]');
    ok('coach: Start opens the question at its lesson', await P(() => { const p = window.__planner; return p.route === 'coach' && p.sub.cq === '7.1' && document.querySelector('.costeps [aria-pressed="true"]').textContent.trim() === '1 Learn' && document.querySelectorAll('#screen .step').length === 1; }));

    // 1. learn: a part at a time, read or listened to
    await click(page, '#screen [data-act="co-listen"]');
    ok('coach learn: the lesson can be listened to', await P(() => /^Question 7 point 1\. Explain the importance/.test(window.__lastListen || '') && window.__listen.title === 'Workbook question 7.1'));
    await P(() => window.AndroidApp.listenStop());
    for (let i = 0; i < 5 && await click(page, '#screen [data-act="co-more"]'); i++);
    ok('coach learn: the parts open one at a time, then it offers the check', await P(() => document.querySelectorAll('#screen .step').length === window.__planner.AW_BY['7.1'].learn.length && !!document.querySelector('#screen [data-act="co-read"]')));
    await P(() => { window.__calls.length = 0; window.__lastInsert = ''; });
    await click(page, '#screen [data-act="co-live"][data-k="aw"]');
    await page.waitForTimeout(400);
    const teach = await P(() => window.__lastInsert || '');
    const q71 = data.aw.find((q) => q.id === '7.1');
    ok('coach live: Claude is given the question, the checklist and where I am, and told to teach in small steps', teach.includes(`"7.1 ${q71.q}"`) && q71.cover.every((c) => teach.includes('- ' + c)) && /one at a time, and wait for my reply/.test(teach) && /from the assessor's role/.test(teach) && /I have not read the lesson yet/.test(teach) && teach.includes(q71.trap), teach);
    ok('coach live: Claude is told not to write my answer', /Do not write my answer for me, not even a model paragraph/.test(teach) && /declare any AI tool/.test(teach));
    await click(page, '[data-act="close-tutor"]');
    await click(page, '#screen [data-act="co-read"]');
    ok('coach learn: reading it is remembered and moves on to the check', await P(() => { const p = window.__planner; return p.state.coach.aw['7.1'].r === '2026-11-18' && document.querySelector('.costeps [aria-pressed="true"]').textContent.trim() === '2 Check' && document.querySelectorAll('#screen [data-act="co-ans"]').length === 6; }));

    // 2. check: two questions, feedback straight away, then how sure you feel
    const right = q71.check.map((c) => c[2]);
    await click(page, `#screen [data-act="co-ans"][data-i="0"][data-o="${(right[0] + 1) % 3}"]`);
    ok('coach check: a wrong pick is shown, with the reason', await P((r) => { const c = document.querySelectorAll('#screen .card')[1]; return /Not quite/.test(c.textContent) && c.querySelector(`[data-o="${r}"]`).classList.contains('right') && c.querySelectorAll('.wrong').length === 1 && c.querySelectorAll('[disabled]').length === 3 && !document.querySelector('#screen [data-act="co-conf"]'); }, right[0]));
    await click(page, `#screen [data-act="co-ans"][data-i="1"][data-o="${right[1]}"]`);
    ok('coach check: after both, the score and a way to try again', await P(() => /1 of 2 right/.test(document.querySelector('#screen').textContent) && !!document.querySelector('#screen [data-act="co-retry"]') && !window.__planner.state.coach.aw['7.1'].k));
    await click(page, '#screen [data-act="co-retry"]');
    for (const i of [0, 1]) await click(page, `#screen [data-act="co-ans"][data-i="${i}"][data-o="${right[i]}"]`);
    await click(page, '#screen [data-act="co-conf"][data-n="3"]');
    const learned = await P(() => { const p = window.__planner; return { u: p.state.coach.aw['7.1'], days: p.state.coach.days, study: p.state.study['2026-11-18'], toast: document.querySelector('#toast').textContent, text: document.querySelector('#screen').textContent, streak: p.coachStreak() }; });
    ok('coach check: saying how sure I am finishes the learning sitting and counts the day', learned.u.k === '2026-11-18' && learned.u.f === 3 && learned.days['2026-11-18'] === 1 && learned.study === 10 && /7\.1 learned/.test(learned.toast) && /2 of 2 right/.test(learned.text) && /Learned/.test(learned.text) && learned.streak === 1, learned);
    await click(page, '#screen [data-act="co-conf"][data-n="1"]');
    ok('coach check: changing my mind does not count the sitting twice, and "Not yet" offers the lesson again', await P(() => { const p = window.__planner; return p.state.coach.days['2026-11-18'] === 1 && p.state.study['2026-11-18'] === 10 && p.state.coach.aw['7.1'].f === 1 && !!document.querySelector('#screen [data-act="co-step"][data-id="learn"].btn'); }));
    pl = await plan();
    ok('coach plan: one sitting done today, the writing is what is left', pl.done === 1 && pl.todo.join() === '7.1 write' && pl.sit === 49, pl);

    // 3. plan: what the question word asks, the checklist, sources, my notes
    await click(page, '#screen [data-act="co-step"][data-id="plan"]');
    ok('coach plan step: the question word, the checklist, the slip, my own example and the sources', await P((q) => { const t = document.querySelector('#screen').textContent; const p = window.__planner; return t.includes(p.VERBS[q.verb]) && q.cover.every((c) => t.includes(c)) && t.includes(q.trap) && t.includes(q.own) && q.src.every((k) => t.includes(p.REFS[k])) && /Cite only what you have read/.test(t) && /The sentences have to be yours/.test(t); }, q71));
    await click(page, '#screen [data-act="co-tick"][data-i="0"]');
    await click(page, '#screen [data-act="co-tick"][data-i="2"]');
    await click(page, '#screen [data-act="co-tick"][data-i="2"]');
    ok('coach plan step: ticks go on and come off', await P(() => JSON.stringify(window.__planner.state.coach.aw['7.1'].t) === '{"0":1}' && document.querySelector('#screen [data-act="co-tick"][data-i="0"]').getAttribute('aria-checked') === 'true' && document.querySelector('#screen [data-act="co-tick"][data-i="2"]').getAttribute('aria-checked') === 'false'));
    ok('coach plan step: the notes box can be spoken into', await P(() => !!document.querySelector('#co-n-7-1 + .vbar [data-act="dictate"]')));
    await type('#co-n-7-1', 'audit trail; my example: the lathe observation record');
    await P(() => { window.__lastInsert = ''; });
    await click(page, '#screen [data-act="co-live"][data-k="aw"]');
    await page.waitForTimeout(400);
    ok('coach live: the brief carries what I typed a moment ago, and how the check went', await P(() => /My notes so far: audit trail; my example: the lathe observation record$/.test(window.__lastInsert || '') && /I have read the short lesson in my app; I got 2 of 2 check questions right; my confidence is low/.test(window.__lastInsert)));
    await click(page, '[data-act="close-tutor"]');
    await click(page, '#screen [data-act="lib-topic"]');
    ok('coach plan step: the Library opens on the topic', await P(() => window.__planner.route === 'library'));
    await P(() => window.__capgownBack());
    ok('coach: coming back from the Library lands on the same question, with the notes kept', await P(() => { const p = window.__planner; return p.route === 'coach' && p.sub.cq === '7.1' && document.querySelector('#co-n-7-1').value === 'audit trail; my example: the lathe observation record' && p.state.coach.aw['7.1'].n === 'audit trail; my example: the lathe observation record'; }));

    // 4. write: my own words; nothing counts until there are some
    await click(page, '#screen [data-act="co-step"][data-id="write"]');
    await click(page, '#screen [data-act="co-written"]');
    ok('coach write: an empty answer cannot be marked as written', await P(() => !window.__planner.state.coach.aw['7.1'].w) && /Write your answer first/.test(await toastText()));
    await click(page, '#screen [data-act="co-check"]');
    ok('coach write: Claude is not asked to check an empty answer', /Write your answer first, then Claude can check it/.test(await toastText()) && await P(() => document.querySelector('#tutor').hidden));
    const mine = 'Following the procedures matters because every decision I make as an assessor has to be traceable. When I observed a candidate turning a shaft on the lathe, I recorded the criteria, the evidence and my decision on the centre form the same day.';
    await type('#co-a-7-1', mine);
    ok('coach write: the words are counted as I type, and the box can be spoken into', await P((n) => document.querySelector('#co-wc').textContent === n + ' words' && !!document.querySelector('#co-a-7-1 + .vbar [data-act="dictate"]'), words(mine)));
    await page.waitForTimeout(750);
    ok('coach write: the answer is saved on the phone as I type', await P((m) => window.__planner.state.coach.aw['7.1'].a === m && JSON.parse(window.AndroidApp.loadState()).coach.aw['7.1'].a === m, mine));
    await P(() => { window.__calls.length = 0; window.__lastInsert = ''; });
    await click(page, '#screen [data-act="co-check"]');
    await page.waitForTimeout(400);
    const fb = await P(() => window.__lastInsert || '');
    ok('coach write: Claude checks my answer against the checklist without rewriting it', fb.includes(`Question: "7.1 ${q71.q}"`) && q71.cover.every((c) => fb.includes('- ' + c)) && fb.endsWith('My answer:\n' + mine) && /Do not write my answer for me/.test(fb) && /as pointers or questions, not as rewritten text/.test(fb) && /teacher's role instead of an assessor's/.test(fb), fb);
    await click(page, '[data-act="close-tutor"]');
    await click(page, '#screen [data-act="co-copy"]');
    ok('coach write: one answer can be copied with its question', await P(([q, m]) => window.__lastCopy === `7.1 ${q}\n\n${m}`, [q71.q, mine]));
    await click(page, '#screen [data-act="co-written"]');
    const wr = await P(() => { const p = window.__planner; return { u: p.state.coach.aw['7.1'], days: p.state.coach.days['2026-11-18'], study: p.state.study['2026-11-18'], text: document.querySelector('#screen').textContent, next: (document.querySelector('#screen .notice [data-act="co-open"]') || { dataset: {} }).dataset.id }; });
    ok('coach write: marking it written counts the second sitting and offers the next question', wr.u.w === '2026-11-18' && wr.days === 2 && wr.study === 30 && /Written on Wed 18 Nov/.test(wr.text) && wr.next === '7.2', wr);
    pl = await plan();
    ok('coach plan: today’s workbook steps are done, and the rest is spread again', pl.done === 2 && pl.todo.length === 0 && pl.sit === 48 && pl.today.join() === 'ksb:S18,cp:', pl);
    await click(page, '#screen [data-act="co-unwrite"]');
    ok('coach write: "Not finished yet" takes the mark off but keeps the words', await P((m) => { const u = window.__planner.state.coach.aw['7.1']; return !u.w && u.a === m; }, mine));
    await click(page, '#screen [data-act="co-written"]');
    await click(page, '#screen .notice [data-act="co-open"]');
    ok('coach: Next opens the next question at its lesson', await P(() => { const p = window.__planner; return p.sub.cq === '7.2' && document.querySelector('.costeps [aria-pressed="true"]').textContent.trim() === '1 Learn'; }));
    ok('coach: the phone’s back button closes the question, then leaves the coach', await P(() => { const p = window.__planner; const a = window.__capgownBack(); const mid = p.route + ':' + p.sub.cq; const b = window.__capgownBack(); return a === true && mid === 'coach:null' && b === true && p.route === 'home'; }));

    // the workbook screen: progress, finish date, hand-ins, my answers
    await P(() => { window.__planner.sub.cpath = 'aw'; window.__planner.go('coach'); });
    const main = await P(() => document.querySelector('#screen').textContent);
    ok('coach workbook: today’s steps are done and the pace is in plain words', /2 done today/.test(main) && /Today’s workbook steps are done/.test(main) && /48 short sittings left \(about 12h 0m\) and 31 days to go: 2 a day keeps you on track/.test(main) && /1 of 25 written/.test(main), main.slice(0, 900));
    await P(() => { const el = document.querySelector('#co-end-aw'); el.value = '2026-11-21'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    ok('coach workbook: a finish date that is too close says so instead of piling it on', await P(() => { const p = window.__planner; const A = p.awToday(); return p.state.coach.end.aw === '2026-11-21' && A.P.per === 12 && A.quota === 4 && /12 a day, which is too many/.test(document.querySelector('#screen').textContent); }));
    await P(() => { const el = document.querySelector('#co-end-aw'); el.value = '2026-11-01'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    ok('coach workbook: a date in the past is not kept', await P(() => !window.__planner.state.coach.end.aw && window.__planner.awEnd() === '2026-12-18'));
    await click(page, '#screen [data-act="co-handed-lo"][data-id="1"]');
    ok('coach workbook: an outcome already handed in drops out of the plan', await P(() => { const p = window.__planner; return ['1.1', '1.2', '1.3', '1.4'].every((id) => p.state.coach.aw[id].h === true) && p.awSittings().length === 40 && p.awOrder().length === 25 && /4 \/ 4/.test(document.querySelector('#screen').textContent); }));
    await click(page, '#screen [data-act="co-handed-lo"][data-id="1"]');
    ok('coach workbook: and comes back when switched off', await P(() => window.__planner.awSittings().length === 48));
    await click(page, '#screen [data-act="co-open"][data-id="3.1"]');
    await click(page, '#screen [data-act="co-step"][data-id="write"]');
    await click(page, '#screen [data-act="co-handed"]');
    ok('coach workbook: one question can be marked as handed in', await P(() => { const p = window.__planner; return p.state.coach.aw['3.1'].h === true && p.awSittings().length === 46 && /Handed in/.test(document.querySelector('#screen .card').textContent); }));
    await click(page, '#screen [data-act="co-handed"]');
    await P(() => { window.__planner.sub.cq = null; window.__planner.go('home'); window.__planner.go('coach'); window.__calls.length = 0; });
    await click(page, '#screen [data-act="co-copy-all"]');
    await click(page, '#screen [data-act="co-save-all"]');
    ok('coach workbook: my answers can be copied or saved, with their questions', await P(([q, m]) => { const want = `Unit D/601/5313: Understanding the principles and practices of assessment\nMy answers\n\n7.1 ${q}\n\n${m}\n`; const f = window.__calls.find((c) => c[0] === 'saveFile'); return window.__lastCopy === want && f && f[1] === 'assessor-workbook-my-answers-2026-11-18.txt' && f[3] === 'text/plain'; }, [q71.q, mine]));
    await P(() => { window.__lastInsert = ''; });
    await click(page, '#screen [data-act="co-live"][data-k="week"]');
    await page.waitForTimeout(400);
    const week = await P(() => window.__lastInsert || '');
    ok('coach workbook: Plan my week tells Claude where I am', /1 of 25 questions written/.test(week) && /I want to finish by Friday 18 December/.test(week) && /Still to do, in order: 7\.2 learn, 7\.2 write, 8\.1 learn/.test(week) && /31 of 51 KSBs evidenced/.test(week) && /Change project: my next step is "Note what you took from the change project workshop"/.test(week) && /Plan my next seven days/.test(week), week);
    await click(page, '[data-act="close-tutor"]');
    await click(page, '#screen [data-act="co-how"]');
    ok('coach: the help sheet says plainly what the app does and what Claude does', await P(() => { const t = document.querySelector('#layer').textContent; return /The coach never writes it for you/.test(t) && /you tap Send in Claude yourself/.test(t); }));
    await click(page, '[data-act="close-sheet"]');

    // a question with the workbook's own headings, and an answer already written in Practice papers
    await P(() => { const p = window.__planner; p.state.papers.aw12 = { answers: ['', '', '', '', 'Observation: I watch the candidate at work.'] }; p.sub.cq = '2.1'; p.sub.cs = 'write'; p.go('home'); p.go('coach'); });
    ok('coach write: an answer from Practice papers is offered', await P(() => /You wrote an answer to this in Practice papers/.test(document.querySelector('#screen').textContent) && !!document.querySelector('#screen [data-act="co-heads"]')));
    await click(page, '#screen [data-act="co-heads"]');
    ok('coach write: the workbook’s headings can be laid out', await P(() => window.__planner.state.coach.aw['2.1'].a === 'Observation:\n\nOral Questioning:\n\nProfessional / Guided Discussion:\n\nWitness Testimony:\n\nExamination of Product Evidence:\n\nWritten Questioning:\n' && document.querySelector('#co-wc').textContent === '15 words'));
    await P(() => { window.__planner.state.coach.aw['2.1'].a = ''; window.__planner.go('home'); window.__planner.go('coach'); });
    await click(page, '#screen [data-act="co-import"]');
    ok('coach write: and it is brought in, not typed again', await P(() => window.__planner.state.coach.aw['2.1'].a === 'Observation: I watch the candidate at work.' && document.querySelector('#co-a-2-1').value === 'Observation: I watch the candidate at work.' && !document.querySelector('#screen [data-act="co-import"]')));
    ok('coach: no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    // a lived-in phone from before the coach: the planner's ticks, the KSB evidence and the change project
    const st = JSON.parse(JSON.stringify(rich));
    ['as-o12-4', 'as-o12-5'].forEach((k) => { st.done[k] = Date.parse('2026-11-10T20:00:00'); });
    st.portfolio.evidence.push({ id: 'e2', date: '2026-11-12', title: 'Observation 2 feedback', type: 'Observation', link: '', ksbs: [], status: 'draft', notes: '' });
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: st });
    const P = (fn, arg) => page.evaluate(fn, arg);
    const type = (sel, text) => P(([s, t]) => { const el = document.querySelector(s); if (!el) return false; el.value = t; el.dispatchEvent(new Event('input', { bubbles: true })); return true; }, [sel, text]);
    ok('coach, older data: the coach’s record is added to a phone that never had one', await P(() => JSON.stringify(window.__planner.state.coach) === '{"aw":{},"ksb":{},"cp":{},"days":{},"end":{},"path":"aw","cpNote":""}'));
    ok('coach, planner: a hand-in ticked off on the planner counts as handed in', await P(() => { const p = window.__planner; const H = p.awHandedLo(); return H[1] && H[2] && !H[3] && !H[7] && p.awSittings().length === 40 && !p.awSittings().some((x) => /^[12]\./.test(x.q.id)); }));
    await P(() => { window.__planner.sub.cpath = 'aw'; window.__planner.go('coach'); });
    ok('coach, planner: the screen says why outcomes 1 and 2 are not in the plan', await P(() => /Your planner shows the hand-in for outcomes 1, 2 as done/.test(document.querySelector('#screen').textContent) && document.querySelector('#screen [data-act="co-handed-lo"][data-id="1"]').getAttribute('aria-checked') === 'true'));
    await click(page, '#screen [data-act="co-handed-lo"][data-id="2"]');
    ok('coach, planner: my own switch wins over the planner', await P(() => { const p = window.__planner; return p.state.coach.aw['2.1'].h === false && p.awSittings().length === 42 && p.awSittings().some((x) => x.q.id === '2.1'); }));
    const before = await P(() => JSON.stringify(window.__planner.state));
    for (const s of [{ cpath: 'aw' }, { cpath: 'ksb' }, { cpath: 'cp' }, { cq: '2.1', cs: 'learn', cn: 9 }, { cq: '2.1', cs: 'check' }, { cq: '5.2', cs: 'plan' }, { cq: '5.2', cs: 'write' }, { cq: '8.4', cs: null }]) await P((x) => { const p = window.__planner; p.go('home'); Object.assign(p.sub, { cq: null, cs: null, cn: 1, ck: null }, x); p.go('coach'); }, s);
    ok('coach: looking at its screens changes nothing', await P((b) => JSON.stringify(window.__planner.state) === b, before));

    // KSBs: one a day, the ones that count towards the most duties first
    await P(() => { const p = window.__planner; p.go('home'); Object.assign(p.sub, { cq: null, cs: null, ck: null }); p.go('coach'); });
    await click(page, '#screen [data-act="co-path"][data-id="ksb"]');
    const K = await P(() => { const p = window.__planner; const k = p.ksbToday(); return { gaps: k.gaps.length, pick: k.pick, end: k.P.end, perWeek: k.perWeek, left: k.left, path: p.state.coach.path, text: document.querySelector('#screen').textContent }; });
    ok('coach KSBs: the gaps, the date and a pace of about three a week', K.gaps === 49 && K.pick === 'K5' && K.end === '2027-04-23' && K.perWeek === 3 && K.left === 1 && K.path === 'ksb' && /49 gaps and 23 weeks to go: about 3 a week, so one KSB on most days is plenty/.test(K.text) && /Today’s KSB · about 10 min/.test(K.text), K);
    ok('coach KSBs: today’s KSB shows its wording and its duties', await P(() => { const p = window.__planner; const t = document.querySelector('#screen').textContent; return t.includes(p.KSBS.K5) && /Part of duty \d/.test(t); }));
    await P(() => { window.__lastInsert = ''; });
    await click(page, '#screen [data-act="co-live"][data-k="ksb"]');
    await page.waitForTimeout(400);
    const kp = await P(() => ({ t: window.__lastInsert || '', k: window.__planner.KSBS.K5 }));
    ok('coach KSBs: Claude is asked to explain the KSB and suggest evidence, not to write the note', kp.t.includes(`Today's KSB is K5: "${kp.k}"`) && /Do not write the note for me/.test(kp.t) && /I have no evidence tagged to K5 yet/.test(kp.t) && /Lesson plan week 6 \(Lesson plan\)/.test(kp.t), kp.t);
    await click(page, '[data-act="close-tutor"]');
    await click(page, '#screen [data-act="co-tag"][data-id="e2"]');
    ok('coach KSBs: evidence I already have can be tagged in one tap', await P(() => { const p = window.__planner; return p.state.portfolio.evidence.find((e) => e.id === 'e2').ksbs.join() === 'K5' && p.ksbCovered().has('K5') && p.ksbGaps().length === 48 && p.sub.ck === 'K5' && /Tagged already: Observation 2 feedback/.test(document.querySelector('#screen').textContent); }));
    await type('#co-k-K5', 'The feedback shows I adapted the task for two learners with support plans.');
    await P(() => { window.__lastInsert = ''; });
    await click(page, '#screen [data-act="co-live"][data-k="ksb"]');
    await page.waitForTimeout(400);
    ok('coach KSBs: the brief carries the evidence just tagged and my two lines', await P(() => /Evidence I have already tagged to K5: Observation 2 feedback\./.test(window.__lastInsert || '') && /My notes so far: The feedback shows I adapted the task/.test(window.__lastInsert)));
    await click(page, '[data-act="close-tutor"]');
    await click(page, '#screen [data-act="co-ksb-done"]');
    const kd = await P(() => { const p = window.__planner; const k = p.ksbToday(); return { u: p.state.coach.ksb.K5, days: p.state.coach.days['2026-11-18'], study: p.state.study['2026-11-18'], pick: k.pick, left: k.left, today: p.coachToday().map((x) => x.path).join(), text: document.querySelector('#screen').textContent }; });
    ok('coach KSBs: done for today keeps my two lines, counts the day and moves to the next gap', kd.u.n === 'The feedback shows I adapted the task for two learners with support plans.' && kd.u.d === '2026-11-18' && kd.days === 1 && kd.study === 10 && kd.pick === 'K9' && kd.left === 0 && !/ksb/.test(kd.today) && /Today’s KSB is done/.test(kd.text), kd);
    await click(page, '#screen [data-act="co-ksb-next"]');
    ok('coach KSBs: Pick another moves on', await P(() => window.__planner.sub.ck === 'S18'));
    await click(page, '#screen .ksbgrid [data-act="co-ksb-pick"][data-id="B1"]');
    await click(page, '#screen [data-act="co-ksb-done"]');
    ok('coach KSBs: a KSB worked on but without evidence waits in its own list', await P(() => { const p = window.__planner; const k = p.ksbToday(); return k.parked.join() === 'B1' && k.gaps.includes('B1') && p.state.coach.days['2026-11-18'] === 2 && !!document.querySelector('#screen .chips [data-act="co-ksb-pick"][data-id="B1"]'); }));
    await click(page, '#screen [data-act="ev-new"]');
    ok('coach KSBs: new evidence opens the evidence sheet', await P(() => /evidence/i.test(document.querySelector('#layer').textContent) && !document.querySelector('#layer').hidden));
    await click(page, '[data-act="close-sheet"]');

    // the change project: five minutes a day, the next planned step, running notes
    await click(page, '#screen [data-act="co-path"][data-id="cp"]');
    const C = await P(() => ({ text: document.querySelector('#screen').textContent, daily: window.__planner.CP_DAILY }));
    ok('coach change project: one five-minute task, the next step in the plan and the module’s rules', C.daily.some((d) => C.text.includes(d)) && /Next step in your plan · Wed 25 Nov/.test(C.text) && /Note what you took from the change project workshop: \d+ min/.test(C.text) && /After that/.test(C.text) && /AITS 2/.test(C.text), C.text.slice(0, 1200));
    await click(page, '#screen [data-act="co-cp-done"]');
    ok('coach change project: five minutes done is counted once', await P(() => { const p = window.__planner; return p.state.coach.cp['2026-11-18'] === 1 && p.state.coach.days['2026-11-18'] === 3 && p.state.study['2026-11-18'] === 25 && !document.querySelector('#screen [data-act="co-cp-done"]') && /1 of the last 7 days/.test(document.querySelector('#screen').textContent) && !p.coachToday().some((x) => x.path === 'cp'); }));
    await click(page, '#screen [data-act="co-note-ask"]');
    ok('coach change project: empty notes are not sent to Claude', await P(() => /Write or speak a few notes first/.test(document.querySelector('#toast').textContent) && document.querySelector('#tutor').hidden));
    await type('#co-cpnote', 'Week 1: 9 of 14 got the returning question on tolerances right.');
    ok('coach change project: the running notes can be spoken into', await P(() => !!document.querySelector('#co-cpnote + .vbar [data-act="dictate"]')));
    await P(() => { window.__lastInsert = ''; });
    await click(page, '#screen [data-act="co-note-ask"]');
    await page.waitForTimeout(400);
    const np = await P(() => window.__lastInsert || '');
    ok('coach change project: Claude asks what is missing from my notes and rewrites nothing', np.endsWith('Week 1: 9 of 14 got the returning question on tolerances right.') && /Do not write or rewrite anything for me/.test(np) && /Ask me up to five questions, one at a time/.test(np), np);
    await click(page, '[data-act="close-tutor"]');
    await P(() => { window.__lastInsert = ''; });
    await click(page, '#screen [data-act="co-live"][data-k="cp"]');
    await page.waitForTimeout(400);
    const cp = await P(() => window.__lastInsert || '');
    ok('coach change project: Claude coaches the next step with my notes and the module’s AI rule', /My next step is "Note what you took from the change project workshop"/.test(cp) && /Do not write the work for me/.test(cp) && /AITS 2/.test(cp) && /My running notes so far:\nWeek 1: 9 of 14/.test(cp), cp);
    await click(page, '[data-act="close-tutor"]');
    await click(page, '#screen [data-act="co-note-copy"]');
    ok('coach change project: the notes can be copied', await P(() => window.__lastCopy === 'Week 1: 9 of 14 got the returning question on tolerances right.'));
    await click(page, '#screen [data-act="start-step"]');
    ok('coach change project: Start it now opens the planner’s step', await P(() => window.__planner.route === 'learn' && window.__planner.sub.stepId === 'pg-cp-w0'));
    await P(() => { const p = window.__planner; p.state.coach.days['2026-11-17'] = 1; p.state.coach.days['2026-11-16'] = 2; p.state.coach.days['2026-11-14'] = 1; p.go('home'); });
    ok('coach: days in a row are counted, and Home says so', await P(() => window.__planner.coachStreak() === 3 && /3 days in a row/.test(document.querySelector('#coach-card').textContent)));
    await page.waitForTimeout(750);
    ok('coach: everything is in the saved copy', await P(() => { const c = JSON.parse(window.AndroidApp.loadState()).coach; return c.ksb.K5.d === '2026-11-18' && c.cp['2026-11-18'] === 1 && /^Week 1/.test(c.cpNote) && c.aw['2.1'].h === false; }));
    ok('coach, lived-in phone: no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    // damaged saved data must not stop the app, and what is sound is kept
    const st = JSON.parse(JSON.stringify(rich));
    st.coach = { aw: { zz: { a: 'x' }, 1.1: 'text', '2.1': { a: 5, n: ['x'], t: 'no', q: [1, 'b'], h: 'yes', w: 'soon', k: 20261118, f: 9, r: null }, '7.1': { a: 'My own answer.', w: '2026-11-17', k: '2026-11-16', f: 2, t: { 0: 1 }, q: { 0: 1 } } }, ksb: { K5: { n: 'two lines', d: '2026-11-17' }, Q9: { n: 'x' }, S2: 7 }, cp: 'yes', days: [1, 2], end: { aw: 'soon', ksb: '2027-03-01' }, path: 'nowhere', cpNote: { a: 1 } };
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: st });
    const c = await page.evaluate(() => window.__planner.state.coach);
    ok('coach, damaged data: what is sound is kept', c.aw['7.1'] && c.aw['7.1'].a === 'My own answer.' && c.aw['7.1'].w === '2026-11-17' && c.aw['7.1'].k === '2026-11-16' && c.aw['7.1'].f === 2 && c.aw['7.1'].t[0] === 1 && c.aw['7.1'].q[0] === 1 && c.ksb.K5.n === 'two lines' && c.ksb.K5.d === '2026-11-17' && c.end.ksb === '2027-03-01', c);
    ok('coach, damaged data: what is not is dropped', !c.aw.zz && Object.keys(c.aw).every((k) => /^\d\.\d$/.test(k) && c.aw[k] && typeof c.aw[k] === 'object') && (!c.aw['2.1'] || (typeof (c.aw['2.1'].a || '') === 'string' && typeof c.aw['2.1'].h !== 'string' && !c.aw['2.1'].w && !c.aw['2.1'].k)) && !c.ksb.Q9 && (!c.ksb.S2 || typeof c.ksb.S2 === 'object') && c.cp && typeof c.cp === 'object' && !Array.isArray(c.cp) && !Array.isArray(c.days) && !c.end.aw && c.path === 'aw' && c.cpNote === '', c);
    const shown = await page.evaluate(() => { const p = window.__planner; const out = []; for (const s of [{ cpath: 'aw' }, { cpath: 'ksb' }, { cpath: 'cp' }, { cq: '2.1', cs: 'check' }, { cq: '2.1', cs: 'write' }, { cq: '7.1', cs: null }]) { p.go('home'); Object.assign(p.sub, { cq: null, cs: null, ck: null }, s); p.go('coach'); out.push(document.querySelector('#screen').textContent.length > 200); } p.go('home'); out.push(!!document.querySelector('#coach-card')); return out; });
    ok('coach, damaged data: every coach screen still opens', shown.every(Boolean) && await page.evaluate(() => window.__planner.selfTest()), shown);
    ok('coach, damaged data: no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  for (const who of [{ name: 'the app before Listen and Speak', o: { app: true, app4: true } }, { name: 'a browser', o: { app: false } }]) {
    const { ctx, page, errors } = await open(browser, Object.assign({ now: '2026-11-18T19:30:00', state: null }, who.o));
    await page.evaluate(() => { window.__planner.state.settings.chatTipSeen = true; window.__planner.go('home'); });
    await click(page, '#coach-card [data-act="co-go"][data-path="aw"]');
    for (let i = 0; i < 5 && await click(page, '#screen [data-act="co-more"]'); i++);
    await click(page, '#screen [data-act="co-read"]');
    const q = await page.evaluate(() => window.__planner.AW_BY['7.1'].check.map((c) => c[2]));
    for (const i of [0, 1]) await click(page, `#screen [data-act="co-ans"][data-i="${i}"][data-o="${q[i]}"]`);
    await click(page, '#screen [data-act="co-conf"][data-n="2"]');
    await click(page, '#screen [data-act="co-step"][data-id="write"]');
    await page.evaluate(() => { const el = document.querySelector('#co-a-7-1'); el.value = 'My own words about records.'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await click(page, '#screen [data-act="co-written"]');
    ok(`coach in ${who.name}: learn, check and write all work`, await page.evaluate(() => { const u = window.__planner.state.coach.aw['7.1']; return u.r && u.k && u.w && u.a === 'My own words about records.' && window.__planner.state.coach.days['2026-11-18'] === 2; }));
    await click(page, '#screen [data-act="co-check"]');
    await page.waitForTimeout(400);
    ok(`coach in ${who.name}: Check my answer opens the tutor`, await page.evaluate((app) => !document.querySelector('#tutor').hidden && (!app || /My answer:\nMy own words about records\.$/.test(window.__lastInsert || '')), who.o.app));
    await click(page, '[data-act="close-tutor"]');
    for (const p of ['ksb', 'cp']) await page.evaluate((x) => { const P = window.__planner; P.sub.cq = null; P.sub.cpath = x; P.go('home'); P.go('coach'); }, p);
    ok(`coach in ${who.name}: no script errors`, errors.length === 0, errors);
    await ctx.close();
  }

  // ---------- K. PebblePad: its phone app (PebblePocket) and its website ----------
  {
    const STORE = 'https://play.google.com/store/apps/details?id=pebblepad.PebblePocket.android';
    const LINK = 'https://v3.pebblepad.co.uk/login/example';
    const REFL = 'The starter went well. Next time I will shorten the plenary.';
    const mk = () => { const st = JSON.parse(JSON.stringify(rich)); st.settings.pebblepad = LINK; st.portfolio.obsInfo = { 2: { date: '2026-11-12', spoken: '', targets: '', refl: REFL } }; return st; };
    {
      // the newest app, with the PebblePad app on the phone
      const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-18T19:30:00', state: mk() });
      const P = (fn, arg) => page.evaluate(fn, arg);
      const type = (sel, text) => P(([s, t]) => { const el = document.querySelector(s); if (!el) return false; el.value = t; el.dispatchEvent(new Event('input', { bubbles: true })); return true; }, [sel, text]);
      const opened = () => P(() => ({ app: window.__calls.filter((c) => c[0] === 'openPebblePad').length, out: window.__opened.slice(), sheet: document.querySelector('#layer').textContent, toast: document.querySelector('#toast').textContent, copy: window.__lastCopy || '' }));
      const reset = () => P(() => { window.__calls.length = 0; window.__opened.length = 0; window.__lastCopy = ''; });
      await P(() => { window.__planner.sub.ppage = 'overview'; window.__planner.go('portfolio'); });
      await click(page, '#appbar [data-act="pebblepad"]');
      let o = await opened();
      ok('PebblePad: the button offers the app and the website', /Open the PebblePad app/.test(o.sheet) && /Open PebblePad on the web/.test(o.sheet) && !/Play Store/.test(o.sheet) && !/not on this phone/.test(o.sheet) && /cannot swap data/.test(o.sheet), o.sheet);
      await click(page, '#layer [data-act="pp-app"]');
      o = await opened();
      ok('PebblePad: the app opens in one tap, nothing goes through the browser, and the sheet closes', o.app === 1 && o.out.length === 0 && o.sheet === '', o);
      await reset();
      await click(page, '#screen [data-act="pebblepad"]');
      await click(page, '#layer [data-act="pp-web"]');
      o = await opened();
      ok('PebblePad: the website opens with the saved link', o.app === 0 && o.out.join() === LINK && o.sheet === '', o);

      // a reflection: copied, taken across, then marked as uploaded
      await reset();
      await P(() => { window.__planner.go('home'); window.__planner.sub.ppage = 'obs'; window.__planner.go('portfolio'); });
      await click(page, '#screen [data-act="obs"][data-id="3"]');
      await click(page, '#layer [data-act="pp-take"][data-k="obs"]');
      o = await opened();
      ok('PebblePad: an empty reflection is not taken across', /Write the reflection first/.test(o.toast) && o.copy === '' && /Your reflection/.test(o.sheet) && !/Open the PebblePad app/.test(o.sheet), o);
      await click(page, '[data-act="close-sheet"]');
      await click(page, '#screen [data-act="obs"][data-id="2"]');
      await click(page, '#layer [data-act="pp-take"][data-k="obs"]');
      o = await opened();
      ok('PebblePad: a reflection is copied and the way across is offered', o.copy === REFL && /Your reflection on observation 2: copied/.test(o.sheet) && /hold a finger in the box and tap Paste/.test(o.sheet) && /It is in: mark the reflection as uploaded/.test(o.sheet) && /Copied\./.test(o.toast), o);
      await P(() => { window.__lastCopy = ''; });
      await click(page, '#layer [data-act="pp-copy"]');
      await click(page, '#layer [data-act="pp-app"]');
      o = await opened();
      ok('PebblePad: it can be copied again, and the sheet waits while I am in PebblePad', o.copy === REFL && o.app === 1 && /mark the reflection as uploaded/.test(o.sheet), o);
      await click(page, '#layer [data-act="pp-done"]');
      ok('PebblePad: back here, one tap marks the reflection as uploaded', await P(() => { const p = window.__planner.state.portfolio; return p.obs.r2 > 0 && !p.obs.f2 && document.querySelector('#layer').textContent === '' && /Marked as in PebblePad/.test(document.querySelector('#toast').textContent); }));
      await click(page, '#screen [data-act="obs"][data-id="2"]');
      await click(page, '#layer [data-act="pp-take"][data-k="obs"]');
      ok('PebblePad: what is already marked is not offered for marking again', await P(() => /Your reflection on observation 2: copied/.test(document.querySelector('#layer').textContent) && !document.querySelector('#layer [data-act="pp-done"]')));
      await click(page, '#layer [data-act="pp-web"]');
      ok('PebblePad: with nothing left to mark, the sheet closes as PebblePad opens', await P((l) => document.querySelector('#layer').textContent === '' && window.__opened.join() === l, LINK));

      // a piece of evidence: saved first, then its note goes across
      await reset();
      await P(() => { window.__planner.go('home'); window.__planner.sub.ppage = 'ksb'; window.__planner.go('portfolio'); });
      await click(page, '#screen [data-act="ev-new"]');
      await click(page, '#layer [data-act="pp-take"][data-k="ev"]');
      o = await opened();
      ok('PebblePad: evidence with no title is not saved or taken across', /Give it a title first/.test(o.toast) && o.copy === '' && await P(() => window.__planner.state.portfolio.evidence.length === 1), o);
      await click(page, '[data-act="close-sheet"]');
      await click(page, '#screen [data-act="ev-edit"][data-id="e1"]');
      await type('#ev-notes', 'The plan shows how I sequenced the theory before the practical.');
      await click(page, '#layer [data-act="pp-take"][data-k="ev"]');
      o = await opened();
      ok('PebblePad: evidence is saved, and its title, KSBs and note are copied', o.copy === 'Lesson plan week 6\nLesson plan, Sunday 1 November\nKSBs: K1, S2\nWhat it shows: The plan shows how I sequenced the theory before the practical.' && /Your evidence note: copied/.test(o.sheet) && /mark this as In PebblePad/.test(o.sheet) && await P(() => { const e = window.__planner.state.portfolio.evidence; return e.length === 1 && e[0].notes === 'The plan shows how I sequenced the theory before the practical.' && e[0].status === 'draft'; }), o);
      await click(page, '#layer [data-act="pp-done"]');
      ok('PebblePad: one tap marks the evidence as In PebblePad', await P(() => window.__planner.state.portfolio.evidence[0].status === 'uploaded' && /In PebblePad/.test(document.querySelector('#screen [data-act="ev-edit"][data-id="e1"]').textContent)));

      // the coach's two lines for a KSB
      await reset();
      await P(() => { const p = window.__planner; p.go('home'); Object.assign(p.sub, { cq: null, cpath: 'ksb', ck: 'K5' }); p.go('coach'); });
      await click(page, '#screen [data-act="pp-take"][data-k="ksb"]');
      o = await opened();
      ok('PebblePad: the coach asks for the two lines before taking them across', /Write your two lines first/.test(o.toast) && o.copy === '' && o.sheet === '', o);
      await type('#co-k-K5', 'My scheme of work adapts each task for two learners with support plans.');
      await click(page, '#screen [data-act="pp-take"][data-k="ksb"]');
      o = await opened();
      const k5 = await P(() => window.__planner.KSBS.K5);
      ok('PebblePad: the coach’s two lines go across with the KSB’s wording', o.copy === `K5: ${k5}\n\nMy scheme of work adapts each task for two learners with support plans.` && /Your two lines for K5: copied/.test(o.sheet) && /mark K5 as evidenced in PebblePad/.test(o.sheet), o);
      await click(page, '#layer [data-act="pp-done"]');
      ok('PebblePad: marking it closes the KSB gap', await P(() => { const p = window.__planner; return p.state.portfolio.ksbDone.K5 > 0 && !p.ksbGaps().includes('K5'); }));

      // Settings says what it found
      await reset();
      await P(() => window.__planner.go('settings'));
      ok('PebblePad in Settings: the app is found on the phone', await P(() => { const t = document.querySelector('#pp-card').textContent; return /On this phone\. The PebblePad buttons open it in one tap/.test(t) && /Your PebblePad link \(the website\)/.test(t) && !/Play Store/.test(t); }));
      await click(page, '#pp-card [data-act="pp-app"]');
      o = await opened();
      ok('PebblePad in Settings: Open tries it', o.app === 1 && o.out.length === 0, o);
      await page.waitForTimeout(750);
      ok('PebblePad: what was marked is in the saved copy', await P(() => { const s = JSON.parse(window.AndroidApp.loadState()); return s.portfolio.obs.r2 > 0 && s.portfolio.evidence[0].status === 'uploaded' && s.portfolio.ksbDone.K5 > 0; }));
      ok('PebblePad: no script errors', errors.length === 0, errors);
      await ctx.close();
    }
    {
      // the newest app, but the PebblePad app is not on the phone, and no link is saved
      const st = mk(); st.settings.pebblepad = '';
      const { ctx, page, errors } = await open(browser, { app: true, noPebble: true, now: '2026-11-18T19:30:00', state: st });
      await page.evaluate(() => { window.__planner.sub.ppage = 'overview'; window.__planner.go('portfolio'); });
      await click(page, '#appbar [data-act="pebblepad"]');
      ok('PebblePad not installed: the sheet says so', await page.evaluate(() => { const t = document.querySelector('#layer').textContent; return /It is not on this phone yet/.test(t) && /Add your link first/.test(t); }));
      await click(page, '#layer [data-act="pp-app"]');
      ok('PebblePad not installed: it is shown in the Play Store', await page.evaluate((s) => window.__calls.some((c) => c[0] === 'openPebblePad') && window.__opened.join() === s && /not on this phone yet\. Here it is in the Play Store/.test(document.querySelector('#toast').textContent), STORE));
      await click(page, '#screen [data-act="pebblepad"]');
      await click(page, '#layer [data-act="pp-web"]');
      await page.waitForTimeout(120);
      ok('PebblePad: with no link saved, the website button asks for it in Settings', await page.evaluate(() => window.__planner.route === 'settings' && /Add your PebblePad link first/.test(document.querySelector('#toast').textContent) && document.activeElement && document.activeElement.id === 'f-pp' && window.__opened.length === 1));
      ok('PebblePad not installed: Settings says so', await page.evaluate(() => /Not on this phone yet\. The button takes you to it in the Play Store/.test(document.querySelector('#pp-card').textContent)));
      ok('PebblePad not installed: no script errors', errors.length === 0, errors);
      await ctx.close();
    }
    for (const who of [{ name: 'the app before this', o: { app: true, app6: true } }, { name: 'a browser', o: { app: false } }]) {
      const { ctx, page, errors } = await open(browser, Object.assign({ now: '2026-11-18T19:30:00', state: mk() }, who.o));
      await page.evaluate(() => { window.__planner.sub.ppage = 'overview'; window.__planner.go('portfolio'); });
      await click(page, '#appbar [data-act="pebblepad"]');
      const sheetText = await page.evaluate(() => document.querySelector('#layer').textContent);
      ok(`PebblePad in ${who.name}: the sheet says how the app will open`, who.o.app ? /opens through its Play Store page: tap Open there\. One more install of Cap and Gown opens it in one tap/.test(sheetText) && await page.evaluate(() => !!document.querySelector('#layer [data-act="get-app"]')) : !/One more install/.test(sheetText), sheetText);
      await click(page, '#layer [data-act="pp-app"]');
      ok(`PebblePad in ${who.name}: the app is reached through its Play Store page`, await page.evaluate((s) => window.__opened.join() === s && !window.__calls.some((c) => c[0] === 'openPebblePad'), STORE));
      await page.evaluate(() => { window.__opened.length = 0; });
      await click(page, '#screen [data-act="pebblepad"]');
      await click(page, '#layer [data-act="pp-web"]');
      ok(`PebblePad in ${who.name}: the website still opens`, await page.evaluate((l) => window.__opened.join() === l, LINK));
      await page.evaluate(() => { window.__planner.go('home'); window.__planner.sub.ppage = 'obs'; window.__planner.go('portfolio'); });
      await click(page, '#screen [data-act="obs"][data-id="2"]');
      await click(page, '#layer [data-act="pp-take"][data-k="obs"]');
      await click(page, '#layer [data-act="pp-done"]');
      await page.evaluate(() => window.__planner.go('settings'));
      ok(`PebblePad in ${who.name}: taking a reflection across and marking it still work`, await page.evaluate((app) => window.__planner.state.portfolio.obs.r2 > 0 && (app ? /Opens through its Play Store page for now/.test(document.querySelector('#pp-card').textContent) : /On a phone, this opens the app or its Play Store page/.test(document.querySelector('#pp-card').textContent)), who.o.app));
      ok(`PebblePad in ${who.name}: no script errors`, errors.length === 0, errors);
      await ctx.close();
    }
  }

  // ---------- L. Mentor meetings: the phone takes the notes, Claude drafts the record ----------
  {
    const REPLY = '**WHO WAS THERE:** Me and my mentor\nPROGRESS ON LAST TARGETS:\nI tried the hinge question [check].\nStrengths: this line is part of the progress, not a heading.\n\n## WHAT WE DISCUSSED:\n- The starter went well.\n- The plenary was rushed.\n\nSTRENGTHS:\nClear instructions.\nAREAS TO DEVELOP:\nNot discussed\nTARGETS AND ACTIONS:\n* Shorten the plenary, me, by Friday\nNEXT MEETING:\nThursday 3 December';
    const NOTES = 'We talked about the starter activity and how the learners settled quickly. My mentor said the instructions were clear. Next time I should shorten the plenary and ask a hinge question before the practical.';
    const mk = () => { const st = JSON.parse(JSON.stringify(rich)); st.settings.pebblepad = 'https://v3.pebblepad.co.uk/login/example'; return st; };
    const toMeetings = (page) => page.evaluate(() => { const P = window.__planner; P.go('home'); P.sub.ppage = 'meetings'; P.go('portfolio'); });
    {
      // the newest app
      const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-23T15:30:00', state: mk() });
      const P = (fn, arg) => page.evaluate(fn, arg);
      const type = (sel, text) => P(([s, t]) => { const el = document.querySelector(s); if (!el) return false; el.value = t; el.dispatchEvent(new Event('input', { bubbles: true })); return true; }, [sel, text]);
      const notes = () => P(() => window.__planner.state.portfolio.meetNotes);
      const saved = () => P(() => JSON.parse(window.AndroidApp.loadState()).portfolio);
      const scr = () => P(() => document.querySelector('#screen').textContent);
      const toastText = () => P(() => document.querySelector('#toast').hidden ? '' : document.querySelector('#toast').textContent);
      await toMeetings(page);
      ok('meeting: the page offers to listen, to paste a transcript and to write a meeting up, and shows saved meetings', await P(() => !!document.querySelector('#screen [data-act="meet-listen"]') && !!document.querySelector('#screen [data-act="meet-paste"]') && !!document.querySelector('#screen [data-act="meet-new"]') && /No sound is saved/.test(document.querySelector('#screen').textContent) && /Talked targets/.test(document.querySelector('#screen').textContent)));
      await click(page, '#screen [data-act="meet-listen"]');
      const sheet0 = await P(() => document.querySelector('#layer').textContent);
      ok('meeting: before listening it says what happens to the words and asks about the mentor', /keeps only the words/.test(sheet0) && /No sound is saved/.test(sheet0) && /My mentor knows and agrees/.test(sheet0) && /may send the sound to Google/.test(sheet0) && /Keep the app open on the screen if you can/.test(sheet0) && /To listen with the phone locked/.test(sheet0) && !/You can lock the phone/.test(sheet0) && !/newest app/.test(sheet0) && !/One more install/.test(sheet0), sheet0);
      await click(page, '#layer [data-act="meet-start"]'); await tick(page);
      ok('meeting: it will not start until the mentor has agreed', (await calls(page, 'meetingStart')).length === 0 && /Ask your mentor first/.test(await toastText()) && await P(() => !window.__planner.MEET.live && window.__planner.state.portfolio.meetNotes == null));
      await click(page, '#layer #mt-ok');
      await click(page, '#layer [data-act="meet-start"]'); await tick(page);
      ok('meeting: Start asks the phone to listen to a whole meeting, and says Listening', (await calls(page, 'meetingStart')).length === 1 && (await calls(page, 'dictateStart')).length === 0 && await P(() => window.__planner.MEET.live && document.querySelector('#mt-state').textContent === 'Listening' && document.querySelector('#layer').textContent === '' && !!document.querySelector('#screen [data-act="meet-pause"]') && !!document.querySelector('#screen [data-act="meet-finish"]')));
      ok('meeting: the notes start empty, dated today, and are saved straight away', await P(() => { const n = window.__planner.state.portfolio.meetNotes; const s = JSON.parse(window.AndroidApp.loadState()).portfolio.meetNotes; return n.date === '2026-11-23' && n.text === '' && s && s.date === '2026-11-23'; }));
      await P(() => window.__say('we talked about the starter activity'));
      ok('meeting: what is heard goes into the notes, with the time', (await notes()).text === '[15:30]\nWe talked about the starter activity.' && await P(() => /We talked about the starter activity\./.test(document.querySelector('#mt-live').textContent) && /^6 words so far/.test(document.querySelector('#mt-count').textContent)), await notes());
      await P(() => window.__say('and my mentor said full stop the plenary comma was rushed', 'partial'));
      ok('meeting: words still being heard show in grey and are not kept yet', await P(() => /the plenary comma was rushed/.test(document.querySelector('#mt-live i').textContent)) && (await notes()).text === '[15:30]\nWe talked about the starter activity.');
      await P(() => window.__say('and my mentor said full stop the plenary comma was rushed'));
      ok('meeting: a second piece joins the first, without a second time, and spoken punctuation words are left as said', (await notes()).text === '[15:30]\nWe talked about the starter activity. And my mentor said full stop the plenary comma was rushed.', await notes());
      await P(() => window.__capgownDictate('wait', 'offline'));
      ok('meeting: when the signal drops it says so and keeps the words', await P(() => /No connection\. Trying again/.test(document.querySelector('#mt-state').textContent) && window.__planner.MEET.live && document.querySelector('#mt-dot').style.visibility === 'hidden'));
      await P(() => window.__capgownDictate('ready', ''));
      ok('meeting: and Listening again when it is back', await P(() => document.querySelector('#mt-state').textContent === 'Listening' && document.querySelector('#mt-dot').style.visibility === 'visible'));
      await P(() => { const M = window.__planner.MEET; M.tickAt = Date.now() - 3000; window.__planner.meetTick(); });
      ok('meeting: the clock counts the listening', await P(() => { const n = window.__planner.state.portfolio.meetNotes; return n.secs >= 2.9 && n.secs < 4.5 && /^0:0[34]$/.test(document.querySelector('#mt-clock').textContent); }), await notes());
      // five minutes on, the time is written again
      await P(() => { window.__planner.MEET.stampAt -= 5 * 60000; window.__NOW = '2026-11-23T15:35:00'; window.__say('next time shorten the plenary'); });
      ok('meeting: the time is noted again every five minutes', /\.\n\n\[15:35\]\nNext time shorten the plenary\.$/.test((await notes()).text), await notes());
      // Speak in a writing box has to wait
      await click(page, '#screen [data-act="meet-new"]');
      await click(page, '#m-disc + .vbar [data-act="dictate"]'); await tick(page);
      ok('meeting: Speak in a writing box is refused while the meeting is being listened to', (await calls(page, 'dictateStart')).length === 0 && /Pause that first/.test(await toastText()) && await P(() => !window.__planner.DICT.on && window.__planner.MEET.live));
      await click(page, '[data-act="close-sheet"]'); await tick(page);
      ok('meeting: closing a sheet over the page leaves it listening', await P(() => window.__planner.MEET.live) && (await calls(page, 'dictateStop')).length === 0);
      // Pause and carry on
      await click(page, '#screen [data-act="meet-pause"]'); await tick(page);
      ok('meeting: Pause stops the microphone and keeps the words', (await calls(page, 'dictateStop')).length === 1 && await P(() => !window.__planner.MEET.live && !!document.querySelector('#mt-paused') && /Nothing is being taken down/.test(document.querySelector('#screen').textContent)) && /Next time shorten the plenary\.$/.test((await saved()).meetNotes.text));
      await P(() => window.__say('this was said while paused'));
      ok('meeting: nothing said while paused is taken down', !/while paused/.test((await notes()).text));
      await click(page, '#screen [data-act="meet-resume"]'); await tick(page);
      ok('meeting: Carry on listens again without asking twice', (await calls(page, 'meetingStart')).length === 2 && await P(() => window.__planner.MEET.live && document.querySelector('#layer').textContent === '' && document.querySelector('#mt-state').textContent === 'Listening'));
      // the phone is locked or another app is opened: the newest app keeps listening under its own notice
      ok('meeting: with the phone’s speech the card says to keep the app open if you can', await P(() => window.__planner.MEET.bg === true && window.__planner.MEET.own === false && /Keep the app open on the screen if you can/.test(document.querySelector('#mt-foot').textContent) && !/You can lock the phone/.test(document.querySelector('#mt-foot').textContent)));
      await P(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => !!window.__hidden }); window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForTimeout(500);
      ok('meeting: with the phone locked it keeps listening', (await calls(page, 'meetingStart')).length === 2 && (await calls(page, 'dictateStop')).length === 1 && await P(() => window.__planner.MEET.live && window.__planner.MEET.st === 'on' && window.__planner.MEET.hidAt > 0));
      await P(() => window.__say('said while the phone was locked'));
      ok('meeting: words heard with the phone locked go into the notes and are saved at once', /Said while the phone was locked\.$/.test((await notes()).text) && await P(() => /Said while the phone was locked\.$/.test(JSON.parse(localStorage.getItem('capgown-planner-v1')).portfolio.meetNotes.text)));
      await P(() => { const M = window.__planner.MEET; window.__planner.state.portfolio.meetNotes.secs = 100; M.tickAt = Date.now() - 60000; window.__planner.meetTick(); });
      ok('meeting: the clock keeps time while the page’s own timer is slowed', await P(() => { const x = window.__planner.state.portfolio.meetNotes.secs; return x >= 159 && x <= 162; }), await notes());
      await P(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); window.__capgownResume(); }); await tick(page);
      ok('meeting: back on the screen it is still listening, and nothing was started twice', (await calls(page, 'meetingStart')).length === 2 && await P(() => window.__planner.MEET.live && document.querySelector('#mt-state').textContent === 'Listening'));
      // the notice could not be put up, so the phone stopped the microphone off the screen: wait, then carry on
      await P(() => { window.__offScreen = true; window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); window.__dictateEnd(''); });
      await page.waitForTimeout(550);
      ok('meeting: if the phone stops the microphone off the screen, the page waits for the app to come back', (await calls(page, 'meetingStart')).length === 3 && await P(() => window.__planner.MEET.live && window.__planner.MEET.st === 'away'));
      await P(() => { window.__offScreen = false; window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); }); await tick(page);
      ok('meeting: and carries on when it is back', (await calls(page, 'meetingStart')).length === 4 && await P(() => document.querySelector('#mt-state').textContent === 'Listening'));
      // the phone stops by itself (its own limit): the page starts it again
      await P(() => window.__dictateEnd(''));
      await page.waitForTimeout(550);
      ok('meeting: if the phone stops by itself the page starts it again', (await calls(page, 'meetingStart')).length === 5 && await P(() => window.__planner.MEET.live));
      // other screens of the app: it keeps listening, and each of them says so
      const stops = (await calls(page, 'dictateStop')).length;
      await P(() => window.__planner.go('home')); await tick(page);
      ok('meeting: it keeps listening on other screens of the app, and each one says so', (await calls(page, 'dictateStop')).length === stops && await P(() => { const bar = document.querySelector('#screen .mtbar'); return window.__planner.MEET.live && !!bar && /Listening/.test(bar.textContent) && /mentor meeting/i.test(bar.textContent) && /^\d+:\d\d$/.test(bar.querySelector('#mt-clock').textContent); }));
      await P(() => window.__say('said on the home screen'));
      ok('meeting: words heard on another screen go into the notes', /Said on the home screen\.$/.test((await notes()).text));
      await P(() => window.__capgownDictate('wait', 'busy'));
      ok('meeting: the bar shows when the speech service drops out', await P(() => /dropped out/.test(document.querySelector('#screen .mtbar').textContent)));
      await P(() => { window.__capgownDictate('ready', ''); window.__planner.go('settings'); });
      ok('meeting: the bar is on every screen', await P(() => /Listening/.test((document.querySelector('#screen .mtbar') || {}).textContent || '')));
      await click(page, '#screen .mtbar'); await tick(page);
      ok('meeting: tapping the bar opens Mentor meetings, still listening', await P(() => window.__planner.route === 'portfolio' && window.__planner.sub.ppage === 'meetings' && !!document.querySelector('#mt-card') && !document.querySelector('#screen .mtbar') && window.__planner.MEET.live));
      await click(page, '#fab'); await tick(page);
      ok('meeting: opening the tutor does not stop it', await P(() => window.__planner.MEET.live && !document.querySelector('#tutor').hidden) && (await calls(page, 'dictateStop')).length === stops);
      await click(page, '[data-act="close-tutor"]');
      // nothing else may talk into the microphone
      ok('meeting: Listen will not read aloud while the meeting is being listened to', await P(() => window.__planner.listen('A title', 'Some words to read.') === false) && /Pause that first/.test(await toastText()) && (await calls(page, 'listenStart')).length === 0);
      // Pause on the phone's notice
      await P(() => window.__dictateEnd('paused')); await tick(page);
      ok('meeting: Pause on the phone’s notice pauses it, with the words kept', await P(() => !window.__planner.MEET.live && !!document.querySelector('#mt-paused')) && /Said on the home screen\.$/.test((await notes()).text));
      await page.waitForTimeout(500);
      ok('meeting: and it does not start again by itself', (await calls(page, 'meetingStart')).length === 5 && await P(() => !window.__planner.MEET.live));
      // a phone that takes the microphone away when it is locked
      await click(page, '#screen [data-act="meet-resume"]'); await tick(page);
      await P(() => window.__dictateEnd('locked')); await tick(page);
      ok('meeting: a phone that stops the microphone when it is locked is named as the reason', await P(() => !window.__planner.MEET.live && /stopped the listening when it was locked or the app was left/.test(document.querySelector('#mt-notes-card').textContent)));
      // quiet from the moment the phone was locked: the phone may have stopped hearing
      await click(page, '#screen [data-act="meet-resume"]'); await tick(page);
      await P(() => { const M = window.__planner.MEET; window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); M.heardAt = M.hidAt - 5000; window.__hidden = false; window.__dictateEnd('quiet'); }); await tick(page);
      ok('meeting: ten quiet minutes straight after the phone was locked are flagged', await P(() => !window.__planner.MEET.live && /Nothing was heard for 10 minutes after the phone was locked/.test(document.querySelector('#mt-notes-card').textContent)));
      // nobody speaks for ten minutes
      await click(page, '#screen [data-act="meet-resume"]'); await tick(page);
      await P(() => window.__dictateEnd('quiet')); await tick(page);
      ok('meeting: ten quiet minutes end the listening, and the notes say why', await P(() => !window.__planner.MEET.live && !!document.querySelector('#mt-notes-card') && /nobody had spoken for 10 minutes/.test(document.querySelector('#mt-notes-card').textContent)));
      // ninety minutes is the most
      await click(page, '#screen [data-act="meet-resume"]'); await tick(page);
      await P(() => { const M = window.__planner.MEET; window.__planner.state.portfolio.meetNotes.secs = 90 * 60 - 1; M.tickAt = Date.now() - 2000; window.__planner.meetTick(); }); await tick(page);
      ok('meeting: it stops after 90 minutes of listening', await P(() => !window.__planner.MEET.live && /after 90 minutes/.test(document.querySelector('#mt-notes-card').textContent)));
      await P(() => { window.__planner.state.portfolio.meetNotes.secs = 1500; });
      // Finish: the notes can be read and corrected
      await click(page, '#screen [data-act="meet-resume"]'); await tick(page);
      await click(page, '#screen [data-act="meet-finish"]'); await tick(page);
      ok('meeting: Finish shows the notes to read through', await P(() => { const n = window.__planner.state.portfolio.meetNotes; const ta = document.querySelector('#mt-notes'); return !window.__planner.MEET.live && ta && ta.value === n.text && /25 min of listening/.test(document.querySelector('#mt-notes-card').textContent) && /Take out learners’ names/.test(document.querySelector('#mt-notes-card').textContent) && !document.querySelector('#mt-draft'); }));
      await type('#mt-notes', 'Too short.');
      await click(page, '#screen [data-act="meet-build"]'); await page.waitForTimeout(350);
      ok('meeting: Claude is not asked to build a record from next to nothing', /not enough in the notes/.test(await toastText()) && await P(() => document.querySelector('#tutor').hidden && !window.__lastInsert));
      await type('#mt-notes', '[15:30]\n' + NOTES);
      await page.waitForTimeout(700);
      ok('meeting: corrections to the notes are saved', (await saved()).meetNotes.text === '[15:30]\n' + NOTES);
      await click(page, '#screen [data-act="meet-build"]'); await page.waitForTimeout(450);
      const brief = await P(() => window.__lastInsert || '');
      ok('meeting: Build my record gives Claude the notes and the headings of the record', ['WHO WAS THERE:', 'PROGRESS ON LAST TARGETS:', 'WHAT WE DISCUSSED:', 'STRENGTHS:', 'AREAS TO DEVELOP:', 'TARGETS AND ACTIONS:', 'NEXT MEETING:'].every((h) => brief.includes('\n' + h + '\n')) && brief.includes(NOTES) && /Monday 23 November/.test(brief), brief);
      ok('meeting: and tells it to add nothing, to mark doubts, to name no learner and to write no reflection', /Use only what is in the notes/.test(brief) && /\[check\]/.test(brief) && /Do not name any learner/.test(brief) && /Do not write any reflection for me\./.test(brief) && /"Not discussed"/.test(brief), brief);
      ok('meeting: the tutor opens with it, and nothing is sent by the app itself', await P(() => !document.querySelector('#tutor').hidden && window.__calls.filter((c) => c[0] === 'chatInsert').length === 1));
      await click(page, '[data-act="close-tutor"]');
      ok('meeting: a box for Claude’s reply appears', await P(() => !!document.querySelector('#mt-draft') && !!document.querySelector('#screen [data-act="meet-fill"]') && window.__planner.state.portfolio.meetNotes.sent > 0 && /Ask Claude again/.test(document.querySelector('#screen [data-act="meet-build"]').textContent)));
      await click(page, '#screen [data-act="meet-fill"]');
      ok('meeting: an empty reply is not turned into a record', /Paste Claude’s reply into the box first/.test(await toastText()) && await P(() => document.querySelector('#layer').textContent === ''));
      await type('#mt-draft', REPLY);
      await page.waitForTimeout(700);
      await click(page, '#screen [data-act="meet-fill"]');
      const boxes = await P(() => { const v = (id) => (document.querySelector('#' + id) || {}).value; return { title: document.querySelector('#layer h3').textContent, present: v('m-present'), progress: v('m-progress'), disc: v('m-disc'), strengths: v('m-strengths'), develop: v('m-develop'), act: v('m-act'), next: v('m-next'), date: v('m-date'), hidden: document.querySelectorAll('#layer .mopt[hidden]').length, more: !!document.querySelector('#layer [data-act="meet-more"]'), drop: document.querySelector('#m-drop').getAttribute('aria-checked'), ev: document.querySelector('#m-ev').getAttribute('aria-checked'), text: document.querySelector('#layer').textContent }; });
      ok('meeting: Claude’s reply is sorted into the boxes of the record', boxes.present === 'Me and my mentor' && boxes.progress === 'I tried the hinge question [check].\nStrengths: this line is part of the progress, not a heading.' && boxes.disc === '- The starter went well.\n- The plenary was rushed.' && boxes.strengths === 'Clear instructions.' && boxes.develop === '' && boxes.act === '- Shorten the plenary, me, by Friday' && boxes.next === 'Thursday 3 December', boxes);
      ok('meeting: the record is dated the day of the meeting, shows every heading and asks for it to be checked', boxes.title === 'Check your record' && boxes.date === '2026-11-23' && boxes.hidden === 0 && !boxes.more && /Check every box against what was really said/.test(boxes.text) && /ask your mentor to read it/.test(boxes.text) && boxes.drop === 'true' && boxes.ev === 'true', boxes);
      await type('#m-develop', 'Pace of the plenary.');
      await click(page, '#layer [data-act="meet-save"]');
      const after = await saved();
      const m = after.meetings.find((x) => x.date === '2026-11-23');
      ok('meeting: Save keeps the record with every box, and adds it to the evidence log', !!m && m.present === 'Me and my mentor' && m.discussed === '- The starter went well.\n- The plenary was rushed.' && m.develop === 'Pace of the plenary.' && m.actions === '- Shorten the plenary, me, by Friday' && m.next === 'Thursday 3 December' && m.none === false && after.evidence.some((e) => e.title === 'Mentor meeting, Mon 23 Nov' && e.type === 'Mentor meeting record') && /Meeting recorded/.test(await toastText()), [m, after.evidence.map((e) => e.title)]);
      ok('meeting: and the phone’s notes are deleted', after.meetNotes === null && await P(() => window.__planner.state.portfolio.meetNotes === null && !!document.querySelector('#screen [data-act="meet-listen"]') && !document.querySelector('#mt-notes')));
      ok('meeting: no sound and no notes are left anywhere in the saved data', !/starter activity and how the learners settled/.test(JSON.stringify(after)));
      // open it again, change it, take it to PebblePad
      await click(page, `#screen [data-act="meet-open"][data-id="${m.id}"]`);
      ok('meeting: a saved meeting opens with its boxes filled', await P(() => document.querySelector('#layer h3').textContent === 'Mentor meeting' && document.querySelector('#m-present').value === 'Me and my mentor' && document.querySelectorAll('#layer .mopt[hidden]').length === 0 && !document.querySelector('#m-none') && !document.querySelector('#m-drop')));
      await type('#m-act', '- Shorten the plenary, me, by Friday\n- Send the scheme of work, my mentor, by Monday');
      await P(() => { window.__lastCopy = ''; window.__calls.length = 0; });
      await click(page, '#layer [data-act="pp-take"][data-k="meet"]');
      const pp = await P(() => ({ copy: window.__lastCopy || '', sheet: document.querySelector('#layer').textContent, n: window.__planner.state.portfolio.meetings.length, ev: window.__planner.state.portfolio.evidence.filter((e) => e.type === 'Mentor meeting record').length }));
      ok('meeting: Take it to PebblePad saves the change and copies the record under its headings', pp.copy === 'Mentor meeting, Monday 23 November\n\nWho was there:\nMe and my mentor\n\nProgress on last targets:\nI tried the hinge question [check].\nStrengths: this line is part of the progress, not a heading.\n\nWhat we discussed:\n- The starter went well.\n- The plenary was rushed.\n\nStrengths:\nClear instructions.\n\nAreas to develop:\nPace of the plenary.\n\nTargets and actions:\n- Shorten the plenary, me, by Friday\n- Send the scheme of work, my mentor, by Monday\n\nNext meeting:\nThursday 3 December' && /Open the PebblePad app/.test(pp.sheet) && /mark this meeting as in PebblePad/.test(pp.sheet), pp);
      ok('meeting: changing a saved meeting does not add a second one or a second evidence entry', pp.n === 2 && pp.ev === 1, pp);
      await click(page, '#layer [data-act="pp-done"]');
      ok('meeting: marking it shows In PebblePad on the list', await P((id) => window.__planner.state.portfolio.meetings.find((x) => x.id === id).pp > 0 && /In PebblePad/.test(document.querySelector(`#screen [data-act="meet-open"][data-id="${id}"]`).textContent), m.id));
      // an old meeting, written before this page, still opens and saves
      await click(page, '#screen [data-act="meet-open"][data-id="mt1"]');
      ok('meeting: a meeting written before this page opens with the two boxes it had', await P(() => document.querySelector('#m-disc').value === 'Talked targets' && document.querySelector('#m-act').value === 'Plan obs 7' && document.querySelectorAll('#layer .mopt[hidden]').length === 5 && !!document.querySelector('#layer [data-act="meet-more"]')));
      await click(page, '#layer [data-act="meet-more"]');
      ok('meeting: Show all the headings shows the other boxes', await P(() => document.querySelectorAll('#layer .mopt[hidden]').length === 0 && document.querySelector('#layer [data-act="meet-more"]').hidden));
      await click(page, '#layer [data-act="meet-save"]');
      ok('meeting: saving it again changes nothing', await P(() => { const o = window.__planner.state.portfolio.meetings.find((x) => x.id === 'mt1'); return o.discussed === 'Talked targets' && o.actions === 'Plan obs 7' && !('present' in o) && window.__planner.state.portfolio.meetings.length === 2; }) && /Saved/.test(await toastText()));
      // write one up by hand, as before
      await click(page, '#screen [data-act="meet-new"]');
      await click(page, '#layer [data-act="meet-save"]');
      ok('meeting: an empty write-up is not saved', /Write what you discussed/.test(await toastText()) && await P(() => window.__planner.state.portfolio.meetings.length === 2));
      await click(page, '#layer #m-none');
      await type('#m-disc', 'My mentor was on a trip.');
      await click(page, '#layer [data-act="meet-save"]');
      ok('meeting: “No meeting this week” is still recorded, without an evidence entry', await P(() => { const p = window.__planner.state.portfolio; const x = p.meetings.find((y) => y.none); return !!x && x.discussed === 'My mentor was on a trip.' && p.evidence.filter((e) => e.type === 'Mentor meeting record').length === 1 && /No meeting/.test(document.querySelector('#screen').textContent); }));
      // paste a transcript made somewhere else, then delete it
      await click(page, '#screen [data-act="meet-paste"]');
      await type('#mt-notes', NOTES);
      await page.waitForTimeout(700);
      ok('meeting: a transcript from somewhere else can be pasted in', (await saved()).meetNotes.text === NOTES && await P(() => !!document.querySelector('#screen [data-act="meet-build"]')));
      await click(page, '#screen [data-act="meet-drop-ask"]');
      ok('meeting: deleting the notes asks first', /Delete the phone’s notes\?/.test(await scr()) && (await notes()) !== null);
      await click(page, '#screen [data-act="meet-drop-no"]');
      ok('meeting: Keep them keeps them', (await notes()).text === NOTES && await P(() => !document.querySelector('#screen [data-act="meet-drop"]')));
      await click(page, '#screen [data-act="meet-drop-ask"]');
      await click(page, '#screen [data-act="meet-drop"]');
      ok('meeting: Yes deletes them from the phone', (await saved()).meetNotes === null && await P(() => !!document.querySelector('#screen [data-act="meet-listen"]')) && /notes are deleted/.test(await toastText()));
      await click(page, '#screen [data-act="meet-listen"]');
      ok('meeting: after deleting, the mentor is asked about again', await P(() => !!document.querySelector('#mt-ok') && document.querySelector('#mt-ok').getAttribute('aria-checked') === 'false'));
      await click(page, '[data-act="close-sheet"]');
      // the ways in and the About entry
      await P(() => window.__planner.go('voice'));
      await click(page, '#screen [data-act="ppage"][data-id="meetings"]');
      ok('meeting: Listen & speak has a way in to Mentor meetings', await P(() => window.__planner.route === 'portfolio' && window.__planner.sub.ppage === 'meetings'));
      await P(() => window.__planner.go('about'));
      ok('meeting: About says what it does', /The phone takes the notes in a mentor meeting/.test(await scr()));
      // the parser: other spellings, and a reply with no headings
      const parsed = await P(() => ({ alt: window.__planner.meetParse('Present: Me and Sam\nDiscussion:\nBehaviour.\nActions agreed:\n- Seating plan\nDate of next meeting: 1 December'), none: window.__planner.meetParse('We just chatted about behaviour.'), empty: window.__planner.meetParse('') }));
      ok('meeting: other spellings of the headings are understood', parsed.alt.present === 'Me and Sam' && parsed.alt.discussed === 'Behaviour.' && parsed.alt.actions === '- Seating plan' && parsed.alt.next === '1 December', parsed.alt);
      ok('meeting: a reply with no headings goes into What you discussed', parsed.none.discussed === 'We just chatted about behaviour.' && Object.keys(parsed.none).length === 1 && parsed.empty.discussed === '', parsed);
      ok('meeting: no script errors', errors.length === 0, errors);
      await ctx.close();
    }
    {
      // Speak is on in a box when Listen is tapped; the microphone is refused; no recogniser
      const st = mk();
      st.portfolio.meetNotes = { date: '2026-11-23', text: 'Some words already here from before the break in the meeting, enough of them to count as real notes for the record.', secs: 60, draft: '', sent: 0 };
      const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-23T15:30:00', state: st });
      const P = (fn, arg) => page.evaluate(fn, arg);
      await toMeetings(page);
      ok('meeting: notes left on the phone are still there when the app opens again', await P(() => !!document.querySelector('#mt-notes-card') && /^Some words already here/.test(document.querySelector('#mt-notes').value) && /Carry on listening/.test(document.querySelector('#screen [data-act="meet-resume"]').textContent)));
      await click(page, '#mt-notes + .vbar [data-act="dictate"]'); await tick(page);
      ok('meeting: Speak works in the notes box', await P(() => window.__planner.DICT.on) && (await calls(page, 'dictateStart')).length === 1);
      await click(page, '#screen [data-act="meet-resume"]');
      ok('meeting: after the app was closed, the mentor is asked about again', await P(() => !!document.querySelector('#mt-ok')));
      await click(page, '#layer #mt-ok');
      await click(page, '#layer [data-act="meet-start"]'); await tick(page); await tick(page);
      ok('meeting: Speak lets go of the microphone and the meeting starts', (await calls(page, 'dictateStop')).length === 1 && (await calls(page, 'meetingStart')).length === 1 && await P(() => !window.__planner.DICT.on && window.__planner.MEET.live && !window.__planner.MEET.pending));
      await P(() => window.__say('and now the second half'));
      ok('meeting: new words are added after the old ones, with the time', await P(() => /^Some words already here .* record\.\n\n\[15:30\]\nAnd now the second half\.$/.test(window.__planner.state.portfolio.meetNotes.text)), await P(() => window.__planner.state.portfolio.meetNotes.text));
      await P(() => window.__dictateEnd('offline')); await tick(page);
      ok('meeting: with no signal it waits and tries again by itself', await P(() => window.__planner.MEET.live && window.__planner.MEET.st === 'wait' && /No connection/.test(document.querySelector('#mt-state').textContent)));
      await click(page, '#screen [data-act="meet-finish"]'); await tick(page);
      ok('meeting: Finish works while it is waiting', await P(() => !window.__planner.MEET.live && !!document.querySelector('#mt-notes-card')));
      ok('meeting second phone: no script errors', errors.length === 0, errors);
      await ctx.close();
    }
    for (const who of [{ name: 'the microphone refused', o: { micDenied: true }, re: /microphone/i }, { name: 'no speech recogniser', o: { noRecogniser: true }, re: /speech recogniser/i }]) {
      const { ctx, page, errors } = await open(browser, Object.assign({ app: true, now: '2026-11-23T15:30:00', state: mk() }, who.o));
      await toMeetings(page);
      await click(page, '#screen [data-act="meet-listen"]');
      const warned = await page.evaluate(() => /no speech recogniser turned on/.test(document.querySelector('#layer').textContent));
      await click(page, '#layer #mt-ok');
      await click(page, '#layer [data-act="meet-start"]'); await tick(page); await tick(page);
      ok(`meeting with ${who.name}: listening ends and the page says why`, await page.evaluate((re) => !window.__planner.MEET.live && new RegExp(re, 'i').test((document.querySelector('#mt-notes-card .notice') || {}).textContent || ''), who.re.source) && (who.o.noRecogniser ? warned : !warned) && errors.length === 0, [await page.evaluate(() => document.querySelector('#screen').textContent.slice(0, 600)), errors]);
      await ctx.close();
    }
    {
      // the app as it was before it could listen to a whole meeting: short stretches that the page starts again
      const { ctx, page, errors } = await open(browser, { app: true, app7: true, now: '2026-11-23T15:30:00', state: mk() });
      const P = (fn, arg) => page.evaluate(fn, arg);
      await toMeetings(page);
      await click(page, '#screen [data-act="meet-listen"]');
      ok('meeting in the older app: the sheet says one more install makes it dependable', await P(() => /One more install makes this dependable/.test(document.querySelector('#layer').textContent) && !!document.querySelector('#layer [data-act="get-app"]') && !document.querySelector('#layer [data-act="meet-start"]').disabled));
      await click(page, '#layer #mt-ok');
      await click(page, '#layer [data-act="meet-start"]'); await tick(page);
      ok('meeting in the older app: it listens with the microphone Speak uses', (await calls(page, 'dictateStart')).length === 1 && await P(() => window.__planner.MEET.live && document.querySelector('#mt-state').textContent === 'Listening'));
      await P(() => window.__say('first stretch'));
      await P(() => window.__dictateEnd('quiet'));
      await page.waitForTimeout(550);
      ok('meeting in the older app: when a stretch ends in a quiet spell the page starts the next one', (await calls(page, 'dictateStart')).length === 2 && await P(() => window.__planner.MEET.live && /First stretch\.$/.test(window.__planner.state.portfolio.meetNotes.text)));
      // a phone that keeps stopping straight away is not asked for ever
      for (let i = 0; i < 6; i++) { await P(() => window.__dictateEnd('')); await page.waitForTimeout(450); }
      ok('meeting in the older app: a phone that stops at once every time is given up on, with the reason', await P(() => !window.__planner.MEET.live && /busy|did not answer|try again/i.test((document.querySelector('#mt-notes-card .notice') || {}).textContent || '')) && (await calls(page, 'dictateStart')).length <= 8, [await calls(page, 'dictateStart'), await P(() => document.querySelector('#screen').textContent.slice(0, 400))]);
      // a long brief is copied, not dropped
      await P(() => { const n = window.__planner.state.portfolio.meetNotes; n.text = 'word '.repeat(10000); window.__lastInsert = ''; window.__lastCopy = ''; window.__planner.go('home'); window.__planner.sub.ppage = 'meetings'; window.__planner.go('portfolio'); });
      await click(page, '#screen [data-act="meet-build"]'); await page.waitForTimeout(450);
      ok('meeting in the older app: a very long brief is copied for pasting, because that app drops it', await P(() => !window.__lastInsert && /^Please turn the rough notes/.test(window.__lastCopy) && window.__lastCopy.length > 50000 && !document.querySelector('#tutor').hidden));
      ok('meeting in the older app: no script errors', errors.length === 0, errors);
      await ctx.close();
    }
    {
      // the app as it was before it could listen with the phone locked (build 13): the phone stops the microphone off the screen
      const { ctx, page, errors } = await open(browser, { app: true, app8: true, now: '2026-11-23T15:30:00', state: mk() });
      const P = (fn, arg) => page.evaluate(fn, arg);
      await toMeetings(page);
      await click(page, '#screen [data-act="meet-listen"]');
      ok('meeting in the app before locked listening: the sheet says one more install lets it listen with the phone locked', await P(() => { const t = document.querySelector('#layer').textContent; return /One more install lets it listen with the phone locked/.test(t) && /Keep the app open on the screen/.test(t) && !/You can lock the phone/.test(t) && !!document.querySelector('#layer [data-act="get-app"]') && !document.querySelector('#layer [data-act="meet-start"]').disabled; }));
      await click(page, '#layer #mt-ok');
      await click(page, '#layer [data-act="meet-start"]'); await tick(page);
      ok('meeting in the app before locked listening: it listens to the whole meeting and says to keep the app open', (await calls(page, 'meetingStart')).length === 1 && await P(() => window.__planner.MEET.live && window.__planner.MEET.bg === false && /Keep the app open on the screen/.test(document.querySelector('#mt-foot').textContent)));
      await P(() => { window.__offScreen = true; Object.defineProperty(document, 'hidden', { configurable: true, get: () => !!window.__hidden }); window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); window.__dictateEnd(''); });
      await page.waitForTimeout(500);
      ok('meeting in the app before locked listening: off the screen it waits and does not ask for the microphone', (await calls(page, 'meetingStart')).length === 1 && await P(() => window.__planner.MEET.live && window.__planner.MEET.st === 'away' && /Waiting for the app to come back/.test(document.querySelector('#mt-state').textContent)));
      await P(() => { window.__offScreen = false; window.__hidden = false; window.__capgownResume(); }); await tick(page);
      ok('meeting in the app before locked listening: back on the screen it carries on', (await calls(page, 'meetingStart')).length === 2 && await P(() => window.__planner.MEET.live && document.querySelector('#mt-state').textContent === 'Listening'));
      await P(() => window.__planner.go('home')); await tick(page);
      ok('meeting in the app before locked listening: other screens of the app keep listening, with the bar', await P(() => window.__planner.MEET.live && !!document.querySelector('#screen .mtbar')) && (await calls(page, 'dictateStop')).length === 0);
      ok('meeting in the app before locked listening: no script errors', errors.length === 0, errors);
      await ctx.close();
    }
    // ---------- The app's own listening: a speech model on the phone, so it carries on with the phone locked ----------
    const ownCardText = (page) => page.evaluate(() => { const c = document.querySelector('#own-card'); return c ? c.textContent.replace(/\s+/g, ' ').trim() : ''; });
    const ownBtn = (page, act) => page.evaluate((a) => { const b = document.querySelector(`#own-card [data-act="${a}"]`); return b ? b.textContent.replace(/\s+/g, ' ').trim() : ''; }, act);
    const toastOf = (page) => page.evaluate(() => document.querySelector('#toast').hidden ? '' : document.querySelector('#toast').textContent);
    const startMeeting = async (page) => { await click(page, '#screen [data-act="meet-listen"]'); await click(page, '#layer #mt-ok'); await click(page, '#layer [data-act="meet-start"]'); await tick(page); };
    {
      // the one-off download of the speech model, then a meeting with the phone locked
      const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-23T15:30:00', state: mk() });
      const P = (fn, arg) => page.evaluate(fn, arg);
      const card = () => ownCardText(page);
      const btn = (act) => ownBtn(page, act);
      const notes = () => P(() => window.__planner.state.portfolio.meetNotes);
      const stored = () => P(() => JSON.parse(localStorage.getItem('capgown-planner-v1')).portfolio.meetNotes);
      await toMeetings(page);
      ok('own listening: the meetings page offers the one-off download, with the size the app gives', /Listening with the phone locked/.test(await card()) && /downloaded once/.test(await card()) && (await btn('own-get')) === 'Download (128 MB)' && await P(() => !document.querySelector('#own-card .list')), await card());
      await click(page, '#own-card [data-act="own-more"]');
      ok('own listening: Other sizes lists the three sizes, with Balanced chosen', await P(() => { const rows = [...document.querySelectorAll('#own-card .list .li')].map((r) => r.textContent.replace(/\s+/g, ' ')); return rows.length === 3 && /Balanced.*128 MB.*Chosen/.test(rows[0]) && /Most accurate.*251 MB.*Choose/.test(rows[1]) && /Smallest.*43 MB.*Choose/.test(rows[2]); }), await card());
      await click(page, '#own-card [data-act="own-size"][data-id="tiny"]');
      ok('own listening: choosing another size changes what Download fetches', (await btn('own-get')) === 'Download (43 MB)', await card());
      await click(page, '#own-card [data-act="own-size"][data-id="small"]');
      await click(page, '#own-card [data-act="own-get"]'); await tick(page);
      ok('own listening: Download asks the app for that size and shows the progress', JSON.stringify(await calls(page, 'ownDownload')) === '[["small"]]' && /Downloading the speech model \(Balanced\)/.test(await card()) && await P(() => document.querySelector('#own-prog').textContent === '0 of 128 MB' && parseFloat(document.querySelector('#own-bar').style.width) === 0 && !!document.querySelector('#own-card [data-act="own-cancel"]') && !document.querySelector('#own-card [data-act="own-get"]') && !document.querySelector('#own-card .list')), await card());
      await P(() => { document.querySelector('#own-card').__same = true; window.__ownStep(67108864); }); await tick(page);
      ok('own listening: the bar and the numbers move without the card being built again', await P(() => document.querySelector('#own-card').__same === true && document.querySelector('#own-prog').textContent === '64 of 128 MB' && parseFloat(document.querySelector('#own-bar').style.width) === 50), await card());
      await click(page, '#own-card [data-act="own-cancel"]'); await tick(page);
      ok('own listening: Stop the download stops it and offers it again', (await calls(page, 'ownCancel')).length === 1 && (await btn('own-get')) === 'Download (128 MB)', await card());
      await click(page, '#own-card [data-act="own-get"]'); await tick(page);
      await P(() => window.__ownEnd('offline')); await tick(page);
      ok('own listening: a download that drops says so and can be carried on', /connection dropped/.test(await card()) && (await btn('own-get')) === 'Download (128 MB)' && (await toastOf(page)) === '', await card());
      await click(page, '#own-card [data-act="own-get"]'); await tick(page);
      ok('own listening: starting again clears the message', !/connection dropped/.test(await card()) && /Downloading the speech model/.test(await card()), await card());
      await P(() => { window.__ownStep(134217728); window.__ownEnd(''); }); await tick(page);
      ok('own listening: when the download finishes it is switched on, and the page says so', (await calls(page, 'ownDownload')).length === 3 && /The speech model is ready/.test(await toastOf(page)) && /On The app does the listening itself/.test(await card()) && /Balanced speech model, 128 MB on this phone/.test(await card()) && !!(await btn('own-off')), await card());
      await click(page, '#screen [data-act="meet-listen"]');
      const sheet = await P(() => document.querySelector('#layer').textContent);
      ok('own listening: the sheet says the phone can be locked and that no sound leaves the phone', /You can lock the phone or open another app/.test(sheet) && /No sound leaves the phone/.test(sheet) && /My mentor knows and agrees/.test(sheet) && !/Google/.test(sheet) && !/To listen with the phone locked/.test(sheet) && !/One more install/.test(sheet), sheet);
      await click(page, '#layer #mt-ok');
      await click(page, '#layer [data-act="meet-start"]'); await tick(page);
      ok('own listening: Start uses the app’s own listening, and the card says the phone can be locked', (await calls(page, 'meetingStart')).length === 1 && await P(() => { const M = window.__planner.MEET; const foot = document.querySelector('#mt-foot').textContent; return M.live && M.own === true && /The app is doing the listening itself/.test(foot) && /You can lock the phone/.test(foot) && !document.querySelector('#own-card'); }));
      await P(() => window.__say('we looked at the scheme of work'));
      ok('own listening: each sentence is taken down with its number', /We looked at the scheme of work\.$/.test((await notes()).text) && (await notes()).sid === 'run1' && (await notes()).seq === 1, await notes());
      await P(() => window.__capgownDictate('final', 'we looked at the scheme of work', 1, 'run1'));
      ok('own listening: a sentence that arrives twice is taken down once', ((await notes()).text.match(/scheme of work/g) || []).length === 1, await notes());
      // the phone is locked and holds the page up: the app keeps the sentences, and the page asks for them when it wakes
      await P(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => !!window.__hidden }); window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForTimeout(300);
      await P(() => { window.__sayHeld('my mentor asked about the hinge question'); window.__sayHeld('we agreed to try it on Thursday'); });
      ok('own listening: while the page is held up nothing reaches it, and it is not stopped', !/hinge question/.test((await notes()).text) && await P(() => window.__planner.MEET.live) && (await calls(page, 'dictateStop')).length === 0);
      await P(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); window.__capgownResume(); }); await tick(page);
      ok('own listening: when the page wakes it takes in what it missed, in order, and saves it at once', /scheme of work\.\s+My mentor asked about the hinge question\.\s+We agreed to try it on Thursday\.$/.test((await notes()).text) && (await notes()).seq === 3 && /We agreed to try it on Thursday\.$/.test((await stored()).text) && (await stored()).seq === 3 && (await calls(page, 'meetingStart')).length === 1 && await P(() => window.__planner.MEET.live && document.querySelector('#mt-state').textContent === 'Listening'), await notes());
      await P(() => { window.__capgownResume(); window.__planner.meetCatchUp(); });
      ok('own listening: asking again brings nothing twice', ((await notes()).text.match(/hinge question/g) || []).length === 1 && ((await notes()).text.match(/on Thursday/g) || []).length === 1);
      await P(() => window.__say('then we set the next date'));
      ok('own listening: the next sentence follows on, once', (await notes()).seq === 4 && ((await notes()).text.match(/next date/g) || []).length === 1, await notes());
      // it ended while the page was held up (the 95 minute limit, say): the page finds out when it wakes, and starts it again
      await P(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForTimeout(300);
      await P(() => { window.__sayHeld('the last thing before it stopped'); window.__dictating = false; window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); window.__capgownResume(); });
      await page.waitForTimeout(600);
      ok('own listening: if it stopped while the page was held up, the page takes in the words and starts it again', /The last thing before it stopped\.$/.test((await notes()).text) && (await calls(page, 'meetingStart')).length === 2 && await P(() => window.__planner.MEET.live && window.__planner.MEET.own === true && document.querySelector('#mt-state').textContent === 'Listening'), await notes());
      // Pause: the app finishes the sentence it was on, and those words are kept; nothing after that
      await click(page, '#screen [data-act="meet-pause"]'); await tick(page);
      await P(() => window.__sayLate('the last words before pause'));
      ok('own listening: the sentence being said when Pause was tapped is kept', await P(() => !window.__planner.MEET.live && !!document.querySelector('#mt-paused')) && /The last words before pause\.$/.test((await stored()).text) && (await stored()).seq === 6, await stored());
      await P(() => window.__say('this was said while paused'));
      ok('own listening: nothing said while paused is taken down', !/while paused/.test((await notes()).text));
      await click(page, '#screen [data-act="meet-finish"]'); await tick(page);
      await P(() => window.__sayLate('one late sentence'));
      ok('own listening: a sentence that arrives after Finish goes into the notes on the screen', await P(() => /One late sentence\.$/.test(document.querySelector('#mt-notes').value)) && /One late sentence\.$/.test((await stored()).text), await stored());
      ok('own listening: after the meeting the card is back, still on', /On The app does the listening itself/.test(await card()));
      await click(page, '#screen [data-act="meet-drop-ask"]');
      await click(page, '#screen [data-act="meet-drop"]'); await tick(page);
      ok('own listening: deleting the notes tells the app to forget the sentences it was keeping', (await calls(page, 'meetingForget')).length === 1 && (await notes()) === null && await P(() => window.__heard.lines.length === 0));
      await P(() => window.__sayLate('words with no notes to go into'));
      ok('own listening: a sentence with no notes to go into is dropped quietly', (await notes()) === null && errors.length === 0, errors);
      await click(page, '#own-card [data-act="own-off"]'); await tick(page);
      ok('own listening: it can be switched off, and the model stays on the phone', JSON.stringify((await calls(page, 'ownUse')).pop()) === '[""]' && /Off The speech model is on this phone/.test(await card()) && !!(await btn('own-use')), await card());
      await click(page, '#screen [data-act="meet-listen"]');
      ok('own listening: switched off, the sheet is about the phone’s speech service again', await P(() => { const t = document.querySelector('#layer').textContent; return /may send the sound to Google/.test(t) && /To listen with the phone locked/.test(t) && !/You can lock the phone/.test(t); }));
      await click(page, '[data-act="close-sheet"]');
      await click(page, '#own-card [data-act="own-use"]'); await tick(page);
      ok('own listening: and switched on again', JSON.stringify((await calls(page, 'ownUse')).pop()) === '["small"]' && /On The app does the listening itself/.test(await card()), await card());
      ok('own listening: no script errors', errors.length === 0, errors);
      await ctx.close();
    }
    {
      // two sizes on the phone: change the one in use, remove one, download another
      const { ctx, page, errors } = await open(browser, { app: true, own: { small: true, tiny: true }, ownUse: 'small', now: '2026-11-23T15:30:00', state: mk() });
      const P = (fn, arg) => page.evaluate(fn, arg);
      const card = () => ownCardText(page);
      const has = (sel) => P((x) => !!document.querySelector(`#own-card ${x}`), sel);
      const rows = () => P(() => [...document.querySelectorAll('#own-card .list .li')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
      await toMeetings(page);
      ok('own sizes: with a model in use the card says On and which it is', /On The app does the listening itself/.test(await card()) && /Balanced speech model, 128 MB on this phone/.test(await card()) && (await ownBtn(page, 'own-more')) === 'Change the size', await card());
      await click(page, '#own-card [data-act="own-more"]');
      ok('own sizes: the list shows the one in use, the ones on the phone and the ones to download', await has('.list [data-act="own-del-ask"][data-id="small"]') && !(await has('.list [data-act="own-use"][data-id="small"]')) && await has('.list [data-act="own-get"][data-id="medium"]') && await has('.list [data-act="own-use"][data-id="tiny"]') && await has('.list [data-act="own-del-ask"][data-id="tiny"]') && /In use/.test((await rows())[0]) && /On this phone/.test((await rows())[2]) && (await ownBtn(page, 'own-more')) === 'Hide the sizes', await rows());
      await click(page, '#own-card [data-act="own-del-ask"][data-id="tiny"]');
      ok('own sizes: Remove asks first', await has('[data-act="own-del"][data-id="tiny"]') && await has('[data-act="own-del-no"]') && (await calls(page, 'ownDelete')).length === 0);
      await click(page, '#own-card [data-act="own-del-no"]');
      ok('own sizes: Keep leaves it there', !(await has('[data-act="own-del"]')) && await has('[data-act="own-use"][data-id="tiny"]') && (await calls(page, 'ownDelete')).length === 0);
      await click(page, '#own-card [data-act="own-use"][data-id="tiny"]'); await tick(page);
      ok('own sizes: Use changes the size in use', JSON.stringify(await calls(page, 'ownUse')) === '[["tiny"]]' && /Smallest speech model, 43 MB on this phone/.test(await card()), await card());
      await click(page, '#own-card [data-act="own-more"]');
      await click(page, '#own-card [data-act="own-del-ask"][data-id="small"]');
      await click(page, '#own-card [data-act="own-del"][data-id="small"]'); await tick(page);
      ok('own sizes: Yes, remove takes it off the phone, and the one in use stays', JSON.stringify(await calls(page, 'ownDelete')) === '[["small"]]' && /Removed/.test(await toastOf(page)) && await has('.list [data-act="own-get"][data-id="small"]') && /Smallest speech model/.test(await card()), await card());
      await click(page, '#own-card .list [data-act="own-get"][data-id="medium"]'); await tick(page);
      ok('own sizes: another size can be downloaded while one is in use', JSON.stringify(await calls(page, 'ownDownload')) === '[["medium"]]' && /Downloading the speech model \(Most accurate\)/.test(await card()) && /0 of 251 MB/.test(await card()), await card());
      await P(() => window.__ownEnd('space')); await tick(page);
      ok('own sizes: a download with no room says so, and the size in use stays on', /not enough room/.test(await card()) && /On The app does the listening itself/.test(await card()) && /Smallest speech model/.test(await card()), await card());
      await click(page, '#own-card [data-act="own-more"]');
      await click(page, '#own-card [data-act="own-del-ask"][data-id="tiny"]');
      await click(page, '#own-card [data-act="own-del"][data-id="tiny"]'); await tick(page);
      ok('own sizes: removing the one in use goes back to the download offer', /It needs a speech model, downloaded once/.test(await card()) && !/On The app does/.test(await card()), await card());
      ok('own sizes: no script errors', errors.length === 0, errors);
      await ctx.close();
    }
    {
      // on mobile data the download asks first
      const { ctx, page, errors } = await open(browser, { app: true, metered: true, now: '2026-11-23T15:30:00', state: mk() });
      const card = () => ownCardText(page);
      await toMeetings(page);
      await click(page, '#own-card [data-act="own-get"]'); await tick(page);
      ok('own on mobile data: Download asks first, with the size', (await calls(page, 'ownDownload')).length === 0 && /You are on mobile data/.test(await card()) && /about 128 MB/.test(await card()) && (await ownBtn(page, 'own-get')) === 'Download anyway' && (await ownBtn(page, 'own-wait')) === 'Wait for Wi-Fi', await card());
      await click(page, '#own-card [data-act="own-wait"]');
      ok('own on mobile data: Wait for Wi-Fi puts the question away', (await calls(page, 'ownDownload')).length === 0 && !/mobile data/.test(await card()) && (await ownBtn(page, 'own-get')) === 'Download (128 MB)', await card());
      await click(page, '#own-card [data-act="own-get"]');
      await click(page, '#own-card [data-act="own-get"]'); await tick(page);
      ok('own on mobile data: Download anyway starts it', JSON.stringify(await calls(page, 'ownDownload')) === '[["small"]]' && /Downloading the speech model/.test(await card()) && !/mobile data/.test(await card()) && errors.length === 0, await card());
      await ctx.close();
    }
    {
      // the app's own listening will not start on this phone: the meeting carries on with the phone's speech service
      const { ctx, page, errors } = await open(browser, { app: true, own: { small: true }, ownUse: 'small', ownFails: true, now: '2026-11-23T15:30:00', state: mk() });
      const P = (fn, arg) => page.evaluate(fn, arg);
      const card = () => ownCardText(page);
      await toMeetings(page);
      await startMeeting(page);
      ok('own listening that cannot start: the page says so and nothing is left listening', (await calls(page, 'meetingStart')).length === 1 && await P(() => !window.__planner.MEET.live && /own listening could not start on this phone/.test(document.querySelector('#screen').textContent) && !!document.querySelector('#screen [data-act="meet-resume"]')));
      ok('own listening that cannot start: its card says so and offers another try', /could not start last time/.test(await card()) && /Off The speech model is on this phone/.test(await card()) && !!(await ownBtn(page, 'own-use')), await card());
      await click(page, '#screen [data-act="meet-resume"]'); await tick(page);
      ok('own listening that cannot start: Carry on listens with the phone’s speech service', (await calls(page, 'meetingStart')).length === 2 && await P(() => { const M = window.__planner.MEET; return M.live && M.own === false && /Keep the app open on the screen if you can/.test(document.querySelector('#mt-foot').textContent); }) && errors.length === 0, errors);
      await ctx.close();
    }
    {
      // a phone that cannot run the speech model, and an app that could not say how big the downloads are
      const a = await open(browser, { app: true, noOwnEngine: true, now: '2026-11-23T15:30:00', state: mk() });
      await toMeetings(a.page);
      ok('a phone that cannot run the app’s own listening: the card says so and offers nothing', /cannot run the app’s own listening/.test(await ownCardText(a.page)) && await a.page.evaluate(() => !document.querySelector('#own-card button')), await ownCardText(a.page));
      await click(a.page, '#screen [data-act="meet-listen"]');
      ok('a phone that cannot run the app’s own listening: the sheet does not point to it', await a.page.evaluate(() => { const t = document.querySelector('#layer').textContent; return /Keep the app open on the screen if you can/.test(t) && !/To listen with the phone locked/.test(t) && !/One more install/.test(t) && !document.querySelector('#layer [data-act="meet-start"]').disabled; }) && a.errors.length === 0, a.errors);
      await a.ctx.close();
      const b = await open(browser, { app: true, ownNoSizes: true, now: '2026-11-23T15:30:00', state: mk() });
      await toMeetings(b.page);
      ok('own listening: if the app cannot say how big the download is, the page gives its own figure', (await ownBtn(b.page, 'own-get')) === 'Download (130 MB)' && b.errors.length === 0, await ownCardText(b.page));
      await b.ctx.close();
    }
    {
      // the app as it was before it could do the listening itself (build 14)
      const { ctx, page, errors } = await open(browser, { app: true, app9: true, now: '2026-11-23T15:30:00', state: mk() });
      const P = (fn, arg) => page.evaluate(fn, arg);
      await toMeetings(page);
      ok('meeting in the app before its own listening: the card says the newest app can listen with the phone locked', /Listening with the phone locked/.test(await ownCardText(page)) && /The newest app can do the listening itself/.test(await ownCardText(page)) && await P(() => !!document.querySelector('#own-card [data-act="get-app"]') && !document.querySelector('#own-card [data-act="own-get"]')), await ownCardText(page));
      await click(page, '#screen [data-act="meet-listen"]');
      ok('meeting in the app before its own listening: the sheet says one more install lets it listen with the phone locked', await P(() => { const t = document.querySelector('#layer').textContent; return /One more install lets it listen with the phone locked/.test(t) && /Keep the app open on the screen if you can/.test(t) && !/You can lock the phone/.test(t) && !!document.querySelector('#layer [data-act="get-app"]') && !document.querySelector('#layer [data-act="meet-start"]').disabled; }));
      await click(page, '#layer #mt-ok');
      await click(page, '#layer [data-act="meet-start"]'); await tick(page);
      await P(() => window.__say('said in the older app'));
      ok('meeting in the app before its own listening: it listens as before, with no sentence numbers', (await calls(page, 'meetingStart')).length === 1 && await P(() => { const M = window.__planner.MEET; const n = window.__planner.state.portfolio.meetNotes; return M.live && M.own === false && M.bg === true && /Said in the older app\.$/.test(n.text) && !('sid' in n) && !('seq' in n); }));
      await P(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => !!window.__hidden }); window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForTimeout(300);
      await P(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); window.__capgownResume(); }); await tick(page);
      ok('meeting in the app before its own listening: coming back from a locked phone it is still listening', (await calls(page, 'meetingStart')).length === 1 && await P(() => window.__planner.MEET.live && document.querySelector('#mt-state').textContent === 'Listening') && errors.length === 0, errors);
      await ctx.close();
    }
    for (const who of [{ name: 'a browser', o: { app: false }, card: false }, { name: 'the app before whole meetings', o: { app: true, app7: true }, card: false }, { name: 'the app before locked listening', o: { app: true, app8: true }, card: true }]) {
      const { ctx, page, errors } = await open(browser, Object.assign({ now: '2026-11-23T15:30:00', state: mk() }, who.o));
      await toMeetings(page);
      ok(`own listening in ${who.name}: ${who.card ? 'the card says what the newest app can do' : 'there is no card'}`, (who.card ? /The newest app can do the listening itself/.test(await ownCardText(page)) : (await ownCardText(page)) === '') && errors.length === 0, await ownCardText(page));
      await ctx.close();
    }
    {
      // the notes remember the number of the last sentence taken in: damaged numbers are dropped, and numbers from
      // an earlier run of the app do not hold back a new meeting
      const bad = mk();
      bad.portfolio.meetNotes = { date: '2026-11-23', text: 'Kept words.', secs: 10, draft: '', sent: 0, sid: 7, seq: 'x' };
      const a = await open(browser, { app: true, now: '2026-11-23T15:30:00', state: bad });
      await toMeetings(a.page);
      ok('own listening: damaged sentence numbers in the notes are dropped and the words stay', await a.page.evaluate(() => { const n = window.__planner.state.portfolio.meetNotes; return n && n.text === 'Kept words.' && !('sid' in n) && !('seq' in n) && !!document.querySelector('#mt-notes'); }) && a.errors.length === 0, a.errors);
      await a.ctx.close();
      const old = mk();
      old.portfolio.meetNotes = { date: '2026-11-23', text: 'From before.', secs: 10, draft: '', sent: 0, sid: 'earlier', seq: 40 };
      const b = await open(browser, { app: true, own: { small: true }, ownUse: 'small', now: '2026-11-23T15:30:00', state: old });
      await toMeetings(b.page);
      ok('own listening: good sentence numbers are kept', await b.page.evaluate(() => { const n = window.__planner.state.portfolio.meetNotes; return n.sid === 'earlier' && n.seq === 40; }));
      await click(b.page, '#screen [data-act="meet-resume"]'); await click(b.page, '#layer #mt-ok'); await click(b.page, '#layer [data-act="meet-start"]'); await tick(b.page);
      await b.page.evaluate(() => window.__say('a new sentence in a new run'));
      ok('own listening: numbers from an earlier run of the app do not hold back a new meeting', await b.page.evaluate(() => { const n = window.__planner.state.portfolio.meetNotes; return /From before\.[\s\S]*A new sentence in a new run\.$/.test(n.text) && n.sid === 'run1' && n.seq === 1; }) && b.errors.length === 0, b.errors);
      await b.ctx.close();
    }
    for (const who of [{ name: 'the app before Listen and Speak', o: { app: true, app4: true }, re: /Listening needs the newest app/ }]) {
      const { ctx, page, errors } = await open(browser, Object.assign({ now: '2026-11-23T15:30:00', state: mk() }, who.o));
      await toMeetings(page);
      await click(page, '#screen [data-act="meet-listen"]');
      ok(`meeting in ${who.name}: it says what is needed, and a transcript can still be pasted`, await page.evaluate((re) => new RegExp(re).test(document.querySelector('#layer').textContent) && document.querySelector('#layer [data-act="meet-start"]').disabled && !!document.querySelector('#screen [data-act="meet-paste"]'), who.re.source) && errors.length === 0, errors);
      await ctx.close();
    }
    {
      // a browser: its own speech recognition, restarted when it stops
      const init = `window.SpeechRecognition = window.webkitSpeechRecognition = function () { window.__sr = this; this.start = () => setTimeout(() => this.onstart && this.onstart(), 0); this.stop = () => setTimeout(() => this.onend && this.onend(), 0); };`;
      const { ctx, page, errors } = await open(browser, { app: false, now: '2026-11-23T15:30:00', state: mk(), init });
      const P = (fn, arg) => page.evaluate(fn, arg);
      await toMeetings(page);
      await click(page, '#screen [data-act="meet-listen"]');
      await click(page, '#layer #mt-ok');
      await click(page, '#layer [data-act="meet-start"]'); await tick(page);
      const has = await P(() => !!window.__sr);
      if (has) {
        await P(() => { window.__sr.onstart && window.__sr.onstart(); window.__sr.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'hello from the browser' }], { isFinal: true })] }); });
        ok('meeting in a browser: the browser’s speech recognition takes the notes', await P(() => window.__planner.MEET.live && /Hello from the browser\.$/.test(window.__planner.state.portfolio.meetNotes.text)));
        await click(page, '#screen [data-act="meet-finish"]'); await tick(page);
        await P(() => { if (window.__planner.MEET.live && window.__sr && window.__sr.onend) window.__sr.onend(); }); await tick(page);
        ok('meeting in a browser: Finish ends it', await P(() => !window.__planner.MEET.live && !!document.querySelector('#mt-notes-card')));
      } else {
        ok('meeting in a browser without speech: it says so', await P(() => /cannot/.test(document.querySelector('#layer').textContent + document.querySelector('#toast').textContent)));
      }
      ok('meeting in a browser: no script errors', errors.length === 0, errors);
      await ctx.close();
    }
    for (const bad of [{ date: 'yesterday', text: 'x' }, 'words', 7, [], { date: '2026-11-23', text: 123, secs: 'long', draft: {}, sent: 'yes' }]) {
      const st = mk();
      st.portfolio.meetNotes = bad;
      st.portfolio.meetings.push({ id: 'mt2', date: '2026-11-12', discussed: 'ok', actions: '', none: false, present: 5, next: ['x'], pp: 'yes' });
      const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-23T15:30:00', state: st });
      await toMeetings(page);
      ok(`meeting: damaged notes (${JSON.stringify(bad).slice(0, 40)}) are repaired and the page opens`, await page.evaluate(() => { const p = window.__planner.state.portfolio; const n = p.meetNotes; const m = p.meetings.find((x) => x.id === 'mt2'); return (n === null || (typeof n.text === 'string' && typeof n.draft === 'string' && typeof n.secs === 'number' && n.sent === 0)) && m && typeof (m.present || '') === 'string' && typeof (m.next || '') === 'string' && !m.pp && !!document.querySelector('#screen [data-act="meet-new"]'); }) && errors.length === 0, errors);
      await ctx.close();
    }
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

  // The KSB reset baseline (page 46 to 48): read from the planner data, Strong KSBs count unless switched off.
  {
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-23T19:30:00', state: null });
    const P = (fn, arg) => page.evaluate(fn, arg);
    const B = await P(() => { const d = window.STUDY_DATA.ksbBaseline; const ids = Object.keys(d.items); const n = (s) => ids.filter((k) => d.items[k].s === s).length; return { ids: ids.length, all: ids.every((k) => window.__planner.KSBS[k]), strong: n('Strong'), partial: n('Partial'), gap: n('Gap'), counts: d.counts, fields: ids.every((k) => ['s', 'ev', 'pp', 'next'].every((f) => typeof d.items[k][f] === 'string' && d.items[k][f])) }; });
    ok('baseline: one entry for each of the 51 KSBs, each with strength, evidence, mapping and next step', B.ids === 51 && B.all && B.fields, B);
    ok('baseline: the counts match the entries (31 Strong, 14 Partial, 6 Gap)', B.strong === 31 && B.partial === 14 && B.gap === 6 && B.counts.Strong === 31 && B.counts.Partial === 14 && B.counts.Gap === 6, B);
    ok('baseline: on a new phone the Strong KSBs count as evidenced', await P(() => { const p = window.__planner; return p.state.settings.baseCount === true && p.ksbCovered().size === 31 && p.ksbCovered().has('K1') && !p.ksbCovered().has('K8') && !p.ksbCovered().has('K6'); }));
    await P(() => { const p = window.__planner; p.sub.ppage = 'overview'; p.go('portfolio'); });
    ok('baseline: the Portfolio overview shows the notice and 31/51 KSBs with evidence', await P(() => { const t = document.querySelector('#screen').textContent; return /KSB reset baseline/.test(t) && /31 Strong, 14 Partial, 6 Gap/.test(t) && /The Strong ones count in KSBs with evidence below/.test(t) && /KSBs with evidence/.test(t) && /31\/51/.test(t); }));
    await click(page, '#screen .notice [data-act="ppage"][data-id="ksb"]');
    ok('baseline: Open KSB evidence goes to the KSB page with the baseline card', await P(() => window.__planner.sub.ppage === 'ksb' && /Reset baseline/.test(document.querySelector('#screen').textContent)));
    ok('baseline: the KSB map labels a baseline-only KSB as Strong and leaves a gap empty', await P(() => { const lab = (k) => document.querySelector(`#screen .ksbgrid [data-id="${k}"] small`).textContent; return lab('K1') === 'Strong' && lab('K8') === '–' && document.querySelector('#screen .ksbgrid [data-id="K1"]').classList.contains('on') && !document.querySelector('#screen .ksbgrid [data-id="K8"]').classList.contains('on'); }));
    await click(page, '#screen [data-act="ksb"][data-id="K1"]');
    ok('baseline: a Strong KSB sheet says it is evidenced by the baseline and shows the next step', await P(() => { const t = document.querySelector('#layer').textContent; return /Evidenced \(baseline\)/.test(t) && /Reset baseline, /.test(t) && /Next step:/.test(t) && /Mapped in PebblePad before the reset: P1/.test(t); }));
    await click(page, '[data-act="close-sheet"]');
    await P(() => { const p = window.__planner; p.sub.ppage = 'ksb'; p.go('portfolio'); });
    await click(page, '#screen [data-act="base-count"]');
    ok('baseline: the switch turns the count off and is saved', await P(() => { const p = window.__planner; const saved = JSON.parse(window.AndroidApp.loadState()); return p.state.settings.baseCount === false && p.ksbCovered().size === 0 && saved.settings.baseCount === false && document.querySelector('#screen [data-act="base-count"]').getAttribute('aria-checked') === 'false'; }));
    await P(() => { const p = window.__planner; p.sub.ppage = 'overview'; p.go('portfolio'); });
    ok('baseline: with the switch off the overview says so and counts 0/51', await P(() => { const t = document.querySelector('#screen').textContent; return /not counted below \(the switch is off\)/.test(t) && /0\/51/.test(t); }));
    await P(() => { const p = window.__planner; p.sub.ppage = 'ksb'; p.go('portfolio'); });
    await click(page, '#screen [data-act="base-count"]');
    ok('baseline: switching it back on counts 31 again', await P(() => window.__planner.ksbCovered().size === 31 && window.__planner.state.settings.baseCount === true));
    await P(() => { const p = window.__planner; p.state.portfolio.evidence.push({ id: 'eb1', date: '2026-11-23', title: 'Both versions of one activity', type: 'Resource', link: '', ksbs: ['K4', 'K8'], status: 'draft', notes: '' }); p.go('portfolio'); });
    ok('baseline: tagged evidence adds to the baseline without counting twice', await P(() => window.__planner.ksbCovered().size === 32));
    await P(() => window.__planner.go('plan'));
    ok('baseline: the set-up steps are on the plan from 23 November', await P(() => /Paste the PGCE link into the T Level project/.test(document.querySelector('#screen').textContent)));
    ok('baseline: no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  for (const v of ['yes', 1, null, {}]) {
    const st = JSON.parse(JSON.stringify(rich));
    st.settings.baseCount = v;
    const { ctx, page, errors } = await open(browser, { app: true, now: '2026-11-23T19:30:00', state: st });
    ok(`baseline: a damaged switch (${JSON.stringify(v)}) is repaired to on`, await page.evaluate(() => window.__planner.state.settings.baseCount === true && window.__planner.ksbCovered().size >= 31) && errors.length === 0, errors);
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r[0]);
  results.forEach((r) => console.log(`${r[0] ? 'PASS' : 'FAIL'}  ${r[1]}${r[2] ? '\n      ' + r[2].slice(0, 700) : ''}`));
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILED', e); process.exit(2); });
