/* Shared AudioContext + synthesized cues. No audio files — everything is
 * generated, so the app is fully offline and tiny. All gains are kept low:
 * this app should sound like a music box in another room. */
const Sounds = (() => {
  let ctx = null;
  let master = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    // iOS parks the context in 'suspended' OR 'interrupted' (after a call,
    // backgrounding, etc.) — always try to resume when not running.
    if (ctx.state !== 'running') { try { ctx.resume(); } catch (err) {} }
    return ctx;
  }

  // iOS unlocks audio only from a user gesture: play a near-silent tick.
  let unlocked = false;
  function unlock() {
    ensure();
    if (!unlocked) {
      unlocked = true;
      tone({ freq: 440, dur: 0.01, gain: 0.001 });
    }
  }

  function tone({ freq, freqEnd, dur, gain = 0.08, type = 'sine', when = 0, attack = 0.02 }) {
    ensure();
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.linearRampToValueAtTime(freqEnd, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.setValueAtTime(gain, t0 + Math.max(attack, dur - 0.08));
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(lp).connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function chime() {
    tone({ freq: 523, dur: 0.5, gain: 0.06 });
    tone({ freq: 659, dur: 0.6, gain: 0.05, when: 0.12 });
  }

  function inviteChime() {
    tone({ freq: 392, dur: 0.35, gain: 0.06 });
    tone({ freq: 523, dur: 0.5, gain: 0.06, when: 0.2 });
  }

  function praise() {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, dur: 0.45, gain: 0.05, when: i * 0.13 }));
  }

  function settleChime() {
    tone({ freq: 440, freqEnd: 392, dur: 1.4, gain: 0.045 });
  }

  // Soft low "uh-oh" for a strike — serious, never scary.
  function uhoh() {
    tone({ freq: 330, dur: 0.35, gain: 0.055 });
    tone({ freq: 262, dur: 0.55, gain: 0.055, when: 0.3 });
  }

  // Rope-bridge creak when it's dragged too fast.
  function creak() {
    tone({ freq: 150, freqEnd: 110, dur: 0.35, gain: 0.05, type: 'triangle' });
  }

  // Breathing cues, scheduled precisely on the audio clock.
  function breathIn(dur) {
    tone({ freq: 220, freqEnd: 330, dur, gain: 0.04, attack: 0.3 });
  }
  function breathOut(dur) {
    tone({ freq: 330, freqEnd: 196, dur, gain: 0.04, attack: 0.3 });
  }

  // Scanner hum: a quiet oscillator whose pitch tracks scan progress.
  let hum = null;
  function humStart() {
    ensure();
    if (hum) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    osc.type = 'triangle';
    osc.frequency.value = 110;
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 0.15);
    osc.connect(lp).connect(g).connect(master);
    osc.start();
    hum = { osc, g };
  }
  function humProgress(p) {
    if (hum) hum.osc.frequency.value = 110 + p * 160;
  }
  function humStop() {
    if (!hum) return;
    const { osc, g } = hum;
    hum = null;
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
    osc.stop(ctx.currentTime + 0.3);
  }

  return {
    ensure, unlock, chime, inviteChime, praise, settleChime, uhoh, creak,
    breathIn, breathOut, humStart, humProgress, humStop,
    get ctx() { return ctx; },
  };
})();
