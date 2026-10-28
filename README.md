# Cap and Gown (Android)

The Cap and Gown study planner as an Android app, with real alarms.

- Rings like an alarm clock (alarm volume, full screen, works when the phone is locked) on evenings that have study steps.
- If the weekly PebblePad review or earlier steps are still open, it rings again each weekday evening until they are ticked off.
- If nobody answers, it stops after five minutes and rings again ten minutes later, up to three times.
- Everything else is the same planner: Today, Plan, Portfolio, Deadlines, Add and Settings.

## Getting the app

Each push to `main` builds a signed app file. The newest one is under **Releases**, called `CapAndGown.apk`.
On the phone: download it, open it, allow installs from that app if Android asks, then tap Install.
A new version installs over the old one and keeps your ticks, because every build uses the same signing key.

## Where things are

- `app/src/main/assets/index.html` is the planner page (dates and steps are in `window.STUDY_DATA` at the top of the script).
- `app/src/main/java/.../` is the Android side: `Alarms` (sets the next alarm), `AlarmService` (sound, vibration, auto snooze), `AlarmActivity` (the alarm screen), `MainActivity` and `Bridge` (the planner and what it can ask the phone to do).
- The build log and the last app file are also saved to the `ci` branch after each build.
