// =============================================================================
// sfx.ts
// -----------------------------------------------------------------------------
// All the SOUND for "The Factory Floor: Building Virginia's Industry." Every
// sound here is SYNTHESIZED in code with the browser's Web Audio API — there are
// no audio files to load. We build each effect out of simple oscillators (pure
// electronic tones) and short volume "envelopes" (a quick swell, then a fade),
// the same way an old toy keyboard makes its beeps and bells.
//
// Why not IWSDK's AudioSource? That component plays sound *files*. We want tiny,
// file-free blips generated on the fly, so we talk to the browser's audio engine
// directly. One shared AudioContext powers everything.
//
// Browsers stay silent until the player has interacted with the page (a click or
// a controller trigger). Every function below first "wakes" the audio engine, and
// the very first sound always happens on a click (picking a business, pressing a
// control), so this just works — in the browser and in a headset alike.
//
// The whole module is one small object, `Sfx`, with one method per sound:
//   Sfx.clunk()    — a control card was clicked (a soft, woody thunk)
//   Sfx.coin()     — a finished batch of goods was made and sold (a bright "ka-ching")
//   Sfx.bell()     — the foreman announced some news (a gentle chime)
//   Sfx.fanfare()  — the End of Day report appeared (a short, happy climb)
//   Sfx.startHum() — the line started running (swell in a soft machine drone)
//   Sfx.stopHum()  — the line finished (fade the drone back out)
// =============================================================================

// -----------------------------------------------------------------------------
// CONSTANTS — every tunable number for the sound, in one place. Want a softer
// hum, a brighter coin, or a longer bell? Change it here. Frequencies are in Hz
// (how high the pitch is); times are in seconds; "peak" values are loudness.
// -----------------------------------------------------------------------------
const CONSTANTS = {
  masterVolume: 0.4, // overall loudness of every sound (kept gentle for a classroom)

  // --- Soft machine hum that runs WHILE the line is making a batch -----------
  hum: {
    volume: 0.13, // how loud the running-machine drone is (soft, in the background)
    baseFreq: 58, // the low pitch of the drone, in Hz (a deep motor rumble)
    detune: 0.6, // a second voice this many Hz apart, so the drone shimmers a little
    lowpass: 200, // cut everything above this so it stays soft and dull, never buzzy
    wobbleRate: 5, // how many times a second the drone gently "chugs" like an engine
    wobbleDepth: 0.16, // how deep that chug is (0 = perfectly steady)
    fadeIn: 0.25, // seconds to swell the drone up when the line starts
    fadeOut: 0.4, // seconds to fade the drone out when the line finishes
  },

  // --- A soft woody "clunk" when a control card is clicked -------------------
  clunk: {
    freqStart: 170, // the pitch it starts at, in Hz
    freqEnd: 90, // it quickly drops to this pitch — a satisfying "thunk"
    peak: 0.5, // how loud it gets
    attack: 0.005, // a near-instant start
    hold: 0.02, // a brief moment at full volume
    release: 0.12, // and a quick fade away
  },

  // --- A bright two-note "coin" when a finished batch is made and sold --------
  coin: {
    type: "triangle", // a soft, rounded tone (not a harsh square wave)
    notes: [988, 1319], // the two notes (B5 then E6), in Hz — a cheerful little leap up
    gap: 0.07, // seconds between the first and second note
    peak: 0.32, // how loud each note is
    attack: 0.005, // a crisp start
    hold: 0.05, // held briefly...
    release: 0.18, // ...then a short sparkle as it fades
  },

  // --- A soft bell when the foreman announces news ---------------------------
  // A real bell is several pure tones ringing together at once. We list them as
  // "partials": each is a multiple of the bell's main pitch and a relative volume.
  bell: {
    baseFreq: 720, // the bell's main pitch, in Hz
    partials: [
      { ratio: 1.0, gain: 1.0 }, // the fundamental (the note you mostly hear)
      { ratio: 2.01, gain: 0.5 }, // a higher overtone, half as loud
      { ratio: 3.01, gain: 0.25 }, // a higher-still overtone, quieter again
    ],
    peak: 0.3, // how loud the strike is
    attack: 0.004, // an instant "ding"
    release: 1.1, // a long, gentle ring-out
  },

  // --- A short, happy fanfare when the End of Day report appears -------------
  fanfare: {
    type: "triangle", // the same soft, rounded tone as the coin
    notes: [523, 659, 784, 1047], // a climbing major chord (C5-E5-G5-C6), in Hz
    step: 0.13, // seconds between each note (a brisk little climb)
    peak: 0.3, // how loud each note is
    attack: 0.01, // a gentle start
    hold: 0.08, // each note rings briefly...
    release: 0.5, // ...and the last one rings out a little longer
  },
};

// =============================================================================
// Shared audio engine
// We make ONE AudioContext (the browser's audio engine) the first time any sound
// plays, then reuse it. Everything flows into a master volume knob and a gentle
// limiter (so overlapping sounds never get harsh), then out to the speakers.
// =============================================================================
let ctx: AudioContext | null = null; // the audio engine (null until the first sound)
let master: GainNode | null = null; // the master volume all sounds pass through
let humGain: GainNode | null = null; // the on/off fade for the running-machine drone
let humBuilt = false; // have we built the (always-on, silent-until-started) hum yet?

// Wake the audio engine and hand back its pieces, building it on first use. This
// is safe to call before every sound: resuming an already-running engine does
// nothing. Returns null if the browser has no Web Audio (so callers can no-op).
function ensure(): { ctx: AudioContext; master: GainNode } | null {
  // Some browsers (older Safari) name it "webkitAudioContext"; check for both.
  const Ctor =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!Ctor) return null; // no Web Audio support — play no sound rather than crash

  if (!ctx) {
    ctx = new Ctor();
    // Master volume → a soft limiter → the speakers. The limiter keeps things
    // from clipping when, say, a coin and a bell land at the same moment.
    master = ctx.createGain();
    master.gain.value = CONSTANTS.masterVolume;
    const limiter = ctx.createDynamicsCompressor();
    master.connect(limiter).connect(ctx.destination);
  }

  // The engine starts "suspended" until a user gesture; nudge it awake. (Every
  // sound is triggered by a click or trigger pull, so this always succeeds.)
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, master: master! };
}

// Play ONE oscillator note with a quick swell-and-fade envelope. This is the
// little building block behind the clunk, the coin, and the fanfare. `freqEnd`
// (optional) slides the pitch during the note — used for the clunk's "thunk."
function tone(
  audio: { ctx: AudioContext; master: GainNode },
  options: {
    type: OscillatorType; // the wave shape ("triangle", "sine", ...)
    freqStart: number; // pitch at the start, in Hz
    freqEnd?: number; // pitch to slide to by the end (optional)
    start: number; // when to play it (audio-engine time, in seconds)
    peak: number; // how loud at its peak
    attack: number; // seconds to swell up to the peak
    hold: number; // seconds to stay at the peak
    release: number; // seconds to fade back to silence
  },
): void {
  const { ctx, master } = audio;
  const { type, freqStart, freqEnd, start, peak, attack, hold, release } =
    options;
  const end = start + attack + hold + release;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, start);
  // A pitch slide reads as a "thunk" (down) or a chirp (up). Exponential ramps
  // can't touch zero, but musical pitches are always well above zero, so fine.
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, end);

  // The volume envelope: silent → swell to the peak → hold → fade to (near) zero.
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.linearRampToValueAtTime(peak, start + attack);
  env.gain.setValueAtTime(peak, start + attack + hold);
  env.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(env).connect(master);
  osc.start(start);
  osc.stop(end + 0.02); // stop just after the fade so the note frees itself
}

// =============================================================================
// Sfx — the public sound board. Import this and call one method per event.
// =============================================================================
export const Sfx = {
  // A soft woody thunk — played whenever the student clicks a control card.
  clunk(): void {
    const audio = ensure();
    if (!audio) return;
    const c = CONSTANTS.clunk;
    tone(audio, {
      type: "triangle",
      freqStart: c.freqStart,
      freqEnd: c.freqEnd, // slides down for a satisfying "thunk"
      start: audio.ctx.currentTime,
      peak: c.peak,
      attack: c.attack,
      hold: c.hold,
      release: c.release,
    });
  },

  // A bright two-note "ka-ching" — played when a finished batch is made and sold.
  coin(): void {
    const audio = ensure();
    if (!audio) return;
    const c = CONSTANTS.coin;
    const t = audio.ctx.currentTime;
    c.notes.forEach((freq, i) => {
      tone(audio, {
        type: c.type as OscillatorType,
        freqStart: freq,
        start: t + i * c.gap, // the two notes climb, one just after the other
        peak: c.peak,
        attack: c.attack,
        hold: c.hold,
        release: c.release,
      });
    });
  },

  // A gentle bell/chime — played when the foreman shares a news beat. Built by
  // ringing a few pure tones together (the "partials") and letting them ring out.
  bell(): void {
    const audio = ensure();
    if (!audio) return;
    const b = CONSTANTS.bell;
    const { ctx, master } = audio;
    const start = ctx.currentTime;
    const end = start + b.attack + b.release;
    for (const partial of b.partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine"; // pure sine tones give a clean, soft bell
      osc.frequency.value = b.baseFreq * partial.ratio;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, start);
      env.gain.linearRampToValueAtTime(b.peak * partial.gain, start + b.attack);
      env.gain.exponentialRampToValueAtTime(0.0001, end); // a long, even ring-out
      osc.connect(env).connect(master);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  },

  // A short, happy climbing chord — played when the End of Day report appears.
  fanfare(): void {
    const audio = ensure();
    if (!audio) return;
    const f = CONSTANTS.fanfare;
    const t = audio.ctx.currentTime;
    f.notes.forEach((freq, i) => {
      // The last note in the climb rings out a little longer for a tidy finish.
      const last = i === f.notes.length - 1;
      tone(audio, {
        type: f.type as OscillatorType,
        freqStart: freq,
        start: t + i * f.step,
        peak: f.peak,
        attack: f.attack,
        hold: f.hold,
        release: last ? f.release * 1.8 : f.release,
      });
    });
  },

  // Swell the soft machine drone in — call this when a batch STARTS running.
  startHum(): void {
    const audio = ensure();
    if (!audio) return;
    this.buildHum(audio); // make the (silent) drone the first time it's needed
    const h = CONSTANTS.hum;
    if (!humGain) return;
    // Fade the drone up to its running volume from wherever it is now.
    const t = audio.ctx.currentTime;
    humGain.gain.cancelScheduledValues(t);
    humGain.gain.setValueAtTime(Math.max(0.0001, humGain.gain.value), t);
    humGain.gain.linearRampToValueAtTime(h.volume, t + h.fadeIn);
  },

  // Fade the soft machine drone back out — call this when a batch FINISHES.
  stopHum(): void {
    if (!ctx || !humGain) return; // never started — nothing to fade
    const h = CONSTANTS.hum;
    const t = ctx.currentTime;
    humGain.gain.cancelScheduledValues(t);
    humGain.gain.setValueAtTime(Math.max(0.0001, humGain.gain.value), t);
    humGain.gain.linearRampToValueAtTime(0.0001, t + h.fadeOut);
  },

  // Build the running-machine drone ONCE: two slightly-detuned low oscillators
  // through a soft lowpass filter, gently wobbling like an engine, into an on/off
  // fade knob (humGain). The oscillators run for the whole session; we only ever
  // raise and lower humGain, so starting and stopping the line never "clicks."
  buildHum(audio: { ctx: AudioContext; master: GainNode }): void {
    if (humBuilt) return;
    humBuilt = true;
    const { ctx: c, master: out } = audio;
    const h = CONSTANTS.hum;

    // A soft lowpass keeps the drone dull and warm instead of buzzy.
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = h.lowpass;

    // The "chug": a steady tone gain (centered at 1) that an LFO wobbles up and
    // down a little, so the drone breathes like a working machine.
    const toneGain = c.createGain();
    toneGain.gain.value = 1;
    const lfo = c.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = h.wobbleRate;
    const lfoDepth = c.createGain();
    lfoDepth.gain.value = h.wobbleDepth;
    lfo.connect(lfoDepth).connect(toneGain.gain); // adds the wobble around the steady 1
    lfo.start();

    // The on/off fade knob — silent until startHum() raises it.
    humGain = c.createGain();
    humGain.gain.value = 0.0001;

    // Two low oscillators, slightly detuned, for a drone with a bit of life.
    for (const offset of [0, h.detune]) {
      const osc = c.createOscillator();
      osc.type = "triangle"; // soft and rounded, not a harsh saw/square
      osc.frequency.value = h.baseFreq + offset;
      osc.connect(filter);
      osc.start();
    }
    filter.connect(toneGain).connect(humGain).connect(out);
  },
};
