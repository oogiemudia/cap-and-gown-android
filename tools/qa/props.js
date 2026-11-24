// Deeper checks on the planner itself: odd clocks and time zones, weeks of use played forward,
// damaged saved data, and a backup taken and put back. Run: node props.js [clocks|walk|monkey|damage|backup]
const { chromium, open, overflow } = require('./lib');
const { rich } = require('./seed');

const ROUTES = ['home', 'plan', 'study', 'portfolio', 'progress', 'more', 'courses', 'learn', 'library', 'terms', 'goals', 'log', 'settings', 'about', 'deadlines', 'add', 'paper', 'voice', 'coach', 'module'];
const STABS = ['foryou', 'quiz', 'cards', 'mistakes', 'papers'];
const PPAGES = ['overview', 'review', 'ksb', 'hours', 'obs', 'meetings', 'placements', 'records', 'pd'];
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Runs inside the page. Returns what is wrong with the plan, the alarms, the calendar file and the suggestions.
const INVARIANTS = `(() => {
  const P = window.__planner, out = [];
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const nowD = new Date(window.__NOW), today = key(nowD);
  const chunks = () => P.deadlines().flatMap((d) => d.chunks.map((c) => Object.assign({}, c, { deadline: d })));
  const before = JSON.stringify(P.state.moved);
  P.replan();
  const again = P.heal();
  if (again) out.push('heal moved ' + again + ' more step(s) straight after a replan');
  if (P.state.settings.heal !== false) chunks().forEach((c) => {
    if (c.done) return;
    const lim = P.lastDayFor(c);
    if ((!lim || lim >= today) && c.dateEff < today) out.push('open step left in the past: ' + c.title + ' on ' + c.dateEff + ' (last day ' + lim + ')');
    const was = JSON.parse(before)[c.id];
    if (P.state.moved[c.id] && P.state.moved[c.id] !== was && lim && P.state.moved[c.id] > lim && lim >= today) out.push('step moved past its last day: ' + c.title + ' to ' + P.state.moved[c.id] + ' (last day ' + lim + ')');
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(c.dateEff))) out.push('step with a bad date: ' + c.title + ' ' + c.dateEff);
  });
  if (P.state.log.length > 80) out.push('change log has ' + P.state.log.length + ' entries');
  const a = P.alarmPlan();
  if (a.on) {
    if (a.alarms.length > 120) out.push(a.alarms.length + ' alarms planned');
    const seen = {};
    a.alarms.forEach((x) => {
      if (!(x.at > nowD.getTime())) out.push('alarm in the past: ' + x.title + ' ' + new Date(x.at));
      if (x.at > nowD.getTime() + 29 * 864e5) out.push('alarm more than four weeks ahead');
      if (!x.title || !x.lines || !x.lines.length) out.push('alarm with nothing to say on ' + x.day);
      if (seen[x.at]) out.push('two alarms at the same minute on ' + x.day); seen[x.at] = 1;
      if (x.lines.some((l) => /undefined|NaN|null/.test(l)) || /undefined|NaN/.test(x.title)) out.push('alarm text broken: ' + x.title + ' / ' + x.lines.join(' / '));
    });
  }
  const ics = P.buildIcs();
  const lines = ics.split('\\r\\n');
  const enc = new TextEncoder();
  const count = (w) => lines.filter((l) => l === w).length;
  if (lines[0] !== 'BEGIN:VCALENDAR' || lines[lines.length - 2] !== 'END:VCALENDAR') out.push('calendar file does not open and close properly');
  if (count('BEGIN:VEVENT') !== count('END:VEVENT') || count('BEGIN:VALARM') !== count('END:VALARM')) out.push('calendar file has an unclosed event or alarm');
  lines.forEach((l) => { if (enc.encode(l).length > 75) out.push('calendar line too long: ' + l.slice(0, 40)); });
  if (/undefined|NaN|Invalid/.test(ics)) out.push('calendar file has a broken value: ' + (ics.match(/.{0,40}(undefined|NaN|Invalid).{0,20}/) || [''])[0]);
  const uids = lines.filter((l) => l.indexOf('UID:') === 0);
  if (new Set(uids).size !== uids.length) out.push('calendar file repeats an event id');
  const r = P.recommend();
  if (!r || !r.picks) out.push('no suggestions object');
  else {
    const ids = r.picks.concat(r.more || []).map((x) => x.it.id);
    if (new Set(ids).size !== ids.length) out.push('the same suggestion twice');
    r.picks.forEach((x) => { if (!x.why || /undefined|NaN/.test(x.why)) out.push('suggestion with no reason: ' + x.it.title + ' / ' + x.why); if (!(x.v > -Infinity)) out.push('suggestion with a broken score: ' + x.it.title); });
    if (r.picks.length < 3) out.push('only ' + r.picks.length + ' suggestion(s)');
    if (/undefined|NaN/.test(r.line || '')) out.push('For you line broken: ' + r.line);
  }
  const wt = P.weekText();
  if (/undefined|NaN|\\[object/.test(wt)) out.push('week summary broken: ' + (wt.match(/.{0,40}(undefined|NaN|\\[object).{0,20}/) || [''])[0]);
  const st = P.selfTest();
  if (st !== true && st !== '' && st != null && !(st && st.ok)) out.push('self-test: ' + JSON.stringify(st));
  try { JSON.parse(JSON.stringify(P.state)); } catch (e) { out.push('saved data cannot be written: ' + e.message); }
  if (/NaN|Infinity/.test(JSON.stringify(P.state, (k, v) => (typeof v === 'number' && !isFinite(v) ? String(v) : v)))) out.push('saved data holds a broken number');
  return out;
})()`;

async function tour(page, where, problems, errors, checkWidth) {
  const visit = async (label, fn, arg) => {
    try { await page.evaluate(fn, arg); } catch (e) { problems.push(`${where} ${label}: crashed: ${String(e.message).split('\n')[0].slice(0, 160)}`); }
    while (errors.length) problems.push(`${where} ${label}: ${errors.shift()}`);
    const txt = await page.evaluate(() => { const s = document.querySelector('#screen'); const t = s ? s.innerText : ''; const m = t.match(/.{0,30}(undefined|NaN|\[object Object\]|Invalid Date).{0,30}/); return m ? m[0].replace(/\s+/g, ' ') : ''; });
    if (txt) problems.push(`${where} ${label}: screen shows "${txt}"`);
    if (checkWidth) { const ov = await overflow(page); if (ov.length) problems.push(`${where} ${label}: ${ov.join(' | ')}`); }
  };
  for (const r of ROUTES) await visit(r, (x) => window.__planner.go(x), r);
  for (const t of STABS) await visit('study/' + t, (x) => { window.__planner.sub.stab = x; window.__planner.go('home'); window.__planner.sub.stab = x; window.__planner.go('study'); }, t);
  for (const p of PPAGES) await visit('portfolio/' + p, (x) => { window.__planner.go('home'); window.__planner.sub.ppage = x; window.__planner.go('portfolio'); }, p);
}

async function clocks(browser, problems) {
  const CLOCKS = ['2026-08-01T19:30:00', '2026-11-18T00:00:30', '2026-11-18T23:59:30', '2026-11-21T10:00:00', '2026-12-24T21:30:00', '2026-12-31T23:59:00', '2027-01-01T00:01:00', '2027-03-28T01:30:00', '2027-03-28T20:00:00', '2027-07-15T19:30:00', '2027-10-31T01:30:00', '2028-02-29T19:00:00', '2029-01-10T19:30:00'];
  const ZONES = ['Europe/London', 'Pacific/Auckland', 'America/Los_Angeles', 'Asia/Kolkata'];
  let n = 0;
  for (const tz of ZONES) for (const now of CLOCKS) {
    const where = `${tz} ${now}`;
    const { ctx, page, errors } = await open(browser, { app: true, width: 360, now, tz, state: rich });
    (await page.evaluate(INVARIANTS)).forEach((x) => problems.push(`${where}: ${x}`));
    await tour(page, where, problems, errors, tz === 'Europe/London');
    await ctx.close();
    n++;
  }
  console.log(`clocks: ${n} clock and time-zone settings, every screen each.`);
}

async function walk(browser, problems) {
  let days = 0;
  for (const seed of [11, 23, 37, 58]) {
    const rnd = rng(seed);
    const { ctx, page, errors } = await open(browser, { app: seed % 2 === 1, width: 360, now: '2026-11-02T19:30:00', state: seed === 58 ? null : rich });
    let day = new Date(2026, 10, 2);
    for (let i = 0; i < 75; i++) {
      const hh = [7, 12, 18, 19, 20, 21, 22, 23][Math.floor(rnd() * 8)];
      const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}:00`;
      const where = `walk ${seed} ${iso}`;
      const acts = await page.evaluate(([now, r1, r2, r3, r4, r5]) => {
        window.__NOW = now;
        const P = window.__planner, did = [];
        const pad = (n) => String(n).padStart(2, '0');
        const d = new Date(now), today = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
        const open = P.deadlines().flatMap((x) => x.chunks).filter((c) => !c.done);
        // tick some of tonight's steps, sometimes an old one, sometimes none at all (a missed evening)
        open.filter((c) => c.dateEff <= today).forEach((c, i) => { if (((r1 * 97 + i * 31) % 10) / 10 < r2) { P.state.done[c.id] = d.getTime(); did.push('tick'); } });
        if (r3 < 0.35) { P.setEnergy(['low', 'ok', 'high'][Math.floor(r4 * 3)]); did.push('energy'); }
        if (d.getDay() === 0 && r5 < 0.7) {
          const mon = new Date(d); mon.setDate(mon.getDate() - 6);
          const mk = mon.getFullYear() + '-' + pad(mon.getMonth() + 1) + '-' + pad(mon.getDate());
          P.saveReflection(mk, 'A week of it', ['ok'], ['lighter', 'same', 'push'][Math.floor(r4 * 3)]); did.push('reflect');
        }
        if (r5 > 0.85) {
          // a new piece of work with a close or far date, the way the Add screen makes one
          const due = new Date(d); due.setDate(due.getDate() + 2 + Math.floor(r1 * 40));
          const dk = due.getFullYear() + '-' + pad(due.getMonth() + 1) + '-' + pad(due.getDate());
          const id = 'x' + Math.floor(r1 * 1e9);
          const steps = [];
          for (let j = 0; j < 1 + Math.floor(r2 * 6); j++) { const sd = new Date(d); sd.setDate(sd.getDate() + j); steps.push({ id: id + '-' + j, date: sd.getFullYear() + '-' + pad(sd.getMonth() + 1) + '-' + pad(sd.getDate()), mins: [10, 25, 45, 90][j % 4], title: 'Extra step ' + j, tip: '' }); }
          P.state.custom.push({ id, custom: true, course: ['pgce', 'assess', 'other'][Math.floor(r3 * 3)], kind: r4 < 0.3 ? 'event' : 'submission', title: 'Extra work ' + id, due: dk, dueTime: r4 < 0.5 ? '09:00' : '23:59', status: 'confirmed', how: '', note: '', template: 'custom', chunks: steps });
          did.push('add');
        }
        return did;
      }, [iso, rnd(), rnd() * 0.9, rnd(), rnd(), rnd()]);
      (await page.evaluate(INVARIANTS)).forEach((x) => problems.push(`${where} after ${acts.join(',') || 'nothing'}: ${x}`));
      while (errors.length) problems.push(`${where}: ${errors.shift()}`);
      if (i % 15 === 14) await tour(page, where, problems, errors, false);
      day.setDate(day.getDate() + (rnd() < 0.15 ? 3 : 1));
      days++;
      if (problems.length > 40) break;
    }
    await ctx.close();
  }
  console.log(`walk: ${days} days of use played forward.`);
}

// One long sitting: hundreds of random taps and entries with nothing reset in between, the clock moving on,
// so the saved data fills up the way real use fills it. Returns that data.
const SEL = '#appbar [data-act], #appbar [data-go], #nav button, #screen [data-act], #screen [data-go], #screen [data-tab], #layer .sheet [data-act], #toast [data-act], #player [data-act]';
async function sitting(browser, problems, seed, steps) {
  const rnd = rng(seed);
  const { ctx, page, errors } = await open(browser, { app: true, width: 360, now: '2026-11-09T19:30:00', state: rich });
  let clock = new Date(2026, 10, 9, 19, 30).getTime();
  let trail = [];
  // the kinds of record a random tap rarely finishes: a piece of work of your own, a lighter week, a saved link
  await page.evaluate(() => {
    const P = window.__planner;
    P.state.custom.push({ id: 'cown1', custom: true, course: 'pgce', kind: 'submission', title: 'Module 2 slides', due: '2026-12-11', dueTime: '09:00', status: 'confirmed', how: 'Turnitin', note: '', template: 'custom', chunks: [{ id: 'cown1a', date: '2026-11-12', mins: 30, title: 'Outline', tip: 'Three headings' }, { id: 'cown1b', date: '2026-11-19', mins: 45, title: 'Draft', tip: '' }, { id: 'cown1c', date: '2026-12-03', mins: 20, title: 'Check and send', tip: '' }] });
    P.state.custom.push({ id: 'cown2', custom: true, course: 'assess', kind: 'event', title: 'Observation with assessor', due: '2026-11-27', dueTime: '13:30', status: 'confirmed', how: '', note: 'Room 4', template: 'observation', chunks: [] });
    P.saveReflection('2026-11-02', 'Tired but on track', ['ok'], 'lighter');
    P.state.library.push({ id: 'uown1', type: 'Link', kind: 'Watch', title: 'Feedback that moves learners on', link: 'https://example.org/feedback', c: 'pgce', t: 'afl', m: 12, meta: 'Yours', note: 'From Andrea', text: '', at: '2026-11-08' });
    P.state.portfolio.hours.push({ id: 'hown1', date: '2026-11-02', group: 'Level 3 Engineering', lead: 6, other: 2, remote: 0 });
    P.go('home');
  });
  for (let i = 0; i < steps; i++) {
    const r = [rnd(), rnd(), rnd()];
    const did = await page.evaluate(([sel, r0, r1, r2, routes]) => {
      const P = window.__planner;
      if (r0 < 0.06) { const to = routes[Math.floor(r1 * routes.length)]; P.go(to); return 'go ' + to; }
      if (r0 < 0.3) {
        const fs = Array.from(document.querySelectorAll('#screen select, #screen input, #screen textarea, #layer .sheet select, #layer .sheet input, #layer .sheet textarea')).filter((el) => el.type !== 'file' && !el.disabled);
        const el = fs[Math.floor(r1 * fs.length)];
        if (!el) return 'no field';
        if (el.tagName === 'SELECT') el.selectedIndex = Math.floor(r2 * el.options.length);
        else if (el.type === 'range' || el.type === 'number') el.value = String(Math.round(r2 * 200));
        else if (el.type === 'time') el.value = ['07:15', '18:30', '21:45'][Math.floor(r2 * 3)];
        else if (el.type === 'date') el.value = ['2026-11-20', '2026-12-04', '2027-02-15', '2027-06-30'][Math.floor(r2 * 4)];
        else if (el.type === 'checkbox' || el.type === 'radio') el.checked = !el.checked;
        else el.value = ['Scaffolding notes', 'https://example.org/reading?x=1&y=2', 'Year 12 <b>group</b> "B" & co', '', 'x'.repeat(300)][Math.floor(r2 * 5)];
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return 'field ' + (el.id || el.name || el.type);
      }
      if (r0 < 0.36) { const f = document.querySelector('#screen form, #layer .sheet form'); if (f) { f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); return 'submit ' + (f.dataset.form || ''); } }
      const els = Array.from(document.querySelectorAll(sel)).filter((el) => !el.disabled && !/^(reset|ask-reset|mistake-clear)$/.test(el.dataset.act || ''));
      const el = els[Math.floor(r1 * els.length)];
      if (!el) { P.go('home'); return 'nothing to tap'; }
      el.click();
      return 'tap ' + (el.dataset.act || el.dataset.go || el.dataset.tab || 'nav') + ' ' + (el.dataset.id || '') + ' "' + (el.textContent || '').trim().slice(0, 18) + '"';
    }, [SEL, r[0], r[1], r[2], ROUTES]).catch((e) => 'CRASH ' + String(e.message).split('\n')[0]);
    trail.push(did); if (trail.length > 6) trail.shift();
    if (/^CRASH/.test(did)) problems.push(`sitting ${seed} step ${i}: ${did} after ${trail.slice(0, -1).join(' > ')}`);
    while (errors.length) problems.push(`sitting ${seed} step ${i}: ${errors.shift()} after ${trail.join(' > ')}`);
    if (i % 40 === 39) {
      // some hours later, back in the app
      clock += (3 + Math.floor(rnd() * 30)) * 3600000;
      const d = new Date(clock);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
      await page.evaluate((x) => { window.__NOW = x; const c = document.querySelector('[data-act="close-tutor"]'); if (c) c.click(); if (window.__capgownResume) window.__capgownResume(); }, iso);
      (await page.evaluate(INVARIANTS)).forEach((x) => problems.push(`sitting ${seed} at ${iso}: ${x}`));
      const ov = await overflow(page);
      if (ov.length) problems.push(`sitting ${seed} step ${i} (${trail.join(' > ')}): ${ov.join(' | ')}`);
    }
    if (problems.length > 30) break;
  }
  await page.evaluate(() => { document.querySelectorAll('[data-act="close-sheet"], [data-act="close-tutor"]').forEach((x) => x.click()); });
  await tour(page, `sitting ${seed} end`, problems, errors, true);
  const lived = JSON.parse(await page.evaluate(() => JSON.stringify(window.__planner.state)));
  await ctx.close();
  return lived;
}
async function monkey(browser, problems) {
  let n = 0;
  for (const seed of [3, 14, 15, 92]) {
    const lived = await sitting(browser, problems, seed, 700);
    n += 700;
    // what that sitting saved must come back exactly as it was saved
    const calm = JSON.parse(JSON.stringify(lived)); calm.settings.heal = false;
    const o = await open(browser, { app: false, width: 360, now: '2026-11-30T19:30:00', state: calm });
    const loaded = JSON.parse(await o.page.evaluate(() => JSON.stringify(window.__planner.state)));
    lost(calm, loaded).filter((x) => !/^\.(updatedAt|fy)\b/.test(x)).forEach((x) => problems.push(`sitting ${seed}: saved data changed on reopening ${x}`));
    await o.ctx.close();
    const size = (o2) => Object.entries(o2).map(([k, v]) => (Array.isArray(v) ? `${k} ${v.length}` : v && typeof v === 'object' ? `${k} ${Object.keys(v).length}` : '')).filter(Boolean).join(', ');
    console.log(`  sitting ${seed} saved: ${size(lived)}; portfolio: ${size(lived.portfolio)}`);
  }
  console.log(`monkey: ${n} random taps and entries in four long sittings.`);
}

async function damage(browser, problems) {
  const PART = Number(process.argv[3] || 0), PARTS = Number(process.argv[4] || 1);
  const rnd = rng(7);
  const junk = [null, 0, -1, 1e9, '', 'text', '2026-13-45', [], {}, [null], [1, 'a', null, {}], { a: null }, true, false, 'null'];
  const pick = () => junk[Math.floor(rnd() * junk.length)];
  const mutate = (node, depth) => {
    if (!node || typeof node !== 'object') return;
    const keys = Object.keys(node);
    if (!keys.length) return;
    const k = keys[Math.floor(rnd() * keys.length)];
    const r = rnd();
    if (depth < 4 && node[k] && typeof node[k] === 'object' && r < 0.6) return mutate(node[k], depth + 1);
    if (r < 0.75) node[k] = pick(); else if (r < 0.9) delete node[k]; else if (Array.isArray(node)) node.push(pick()); else node['extra' + Math.floor(rnd() * 99)] = pick();
  };
  let n = 0;
  const quiet = [];
  const lived = await sitting(browser, quiet, 27, 500);
  for (let i = 0; i < 240; i++) {
    const base = i % 3 === 0 ? rich : lived;
    const st = JSON.parse(JSON.stringify(base));
    const hits = 1 + Math.floor(rnd() * 4);
    for (let h = 0; h < hits; h++) mutate(st, 0);
    const where = `damaged data #${i}`;
    if (i % PARTS !== PART) continue;
    const { ctx, page, errors } = await open(browser, { app: i % 2 === 0, width: 360, now: '2026-11-18T19:30:00', state: st }).catch((e) => ({ failed: e }));
    if (!page) { problems.push(`${where}: the app did not start (${JSON.stringify(diff(base, st)).slice(0, 300)})`); continue; }
    const before = problems.length;
    while (errors.length) problems.push(`${where} start: ${errors.shift()}`);
    try {
      await page.evaluate(() => { window.__planner.replan(); window.__planner.alarmPlan(); window.__planner.buildIcs(); window.__planner.recommend(); window.__planner.weekText(); });
    } catch (e) { problems.push(`${where} planner: ${String(e.message).split('\n')[0]}`); }
    await tour(page, where, problems, errors, false);
    if (problems.length > before) problems.push(`   ^ what was damaged: ${JSON.stringify(diff(base, st)).slice(0, 400)}`);
    problems.slice(before).forEach((x) => console.log('PROBLEM ' + x));
    await ctx.close();
    n++;
  }
  console.log(`damage: ${n} damaged copies of the saved data, every screen each.`);
}
function diff(a, b, path = '', out = []) {
  if (out.length > 6) return out;
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    new Set(Object.keys(a).concat(Object.keys(b))).forEach((k) => diff(a[k], b[k], path + '.' + k, out));
  } else out.push(`${path}: ${JSON.stringify(b === undefined ? '(gone)' : b).slice(0, 60)}`);
  return out;
}

// Everything in a goes through to b unchanged (b may hold more).
function lost(a, b, path = '', out = []) {
  if (out.length > 12) return out;
  if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) { out.push(`${path}: ${JSON.stringify(a).slice(0, 50)} became ${JSON.stringify(b === undefined ? '(gone)' : b).slice(0, 50)}`); return out; }
    Object.keys(a).forEach((k) => lost(a[k], b[k], path + '.' + k, out));
  } else if (a !== b) out.push(`${path}: ${JSON.stringify(a)} became ${JSON.stringify(b === undefined ? '(gone)' : b)}`);
  return out;
}

async function backup(browser, problems) {
  {
    // sound saved data comes through the start-up repair untouched
    const calm = JSON.parse(JSON.stringify(rich)); calm.settings = Object.assign({}, calm.settings, { heal: false });
    const o = await open(browser, { app: false, width: 360, now: '2026-11-18T19:30:00', state: calm });
    const loaded = JSON.parse(await o.page.evaluate(() => JSON.stringify(window.__planner.state)));
    lost(calm, loaded).filter((x) => !/^\.(updatedAt|fy)\b/.test(x)).forEach((x) => problems.push('start-up changed sound data ' + x));
    await o.ctx.close();
  }
  const { ctx, page, errors } = await open(browser, { app: true, width: 360, now: '2026-11-18T19:30:00', state: rich });
  await page.evaluate(() => { const P = window.__planner; P.replan(); P.setEnergy('low'); P.go('settings'); });
  await page.click('[data-act="copy-backup"]');
  const text = await page.evaluate(() => window.__lastCopy || '');
  const strip = (s) => { const o = JSON.parse(s); delete o.updatedAt; return JSON.stringify(o); };
  if (!text || text.length < 500) problems.push('backup: nothing was copied');
  else {
    const snapshot = await page.evaluate(() => JSON.stringify(window.__planner.state));
    // wreck the plan, then put the backup back
    await page.evaluate(() => { const P = window.__planner; P.state.done = {}; P.state.custom = []; P.state.library = []; P.state.res = {}; P.state.portfolio.hours = []; P.go('home'); P.go('settings'); });
    await page.setInputFiles('#f-restore', { name: 'cap-and-gown-backup.json', mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });
    await page.waitForFunction(() => /restored/i.test((document.querySelector('#toast') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => problems.push('backup: no "Backup restored" message'));
    const after = await page.evaluate(() => JSON.stringify(window.__planner.state));
    if (strip(after) !== strip(snapshot)) problems.push('backup: what came back is not what was saved');
    for (const bad of ['', 'not json', '[]', '{"settings":null}', '{"hello":1}', 'null', '{"settings":{},"custom":"x","library":[null,3],"log":{}}']) {
      await page.evaluate(() => { window.__planner.go('home'); window.__planner.go('settings'); });
      await page.setInputFiles('#f-restore', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(bad, 'utf8') });
      await page.waitForTimeout(150);
      await tour(page, `backup restore of ${JSON.stringify(bad).slice(0, 30)}`, problems, errors, false);
    }
  }
  while (errors.length) problems.push(`backup: ${errors.shift()}`);
  await ctx.close();
  console.log('backup: saved, wrecked, restored and compared; seven bad files refused or made safe.');
}

(async () => {
  const which = process.argv[2] || 'all';
  const browser = await chromium.launch();
  const problems = [];
  const parts = { clocks, walk, monkey, damage, backup };
  for (const [name, fn] of Object.entries(parts)) if (which === 'all' || which === name) await fn(browser, problems);
  await browser.close();
  const uniq = [...new Set(problems)];
  console.log(uniq.length ? uniq.slice(0, 80).join('\n') + `\n${uniq.length} problem(s)` : 'PROPS OK');
  process.exit(uniq.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILED', e); process.exit(1); });
