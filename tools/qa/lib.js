// Shared helpers for the QA runs: a fake Android bridge, a clock, and page set-up.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// The page under test: the app's own page, unless PAGE_FILE points somewhere else.
const PAGE_FILE = process.env.PAGE_FILE ? path.resolve(process.env.PAGE_FILE) : path.join(__dirname, '..', '..', 'app', 'src', 'main', 'assets', 'index.html');
// Its page number, from the capgown-page meta tag in the head.
const PAGE_NO = Number((fs.readFileSync(PAGE_FILE, 'utf8').slice(0, 4096).match(/name="capgown-page" content="(\d+)"/) || [])[1]) || 0;

// Episode lists the stand-in app gives for each show (PodFeed.java fetches these from the shows' own feeds).
// Keyed by a show's first feed address, or apple:<id> for shows found through Apple's directory.
const EP = (t, l, days, mins, n) => ({ t, u: 'https://audio.example/' + encodeURIComponent(t.toLowerCase().replace(/[^a-z0-9]+/g, '-')) + '.mp3', l, i: '', n: n || '', d: Date.UTC(2026, 10, 18) - days * 86400000, s: mins * 60 });
const SAMPLE_FEEDS = {
  'https://feed.podbean.com/evidenceintoaction/feed.xml': { title: 'Evidence into Action', eps: [
    EP('Maths: prioritising problem solving | Evidence into Action', 'https://evidenceintoaction.podbean.com/e/maths-prioritising-problem-solving/', 160, 39),
    EP('Exploring disadvantage in 16–19 settings | Evidence into Action', 'https://evidenceintoaction.podbean.com/e/exploring-disadvantage-in-16%E2%80%9319-settings/', 265, 39, 'Co-hosts explore socioeconomic disadvantage in 16–19 education.'),
    EP('Effective professional development in 16-19 settings', 'https://evidenceintoaction.podbean.com/e/effective-professional-development-in-16-19-settings', 300, 33),
    EP('Teaching: an art or science? Part 3', 'https://evidenceintoaction.podbean.com/e/teaching-an-art-or-science-part-3/', 600, 26),
    EP('Teaching: an art or science? Part 1', 'https://evidenceintoaction.podbean.com/e/teaching-an-art-or-science-part-1/', 640, 31),
    EP('Metacognition: moving forward with new evidence', 'https://evidenceintoaction.podbean.com/e/metacognition-moving-forward-with-new-evidence/', 700, 34),
    EP('Ep 18: Special educational needs and disabilities', 'https://evidenceintoaction.podbean.com/e/ep-18-special-educational-needs-and-disabilities/', 1000, 68),
    EP('Ep 6: Cognitive science in the classroom', 'https://evidenceintoaction.podbean.com/e/ep-6-cognitive-science-in-the-classroom/', 1890, 57)
  ] },
  'https://feed.podbean.com/ofstedtalks/feed.xml': { title: 'Ofsted Talks', eps: [
    EP('Renewed Education Inspections', 'https://ofstedtalks.podbean.com/e/renewed-education-inspections/', 313, 30)
  ] },
  'https://www.learningscientists.org/learning-scientists-podcast/?format=rss': { title: 'The Learning Scientists Podcast', eps: [
    EP('Episode 95: Supporting Neurodivergent Kids and Adults', 'https://www.learningscientists.org/learning-scientists-podcast/2025/12/18/episode-95', 335, 35),
    EP('Episode 2: Retrieval Practice', 'https://www.learningscientists.org/learning-scientists-podcast/2017/9/6/episode-2-retrieval-practice', 3360, 20)
  ] },
  'apple:1875223587': { title: 'The Science of Learning', eps: [EP('Our favourite studies, with John Hattie', 'https://anchor.fm/innerdrive/episodes/3', 250, 43), EP('An introduction', 'https://anchor.fm/innerdrive/episodes/1', 280, 12)] },
  'apple:1516532537': { title: 'Mind the Gap: Making Education Work Across the Globe', eps: [EP('Teaching through examples with Tom Needham', 'https://anchor.fm/mindthegap-edu/episodes/122', 40, 58)] },
  'apple:1437192863': { title: 'Teaching Excellence Podcast', eps: [EP('Initial assessment: establishing learner start points', 'https://anchor.fm/TeachingExcellence/episodes/62', 1150, 30)] }
};

function bridgeScript(opts) {
  // Runs in the page before its own script. Mirrors Bridge.java.
  return `(() => {
    const o = ${JSON.stringify(Object.assign({ feeds: SAMPLE_FEEDS }, opts || {}))};
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
    // Listen (ReadAloud.java) and Speak (Dictation.java): stand-ins that keep the state and report it the way
    // the phone does. A test finishes a reading with __listenEnd(done, error) and speaks with __say(words).
    const L = { state: 'idle', title: '', i: 0, n: 0, rate: 1, done: false, resumed: false, error: '' };
    const tellListen = () => setTimeout(() => { if (window.__capgownListen) window.__capgownListen(JSON.parse(JSON.stringify(L))); }, 0);
    const tellSpeak = (kind, text) => setTimeout(() => { if (window.__capgownDictate) window.__capgownDictate(kind, text || ''); }, 0);
    window.__listen = L;
    window.__listenEnd = (done, error) => { Object.assign(L, { state: 'idle', done: !!done, error: error || '' }); tellListen(); };
    // Podcasts (Podcast.java, PodFeed.java): episode lists come from o.feeds; 'fail' for a show that cannot be reached.
    // A test ends an episode with __podEnd(done, error).
    const P = { state: 'idle', id: '', url: '', title: '', show: '', image: '', page: '', pos: 0, dur: 0, rate: 1, done: false, resumed: false, wait: false, error: '' };
    const places = Object.assign({}, o.podPlaces || {});
    const tellPod = () => setTimeout(() => { if (window.__capgownPod) window.__capgownPod(JSON.parse(JSON.stringify(P))); }, 0);
    window.__pod = P;
    window.__podPlaces = places;
    window.__podEnd = (done, error) => { if (done) delete places[P.url]; Object.assign(P, { state: 'idle', done: !!done, error: error || '' }); tellPod(); };
    window.__dictating = false;
    window.__say = (words, kind) => { if (window.__capgownDictate) window.__capgownDictate(kind || 'final', words); };
    window.__dictateEnd = (why) => { window.__dictating = false; if (window.__capgownDictate) window.__capgownDictate('end', why || ''); };
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
      chatPasteLink: () => 'empty', chatInsert: (t) => { window.__lastInsert = String(t); rec('chatInsert')(t); }, chatOpenBrowser: rec('chatOpenBrowser'), chatSignOut: rec('chatSignOut'),
      copyText: (t) => { window.__lastCopy = String(t); rec('copyText')(t); return true; },
      speak: rec('speak'), stopSpeaking: rec('stopSpeaking'), toast: rec('toast'),
      listenStart: (title, text) => {
        rec('listenStart')(title, text);
        if (P.state !== 'idle') { places[P.url] = P.pos; P.state = 'idle'; tellPod(); }
        window.__lastListen = String(text);
        if (!/[A-Za-z0-9]/.test(String(text))) return false;
        Object.assign(L, { state: 'playing', title: String(title), i: o.listenResumed ? 4 : 1, n: Math.max(o.listenResumed ? 9 : 1, Math.ceil(String(text).length / 280)), done: false, resumed: !!o.listenResumed, error: '' });
        tellListen();
        return true;
      },
      listenPause: () => { rec('listenPause')(); if (L.state === 'playing') { L.state = 'paused'; tellListen(); } },
      listenResume: () => { rec('listenResume')(); if (L.state === 'paused') { L.state = 'playing'; L.resumed = false; tellListen(); } },
      listenStop: () => { rec('listenStop')(); if (L.state !== 'idle') { L.state = 'idle'; tellListen(); } },
      listenSkip: (by) => { rec('listenSkip')(by); if (L.state !== 'idle') { L.i = Math.max(1, Math.min(L.n, L.i + by)); L.resumed = false; tellListen(); } },
      listenRate: (r) => { rec('listenRate')(r); L.rate = r; tellListen(); },
      listenRestart: () => { rec('listenRestart')(); if (L.state !== 'idle') { L.i = 1; L.resumed = false; tellListen(); } },
      listenStatus: () => JSON.stringify(L),
      listenTo: (u, t) => { rec('listenTo')(u, t); return /^https:\\/\\//.test(u); },
      podFeed: (req, json) => {
        const q = JSON.parse(json);
        rec('podFeed')(req, q);
        const keys = (q.feeds || []).concat(q.apple ? ['apple:' + q.apple] : []);
        let ans = { ok: false, error: 'no feed' };
        for (const k of keys) { const f = (o.feeds || {})[k]; if (f && f !== 'fail') { ans = Object.assign({ ok: true, stale: false, at: Date.now(), feed: k, image: '' }, JSON.parse(JSON.stringify(f))); break; } }
        setTimeout(() => { if (window.__capgownPodFeed) window.__capgownPodFeed(req, ans); }, o.feedDelay || 0);
      },
      podPlay: (json) => {
        const g = JSON.parse(json);
        rec('podPlay')(g);
        if (!/^https?:\\/\\//.test(g.url || '')) return false;
        if (L.state !== 'idle') { L.state = 'idle'; tellListen(); }
        if (P.url === g.url && P.state !== 'idle') { if (g.at != null) P.pos = g.at * 1000; P.state = 'playing'; tellPod(); return true; }
        if (P.state !== 'idle') places[P.url] = P.pos;
        const saved = places[g.url] || 0;
        Object.assign(P, { state: 'playing', id: g.id || '', url: g.url, title: g.title || '', show: g.show || '', image: g.image || '', page: g.page || '', pos: g.at != null ? g.at * 1000 : saved, dur: (g.dur || 0) * 1000 || 1800000, done: false, resumed: g.at == null && saved > 0, wait: false, error: '' });
        tellPod();
        return true;
      },
      podPause: () => { rec('podPause')(); if (P.state === 'playing' || P.state === 'loading') { P.state = 'paused'; places[P.url] = P.pos; tellPod(); } },
      podResume: () => { rec('podResume')(); if (P.state === 'paused') { P.state = 'playing'; P.resumed = false; tellPod(); } },
      podStop: () => { rec('podStop')(); if (P.state !== 'idle') { places[P.url] = P.pos; P.state = 'idle'; tellPod(); } },
      podSkip: (sec) => { rec('podSkip')(sec); if (P.state !== 'idle') { P.pos = Math.max(0, Math.min(P.dur - 1000, P.pos + sec * 1000)); P.resumed = false; tellPod(); } },
      podSeek: (ms) => { rec('podSeek')(ms); if (P.state !== 'idle') { P.pos = Math.max(0, Math.min(P.dur - 1000, ms)); P.resumed = false; tellPod(); } },
      podRate: (r) => { rec('podRate')(r); P.rate = r; tellPod(); },
      podStatus: () => JSON.stringify(P),
      podPlaces: () => JSON.stringify(places),
      dictateAvailable: () => !o.noRecogniser,
      dictateStart: () => {
        rec('dictateStart')();
        if (o.micDenied) { tellSpeak('end', 'denied'); return; }
        if (o.noRecogniser) { tellSpeak('end', 'none'); return; }
        window.__dictating = true;
        tellSpeak('ready');
      },
      dictateStop: () => { rec('dictateStop')(); if (window.__dictating) { window.__dictating = false; tellSpeak('end', ''); } },
      // A whole mentor meeting (Dictation.start(true)). The app will not start one while it is off the screen
      // (a test sets window.__offScreen): it says "end", "away" and the page asks again when the app is back.
      meetingStart: () => {
        rec('meetingStart')();
        if (window.__offScreen) { tellSpeak('end', 'away'); return; }
        if (o.micDenied) { tellSpeak('end', 'denied'); return; }
        if (o.noRecogniser) { tellSpeak('end', 'none'); return; }
        window.__dictating = true;
        tellSpeak('ready');
      },
      // The PebblePad app (PebblePocket): on this phone unless noPebble
      hasPebblePad: () => !o.noPebble,
      openPebblePad: () => { rec('openPebblePad')(); return !o.noPebble; },
      openReader: (u, t) => { rec('openReader')(u, t); return /^https:\\/\\//.test(u); },
      takeSavedLinks: () => { const s = saved; saved = '[]'; return s; },
      liveStatus: () => JSON.stringify(live),
      checkUpdate: rec('checkUpdate'),
      applyUpdate: rec('applyUpdate'),
      pageReady: rec('pageReady'),
      setAutoUpdate: (on) => { live.auto = !!on; rec('setAutoUpdate')(on); },
      revertUpdate: rec('revertUpdate')
    };
    // app7: the app as it was before it could listen to a whole mentor meeting (page 48).
    if (o.oldApp || o.app4 || o.app5 || o.app6 || o.app7) delete window.AndroidApp.meetingStart;
    // app6: the app as it was before it could open the PebblePad app (page 44).
    if (o.oldApp || o.app4 || o.app5 || o.app6) ['hasPebblePad', 'openPebblePad'].forEach((k) => { delete window.AndroidApp[k]; });
    // app5: the app as it was before podcasts played inside it (page 42).
    if (o.oldApp || o.app4 || o.app5) ['podFeed', 'podPlay', 'podPause', 'podResume', 'podStop', 'podSkip', 'podSeek', 'podRate', 'podStatus', 'podPlaces'].forEach((k) => { delete window.AndroidApp[k]; });
    // app4: the app as it was before Listen and Speak (it still has the reader and live updates).
    if (o.oldApp || o.app4) ['listenStart', 'listenPause', 'listenResume', 'listenStop', 'listenSkip', 'listenRate', 'listenRestart', 'listenStatus', 'listenTo', 'dictateAvailable', 'dictateStart', 'dictateStop'].forEach((k) => { delete window.AndroidApp[k]; });
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
  if (opts.init) await page.addInitScript(opts.init); // a test's own stand-ins (the browser's voice and speech recognition)
  const font = opts.font || process.env.FONT || '';
  if (font) {
    // Letters are wider or narrower from one phone to the next. FONT="DejaVu Sans" (a wide one) shows what
    // still fits when they are wide. Machines without that font fall back to their own.
    await page.addInitScript(`document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'html body, html body *{font-family:${JSON.stringify(font).replace(/'/g, '')},sans-serif!important}'; document.head.appendChild(st); });`);
  }
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

module.exports = { chromium, open, overflow, PAGE_FILE, PAGE_NO, SAMPLE_FEEDS };
