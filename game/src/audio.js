// Sound, all of it generated: no audio file ships with the game. A small WebAudio graph makes
// a footstep (a filtered noise burst), a case cracking (two detuned glass pings), a lift (a
// rising triad), a guard's bark (a low sawtooth swell), the alarm (a two-tone siren that rises
// with the meter) and the night's two endings. The graph is created on the first key press,
// because browsers keep audio asleep until a gesture, and every voice is short and pooled.
import { PALETTE } from './config.js';

const MASTER = 0.32;

export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let siren = null;
  let sirenGain = null;
  let enabled = true;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return context;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
      enabled = false;
      return null;
    }
    context = new AudioCtor();
    master = context.createGain();
    master.gain.value = MASTER;
    master.connect(context.destination);
    // One second of white noise, reused by every percussive voice.
    noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    return context;
  }

  /** A short tone with an envelope: the workhorse of every musical cue. */
  function tone(freq, when, duration, gain, type = 'sine', detune = 0) {
    if (!context) return;
    const osc = context.createOscillator();
    const env = context.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const start = context.currentTime + when;
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env);
    env.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** A filtered noise burst: footsteps, a case's lid, a coin's ring. */
  function noise(when, duration, gain, freq, q = 1, type = 'bandpass') {
    if (!context) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const env = context.createGain();
    const start = context.currentTime + when;
    env.gain.setValueAtTime(Math.max(0.0002, gain), start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(env);
    env.connect(master);
    source.start(start, Math.random() * 0.5, duration + 0.02);
  }

  const api = {
    /** Called on the first real input: browsers will not start audio before one. */
    unlock() {
      if (enabled) ensure();
    },
    setEnabled(value) {
      enabled = value;
      if (master) master.gain.value = value ? MASTER : 0;
    },
    isEnabled() {
      return enabled;
    },

    footstep(gait) {
      if (!context) return;
      const sneak = gait === 'sneak';
      const sprint = gait === 'sprint';
      noise(0, sneak ? 0.05 : 0.09, sneak ? 0.05 : sprint ? 0.16 : 0.1, sneak ? 900 : 260, 0.9, 'bandpass');
      if (sprint) noise(0.02, 0.06, 0.07, 1800, 1.4, 'highpass');
    },

    caseCrack() {
      if (!context) return;
      noise(0, 0.18, 0.14, 3200, 2.2, 'bandpass');
      tone(1980, 0.0, 0.22, 0.09, 'triangle');
      tone(2640, 0.045, 0.26, 0.06, 'triangle', 8);
    },

    cutter() {
      if (!context) return;
      noise(0, 0.5, 0.1, 5200, 3.5, 'bandpass');
      tone(3120, 0.05, 0.42, 0.05, 'sawtooth');
    },

    lift() {
      if (!context) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => tone(freq, index * 0.055, 0.4, 0.075, 'triangle'));
    },

    spotted() {
      if (!context) return;
      tone(196, 0, 0.34, 0.12, 'sawtooth');
      tone(233.08, 0.09, 0.4, 0.1, 'sawtooth');
      noise(0, 0.22, 0.06, 700, 1.2, 'bandpass');
    },

    noiseMaker() {
      if (!context) return;
      tone(2349, 0, 0.14, 0.07, 'triangle');
      tone(3136, 0.03, 0.16, 0.05, 'triangle');
      tone(2093, 0.09, 0.18, 0.04, 'triangle');
    },

    jammer() {
      if (!context) return;
      noise(0, 0.3, 0.09, 420, 0.7, 'lowpass');
      tone(140, 0, 0.3, 0.08, 'square');
    },

    caught() {
      if (!context) return;
      [392, 349.23, 311.13, 261.63].forEach((freq, index) => tone(freq, index * 0.13, 0.5, 0.1, 'sawtooth'));
      noise(0, 0.5, 0.12, 220, 0.6, 'lowpass');
    },

    escaped() {
      if (!context) return;
      [392, 523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => tone(freq, index * 0.09, 0.7, 0.085, 'triangle'));
      tone(1567.98, 0.5, 1.1, 0.05, 'sine');
    },

    /** Start, or retune, the siren that rides the alarm meter. */
    setAlarm(level) {
      if (!context) return;
      const active = level > 0.55;
      if (active && !siren) {
        siren = context.createOscillator();
        sirenGain = context.createGain();
        siren.type = 'triangle';
        siren.frequency.value = 420;
        sirenGain.gain.value = 0.0001;
        siren.connect(sirenGain);
        sirenGain.connect(master);
        siren.start();
      }
      if (!siren) return;
      const target = active ? 0.012 + (level - 0.55) * 0.05 : 0.0001;
      sirenGain.gain.setTargetAtTime(target, context.currentTime, 0.25);
      siren.frequency.setTargetAtTime(360 + level * 300, context.currentTime, 0.4);
    },

    /** The room's own breath: a low drone that gets a tritone as the night sours. */
    setTension(level) {
      if (!context || !master) return;
      if (!api._drone) {
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = 'sine';
        osc.frequency.value = 55;
        gain.gain.value = 0.028;
        osc.connect(gain);
        gain.connect(master);
        osc.start();
        api._drone = { osc, gain };
      }
      api._drone.osc.frequency.setTargetAtTime(55 + level * 18, context.currentTime, 0.6);
    },
  };

  return api;
}

export const AUDIO_HINT_COLOUR = PALETTE.gold;
