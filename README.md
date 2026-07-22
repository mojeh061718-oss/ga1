# Calm Pups 🐾

A rescue-member HQ for a little kid, made to live on an iPhone home
screen. After the badge login she lands in a dark, sleek hub with her own
photo ID ("ACTIVE RESCUE MEMBER"), a daily monitor, the Calm Den, and a
bedtime diary.

## The Hub

- **ID badge**: tap the little pencil to set her name and photo (take one
  or pick from the library). It persists on the phone.
- **Daily Monitor** — three boxes: double-tap stamps a **red sad face**
  (a strike), triple-tap pops a **green happy face** (a star), long-press
  ~1.5s erases. Three strikes shows a pulsing
  "WARNING: <NAME> IS AT RISK OF SUSPENSION" banner; three happy faces trigger
  a gold "TOP PUP!" celebration. The monitor resets every morning, and
  each day's marks are saved into the Log.
- **PAW MAIL** — letters "from HQ". **Press and hold the PAW MAIL title
  for 5 seconds** to secretly write one; the compose box also has an
  optional **"from" photo** (add a picture of whoever "sent" it and it
  appears at the top of the letter). Letters land in her inbox as glowing
  sealed envelopes with an unread badge. The **speaker button on the
  letter reads it aloud** with the phone's voice (silent until tapped),
  and the big mic button records her **voice
  reply**, which stamps "REPLY SENT TO HQ ✓". Nothing is actually sent
  anywhere — letters and replies live only on the phone.
- **Calm Den** — the three calming activities.
- **PUP CHECK-IN** — the bedtime ritual (below). Between **6pm and 10pm**,
  if it hasn't been done yet, the hub shows a glowing "TIME FOR PUP
  CHECK-IN" reminder that opens it in one tap.
- **Log** — parent calendar of every recorded day (below).

## The Calm Den — rescue missions

Three night missions where she helps a pup — each one is secretly a
calming exercise:

- **Light the beacon** — press and hold the screen (or blow into the mic
  via the little mic button) steadily until the rescue beacon blazes to
  life. Long slow exhales / steady holds are the point: they're the
  fastest way a body calms itself down. Every lighting earns a new color.
- **Charge the pup** — breathe along with the glowing orb (in 4s, hold
  2s, out 6s). Each full breath lights one of five paw-lights; five
  breaths fully recharges the pup.
- **Cross the bridge** — drag the supply cart across the rope bridge to
  the waiting pup. Only slow, steady dragging works: rushing makes the
  bridge creak and wobble and the cart won't budge until it settles.
  Forced slow movement is the regulation exercise.

Everything is wordless, there are no fail states, and every mission
loops gently forever.

## The PUP CHECK-IN (bedtime ritual)

Open PUP CHECK-IN for the last 15 minutes of the day. It walks through ~20
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
"scans" her in (lifting early just pauses — progress is kept). Then a big
**WELCOME <NAME>** screen appears with her badge photo (or her first
initial on the shield until you set a photo), and the arrow takes her into
HQ. No permission prompts happen at login — the mic is only requested by
the balloon's mic button, and motion by the glitter jar's first touch.

### Parent access gate

Double-tap anywhere **outside the shield** on the login screen to open or
close HQ. The tiny dot in the top-right corner tells you (not her) the
state: **green = she can get in, red = access denied**. While red, a
completed scan just shakes the shield and resets. The gate is remembered
across launches.

Parent shortcuts:

- **Voice settings:** hold PAW MAIL 5s to open compose, then tap **Reader voice & speed** —
  choose the reader voice (downloaded premium voices from Settings →
  Accessibility → Spoken Content appear here), adjust speed and pitch,
  or hit the KID VOICE preset (higher pitch reads kid-like; real Siri
  child voices aren't available to web apps).
- **Skip login instantly (works even when locked):** triple-tap the very
  top-left corner of the login screen.
- **Login rhythm:** fresh launches always start at the scan. Quick hops
  away (under 2 minutes) resume in place; longer than that returns to
  the login. An active PUP CHECK-IN session is never interrupted. Tune
  with `RELOCK_MIN` in `js/login.js`.
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

## Credits

Sound effects from [Kenney](https://kenney.nl) (CC0 / public domain).

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
- **Mic permission:** iOS may re-ask on each launch. The ask only happens
  when the balloon's mic button is tapped — never at login.
- **Screen sleep:** the app requests a wake lock (iOS 16.4+) so the screen
  stays on while glitter settles; on older iOS, bump Auto-Lock in Settings.
- **Orange mic dot:** appears only while the balloon's mic is on or a diary
  answer is recording — the mic is never left running.
