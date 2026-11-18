// Shared helpers for the QA runs: a fake Android bridge, a clock, and page set-up.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// The page under test: the app's own page, unless PAGE_FILE points somewhere else.
const PAGE_FILE = process.env.PAGE_FILE ? path.resolve(process.env.PAGE_FILE) : path.join(__dirname, '..', '..', 'app', 'src', 'main', 'assets', 'index.html');
// Its page number, from the capgown-page meta tag in the head.
const PAGE_NO = Number((fs.readFileSync(PAGE_FILE, 'utf8').slice(0, 4096).match(/name="capgown-page" content="(\d+)"/) || [])[1]) || 0;

function bridgeScript(opts) {
  // Runs in the page before its own script. Mirrors Bridge.java.
  return `(() => {
    const o = ${JSON.stringify(opts || {})};
    window.__calls = [];
    window.__opened = [];
    window.open = (u) => { window.__opened.push(String(u)); return {}; };
    if (o.now) window.__NOW = o.now;
    if (!o.app) return;
    const live = Object.assign({ bundled: ${PAGE_NO}, page: ${PAGE_NO}, waiting: 0, bad: 0, auto: true, checked: 0, lastError: '' }, o.live || {});
    let saved = JSON.stringify(o.savedLinks || []);
    let native = o.nativeState || '';
    const rec = (name) => (...a) => { window.__calls.push([name].concat(a.map((x) => (typeof x === 'string' && x.length > 200 ? x.slice(0, 200) : x)))); };
    window.__live = live;
    window.AndroidApp = {
      version: () => '1.0.5',
      saveState: (j) => { native = j; },
      loadState: () => native,
      setAlarms: rec('setAlarms'),
      testAlarm: rec('testAlarm'),
      status: () => JSON.stringify({ version: '1.0.5', notifications: true, fullScreen: true, exact: true, battery: true, alarmVolume: 5 }),
      fix: rec('fix'),
      saveFile: (...a) => { rec('saveFile')(...a); return true; },
      chatShow: rec('chatShow'), chatHide: rec('chatHide'), chatGo: rec('chatGo'), chatReload: rec('chatReload'),
      chatPasteLink: () => 'empty', chatInsert: rec('chatInsert'), chatOpenBrowser: rec('chatOpenBrowser'), chatSignOut: rec('chatSignOut'),
      copyText: (t) => { window.__lastCopy = String(t); rec('copyText')(t); return true; },
      speak: rec('speak'), stopSpeaking: rec('stopSpeaking'), toast: rec('toast'),
      openReader: (u, t) => { rec('openReader')(u, t); return /^https:\\/\\//.test(u); },
      takeSavedLinks: () => { const s = saved; saved = '[]'; return s; },
      liveStatus: () => JSON.stringify(live),
      checkUpdate: rec('checkUpdate'),
      applyUpdate: rec('applyUpdate'),
      pageReady: rec('pageReady'),
      setAutoUpdate: (on) => { live.auto = !!on; rec('setAutoUpdate')(on); },
      revertUpdate: rec('revertUpdate')
    };
    if (o.oldApp) ['openReader', 'takeSavedLinks', 'liveStatus', 'checkUpdate', 'applyUpdate', 'pageReady', 'setAutoUpdate', 'revertUpdate'].forEach((k) => { delete window.AndroidApp[k]; });
  })();`;
}

async function open(browser, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: opts.width || 390, height: opts.height || 800 },
    deviceScaleFactor: opts.dpr || 1,
    colorScheme: opts.dark ? 'dark' : 'light',
    timezoneId: opts.tz || 'Europe/London'
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  await page.addInitScript(bridgeScript(opts));
  if (opts.zoom && opts.zoom !== 1) {
    // Android makes the app's text bigger when the phone's font size is turned up. This does the same here:
    // every text size in the page's styles, and every one set on an element, is multiplied.
    await page.addInitScript(`(() => {
      const f = ${Number(opts.zoom)};
      const px = (v) => (/^[\\d.]+px$/.test(v) ? (parseFloat(v) * f).toFixed(2) + 'px' : null);
      const el = (n) => { if (n.nodeType !== 1) return; [n].concat(Array.from(n.querySelectorAll('[style*="font-size"]'))).forEach((x) => { if (x.style && x.style.fontSize && !x.__z) { const v = px(x.style.fontSize); if (v) { x.style.fontSize = v; x.__z = 1; } } }); };
      document.addEventListener('DOMContentLoaded', () => {
        const before = getComputedStyle(document.body).fontSize;
        const walk = (rules) => Array.from(rules).forEach((r) => { if (r.cssRules) walk(r.cssRules); if (r.style && r.style.fontSize) { const v = px(r.style.fontSize); if (v) r.style.fontSize = v; } });
        Array.from(document.styleSheets).forEach((sh) => { try { walk(sh.cssRules); } catch (e) {} });
        if (getComputedStyle(document.body).fontSize === before) document.body.style.fontSize = (parseFloat(before) * f) + 'px';
        el(document.body);
        new MutationObserver((ms) => ms.forEach((m) => { m.addedNodes.forEach(el); if (m.type === 'attributes') { m.target.__z = 0; el(m.target); } })).observe(document.body, { childList: true, subtree: true });
      });
    })();`);
  }
  if (opts.state !== undefined) {
    await page.addInitScript(`try { if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); ${opts.state === null ? '' : `localStorage.setItem('capgown-planner-v1', ${JSON.stringify(JSON.stringify(opts.state))});`} } } catch (e) {}`);
  }
  await page.goto('file://' + PAGE_FILE);
  await page.waitForSelector('#nav button');
  return { ctx, page, errors };
}

// Anything wider than the phone screen, or pushing the screen sideways.
async function overflow(page) {
  return page.evaluate(() => {
    const out = [];
    const w = document.documentElement.clientWidth;
    const sc = document.querySelector('#screen');
    if (sc && sc.scrollWidth > sc.clientWidth + 1) out.push(`#screen scrolls sideways: ${sc.scrollWidth} > ${sc.clientWidth}`);
    document.querySelectorAll('#app *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      // rows that scroll sideways on purpose (chips, the portfolio's page tabs)
      for (let p = el.parentElement; p && p.id !== 'screen'; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll') return; }
      if (el.closest('[hidden]')) return;
      if (r.right > w + 1 || r.left < -1) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').join('.')} ${Math.round(r.left)}..${Math.round(r.right)} of ${w}: ${(el.textContent || '').trim().slice(0, 40)}`);
    });
    return out.slice(0, 8);
  });
}

module.exports = { chromium, open, overflow, PAGE_FILE, PAGE_NO };
