# Cap and Gown (Android)

The Cap and Gown study planner as an Android app, with real alarms and Claude inside the app.

## Version 4: the online library, a Study tab that picks for you, and live updates

- **Online library, inside the app.** The Library opens the ITE reading list on Padlet and the Ann Gravells reading list in the app's own reader. Tap **Save** at the top of any page and it is kept in your Library, filed by topic. Underneath is a catalogue of 48 readings, videos and podcasts, each one opened and checked, covering every PGCE and Assessor topic.
- **Study, For you.** The Study tab now opens on a list made for today: one thing to study (a quick check, your due cards or a lesson) and one thing each to read, watch and listen to. It is chosen from your weakest topics, what is due soon, quiz slips this week, your energy, the free minutes left tonight and which kind of resource has stuck before. Every pick says why. Tap Done, say if it stuck, and the list learns.
- **Live updates.** The app looks for a newer planner page on GitHub when it opens and shows it without a new install. Settings has Check for updates and a way back to the built-in page.

Six tabs: **Home, Plan, Study, Portfolio, Progress, More**, plus an **Ask tutor** button.

- **Home:** portfolio readiness ring, your one next step, energy check-in, streak / cards due / time this week, today's plan, next deadlines.
- **Plan:** the week's evenings with times. "I'll miss it" moves a step to the next evening with room before its deadline; Re-plan evens out busy evenings.
- **Study:** For you (what to study, read, watch and listen to today), a smart quiz from your weakest PGCE and Assessor topics, spaced-repetition cards, a mistake notebook, and practice papers (assessor workbook, professional discussion, Module 2) reviewed with your tutor.
- **Portfolio:** a workbook like your PebblePad one: weekly review, KSB evidence (all 51 KSBs, tag evidence to them), teaching hours log, observations with reflections and word counts, mentor meetings, placements, records, and the nine duties for the professional discussion. It does not sync with PebblePad; upload there, then mark it here.
- **Progress:** portfolio progress across eight parts, weak spots, topic mastery, time studied, what works for you.
- **More:** Courses, Learn, Library, Key terms & models, Goals & reflection, How it adapts, Settings, What makes it smart.
- **Ask tutor:** your own Claude account (claude.ai) inside the app. Suggestions and tutor buttons put your week and the question into the message box; nothing is sent until you tap send. Sign in once with Continue with email.

## Alarms (unchanged)

- Rings like an alarm clock (alarm volume, full screen, works when the phone is locked) on evenings that have study steps.
- If the weekly PebblePad review or earlier steps are still open, it rings again each weekday evening until they are ticked off.
- If nobody answers, it stops after five minutes and rings again ten minutes later, up to three times.

## Getting the app

Each push to `main` builds a signed app file. The newest one is under **Releases**, called `CapAndGown.apk`.
On the phone: download it, open it, allow installs from that app if Android asks, then tap Install.
A new version installs over the old one and keeps your ticks, because every build uses the same signing key.

A new install is only needed when the Android side changes (alarms, the reader, the chat). Changes to the planner page arrive by themselves, as below.

## Live updates: changing the app without a new install

The whole planner is one page, `app/src/main/assets/index.html`. From version 4 the app reads that file from the `main` branch when it opens (at most every three hours, or when you tap Check for updates in Settings) and shows the newer copy.

To change the app for every phone:

1. Edit `app/src/main/assets/index.html`.
2. Raise the page number in its head: `<meta name="capgown-page" content="40">` becomes `41`. Phones only take a page with a higher number.
3. Open a pull request. The **Check a change** workflow tests the page (see below) and builds the app.
4. Merge it. Phones pick it up the next time the app is opened with a connection.

Safety nets: a downloaded page tests its own main screens and tells the app it works. If it does not, the app goes back to the built-in page by itself. Settings, Updates also has **Go back to the built-in version**.

### Adding to the online library

The catalogue is the `ONLINE` list in `index.html`. Copy a line, give it a new `id`, set `kind` (Read, Watch or Listen), the topics it helps with (best first), the minutes, and a one-line note. Open the link yourself first. Reading lists that open as a whole are in `HUBS` just above it.

## Tests

`tools/check_page.py` checks the page is whole, its script parses, the library links are sound and the page number went up.
`tools/qa/` is a test robot (Playwright, headless Chromium) with a stand-in for the phone:

- `smoke.js` opens every screen in the app, in a browser and in an older app, at two phone widths.
- `logic.js` checks behaviour: the recommendations, the library, saved pages, live updates, old and damaged data, different dates, dark and dyslexia display.
- `clicker.js` taps every button on every screen, and whatever each tap reveals.
- `bigtext.js` checks nothing runs off the edge on a small phone with the phone's text size turned up, the dyslexia-friendly font and wide letters. `FONT="DejaVu Sans"` in front of any of the tests runs it with wide letters, which is what the checks on GitHub use.
- `props.js` goes deeper into the planner itself: 52 clock and time-zone settings (midnight, the clocks changing, new year, leap day, after the course ends), 300 days of use played forward, four long sittings of random taps with nothing reset in between, 240 damaged copies of the saved data, and a backup that is saved, wrecked and restored.

To run them: `cd tools/qa && npm install --no-save playwright && npx playwright install chromium`, then `node smoke.js`, `node logic.js`, `node bigtext.js`, `node props.js`, `node clicker.js app` and `node clicker.js browser`.

Saved data that is damaged (a hand-edited backup, a half-written file) is repaired when the app starts: anything of the wrong shape is dropped and the rest is kept. That is the `repair` function next to `normalise` in `index.html`.

## Where things are

- `app/src/main/assets/index.html` is the planner page (dates and steps are in `window.STUDY_DATA` at the top of the script; the library is in `HUBS` and `ONLINE`; the recommendations are in `recommend()`).
- `app/src/main/java/.../` is the Android side: `Alarms` (sets the next alarm), `AlarmService` (sound, vibration, auto snooze), `AlarmActivity` (the alarm screen), `MainActivity` and `Bridge` (the planner and what it can ask the phone to do), `ChatPane` (claude.ai behind Ask tutor), `ReaderActivity` (the online library inside the app), `LiveUpdate` (fetches and guards the newer page) and `Files` (saving to Downloads).
- `.github/workflows/build.yml` builds and publishes the app file on each push to `main`. `.github/workflows/check.yml` tests every pull request and publishes nothing.
- The build log and the last app file are also saved to the `ci` branch after each build.
