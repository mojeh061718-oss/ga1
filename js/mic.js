/* Microphone capture + blow detection. The highest-risk code in the app.
 *
 * v2 detector — the v1 "low-band dominance" test failed on a real iPhone
 * because speech and crying are ALSO low-frequency-heavy. What actually
 * separates blowing from a voice:
 *
 *   1. RUMBLE   — wind on the mic membrane overloads the lowest bins
 *                 (< ~180 Hz) far beyond what a voice at arm's length does.
 *   2. FLATNESS — blowing is turbulence: a flat, noisy spectrum.
 *                 Voices/crying are harmonic: a spiky spectrum. Spectral
 *                 flatness (geometric mean / arithmetic mean) is high for
 *                 noise, low for voices.
 *   3. SUSTAIN  — a blow holds steady; speech is syllabic. Nothing counts
 *                 until the blow signature holds for ONSET_MS straight.
 *
 * Tune with the ?micdebug overlay: open the app with ?micdebug in the URL,
 * go to the balloon, and live values render on screen.
 */
const Mic = (() => {
  const CONSTRAINTS = {
    audio: {
      echoCancellation: false,
      noiseSuppression: false, // would eat blow noise
      autoGainControl: false,  // would destroy our thresholds
    },
  };

  // ---- tuning constants ----
  const RUMBLE_HZ = 180;        // "wind" band top
  const MID_LO_HZ = 400;        // voice-formant band
  const MID_HI_HZ = 2000;
  const FLAT_HI_HZ = 4000;      // flatness is computed over 0..this
  const FLAT_MIN = 0.25;        // min spectral flatness to count as turbulence
  const RUMBLE_OVER_MID = 2.5;  // rumble must beat mid band by this ratio
  const START_ABOVE = 30;       // rumble above noise floor to start
  const STOP_ABOVE = 14;        // ...and hysteresis to stop
  const ONSET_MS = 250;         // signature must hold this long before anything moves
  const RAMP_MS = 400;          // strength then ramps 0->1 over this long

  let stream = null;
  let analyser = null;
  let data = null;
  let binHz = 43;
  let floor = 8;               // adaptive rumble noise floor (EMA of quiet frames)
  let blowing = false;
  let candidateSince = null;
  let blowStart = 0;
  let grantedThisSession = false;
  let debugEl = null;

  async function enable() {
    if (stream) return true;
    try {
      stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
    } catch (err) {
      stream = null;
      return false;
    }
    grantedThisSession = true;
    const ctx = Sounds.ensure();
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;
    src.connect(analyser); // analysis only — never routed to output
    data = new Uint8Array(analyser.frequencyBinCount);
    binHz = ctx.sampleRate / analyser.fftSize;
    return true;
  }

  function disable() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    analyser = null;
    blowing = false;
    candidateSince = null;
  }

  function metrics() {
    if (!analyser) return null;
    analyser.getByteFrequencyData(data);
    const nR = Math.max(2, Math.round(RUMBLE_HZ / binHz));
    const mLo = Math.round(MID_LO_HZ / binHz);
    const mHi = Math.min(data.length, Math.round(MID_HI_HZ / binHz));
    const fHi = Math.min(data.length, Math.round(FLAT_HI_HZ / binHz));
    let rSum = 0, mSum = 0, logSum = 0, ariSum = 0, allSum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      allSum += v;
      if (i < nR) rSum += v;
      if (i >= mLo && i < mHi) mSum += v;
      if (i < fHi) { logSum += Math.log(v + 1); ariSum += v + 1; }
    }
    return {
      rumble: rSum / nR,
      mid: mSum / Math.max(1, mHi - mLo),
      flatness: Math.exp(logSum / fHi) / (ariSum / fHi),
      overall: allSum / data.length,
    };
  }

  /* Per-frame blow strength, 0..1. Call from a rAF loop. */
  function breathStrength() {
    const m = metrics();
    if (!m) return 0;
    const now = performance.now();

    // Track the noise floor only while clearly quiet in the rumble band.
    if (m.rumble < floor + STOP_ABOVE) floor += (m.rumble - floor) * 0.02;
    floor = Math.max(4, Math.min(floor, 100));

    const startCond = m.rumble > floor + START_ABOVE &&
                      m.flatness > FLAT_MIN &&
                      m.rumble > RUMBLE_OVER_MID * m.mid;
    const holdCond = m.rumble > floor + STOP_ABOVE &&
                     m.flatness > FLAT_MIN * 0.7 &&
                     m.rumble > RUMBLE_OVER_MID * 0.7 * m.mid;

    if (!blowing) {
      if (startCond) {
        if (candidateSince === null) candidateSince = now;
        if (now - candidateSince >= ONSET_MS) { blowing = true; blowStart = now; }
      } else {
        candidateSince = null;
      }
    } else if (!holdCond) {
      blowing = false;
      candidateSince = null;
    }

    const strength = blowing ? Math.min(1, (now - blowStart) / RAMP_MS) : 0;
    if (debugEl) {
      debugEl.textContent =
        `rumble ${m.rumble.toFixed(0)}  mid ${m.mid.toFixed(0)}  ` +
        `flat ${m.flatness.toFixed(2)}  floor ${floor.toFixed(0)}  ` +
        `str ${strength.toFixed(2)}  ${blowing ? 'BLOWING' : ''}`;
    }
    return strength;
  }

  /* Resolve true on any sustained sound (~0.5s above floor) — used by the
   * "say your name" step. Any sound counts; there is no recognition. */
  function waitForSound(timeoutMs) {
    return new Promise((resolve) => {
      if (!analyser) { resolve(false); return; }
      const start = performance.now();
      let loudSince = null;
      function poll(now) {
        if (!analyser) { resolve(false); return; }
        const m = metrics();
        if (m && m.overall > 12) {
          if (loudSince === null) loudSince = now;
          if (now - loudSince > 500) { resolve(true); return; }
        } else {
          loudSince = null;
        }
        if (now - start > timeoutMs) { resolve(false); return; }
        requestAnimationFrame(poll);
      }
      requestAnimationFrame(poll);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (new URLSearchParams(location.search).has('micdebug')) {
      debugEl = document.createElement('div');
      debugEl.id = 'mic-debug';
      document.body.appendChild(debugEl);
    }
  });

  return {
    enable, disable, breathStrength, waitForSound,
    get active() { return !!stream; },
    get grantedThisSession() { return grantedThisSession; },
  };
})();
