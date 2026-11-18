// "Listen to this page" in the in-app reader: the script that collects a page's words lives in
// ReaderActivity.java (GRAB). This takes it from there and runs it on made-up pages of the usual shapes,
// so a change to it is checked without a phone.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'src', 'main', 'java', 'io', 'github', 'oogiemudia', 'capgown', 'ReaderActivity.java'), 'utf8');
const from = src.indexOf('private static final String GRAB = ');
const to = src.indexOf('})()";', from);
if (from < 0 || to < 0) { console.error('HARNESS FAILED: GRAB not found in ReaderActivity.java'); process.exit(2); }
// Java string pieces, joined: "a" + "b" ...
const GRAB = (src.slice(from, to + 6).match(/"((?:[^"\\]|\\.)*)"/g) || []).map((s) => JSON.parse(s.replace(/\\'/g, "'"))).join('');

const para = (n, word) => Array.from({ length: n }, (x, i) => `This is ${word} sentence number ${i + 1} of the reading`).join('. ') + '.';
const PAGES = {
  article: `<html><head><title>Feedback that moves learners on</title></head><body>
    <header><nav><ul><li>Home</li><li>Courses</li><li>Contact us</li></ul></nav><p>Site strapline in the header</p></header>
    <div id="cookie-banner"><p>We use cookies to improve your experience on our site.</p><button>Accept all</button></div>
    <main><article><header><h1>Feedback that moves learners on</h1><p>By A Teacher</p></header>
      <p>${para(6, 'the first')}</p><h2>What the research says</h2><p>${para(6, 'the second')}</p>
      <ul><li>Point one about feedback</li><li>Point two about feedback.</li></ul>
      <blockquote><p>A quotation inside a block.</p></blockquote>
      <p style="display:none">Hidden words that nobody sees.</p>
      <aside><p>Related: ten other articles you might like.</p></aside>
      <form><p>Sign up to our newsletter</p><input></form>
    </article></main>
    <footer><p>Copyright notice in the footer. Privacy policy.</p></footer></body></html>`,
  plain: `<html><head><title>A plain page</title></head><body class="has-cookie-consent">
    <div class="menu"><a href="#">Home</a> <a href="#">About</a></div>
    <div class="content"><h1>Assessment in further education</h1><p>${para(8, 'a plain')}</p><table><tr><th>Term</th><td>Meaning of the term</td></tr></table></div>
    <div class="cookie-notice"><p>This site uses cookies. Read our cookie policy.</p></div></body></html>`,
  thin: `<html><head><title>A video page</title></head><body><main><h1>Watch: questioning</h1><video></video><p>12 minutes.</p></main></body></html>`,
  noblocks: `<html><head><title>Old page</title></head><body><div>${para(10, 'an unmarked')}</div></body></html>`
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const results = [];
  const ok = (name, cond, detail) => results.push([!!cond, name, cond ? '' : JSON.stringify(detail).slice(0, 600)]);
  const grab = async (html, before) => { await page.setContent(html); if (before) await page.evaluate(before); return JSON.parse(await page.evaluate(GRAB)); };

  let r = await grab(PAGES.article);
  ok('article: the title comes with it', r.t === 'Feedback that moves learners on', r.t);
  ok('article: starts with its own heading and author', r.x.startsWith('Feedback that moves learners on.\nBy A Teacher.\nThis is the first sentence number 1'), r.x.slice(0, 120));
  ok('article: headings, paragraphs, list items and quotations are read', /What the research says\./.test(r.x) && /the second sentence number 6 of the reading\./.test(r.x) && /Point one about feedback\.\nPoint two about feedback\.\nA quotation inside a block\./.test(r.x), r.x.slice(-300));
  ok('article: menus, cookie notices, sidebars, forms, footers and hidden words are left out', !/Home|Courses|strapline|cookies|Accept all|Related:|newsletter|Copyright|Hidden words/.test(r.x), r.x);
  ok('article: a heading with no full stop gets a pause after it', r.x.split('\n').every((l) => /[.!?:;…]["'”’)\]]*$/.test(l)), r.x.split('\n').filter((l) => !/[.!?:;…]["'”’)\]]*$/.test(l)));

  r = await grab(PAGES.plain);
  ok('plain page: read from the body when there is no article, even if the body is labelled "cookie"', r.x.startsWith('Assessment in further education.') && /a plain sentence number 8/.test(r.x) && /Term\.\nMeaning of the term\./.test(r.x), r.x.slice(0, 200));
  ok('plain page: its cookie notice is still left out', !/uses cookies/.test(r.x), r.x.slice(-200));

  r = await grab(PAGES.thin);
  ok('video page: too few words to read (the app then says so)', r.x.length < 200, r.x);

  r = await grab(PAGES.noblocks);
  ok('page with no paragraphs: falls back to all its words', r.x.length > 400 && /an unmarked sentence number 10/.test(r.x), r.x.length);

  r = await grab(PAGES.article, () => { const p = document.querySelectorAll('article p')[2]; const range = document.createRange(); range.selectNodeContents(p); const s = window.getSelection(); s.removeAllRanges(); s.addRange(range); });
  ok('selected words: only the selection is read', r.sel === true && r.x.startsWith('This is the second sentence number 1') && !/the first sentence/.test(r.x), r.x.slice(0, 120));

  await browser.close();
  const failed = results.filter((x) => !x[0]);
  results.forEach((x) => console.log(`${x[0] ? 'PASS' : 'FAIL'}  ${x[1]}${x[2] ? '\n      ' + x[2] : ''}`));
  console.log(`\n${results.length - failed.length} of ${results.length} reader checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILED', e); process.exit(2); });
