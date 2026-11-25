# Cap and Gown (Android)

The Cap and Gown study planner as an Android app, with real alarms and Claude inside the app.

## Page 58: Module 3 from the college's own documents and Padlet board

The Module 3 page under More, Assessment is rebuilt from what the college gives out for the portfolio and its professional discussion: nine documents and the Padlet board "Mapping Evidence to the Occupational Standards". There is no Module 3 handbook. This page change needs no new install.

- **What the documents say, and what they do not.** One rule: all 51 Occupational Standards have to be shown as met by the end of the course to pass. They give no grade bands and do not say how the discussion is marked, so the page claims none and says to ask the tutor. The 30 minutes and the nine stories or questions come from the plan the app already held, and the page says which is which.
- **Everything is in the app's own words.** The college's documents and the board are not copied. The official wording of each standard was already in `KSBS`.
- **The A to Z of evidence** (`AZ`): the college's 26 kinds of evidence, one for each letter.
- **Each standard in plain words** (`KSB_PLAIN`), shown on the matrix and on the KSB sheet in Portfolio.
- **The Padlet board's ideas** (`KSB_IDEAS`): 145 ideas across the 51 standards, each with its A to Z letter where the idea plainly is that kind of evidence.
- **The evidence matrix** (More, Assessment, Module 3, Evidence matrix): the college's grid of 51 standards by 26 letters, turned into one row for each standard. Tap a row for the wording, the plain meaning and the board's ideas, and tick the kinds you have or plan to use (`state.ax.mx`, the letters for each standard). It can be copied as text.
- **Justifications**: the college's two templates, practice to theory and theory to practice (`JUST`), as a screen to write on (`state.ax.just`). Speak and Listen sit under every box. A finished one can be copied, taken to PebblePad, or added to the evidence log, which tags its KSBs and ticks J for them on the matrix. Claude's brief (`justBrief`) carries what was written and questions it; it is told not to rewrite it or add references.
- **Four short guides** (`m3GuideSheet`): what goes where in PebblePad's two workbooks, sharing both with ATLAS, recording an alternative placement, and the A to Z.
- **A pace** (`m3Pace`): how many standards a week it takes to have every one evidenced by the plan's final KSB check.
- **The hand-in list** grew from 7 to 12 with what the documents ask for: each piece explained, the Progress Tracking Page, the Statement of Professionalism, mentor meetings recorded, both workbooks shared.
- **Portfolio**: the KSB sheet shows the plain meaning and opens the college's ideas; the overview has a button to the Module 3 page; Justification is a type in the evidence log.

Saved data: `state.ax.mx` and `state.ax.just` are new. `repair()` keeps only real standards and letters, and cuts a justification to its known parts.

Tests: `logic.js` has a section for the data (26 kinds, 51 meanings, 145 ideas), the page, the four guides, the matrix, both templates, the evidence log, PebblePad, phone back, a reload and damaged data. `bigtext.js` and `clicker.js` open the new screens.

## Page 57: a usual teaching week of 19.5 hours, and placement 2's hours

On 25 November Godswill said he teaches 19.5 hours a week and has covered the 10 hours of his alternative placement. The portfolio now works from that. This page change needs no new install.

- **Your usual week** (`weeklyLead` in the portfolio data, 19.5). Teaching hours shows it under Totals, with how many more teaching weeks reach 150 lead hours and 250 in your setting. The Lead box for this week starts at 19.5. It can be changed at the bottom of Log this week's hours (`state.portfolio.nums.usual`); emptying the box goes back to 19.5.
- **Weeks still to log** (`weeksToLog`): every teaching week from 14 September up to last week with nothing in the log, leaving out half terms, Christmas and Easter (`teachBreaks`). One tap logs them all at the usual week. A week can then be deleted or changed in the log as before.
- **The weekly review.** The hours item has **Log 19.5 h for this week**, which logs the week and ticks the item. Half term and holiday weeks say there is nothing to log.
- **The update card** (`update` in the portfolio data, `pfUpdateCard`). Portfolio, Overview shows what the message changes before anything is touched: the weeks to log, 10 hours on placement 2, and the "arranged" and "10 hours logged" ticks. **Update my portfolio** does all of it and writes it into How it adapts. **Not now** leaves everything as it was, and Teaching hours still offers the weeks. Either way the card does not come back (`state.portfolio.applied`).
- **Placement 2 steps.** The step on 27 November is now to write down the visit dates and what was done while they are fresh, and the step on 26 February checks the hours and notes are in PebblePad.

Damaged saved data is repaired as before: `applied` keeps only real ticks, a usual week that is not a number is dropped, and placement fields are kept as text.

## Page 56: Assessment under More, and a plan that finishes early

**Assessment** is a new screen under More. It holds what each of the two courses is marked on, aims each one at its top standard, and offers a plan that ends the real work on every assessment about two weeks before it is due. This page change needs no new install.

- **Four assessments** (`AX`): the Module 2 presentation and the Module 3 portfolio with its professional discussion for the PGCE; the knowledge workbook and the evidence of assessing learners for the assessor award. Each has a page: what is handed in, its dates and steps from the planner, how it is marked, what top work looks like, and a list to tick before handing in.
- **What is and is not graded.** Only Module 2 has bands in the app (from its handbook), so only Module 2 says "distinction". The assessor award has no distinction grade, and the page says so: the aim there is accepted first time. Module 3 has no grade bands in the college's documents, and the page says that too (see page 58).
- **Where is my work now?** On the Module 2 page each outcome can be rated Refer, Pass, Merit or Distinction (`state.ax.rate`). The lowest one is named first, with what would lift it (`AX_LIFT`).
- **Claude.** One brief for each assessment (`axBrief`). They question and check. They do not write slides, answers, stories or records, and the one for assessment records tells Claude not to ask for learners' names.
- **The early plan** (`AX_GROUPS`, next to `deadlines()`): an earlier evening for 18 steps. The workbook goes to the assessor before Christmas. Standardisation evidence and learner 2 start two weeks sooner, so half term is free. The Module 2 slides are planned and drafted in March beside the project, so a whole first draft exists before Easter, and the final edit is two weeks before the hand-in. The Module 3 portfolio list is checked three weeks before the discussion.
- **What does not move.** Steps tied to a class, an observation or a learner's own dates, and the small jobs that belong close to the day (`AX_LIGHT`: a file check, the upload, speaking practice).
- **It is a choice.** Nothing moves until "Use the early plan" is tapped (a card on Home offers it once). Switching it on is written into How it adapts with every move, and the alarms follow. Switching it off puts every step back. A step moved by hand keeps its date.
- **Switched on late.** A group of steps is used only if its first evening had not passed on the day the plan was switched on (`state.ax.since`), so nothing lands in the past or counts as missed.
- **The pill beside a deadline** says how many days before its due date the real work ends (`axMargin`).

To change the early plan, edit `AX_GROUPS`. Keep each evening under an hour with what is already planned: a check in `logic.js` adds them up.

## Page 55: PGCE Module 2, week by week, to revise before each class

The Module 2 handbook (34 sessions, Wednesdays 9:30 to 12:30) is now a screen of its own, **Module 2**, under More. Each week is a short lesson to read the evening before class, so the class itself can be spent on questions. This page change needs no new install.

- **The weeks.** `M2` holds the 34 sessions with the handbook's dates, kinds and topics (`M2_BREAKS` holds the breaks). A week has the idea in one line, two to four short parts, what is easy to get wrong, two or three check questions, questions to take to class, one thing to try in your own teaching, what a distinction asks of that week, three or four cards, and names to look up. The lessons are written from what each topic means in the field, not from the tutor's slides, and each week says so.
- **Four steps.** Learn, Check, Ask, After (`m2WeekView`). Finishing the check and saying how sure you feel marks the week revised (`m2Revised`). A week with no check is revised once it is read.
- **Home and For you.** `m2HomeCard` shows the next class from seven days out on Home and from two days out on For you: "Revise before class" until the week is revised, then "My questions for class". After 12:30 on the day, and the next day, it asks for five minutes on what you took from the session (`m2Now`).
- **The evening before.** If tomorrow's class is not revised, the evening alarm leads with "Class tomorrow at 9:30: revise week N first" (`m2AlarmWeeks`, in `alarmPlan`). No new alarm time is used.
- **The tutor.** Four briefs for Claude (`m2Brief`): teach me this before class, question me at level 7, clear up what was unclear, and plan how to try it. Each one carries the week, the handbook's topics, the subject taught, the change project and the aim of a distinction. Each one also carries the module's AI rule (`M2_RULES`, AI for shaping only): Claude is told not to write slides, a script or paragraphs for the presentation.
- **A distinction.** The Module 2 screen sets out the four learning outcomes with what the top band asks of each, and the ladder from describing to evaluating (`M2_LO`, `M2_LADDER`). The examples on the ladder are invented, and it says so.
- **Cards.** A revised week's cards join the review cards (`m2CardsOf`, source `m2wN`), come first in the queue, and can be switched off for that week.
- **A class that moves.** Each week's After step can take a new date. The Home card and the evening line follow it.
- **Saved data.** `state.m2.w[n]` keeps, for a week: the day read (`r`), the check answers (`q`), the day revised (`k`), how sure (`f`), ticked questions (`a`), your own questions (`own`), what you took from class (`took`), what is unclear (`fog`), the day tried (`p`) with a note (`pn`), a moved date (`d`) and `nocards`. `repair` drops anything of the wrong shape.

To change a week, edit its entry in `M2`. Keep the wording your own: do not copy the handbook, a tutor's slides or a reading.

## Version 11 (page 54): a video player of the app's own, which knows when you finish

Page 53 opened a YouTube lesson in the in-app reader, as YouTube's own page, and asked "did it stick?" when you came back, because the app could not see the video. This version adds a screen that plays one YouTube video and nothing else.

- **A screen for one video.** Tapping Watch on a single YouTube lesson opens it on a screen of its own: Close, the lesson's title, Browser, the video, and one line of help. It is YouTube's embedded player, so there is no feed and no comments beside it. Full screen turns the video on its side.
- **It knows when you finish.** When the video ends the screen closes, the lesson is marked done and its cards join the review cards, with no question asked first. One sheet then asks whether it stuck, which is the answer that teaches the app what works for you; "Not now" leaves the lesson done.
- **Carry on from where you stopped.** Close a video part of the way through and its button becomes "Carry on from 3:20". It starts a few seconds before that.
- **Real lengths.** The player reports how long a video is, and study time uses it. The 14 YouTube lessons in the library now carry the lengths the player gave on 24 November 2026 (from 2 to 25 minutes; they had all been planned as 8), so "length not checked" is gone from them on every app, old or new.
- **Browser** on the player moves the video out to the phone's browser or the YouTube app at the place it had reached, and "Watch in my browser or the YouTube app" is still on the lesson's sheet.
- **If the player cannot play a video** (its owner does not allow players, or YouTube does not answer in 20 seconds), the screen shows YouTube's own page for it, and the app asks how it went when you come back, as page 53 does.
- A playlist, a channel and a video on any other site still open in the reader.

How it is built: `VideoActivity` holds a web view with no bridge to the planner. It loads a small page of the app's making with `loadDataWithBaseURL` from `https://` and the app's id, which is how YouTube asks an app to name itself (without it the player shows error 153). The page starts the IFrame Player API and keeps the player's state, place and length in one object, which the screen reads once a second. What it learns is left in the app's own storage, and the planner collects it when it is back on the screen: `Bridge.videoPlay` opens the player and `Bridge.videoTake` hands the result over once. On the page, `resOpen` asks for the player first (`playsHere`), `videoTaken` records the place (`res.pos`), the length (`res.len`) and the finish, and `videoBack` still asks by time when only YouTube's page was shown.

This needs this app build. An older app showing the newer page plays videos in the reader as page 53 does, and the lesson's sheet offers the download of the newest app.

Tests: `logic.js` has a section for the player (the request, carrying on, the measured length, the end, the last few seconds, YouTube's own page, a player that refuses, odd answers); `app10` in `lib.js` is the app before this. The emulator job, now **The app's own listening and video player on an Android emulator**, has three steps for this:

1. **The screen's own part, with a stand-in for the player** (no connection needed, must pass): a page that behaves as the player's page does is closed part of the way through, and the screen must leave the place and the length, once; then it is played to the end, and the screen must close itself and leave "ended".
2. **A real YouTube lesson**: the player must answer and give the length. If it plays, the place must move on, and the last seconds must close the screen. Error 153 (YouTube not accepting the app's name) fails the step. Any other refusal is kept on the screen, the words on it are printed, and the step says SKIP.
3. **Every YouTube lesson in the library** is asked for, and its length and whether it played go in the log.

What the first runs showed (24 November 2026, Android 14 emulator on a GitHub runner): the player loaded for all 14 lessons with their titles and lengths and no error 153, so YouTube accepts the way the app names itself. It then refused to play any of them with error 150, and the words on the screen were "Sign in to confirm you’re not a bot". That is YouTube's check on machines in data centres, not a fault in the lesson or the app, and the app did what it does on any refusal: it showed YouTube's own page for the video. So **playback itself is not proven by these checks**; it has to be tried on a phone.

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
- `logic.js` checks behaviour: the recommendations, the library, saved pages, live updates, old and damaged data, different dates, dark and dyslexia display, Listen and Speak (the player bar, speech into each kind of box, spoken notes into a reflection, a refused microphone, an older app, a plain browser), and podcasts (each library podcast finds its own episode, Play from For you and Home, the bar's buttons and slider, carrying on from a saved place, the end of an episode, a lost connection, a show that cannot be reached, an older app, a browser, a 320-pixel phone), and the coach (every lesson has its parts, checks, checklist and real sources; the plan for today under normal, low and good energy; learn, check, plan and write for a question; nothing counted twice; hand-ins from the planner and by hand; the briefs given to Claude and that each says not to write the work; KSB evidence tagged in one tap; the change project's five minutes and notes; damaged data; an older app; a browser), and PebblePad (the app opened in one tap, the website, the PebblePad app missing from the phone, a reflection, a piece of evidence and a KSB's two lines copied across and marked as in, an older app going through the Play Store page, a browser), and mentor meetings (the mentor's agreement, words into the notes with the time, the signal dropping, Pause, the bar on other screens, the phone locked, Pause on the phone's notice, a phone that stops the microphone when locked, an app that stops off the screen and carries on, ten quiet minutes, ninety minutes, the brief given to Claude, its reply sorted into the boxes, saving, changing a saved meeting, taking it to PebblePad, a pasted transcript, deleting the notes, a refused microphone, no recogniser, an older app, a browser, damaged notes). It also checks Module 2: the handbook's dates and breaks, every week's lesson, which class comes next at different times of the week, the Home card, the four steps, the cards joining the review cards, the four briefs given to Claude with the AI rule, the evening line before a class, a class that moves, and damaged notes. And Assessment: the four pages, what is and is not graded, the early plan (every step earlier, on a weekday, in order, each evening under an hour), switching it on and off, a step moved by hand, switching it on late in the year, the rating against the bands, the hand-in ticks, the four briefs given to Claude, and damaged choices. And the usual teaching week: the weeks still to log (half term left out, nothing before the year or after it), the update card and what it changes, Not now, one tap from the weekly review, a changed usual week, and damaged saved data.
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
