// Taps every button on every screen (and whatever each tap reveals), in the app and in a browser,
// and reports any script error or anything pushed off the side of the screen.
const { chromium, open, overflow } = require('./lib');
const { rich } = require('./seed');

const SCREENS = [];
['home', 'plan', 'portfolio', 'progress', 'more', 'courses', 'learn', 'library', 'terms', 'goals', 'log', 'settings', 'about', 'deadlines', 'add', 'paper', 'voice', 'coach'].forEach((r) => SCREENS.push({ name: r, route: r, sub: {} }));
[['coach/ksb', { cpath: 'ksb' }], ['coach/cp', { cpath: 'cp' }], ['coach/learn', { cq: '2.1', cs: 'learn', cn: 4 }], ['coach/check', { cq: '2.1', cs: 'check' }], ['coach/plan', { cq: '5.2', cs: 'plan' }], ['coach/write', { cq: '5.2', cs: 'write' }]].forEach(([n, s]) => SCREENS.push({ name: n, route: 'coach', sub: s }));
['foryou', 'quiz', 'cards', 'mistakes', 'papers'].forEach((t) => SCREENS.push({ name: 'study/' + t, route: 'study', sub: { stab: t } }));
['overview', 'review', 'ksb', 'hours', 'obs', 'meetings', 'placements', 'records', 'pd'].forEach((p) => SCREENS.push({ name: 'portfolio/' + p, route: 'portfolio', sub: { ppage: p } }));
[['learn/video', { topic: 'afl', fmt: 'Short video' }], ['learn/video-none', { topic: 'ofsted', fmt: 'Short video' }], ['learn/audio', { topic: 'vacsr', fmt: 'Audio summary' }], ['learn/cards', { topic: 'qa', fmt: 'Flashcards' }]].forEach(([n, s]) => SCREENS.push({ name: n, route: 'learn', sub: s }));
[['library/watch', { lf: 'Watch' }], ['library/mine', { lf: 'Mine' }], ['library/topic', { lt: 'vacsr' }], ['library/search', { q: 'podcast' }], ['library/none', { q: 'zzzz' }]].forEach(([n, s]) => SCREENS.push({ name: n, route: 'library', sub: s }));

const SEL = '#appbar [data-act], #appbar [data-go], #screen [data-act], #screen [data-go], #screen [data-tab], #layer .sheet [data-act], #toast [data-act], #player [data-act]';

async function setup(page, seedJson, sc) {
  await page.evaluate(([seed, s]) => {
    const P = window.__planner;
    document.querySelectorAll('[data-act="close-sheet"]').forEach((x, i) => { if (i === 0) x.click(); });
    const ct = document.querySelector('[data-act="close-tutor"]'); if (ct) ct.click();
    // nothing left reading or listening from the tap before
    if (P.DICT.on) { window.__dictating = false; P.dictEvent('end', ''); }
    if (window.__listen && window.__listen.state !== 'idle') { window.__listen.state = 'idle'; P.listenState({ state: 'idle' }, true); } else if (P.LS.state !== 'idle') P.listenCmd('stop');
    if (window.__pod) window.__pod.state = 'idle'; else if (P.POD.state !== 'idle') P.podCmd('stop');
    P.PODQ.run++; P.PODQ.id = ''; P.podState({ state: 'idle' }, true);
    const st = P.state;
    Object.keys(st).forEach((k) => delete st[k]);
    Object.assign(st, JSON.parse(seed));
    Object.keys(P.sub).forEach((k) => delete P.sub[k]);
    Object.assign(P.sub, s.sub);
    P.go('home');
    Object.assign(P.sub, s.sub);
    P.go(s.route);
    const t = document.querySelector('#toast'); if (t) t.hidden = true;
  }, [seedJson, sc]);
}
const list = (page) => page.$$eval(SEL, (els) => els.map((el) => `${el.dataset.act || ''}|${el.dataset.go || ''}|${el.dataset.tab || ''}|${el.dataset.id || ''}|${el.dataset.v || ''}|${el.dataset.t || ''}|${(el.textContent || '').trim().slice(0, 24)}`));
const clickAt = (page, sig, nth) => page.evaluate(([sel, s, n]) => {
  const els = Array.from(document.querySelectorAll(sel)).filter((el) => `${el.dataset.act || ''}|${el.dataset.go || ''}|${el.dataset.tab || ''}|${el.dataset.id || ''}|${el.dataset.v || ''}|${el.dataset.t || ''}|${(el.textContent || '').trim().slice(0, 24)}` === s);
  const el = els[n] || els[0];
  if (!el || el.disabled) return false;
  el.click();
  return true;
}, [SEL, sig, nth]);

(async () => {
  const browser = await chromium.launch();
  const problems = [];
  let taps = 0;
  let printed = 0;
  const WHICH = process.argv[2] || 'app';
  const PART = Number(process.argv[3] || 0);
  const PARTS = Number(process.argv[4] || 1);
  const MINE = SCREENS.filter((x, i) => i % PARTS === PART).filter((x) => !process.env.ONLY || x.name === process.env.ONLY);
  for (const mode of [{ name: 'app', app: true }, { name: 'browser', app: false }].filter((m) => m.name === WHICH)) {
    const { ctx, page, errors } = await open(browser, { app: mode.app, width: 360, now: '2026-11-18T19:30:00', state: rich });
    const seedJson = await page.evaluate(() => JSON.stringify(window.__planner.state));
    const note = (where) => { while (errors.length) problems.push(`${mode.name} ${where}: ${errors.shift()}`); };
    note('load');
    for (const sc of MINE) {
      console.log(`.. ${mode.name} ${sc.name} (${taps} taps so far, ${problems.length} problems)`);
      problems.slice(printed).forEach((x) => console.log('PROBLEM ' + x)); printed = problems.length;
      await setup(page, seedJson, sc);
      note(`${sc.name} (open)`);
      const ov0 = await overflow(page);
      if (ov0.length) problems.push(`${mode.name} ${sc.name}: ${ov0.join(' | ')}`);
      const first = await list(page);
      const seen = {};
      for (let i = 0; i < first.length; i++) {
        const sig = first[i];
        const nth = (seen[sig] = (seen[sig] || 0) + 1) - 1;
        if (nth > 2) continue; // three of a kind is enough
        await setup(page, seedJson, sc);
        if (!(await clickAt(page, sig, nth))) continue;
        taps++;
        note(`${sc.name} > ${sig}`);
        const ov = await overflow(page);
        if (ov.length) problems.push(`${mode.name} ${sc.name} > ${sig}: ${ov.join(' | ')}`);
        // second level: whatever that tap revealed (a sheet, a confirm, a new screen's buttons inside a sheet)
        const second = (await list(page)).filter((x) => !first.includes(x));
        const seen2 = {};
        for (const sig2 of second.slice(0, 10)) {
          const nth2 = (seen2[sig2] = (seen2[sig2] || 0) + 1) - 1;
          if (nth2 > 0) continue;
          await setup(page, seedJson, sc);
          if (!(await clickAt(page, sig, nth))) break;
          if (!(await clickAt(page, sig2, 0))) continue;
          taps++;
            note(`${sc.name} > ${sig} > ${sig2}`);
        }
      }
      // every dropdown option and every text box
      await setup(page, seedJson, sc);
      const fields = await page.$$eval('#screen select, #screen input, #screen textarea', (els) => els.map((el, i) => ({ i, tag: el.tagName, type: el.type, n: el.tagName === 'SELECT' ? el.options.length : 0 })));
      for (const f of fields) {
        const tries = f.tag === 'SELECT' ? Math.min(f.n, 4) : 1;
        for (let k = 0; k < tries; k++) {
          await setup(page, seedJson, sc);
          await page.evaluate(([i, k2]) => {
            const el = document.querySelectorAll('#screen select, #screen input, #screen textarea')[i];
            if (!el || el.type === 'file') return;
            if (el.tagName === 'SELECT') el.selectedIndex = k2;
            else if (el.type === 'range' || el.type === 'number') el.value = '45';
            else if (el.type === 'time') el.value = '18:30';
            else if (el.type === 'date') el.value = '2026-12-01';
            else if (el.type === 'checkbox') el.checked = !el.checked;
            else el.value = 'Test <b>entry</b> "quoted" & more';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }, [f.i, k]);
          taps++;
          note(`${sc.name} field ${f.i} ${f.tag}/${f.type} option ${k}`);
        }
      }
    }
    await ctx.close();
  }
  await browser.close();
  const uniq = [...new Set(problems)];
  console.log(`${taps} taps and field changes.`);
  console.log(uniq.length ? uniq.slice(0, 60).join('\n') + `\n${uniq.length} problem(s)` : 'CLICKER OK');
  process.exit(uniq.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILED', e); process.exit(1); });
