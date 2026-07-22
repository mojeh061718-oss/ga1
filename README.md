# Calm Pups 🐾

A rescue-member HQ for a little kid, made to live on an iPhone home
screen. After the badge login she lands in a dark, sleek hub with her own
photo ID ("ACTIVE RESCUE MEMBER"), a daily monitor, the Calm Den, and a
bedtime diary.

## The Hub

- **ID badge**: tap the little pencil to set her name and photo (take one
  or pick from the library). It persists on the phone.
- **Daily Monitor** — three boxes: double-tap stamps an **X**, triple-tap
  pops a **star**, long-press ~1.5s erases. Three X's shows a pulsing
  "WARNING: <NAME> IS AT RISK OF SUSPENSION" banner; three stars triggers
  a gold "TOP PUP!" celebration. The monitor resets every morning, and
  each day's marks are saved into the Log.
- **Calm Den** — the three calming activities.
- **Diary** — the bedtime ritual (below).
- **Log** — parent calendar of every recorded day (below).

## The Calm Den

Three friendly rescue pups guide three activities:

- **Balloon** — blow into the microphone (or press and hold the screen) to
  inflate a balloon until it floats away. Long slow exhales are the whole
  point: they're the fastest way a body calms itself down.
- **Breathing buddy** — a pup inside a glowing orb that grows (breathe in,
  4s), holds (2s), and shrinks (breathe out, 6s). She just breathes along
  with it. No instructions needed.
- **Glitter jar** — swirl the glitter with a finger (or shake the phone),
  then watch it slowly settle for about 45 seconds. The watching is the
  activity.

Everything in the Den is wordless, slow, and soft on purpose. There are
no scores, no fail states, and nothing to unlock.

## The Diary (bedtime ritual)

Open Diary for the last 15 minutes of the day. It walks through ~20
gentle questions ("What did you love most about today?", "What do you
want to dream about tonight?"...). You read each question aloud, tap the
big mic, she answers **in her own voice**, tap again to stop (60s max per
answer), then the arrow moves on. Questions can be skipped by just
tapping the arrow. The last step is a **selfie together**, then a
goodnight moon. The whole session — every recording and the photo — is
saved on the phone under that date.

## The Log

The calendar shows a dot on every day with data. Tap a day for its
progress report: stars/X's that day, every diary question with a play
button for her recorded answer, and the goodnight selfie.

Storage notes: recordings and photos live in the app's on-phone database
(IndexedDB). Installed home-screen apps keep this across launches, but it
never leaves the phone — there is no cloud backup. A nightly diary is
roughly 5–15 MB, so storage grows over months of use.

## The Rescue Login

On launch, a pink badge asks for her finger. Holding it for **8 seconds**
"scans" her in (lifting early just pauses — progress is kept). Then a pup
asks her to **say her name** — any sound counts, there's no recognition.
Then the badge swings open and she's on the team.

The login is also where the app asks iOS for microphone and motion
permissions, so prompts never appear during an activity. **You may need to
tap "Allow" for her the first time.** If a permission is denied or she stays
quiet, a big paw button appears — one tap goes straight in. Nothing ever
blocks entry.

### Record the prompts in your own voice

Triple-tap the **top-right corner** of the login screen to open the voice
panel. Record two short clips — "Put your finger on the badge!" and "Say
your name for me!" (5 seconds max each, tap ● to start, tap again to
stop, ▶ to preview). They save on the phone and play at the right
moments: the finger prompt on her first touch of the screen (iOS doesn't
allow sound before a touch), the name prompt right after the scan.

Until you record them, the name prompt falls back to the iPhone's
built-in synthetic voice and the finger prompt stays silent (the pulsing
badge carries it). Your voice is much better — a familiar voice is
exactly what a wound-up kid responds to.

Parent shortcuts:

- **Skip login instantly:** triple-tap the very top-left corner of the
  login screen.
- **Voice panel:** triple-tap the top-right corner of the login screen.
- **Quick return:** after a successful login, relaunching within 30 minutes
  skips the login automatically (mid-meltdown you shouldn't have to coach
  her through a scan).
- **Change the hold time:** edit `HOLD_SECONDS` at the top of
  `js/login.js`.

## Put it on the iPhone

1. In this repo: **Settings → Pages → Source → "GitHub Actions"** (one-time).
2. Merge/push to `main`. The workflow in `.github/workflows/deploy.yml`
   deploys automatically to `https://<your-username>.github.io/<repo-name>/`.
3. On the iPhone, open that URL in Safari → Share → **Add to Home Screen**.
4. Launch it once from the home screen with internet — after that it works
   fully offline (car meltdowns included).

## Use your own pup pictures

The three default pups (Berry, Willow, Pebble) are original art. To swap in
any picture she loves:

1. Drop the image (square-ish PNG/JPG/SVG) into `assets/pups/`.
2. Change the matching path in `js/pups.js` (one line per pup).
3. Add the new filename to `js/precache-list.js` (so it works offline).
4. Push. Fully quit and relaunch the app twice to pick up the update.

Note: only put images here you have the right to publish — this repo
deploys to a public URL.

## Developing locally

```bash
python3 -m http.server 8000   # from the repo root
```

Open `http://localhost:8000/?skiplogin` (the `?skiplogin` query param
bypasses the login while iterating). `localhost` counts as a secure
context, so the mic works — blow into your laptop mic to test the balloon.

**Tuning the blow detector:** open the app with `?micdebug` in the URL
(works on the deployed site too, e.g. `.../ga1/?micdebug&skiplogin`) and
go to the balloon. A small readout shows the live `rumble / mid / flat /
floor / str` values. Blowing should push `rumble` high and `flat` above
0.25; talking should keep `flat` low. If the balloon misbehaves on a real
device, read those numbers off the screen while blowing and while talking —
the thresholds are the named constants at the top of `js/mic.js`.

To simulate the GitHub Pages subpath, serve the *parent* directory and open
`http://localhost:8000/<repo-dir>/` — any absolute-path bug shows up there
exactly as it would in production.

## Known iOS quirks (by design / no code fix)

- **Ring/silent switch:** when the phone is on silent, iOS mutes web-app
  audio entirely. The app is fully usable without sound — every cue is
  visual first.
- **Mic permission:** iOS may re-ask on each launch. The ask always happens
  inside the login ritual, never mid-activity.
- **Screen sleep:** the app requests a wake lock (iOS 16.4+) so the screen
  stays on while glitter settles; on older iOS, bump Auto-Lock in Settings.
- **Orange mic dot:** appears only during the name step and the balloon
  activity, and goes away when they end — the mic is never left running.
