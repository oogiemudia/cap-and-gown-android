# Cap and Gown (Android)

The Cap and Gown study planner as an Android app, with real alarms and Claude inside the app.

## Page 53: videos play inside the app, and a finished video brings its cards

Page 52 sent YouTube lessons out to the browser. They now open inside the app again, in the in-app reader, and a finished video puts cards into the review cards. This page change needs no new install.

- **Videos open inside the app.** Only a page that needs a sign-in (`acc: 'account'`) still goes to the phone's browser. A video's sheet has "Watch in my browser or the YouTube app" as a choice, and the reader's own Browser button moves any page out.
- **Why the reader and not a player on the planner page.** A YouTube frame on the planner page would be able to call the app's bridge (`AndroidApp`), which reads and writes everything saved in the app. The reader is a separate web view with no bridge. YouTube's embedded player also needs the app to name itself in the `Referer`, which the reader cannot do from the page alone, so for now it shows YouTube's own page.
- **Coming back asks if it stuck.** A video that was open for a minute or more brings up "Back from the video. Did it stick?" when you return (`videoBack`, on the app's resume and on the page becoming visible). Back within a minute, nothing is asked.
- **A finished video brings cards.** `VIDEO_CARDS` holds three cards for each of 22 lesson videos. They are written from what the lesson is about (for the assessor award, from the unit's criteria), not from the videos' words, and the app says so. A video with no cards of its own brings the first three deck cards on its topic. These cards come first in the review queue, and they count towards the eight new cards a day.
- **A card in your own words.** After a video, "Add a card in my own words" saves a question and an answer under that video (`extraCards` with `src`), with Speak under each box. The video's sheet lists your cards with Remove, and can take its ready-made cards out (`nocards`) and put them back.
- **The cards screen** can show one video's cards, and says which video a card came from.

To add cards for a video, add its id to `VIDEO_CARDS` with pairs of question and answer. Check each fact against the unit or the source, and do not copy a video's wording.

## Page 52: free lessons only, free study platforms, and a way to report a locked link

A lesson the Study tab suggested turned out to be locked to paying customers. This page change needs no new install.

- **Twelve ProTrainings lessons are out.** That course frees only two of its 24 videos, and the lock is set on its server. The one free lesson that fits the unit ("Understanding different types of assessment") stays, with a note to stop there.
- **Twenty-eight free items are in**, each checked on 24 November 2026 to open without paying (`ck` holds the date): fourteen public YouTube lessons from assessor training providers, the official unit page with every criterion, two City & Guilds guides, a Jisc guide, a short OpenLearn section on Lewin, and eight courses.
- **Course is a new kind.** OpenLearn and Seneca courses are interactive and done a section at a time, so `m` is minutes a session and For you offers one course beside the read, watch and listen picks. A course that needs a free account (`acc: 'account'`) opens in the phone's browser so you can sign in. YouTube lessons went to the browser or the YouTube app too, until page 53 brought them back inside the app.
- **Lengths are honest.** The YouTube lengths could not be read, so those items carry `g` and say "length not checked"; the plan allows eight minutes for each.
- **Free study platforms** have their own card on Study > For you and in the Library: Gemini Notebook (NotebookLM), OpenLearn, Seneca teacher CPD, AnkiDroid and the ETF Learning Library, each with the one job it does and how you get in.
- **"It was locked or asked me to pay"** is on every pick you have opened and at the foot of every item's sheet. The item leaves For you until you put it back, the Library marks it Locked, and the next free item on the same topic is offered.
- A pick that needs a sign-in says so on its card (college library books, free-account courses).

The research behind the choices is in the project files (`Cap and Gown study platforms/`).

## Version 10 (page 51): the app does the listening itself, so it carries on with the phone locked

Version 9 kept the meeting listener going under a notice, but on the phone it was tried on the words still stopped when the phone was locked. The reason is the phone's speech service: it is another app's service, and on many phones it stops hearing when the screen goes off. No setting in Cap and Gown can change that. So this version adds the app's own listening.

- **Listening with the phone locked** is a new card on Portfolio, Mentor meetings. **Download** fetches a speech model once (136 MB for the Balanced size; Most accurate is 257 MB and Smallest 43 MB). It shows the progress, can be stopped and carried on, asks first on mobile data, and says so if the connection drops or the phone is short of room.
- **Once the model is on the phone, the app listens by itself.** It opens the microphone and turns the sound into words on the phone. It does not use the phone's speech service, so it carries on with the phone locked or with another app open, under the same notice with its **Pause** button. **No sound leaves the phone and none is saved**: only the words are kept, as before.
- **Nothing is lost while the phone is locked.** The app numbers each sentence. If the phone holds the page up while it is locked, the page asks the app for the sentences it missed when it wakes, in order and once each. The last sentence being said at Pause or Finish is kept too.
- **The phone's speech service is still there.** Without the download, meetings are listened to as in version 9, and the sheet says to keep the app open on the screen. **Use the phone's speech instead** switches back at any time, and a size can be changed or removed. If the app's own listening cannot start, the meeting carries on with the phone's speech service and the card says so.
- **What it costs.** The app file grows from under 1 MB to about 16 MB, because it now carries the speech engine. A long meeting uses a fair amount of battery, because the phone is doing the work that Google's computers did. It still does not know who is speaking and still mishears some words.

How it is built: the engine is [Moonshine Voice](https://github.com/moonshine-ai/moonshine) (MIT licence), from Maven Central as `ai.moonshine:moonshine-voice`. Only its engine is used, through `ai.moonshine.voice.JNI`, so none of the libraries it lists for its other parts are brought in. `SpeechModel` asks the engine for its own list of model files, downloads them into the app's folder (carrying on a broken download, checking each file's size and CRC-32C checksum) and remembers which size is in use. `OwnSpeech` reads the microphone with `AudioRecord`, feeds the engine a streaming session, and reports through the same callback as `Dictation`: `ready` with the text `own`, `partial`, `final` and `end` (with `engine` if the model would not start, `mic` if the microphone was taken away). `MainActivity.beginDictation()` uses it for a meeting when a model is in use, under `MeetingService`, which already keeps the processor awake. The engine's transcript is started afresh every few minutes, at a pause, so a long meeting does not grow without end. `Bridge` adds `ownListen`, `ownDownload`, `ownCancel`, `ownUse`, `ownDelete`, `meetingSince` and `meetingForget`.

This needs this app build. An older app showing the newer page works as it did, and its card and sheet offer the download of the newest app.

Tests: `logic.js` has a section for the card, the download, the sizes, mobile data, a meeting with the phone locked (sentences held back and caught up), a model that will not start, and older apps (`app9` in `lib.js` is the app before this). The checks also have a new job, **The app's own listening on an Android emulator**: it builds a test build, starts an Android 14 emulator, downloads the smallest model and plays the engine a recording, which must come out as the right words (`app/src/debug/.../SelfTest.java`, which is not in the app people install). It then turns the emulator's screen off and checks the microphone still gives sound under the meeting's notice. On the first run the Smallest model heard 44 seconds of speech correctly, four times faster than it was spoken, and the microphone gave sound for the whole minute the screen was off. An emulator is not a phone: how well it hears two people across a table, how much battery it uses, and whether a phone maker's own battery saver lets it be have to be tried on the phone.

## Version 9 (page 50): the meeting listener carries on with the phone locked

- **Lock the phone or open another app.** A meeting that is being listened to now carries on. While it does, the phone shows a notice, **Listening to your mentor meeting**, with a **Pause** button, on the lock screen too. Tapping the notice opens the app.
- **Other screens of the app.** Leaving the Mentor meetings page, or opening the tutor, no longer pauses it. Every other screen has a bar at the top that says it is listening, with the clock; a tap opens Mentor meetings. Reading aloud and podcasts are refused while it listens, so the phone does not write down its own voice.
- **If a phone will not allow it.** Some phones stop the microphone when they are locked. If the phone says so, or nothing is heard for ten minutes from the moment the phone was locked, the notes say that and to keep the app open on the screen next time.
- It still ends after ten quiet minutes or ninety minutes of listening, and still needs the mentor's agreement first.

How it is built: `MeetingService` is a foreground service of the microphone type. `MainActivity` starts it as the listening starts, while the app is on the screen, which is the only moment Android allows, and stops it as the listening ends. The service hears nothing itself: it shows the notice and keeps the processor awake, and `Dictation` in `MainActivity` goes on listening because `onPause` no longer cancels a meeting that is under its notice. It is started as an ordinary service on purpose, so that a phone that refuses the notice leaves the listening as it was in version 8 instead of crashing. `Bridge.meetingInBackground()` tells the page; Pause on the notice ends with the reason `paused`, and a microphone taken away off the screen with `locked`. Words that arrive while the page is hidden are saved as they arrive, because a hidden page's timers are slowed.

This needs this app build. The app from version 8 still stops the microphone when it leaves the screen and carries on when it comes back, and its sheet offers the download. When it was tried on a phone, the phone's speech service stopped turning speech into words once the phone was locked. Version 10, above, is the answer to that.

## Version 8 (page 49): the phone takes the notes in a mentor meeting

On Portfolio, Mentor meetings.

- **Listen to this meeting.** Tap it at the start of a meeting and put the phone on the table. The phone's own speech service (the one Speak uses) turns what is said into words, with the time every five minutes. **Only the words are kept, on the phone. No sound file is ever made.**
- **The mentor agrees first.** Listening will not start until **My mentor knows and agrees** is switched on. It is asked again each time the app is opened, and after the notes are deleted.
- **Pause and Finish.** Pause for anything private, such as a named learner. It ends after ten quiet minutes or ninety minutes of listening. (In this version it also stopped when the app left the screen. Version 9, above, changed that.)
- **Build my record with Claude.** Afterwards the notes can be read and corrected, then the button puts them into your own Claude with a brief: use only what was said, mark anything unclear with [check], name no learner, write no reflection. Claude answers under the headings of the record. Paste its reply back and it is sorted into the boxes: who was there, progress on the last targets, what you discussed, strengths, areas to develop, actions agreed, next meeting.
- **Check it, save it, take it to PebblePad.** The record opens for checking, with every box open to change. Saving deletes the phone's notes (a switch keeps them). **Save and take it to PebblePad** copies the record under its headings and opens the PebblePad sheet; one tap marks it as in.
- **Without the microphone.** A transcript made somewhere else can be pasted in instead, and a meeting can still be written up by hand. Saved meetings now open again for changes.
- **What it cannot do.** It does not know who is speaking, it mishears some words, and it needs a signal on most phones (the phone's speech service may send the sound to Google to turn it into words). The record is a draft for you and your mentor to correct.

The headings are one list in the page (`MEET_FIELDS`), so they can be changed to match the college's Mentor Meeting Record.

Listening to a whole meeting needs this app build (`Bridge.meetingStart`: `Dictation` carries on through pauses and reports "wait" while it tries again, and the chat takes a longer brief). An older app showing the newer page listens in short stretches that the page starts again, says that one more install makes it dependable, and copies a very long brief for pasting.

## Page 48: the baseline counts

A page change only: it arrives by itself, with no new install.

- **The Strong KSBs now count.** The 31 Strong KSBs on the reset baseline count as evidenced, so Portfolio shows 31/51 for KSBs with evidence and the progress ring moves with it. On the KSB map they are green and labelled Strong, and their sheet says Evidenced (baseline).
- **A switch to turn it off.** The Reset baseline card on KSB evidence has **Count the 31 Strong KSBs as evidenced**. Off, the map counts only what is tagged here or marked as in PebblePad. It is on for every phone unless turned off (`settings.baseCount`).
- **Seen where progress is read.** The Portfolio overview has a KSB reset baseline notice with **Open KSB evidence**.
- **The coach works on what is left.** With the baseline on, the coach's KSB of the day comes from the Partial and Gap KSBs (S18 first).
- Tests: `logic.js` checks the baseline data, the count, the switch, the map labels, the sheet, tagging on top of the baseline and a damaged switch. The sample record in `seed.js` keeps the switch off so the older coach checks still test what they were written for.

## Page 46: the KSB reset baseline

A page change only: it arrives by itself, with no new install.

- **Reset baseline on the KSB page.** Portfolio, KSB evidence has a Reset baseline card: where the evidence for each of the 51 KSBs stood on 22 November 2026, when the portfolio was restarted (31 Strong, 14 Partial, 6 Gap). The Gap and Partial KSBs are buttons, and **What the evidence codes mean** explains P1, TL3 and the rest.
- **On each KSB.** A KSB's sheet shows its baseline: strength, the evidence behind it, the next step and what it was mapped to in PebblePad before the reset.
- **Read-only at first.** On page 46 the baseline did not count towards the KSB map. Page 48 changed that (see above).
- **New planner steps.** "KSB reset and T Level bridge set-up" (your own target, 1 December): paste the PGCE link into the T Level project, add the Drive line to the PGCE project and run the catch-up once, review the KSB Coverage Reset, then the quick wins.

The baseline is `ksbBaseline` in `window.STUDY_DATA` (one entry per KSB: `s` strength, `ev` evidence, `pp` mapped before the reset, `next`). Its master copy is `claude/ksb-coverage-reset.md` in the PGCE Claude project.

## Version 7: the PebblePad app, one tap away

- **PebblePad buttons offer both.** The PebblePad button on Portfolio (and in Settings) opens a short sheet: **Open the PebblePad app** (PebblePocket, for a quick note, reflection, photo or video, even with no signal) or **Open PebblePad on the web** (the workbook, with the link saved in Settings).
- **Take it to PebblePad.** A reflection on an observation, a piece of evidence and the coach's two lines for a KSB each have a button that copies your words and opens that sheet. Paste them in PebblePad, come back, and one tap marks it here as uploaded.
- **What it cannot do.** The two apps cannot swap data: PebblePad gives no other app a way to read or write a portfolio. So nothing is sent or fetched by itself. It is still: add it there, mark it here.

Opening the PebblePad app in one tap needs the app build that came with page 45 (`Bridge.openPebblePad`, and the app is named in the manifest so that Android lets Cap and Gown see it). An older app showing the newer page opens PebblePocket's Play Store page, which has an Open button, and offers the download. If PebblePocket is not on the phone, the Play Store page is where to get it.

## Page 44: the coach, a small step every day

A page change only: it arrives by itself, with no new install (see Live updates below).

- **It plans.** The coach counts what is left and the days to your date, and sets a small step for each day. Miss a day and the rest is spread again. Low energy on Home keeps one light step; good energy adds one. Home shows tonight's first step, and **More, Coach** has all of it.
- **Assessor workbook (Unit D/601/5313).** Each of the 25 questions is two short sittings. **Learn it** (about 10 minutes): a lesson in three or four parts to read or listen to, then two quick checks and how sure you feel. **Write it** (about 20 minutes): what the question word asks for, what a good answer covers, the common slip, sources you could read and cite, your own plan, then your own answer, typed or spoken. Questions whose hand-in is still ahead come first. An outcome whose hand-in is ticked on the planner counts as handed in, and you can switch any outcome or question yourself. **My answers** copies them or saves them as a file for the Word workbook.
- **KSB portfolio.** One KSB a day, the ones that count towards the most duties first: understand it, tag one piece of evidence you already have (or add a new one), and write two lines on how it shows the KSB.
- **Change project.** Five minutes a day (one small task, in turn), the next step from the planner, and one place for running notes, typed or spoken.
- **Claude joins in when you ask.** **Coach me live with Claude** opens your own Claude with the question, the checklist and where you are, and asks it to teach one step at a time. **Check my answer with Claude** asks for feedback against the checklist. Every brief tells Claude not to write the answer, the note or the project work: the workbook ends with a declaration that the work is your own and that any AI tool is named. The app has no Claude of its own, so you tap Send in Claude yourself; the plan and the lessons work without a connection.

The lessons are in `AW` in `index.html` (one entry per question: `learn`, `check`, `cover`, `trap`, `own`, `start`, `src`), written from the assessor's role, with sources from `REFS`. To add a course, add its units in the same shape and a tab in `COACH_PATHS`. What you do is kept in `state.coach`.

## Version 6: podcasts play inside the app

- **Play here.** Every podcast in the library now plays in the app itself. The day's podcast in Study, For you has **Play here**, and Home has **Play today's podcast here**. The app finds the episode in the show's own feed and streams it; nothing opens outside the app.
- **Screen off, lock screen, headphones.** It carries on with the screen off or another app open. The notification and the lock screen have back 15 seconds, pause, forward 30 seconds and stop, and so do headphone buttons and a car. Unplugging headphones pauses it.
- **Your place is kept.** Stop part way and it carries on from there next time (**Start again** on the bar goes back to the beginning). A bar above the tabs shows the time and has a slider to move through the episode, and speed from 0.8× to 2×.
- **The whole show.** A podcast's card in the Library shows its episode, where you got to, and the show's other episodes, newest first. A whole show (Mind the Gap, The Science of Learning, Teaching Excellence, the Learning Scientists) plays the episode you started, or else the newest one you have not heard.
- When an episode ends the app asks if it stuck, the same as Done.

Shows are found from their feed address, or through Apple's podcast directory when only an Apple Podcasts or Spotify link is known (`SHOWS` in `index.html`). The last list for each show is kept on the phone, so it still shows without a connection. Playing podcasts needs the app build that came with page 43: an older app showing the newer page opens the episode's page as before and offers the download.

## Version 5: Listen and Speak

- **Listen.** The phone reads to you, in its own voice: a lesson (Learn, **Listen to this lesson**), a reading (**Listen to this page** at the bottom of any page the app opens, or **Listen to it instead** on a Library card), anything you have written (**Listen** under every writing box), and anything from another app (Share, then Cap and Gown). It carries on with the screen off and remembers your place. A bar above the tabs, and a notification, have back, pause, forward, speed and stop. PDF files and videos cannot be read aloud.
- **Speak.** A **Speak** button under every writing box turns what you say into text, using the phone's own speech recogniser. Say "full stop", "comma", "question mark" or "new paragraph" as you go. It stops when you tap Stop, when it goes quiet, or when the app leaves the screen. Only the text is kept, on the phone.
- **Spoken notes for each observation.** Portfolio, Observations: each observation has a Spoken notes box, stamped with the date and time, for saying how it went straight after. When the feedback arrives, **Start from my spoken notes** makes them the first draft of the reflection, and **Ask tutor to help me build it** hands the tutor your own words and the feedback targets (it is told not to write it for you).
- More, **Listen & speak** explains both, sets the reading speed and has a notepad.

Listen and Speak need the app build that came with them (the Android side changed). An older app showing the newer page says so and offers the download.

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
- **More:** Courses, Learn, Library, Listen & speak, Key terms & models, Goals & reflection, How it adapts, Settings, What makes it smart.
- **Ask tutor:** your own Claude account (claude.ai) inside the app. Suggestions and tutor buttons put your week and the question into the message box; nothing is sent until you tap send. Sign in once with Continue with email.

## Alarms (unchanged)

- Rings like an alarm clock (alarm volume, full screen, works when the phone is locked) on evenings that have study steps.
- If the weekly PebblePad review or earlier steps are still open, it rings again each weekday evening until they are ticked off.
- If nobody answers, it stops after five minutes and rings again ten minutes later, up to three times.

## Getting the app

Each push to `main` builds a signed app file. The newest one is under **Releases**, called `CapAndGown.apk`.
On the phone: download it, open it, allow installs from that app if Android asks, then tap Install.
A new version installs over the old one and keeps your ticks, because every build uses the same signing key.

A new install is only needed when the Android side changes (alarms, the reader, the chat, listen and speak, the podcast player, opening the PebblePad app, listening to a whole mentor meeting, and with the phone locked). Changes to the planner page arrive by themselves, as below.

## Live updates: changing the app without a new install

The whole planner is one page, `app/src/main/assets/index.html`. From version 4 the app reads that file from the `main` branch when it opens (at most every three hours, or when you tap Check for updates in Settings) and shows the newer copy.

To change the app for every phone:

1. Edit `app/src/main/assets/index.html`.
2. Raise the page number in its head: `<meta name="capgown-page" content="40">` becomes `41`. Phones only take a page with a higher number.
3. Open a pull request. The **Check a change** workflow tests the page (see below) and builds the app.
4. Merge it. Phones pick it up the next time the app is opened with a connection.

Safety nets: a downloaded page tests its own main screens and tells the app it works. If it does not, the app goes back to the built-in page by itself. Settings, Updates also has **Go back to the built-in version**.

### Adding to the online library

The catalogue is the `ONLINE` list in `index.html`. Copy a line, give it a new `id`, set `kind` (Read, Watch, Listen or Course), the topics it helps with (best first), the minutes (for a Course, minutes a session), and a one-line note. Open the link yourself first, signed out: nothing goes in unless it opens without paying. Add `ck` with the date you checked, `acc: 'account'` if it needs a free account, and `g: true` if you could not find the length. Reading lists that open as a whole are in `HUBS` just above it; a hub with `plat: true` is a free study platform shown on the Study tab.

For a podcast, add `pod:` with the show's key in `SHOWS` so it plays in the app. The episode is found by its page's address in the show's feed; when the link is not the episode's own page, add `ep:` with words from the episode's title. A new show needs a line in `SHOWS`: its feed address if you know it, and its Apple Podcasts id (the number after `id` in its Apple Podcasts link). A page you save yourself from a Podbean show plays in the app without any of this.

## Tests

`tools/check_page.py` checks the page is whole, its script parses, the library links are sound and the page number went up.
`tools/qa/` is a test robot (Playwright, headless Chromium) with a stand-in for the phone:

- `smoke.js` opens every screen in the app, in a browser and in an older app, at two phone widths.
- `logic.js` checks behaviour: the recommendations, the library, saved pages, live updates, old and damaged data, different dates, dark and dyslexia display, Listen and Speak (the player bar, speech into each kind of box, spoken notes into a reflection, a refused microphone, an older app, a plain browser), and podcasts (each library podcast finds its own episode, Play from For you and Home, the bar's buttons and slider, carrying on from a saved place, the end of an episode, a lost connection, a show that cannot be reached, an older app, a browser, a 320-pixel phone), and the coach (every lesson has its parts, checks, checklist and real sources; the plan for today under normal, low and good energy; learn, check, plan and write for a question; nothing counted twice; hand-ins from the planner and by hand; the briefs given to Claude and that each says not to write the work; KSB evidence tagged in one tap; the change project's five minutes and notes; damaged data; an older app; a browser), and PebblePad (the app opened in one tap, the website, the PebblePad app missing from the phone, a reflection, a piece of evidence and a KSB's two lines copied across and marked as in, an older app going through the Play Store page, a browser), and mentor meetings (the mentor's agreement, words into the notes with the time, the signal dropping, Pause, the bar on other screens, the phone locked, Pause on the phone's notice, a phone that stops the microphone when locked, an app that stops off the screen and carries on, ten quiet minutes, ninety minutes, the brief given to Claude, its reply sorted into the boxes, saving, changing a saved meeting, taking it to PebblePad, a pasted transcript, deleting the notes, a refused microphone, no recogniser, an older app, a browser, damaged notes).
- `reader.js` takes the script that collects a web page's words for **Listen to this page** out of `ReaderActivity.java` and runs it on made-up pages: menus, cookie notices and footers must be left out.
- `clicker.js` taps every button on every screen, and whatever each tap reveals.
- `bigtext.js` checks nothing runs off the edge on a small phone with the phone's text size turned up, the dyslexia-friendly font and wide letters. `FONT="DejaVu Sans"` in front of any of the tests runs it with wide letters, which is what the checks on GitHub use.
- `props.js` goes deeper into the planner itself: 52 clock and time-zone settings (midnight, the clocks changing, new year, leap day, after the course ends), 300 days of use played forward, four long sittings of random taps with nothing reset in between, 240 damaged copies of the saved data, and a backup that is saved, wrecked and restored.

To run them: `cd tools/qa && npm install --no-save playwright && npx playwright install chromium`, then `node smoke.js`, `node logic.js`, `node reader.js`, `node bigtext.js`, `node props.js`, `node clicker.js app` and `node clicker.js browser`.

The stand-in for the phone (`lib.js`) cannot speak, hear or play sound. It keeps the state the phone would keep and reports it the same way; a test "says" words with `__say()` and ends an episode with `__podEnd()`. Its podcast feeds are made-up lists (`SAMPLE_FEEDS`) whose episode pages match the library's links. The voice, the microphone, the notification, screen-off playing and the real feeds can only be tried on a real phone. `PodFeed.java` is plain Java, so its feed reading can be tried on a computer with `javac` and sample feeds.

Saved data that is damaged (a hand-edited backup, a half-written file) is repaired when the app starts: anything of the wrong shape is dropped and the rest is kept. That is the `repair` function next to `normalise` in `index.html`.

## Where things are

- `app/src/main/assets/index.html` is the planner page (dates and steps are in `window.STUDY_DATA` at the top of the script; the library is in `HUBS` and `ONLINE`; the recommendations are in `recommend()`).
- `app/src/main/java/.../` is the Android side: `Alarms` (sets the next alarm), `AlarmService` (sound, vibration, auto snooze), `AlarmActivity` (the alarm screen), `MainActivity` and `Bridge` (the planner and what it can ask the phone to do), `ChatPane` (claude.ai behind Ask tutor), `ReaderActivity` (the online library inside the app, and Listen to this page), `ReadAloud` and `ReadAloudService` (Listen: the voice, the place it got to, the notification), `Podcast`, `PodcastService` and `PodFeed` (podcasts: the player and the place in each episode, the lock screen and notification controls, finding a show's episodes from its feed), `Dictation` (Speak: speech to text), `LiveUpdate` (fetches and guards the newer page) and `Files` (saving to Downloads).
- `.github/workflows/build.yml` builds and publishes the app file on each push to `main`. `.github/workflows/check.yml` tests every pull request and publishes nothing.
- The build log and the last app file are also saved to the `ci` branch after each build.
