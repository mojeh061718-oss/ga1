/* Microphone capture + blow detection. The highest-risk code in the app —
 * tuned so that blowing across the mic reads strongly while talking or
 * crying reads near zero. See README for the tuning story.
 *
 * Blowing produces broadband turbulence noise dominated by low frequencies;
 * speech is spikier and mid-band. We require BOTH high overall energy AND
 * low-band dominance, with an adaptive noise floor (so a quiet bedroom and
 * a running car both work) and hysteresis (so the balloon doesn't flicker).
 */
const Mic = (() => {
  const CONSTRAINTS = {
    audio: {
      echoCancellation: false,
      noiseSuppression: false, // would eat blow noise
      autoGainControl: false,  // would destroy our thresholds
    },
  };

  const LOW_BAND_HZ = 500;
  const DOMINANCE = 1.4;   // low-band avg must exceed overall avg by this ratio
  const START_ABOVE = 25;  // hysteresis: begin "blowing" this far above floor
  const STOP_ABOVE = 12;   // ...and stop this far above floor
  const FULL_ABOVE = 90;   // energy above floor that maps to strength 1.0

  let stream = null;
  let analyser = null;
  let data = null;
  let lowBins = 4;
  let floor = 10;          // adaptive noise floor (EMA of quiet frames)
  let blowing = false;
  let grantedThisSession = false;

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
    lowBins = Math.max(2, Math.round(LOW_BAND_HZ / (ctx.sampleRate / analyser.fftSize)));
    return true;
  }

  function disable() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    analyser = null;
    blowing = false;
  }

  function levels() {
    if (!analyser) return null;
    analyser.getByteFrequencyData(data);
    let lowSum = 0;
    let allSum = 0;
    for (let i = 0; i < data.length; i++) {
      allSum += data[i];
      if (i < lowBins) lowSum += data[i];
    }
    return { low: lowSum / lowBins, overall: allSum / data.length };
  }

  /* Per-frame blow strength, 0..1. Call from a rAF loop. */
  function breathStrength() {
    const lv = levels();
    if (!lv) return 0;
    const { low, overall } = lv;

    // Track the noise floor only while clearly not blowing.
    if (low < floor + STOP_ABOVE) floor += (low - floor) * 0.02;
    floor = Math.max(4, Math.min(floor, 120));

    const dominant = overall > 4 && low / Math.max(overall, 1) > DOMINANCE;
    const startT = floor + START_ABOVE;
    const stopT = floor + STOP_ABOVE;
    if (!blowing && dominant && low > startT) blowing = true;
    else if (blowing && (low < stopT || !dominant)) blowing = false;

    if (!blowing) return 0;
    return Math.min(1, (low - stopT) / FULL_ABOVE);
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
        const lv = levels();
        if (lv && lv.overall > floor + 15) {
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

  return {
    enable, disable, breathStrength, waitForSound,
    get active() { return !!stream; },
    get grantedThisSession() { return grantedThisSession; },
  };
})();
