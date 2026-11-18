// A lived-in record in the OLD (version 3) shape: no "res", no "fy", library items without "kind".
// Loading it also tests that an existing phone's data carries over.
const ts = Date.parse('2026-11-10T20:00:00');
module.exports.rich = {
  v: 1, updatedAt: 1, done: { 'as-o12-1': ts, 'as-o12-2': ts, 'as-o12-3': ts, 'pg-ctf-1': ts, 'pg-ctf-2': ts }, moved: {}, due: {}, hidden: {}, custom: [], reviews: {},
  settings: { cap: 60, evening: '19:00', alarmSetupSeen: true, chatTipSeen: true, remindersSeen: true },
  energy: { '2026-11-18': 'okay' }, log: [{ id: 'l1', at: ts, kind: 'study', what: 'Strong quiz', why: '4 of 5 right.' }], weekCap: {}, reflections: {}, missed: {}, logSeen: 0,
  mastery: { retrieval: 42, memory: 80, change: 55, afl: 68, vacsr: 35, methods: 90 },
  cards: { d0: { iv: 2, ease: 2.5, first: '2026-11-10', due: '2026-11-12', at: ts } },
  extraCards: [{ id: 'm1', f: 'What is the testing effect?', b: 'Recall strengthens memory', t: 'retrieval', mistake: true }],
  mistakes: [
    { t: 'retrieval', q: 'Which is retrieval practice?', your: 'Re-reading', right: 'A low-stakes quiz', why: 'Recall beats review.', at: '2026-11-16' },
    { t: 'vacsr', q: 'What does the V stand for?', your: 'Varied', right: 'Valid', why: 'Valid means it measures what it should.', at: '2026-11-17' },
    { t: 'gone-topic', q: 'Old question', your: 'a', right: 'b', why: 'w', at: '2026-11-17' }
  ],
  formats: { 'Worked example': { n: 3, yes: 2, partly: 1 }, 'Short video': { n: 2, yes: 2 }, 'Practice quiz': { n: 2 } },
  study: { '2026-11-17': 25, '2026-11-16': 10 },
  library: [
    { id: 'u1', type: 'Link', title: 'Retrieval practice guide', link: 'https://www.retrievalpractice.org/', c: 'pgce', t: 'retrieval', meta: 'Yours', note: 'Good overview', text: '' },
    { id: 'u2', type: 'Note', title: 'My note on VACSR', link: '', c: 'assess', t: 'vacsr', meta: 'Yours', note: 'Remember sufficiency', text: '' },
    { id: 'u3', type: 'PDF', title: 'A handout with an old topic', link: '', c: 'pgce', t: 'unknown-topic', meta: 'Yours' }
  ],
  favs: { lb1: true, u1: true }, papers: {},
  portfolio: { nums: { hours: 40 }, obs: { f1: true }, checks: {}, duties: {}, approach: '', evidence: [{ id: 'e1', date: '2026-11-01', title: 'Lesson plan week 6', type: 'Lesson plan', link: '', ksbs: ['K1', 'S2'], status: 'draft', notes: '' }], ksbDone: { K1: true }, hours: [{ id: 'h1', date: '2026-11-02', group: 'T Level Y1', lead: 3, other: 1, remote: 0 }], meetings: [{ id: 'mt1', date: '2026-11-05', discussed: 'Talked targets', actions: 'Plan obs 7', none: false }], obsInfo: {}, placements: {}, dutyNotes: {} }
};
