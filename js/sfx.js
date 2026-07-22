/* Real sound effects (Kenney.nl, CC0) decoded into WebAudio buffers via
 * the shared Sounds context, so the iOS unlock/resume logic applies.
 * Every effect has a synth fallback from sounds.js — if a file hasn't
 * loaded or decoded yet, the old tone plays instead of silence. */
const Sfx = (() => {
  const FILES = {
    denied: 'assets/audio/denied.mp3',
    scanok: 'assets/audio/scanok.mp3',
    welcome: 'assets/audio/welcome.mp3',
    mail: 'assets/audio/mail.mp3',
    open: 'assets/audio/open.mp3',
    sent: 'assets/audio/sent.mp3',
    strike: 'assets/audio/strike.mp3',
    star: 'assets/audio/star.mp3',
    toppup: 'assets/audio/toppup.mp3',
  };
  const GAIN = { denied: 0.9, welcome: 0.7, toppup: 0.7, strike: 0.7 }; // default 0.6

  const FALLBACK = {
    denied: () => Sounds.uhoh(),
    scanok: () => Sounds.chime(),
    welcome: () => Sounds.praise(),
    mail: () => Sounds.inviteChime(),
    open: () => Sounds.chime(),
    sent: () => Sounds.praise(),
    strike: () => Sounds.uhoh(),
    star: () => Sounds.chime(),
    toppup: () => Sounds.praise(),
  };

  const raw = {};     // name -> ArrayBuffer (fetched eagerly, no ctx needed)
  const buffers = {}; // name -> AudioBuffer (decoded lazily once ctx exists)

  function preload() {
    Object.entries(FILES).forEach(([name, url]) => {
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((ab) => { if (ab) raw[name] = ab; })
        .catch(() => {});
    });
  }

  function decode(name) {
    const ctx = Sounds.ctx;
    if (!ctx || !raw[name] || buffers[name]) return;
    const ab = raw[name];
    raw[name] = null; // decodeAudioData detaches the buffer — decode once
    ctx.decodeAudioData(ab.slice(0),
      (buf) => { buffers[name] = buf; },
      () => {});
  }

  function play(name) {
    try {
      const ctx = Sounds.ensure();
      if (!buffers[name]) {
        decode(name);
        (FALLBACK[name] || (() => {}))(); // not ready yet — synth stands in
        return;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffers[name];
      const g = ctx.createGain();
      g.gain.value = GAIN[name] !== undefined ? GAIN[name] : 0.6;
      src.connect(g).connect(ctx.destination);
      src.start();
    } catch (err) {
      (FALLBACK[name] || (() => {}))();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    preload();
    // decode everything on the first touch (context exists after unlock)
    document.addEventListener('pointerdown', () => {
      Object.keys(FILES).forEach(decode);
    });
  });

  return { play };
})();
