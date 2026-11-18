# Cap and Gown (Android)

The Cap and Gown study planner as an Android app, with real alarms and Claude inside the app.

## Version 2: the Studypath layout

Five tabs: **Home, Plan, Chat, Portfolio, More**. Home has the cap and your evening; More holds Deadlines, Add a deadline, Weekly reflection, How it adapts and Settings.

- **One next step.** Home shows the single best thing to do now: an open PebblePad review first, then the step tonight with the closest deadline. Done, Not tonight and Why this? are on the card.
- **Energy check-in.** Low keeps only the most urgent step tonight and moves the rest to evenings with room. Good pulls one step forward from later in the week. Changing your answer undoes it.
- **Self-healing planner.** A step you miss moves to the first weekday evening with room before its deadline, closest deadline first, and the alarm rings for it there. Steps whose deadline has passed are not moved; Home lists them under Check these. Re-plan (on the Plan tab) evens out evenings that are over your limit. Can be turned off in Settings.
- **Weekly reflection.** On review day: a few lines, how the week felt, and whether next week should be lighter, usual or fuller. Lighter caps next week's evenings and moves the least urgent steps. The app also notes patterns from your ticks and reflections.
- **How it adapts.** Every change the planner makes, with the reason. Energy, Re-plan and reflection changes can be undone for a week.
- **Chat.** claude.ai inside the app, signed in to your own Claude account, so your chats and the PGCE project are there. Sign in once with Continue with email (Google sign-in does not work inside apps). The list button puts this week's plan into the message box. Attaching files, the microphone and downloads work.

## Alarms (unchanged)

- Rings like an alarm clock (alarm volume, full screen, works when the phone is locked) on evenings that have study steps.
- If the weekly PebblePad review or earlier steps are still open, it rings again each weekday evening until they are ticked off.
- If nobody answers, it stops after five minutes and rings again ten minutes later, up to three times.

## Getting the app

Each push to `main` builds a signed app file. The newest one is under **Releases**, called `CapAndGown.apk`.
On the phone: download it, open it, allow installs from that app if Android asks, then tap Install.
A new version installs over the old one and keeps your ticks, because every build uses the same signing key.

## Where things are

- `app/src/main/assets/index.html` is the planner page (dates and steps are in `window.STUDY_DATA` at the top of the script).
- `app/src/main/java/.../` is the Android side: `Alarms` (sets the next alarm), `AlarmService` (sound, vibration, auto snooze), `AlarmActivity` (the alarm screen), `MainActivity` and `Bridge` (the planner and what it can ask the phone to do), `ChatPane` (claude.ai in the Chat tab) and `Files` (saving to Downloads).
- The build log and the last app file are also saved to the `ci` branch after each build.
