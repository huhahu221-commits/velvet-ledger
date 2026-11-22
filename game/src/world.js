// The night itself: the thief, the guards, the lenses and the catalogue, stepped in one fixed
// order and reported as events. Nothing here draws and nothing here touches the DOM, so the
// screenshot scenes and the live loop run exactly the same rules.
//
// Order inside a step matters: the thief moves, then the tools, then the eyes, then the alarm,
// then the consequences. A guard reacts to where the thief is now, never to where he was.
import { ALARM, TOOLS } from './config.js';
import { createAlarm, resetAlarm, stepAlarm, threatOf } from './alarm.js';
import { createCameras, jamCamera, resetCameras, stepCameras } from './cameras.js';
import { createGuards, guardCatches, resetGuards, stepGuards } from './guards.js';
import { distance } from './geometry.js';
import { EXIT, HOUSE, START } from './level.js';
import { buildNavGrid } from './navigation.js';
import {
  CASE_OPEN,
  CASE_TAKEN,
  createLoot,
  createTools,
  cutCase,
  focusLoot,
  ledgerTaken,
  liftCase,
  resetLoot,
  resetTools,
  takenCount,
  totalValue,
  workCase,
} from './loot.js';
import { createPlayer, footstepNoise, resetPlayer, stepPlayer } from './player.js';

export const EVENT_FOOTSTEP = 1;
export const EVENT_CASE_CRACK = 2;
export const EVENT_LOOT_LIFTED = 4;
export const EVENT_SPOTTED = 8;
export const EVENT_ALARM_RAISED = 16;
export const EVENT_CAUGHT = 32;
export const EVENT_ESCAPED = 64;
export const EVENT_NOISE_MADE = 128;
export const EVENT_CUTTER_USED = 256;
export const EVENT_ALARM_HIGH = 512;

export const PHASE_PLAY = 'play';
export const PHASE_CAUGHT = 'caught';
export const PHASE_ESCAPED = 'escaped';

export function createWorld(seedRandom) {
  const nav = buildNavGrid();
  const player = createPlayer(START);
  const guards = createGuards();
  const cameras = createCameras();
  const loot = createLoot();
  const alarm = createAlarm();
  const tools = createTools();
  const state = {
    seed: 0,
    phase: PHASE_PLAY,
    elapsed: 0,
    /** Steps since the night began, which is what the scenes key their staging on. */
    ticks: 0,
    /** The last case worked, for the HUD's ring. */
    focus: null,
    /** The last noise pulse, for the renderer's ring. */
    noise: null,
    noiseTimer: 0,
    /** What the guards are hearing this step. */
    hearing: [],
    /** Set while the alarm has the whole house chasing. */
    hunting: false,
    /** Counters the HUD reads. */
    lifts: 0,
    cracks: 0,
    closeCalls: 0,
    /** The night's end card. */
    endReason: '',
    score: 0,
    /** A one-step flag: the shutter was reached this step. */
    atExit: false,
    /** A rolling note of the last event, shown in the ticker. */
    ticker: 'The house is quiet. Find the four pieces.',
    tickerAge: 0,
  };

  function reset(seed = 0) {
    state.seed = seed;
    state.phase = PHASE_PLAY;
    state.elapsed = 0;
    state.ticks = 0;
    state.focus = null;
    state.noise = null;
    state.noiseTimer = 0;
    state.hearing = [];
    state.hunting = false;
    state.lifts = 0;
    state.cracks = 0;
    state.closeCalls = 0;
    state.endReason = '';
    state.score = 0;
    state.atExit = false;
    state.ticker = 'The house is quiet. Find the four pieces.';
    state.tickerAge = 0;
    resetPlayer(player, START);
    resetGuards(guards);
    resetCameras(cameras);
    resetLoot(loot);
    resetAlarm(alarm);
    resetTools(tools);
  }

  function say(message) {
    state.ticker = message;
    state.tickerAge = 0;
  }

  function makeNoise(x, y, radius, seconds = 0.1) {
    state.noise = { x, y, radius, life: seconds, max: seconds };
    state.hearing.push({ x, y, radius });
  }

  /** Spend a noise maker: a coin thrown across the room. */
  function throwNoise(intentAngle) {
    if (tools.noiseCharges <= 0) return false;
    tools.noiseCharges -= 1;
    const reach = 170;
    const x = player.x + Math.cos(intentAngle) * reach;
    const y = player.y + Math.sin(intentAngle) * reach;
    makeNoise(x, y, TOOLS.noiseRadius, TOOLS.noiseSeconds);
    tools.usedNoise = true;
    say('A coin rings across the floor. Every head turns.');
    return true;
  }

  /** Jam the nearest live lens within reach of the thief's facing. */
  function jamNearest() {
    let best = null;
    let bestGap = 260;
    for (const camera of cameras) {
      if (camera.jam > 0) continue;
      const gap = distance(player.x, player.y, camera.x, camera.y);
      if (gap < bestGap) {
        bestGap = gap;
        best = camera;
      }
    }
    if (!best) return false;
    jamCamera(best);
    say(`${best.name} goes dark. Five seconds of blindness.`);
    return true;
  }

  /**
   * One fixed step. `intent` is the input's read for this step:
   * { x, y, sprint, sneak, work, useCutter, noise, jam }.
   */
  function step(dt, intent) {
    let events = 0;
    if (state.phase !== PHASE_PLAY) return events;

    state.elapsed += dt;
    state.ticks += 1;
    state.tickerAge += dt;
    state.hearing = [];

    // 1. The thief.
    stepPlayer(player, dt, intent, takenCount(loot));
    if (player.footstep) {
      events |= EVENT_FOOTSTEP;
      const radius = footstepNoise(player.gait);
      if (radius > 0) state.hearing.push({ x: player.x, y: player.y, radius });
    }

    // 2. Tools: a noise maker, a jammer, the cutter.
    if (intent.noise && throwNoise(player.angle)) events |= EVENT_NOISE_MADE;
    if (intent.jam && jamNearest()) events |= EVENT_NOISE_MADE;
    tools.usedCutter = false;

    // 3. The case in reach, worked while the key is held; a cutter buys a head start.
    const focus = focusLoot(loot, player.x, player.y);
    state.focus = focus;
    player.focus = focus;
    if (focus) {
      const before = focus.state;
      let after = before;
      if (intent.useCutter && focus.state !== CASE_OPEN) {
        if (cutCase(focus, tools)) {
          events |= EVENT_CUTTER_USED;
          alarm.value = Math.min(ALARM.max, alarm.value + ALARM.crackNoise * 1.8);
          say('The cutter bites. Glass sings, and the meter jumps.');
        }
      }
      after = workCase(focus, dt, intent.work);
      if (after === CASE_OPEN && before !== CASE_OPEN) {
        events |= EVENT_CASE_CRACK;
        state.cracks += 1;
        alarm.value = Math.min(ALARM.max, alarm.value + ALARM.crackNoise);
        say(`${focus.name} is open. Take it.`);
      }
      if (intent.take && focus.state === CASE_OPEN) {
        const value = liftCase(focus);
        state.lifts += 1;
        state.score += value;
        events |= EVENT_LOOT_LIFTED;
        say(`${focus.name} is in the bag.`);
        if (ledgerTaken(loot)) {
          state.score += 250000;
          say('The Ledger is yours. The shutter is open — get out.');
        }
      }
    }

    // 4. The eyes: guards first (they hear as well as see), then the lenses.
    state.hunting = alarm.value >= 92;
    const guardWatchers = stepGuards(guards, dt, player, nav, state.hearing, state.hunting);
    const cameraWatchers = stepCameras(cameras, dt, state.elapsed, player);
    for (const guard of guards) if (guard.spotted) events |= EVENT_SPOTTED;
    for (const camera of cameras) if (camera.spotted) events |= EVENT_SPOTTED;

    // 5. The alarm: pressure from every pair of eyes, then its own decay.
    const rates = [];
    for (const watcher of guardWatchers) {
      const close = watcher.gap < ALARM.closeRadius;
      rates.push(close ? ALARM.closeRate : ALARM.guardRate);
    }
    for (const watcher of cameraWatchers) rates.push(ALARM.cameraRate);
    if (rates.length > 0 && state.noiseTimer <= 0) state.closeCalls += 0;
    const before = alarm.value;
    stepAlarm(alarm, dt, rates);
    if (alarm.value >= 100) {
      events |= EVENT_ALARM_HIGH;
      if (before < 100) {
        say('The alarm is screaming. Every guard is coming.');
        events |= EVENT_ALARM_RAISED;
      }
    }

    // 6. Consequences: a grab ends the night; the shutter ends it well.
    for (const guard of guards) {
      if (guardCatches(guard, player)) {
        state.phase = PHASE_CAUGHT;
        state.endReason = `${guard.name} has you by the collar.`;
        events |= EVENT_CAUGHT;
        break;
      }
    }
    if (state.phase === PHASE_PLAY) {
      const exitReach = distance(player.x, player.y, EXIT.x + EXIT.w / 2, EXIT.y + EXIT.h / 2);
      state.atExit = exitReach < 74;
      if (state.atExit && ledgerTaken(loot)) {
        state.phase = PHASE_ESCAPED;
        state.endReason = 'Out through the shutter with the Ledger.';
        events |= EVENT_ESCAPED;
      }
    }

    // A noise ring fades on its own clock.
    if (state.noise) {
      state.noise.life -= dt;
      if (state.noise.life <= 0) state.noise = null;
    }
    if (state.tickerAge > 6 && state.phase === PHASE_PLAY) {
      const left = loot.filter((item) => item.state !== CASE_TAKEN).length;
      say(left === 0 ? 'Nothing left but the door.' : `${left} piece${left === 1 ? '' : 's'} still on the floor.`);
    }
    return events;
  }

  /** A read-only summary the HUD and the renderer both use. */
  function summary() {
    return {
      loot,
      taken: takenCount(loot),
      value: totalValue(loot),
      threat: threatOf(alarm.value),
      alarm: alarm.value,
      ledger: ledgerTaken(loot),
      exitOpen: ledgerTaken(loot),
      house: HOUSE,
      focus: state.focus,
      phase: state.phase,
      ticker: state.ticker,
      elapsed: state.elapsed,
      score: state.score,
    };
  }

  return { state, player, guards, cameras, loot, alarm, tools, nav, reset, step, summary, say };
}
