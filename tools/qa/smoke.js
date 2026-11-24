// First pass: every route renders, in the app and in a browser, with no errors and nothing off-screen.
const { chromium, open, overflow } = require('./lib');
const path = require('path');
const fs = require('fs');

const ROUTES = ['home', 'plan', 'study', 'portfolio', 'progress', 'more', 'courses', 'learn', 'library', 'terms', 'goals', 'log', 'settings', 'about', 'deadlines', 'add', 'paper', 'voice', 'coach', 'module'];
const shots = process.env.SHOTS || '';
if (shots) fs.mkdirSync(shots, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const problems = [];
  for (const mode of [{ name: 'app', app: true }, { name: 'browser', app: false }, { name: 'oldapp', app: true, oldApp: true }]) {
    for (const width of [360, 390]) {
      const { ctx, page, errors } = await open(browser, { app: mode.app, oldApp: mode.oldApp, width, now: '2026-11-18T19:30:00', state: null });
      for (const r of ROUTES) {
        await page.evaluate((x) => window.__planner.go(x), r);
        const got = await page.evaluate(() => window.__planner.route);
        if (got !== r) problems.push(`${mode.name} ${width}: route ${r} became ${got}`);
        const ov = await overflow(page);
        if (ov.length) problems.push(`${mode.name} ${width} ${r}: ${ov.join(' | ')}`);
        if (shots && mode.name === 'app' && width === 390 && ['home', 'study', 'library', 'settings', 'learn', 'more'].includes(r)) await page.screenshot({ path: path.join(shots, `${r}.png`), fullPage: false });
      }
      for (const tab of ['foryou', 'quiz', 'cards', 'mistakes', 'papers']) {
        await page.evaluate((t) => { window.__planner.sub.stab = t; window.__planner.go('study'); }, tab);
        const ov = await overflow(page);
        if (ov.length) problems.push(`${mode.name} ${width} study/${tab}: ${ov.join(' | ')}`);
      }
      errors.forEach((e) => problems.push(`${mode.name} ${width}: ${e}`));
      await ctx.close();
    }
  }
  await browser.close();
  console.log(problems.length ? problems.join('\n') : 'SMOKE OK');
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILED', e); process.exit(1); });
