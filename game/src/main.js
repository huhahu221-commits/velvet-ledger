// Boot and the one loop. Input is read once per frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is there.
// The game moves between five screens: title, play, paused, caught and escaped.
//
// ?seed=N fixes the night's own randomness. ?shot=start|play|alarm|win stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, FIELD, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_ALARM_HIGH, EVENT_CAUGHT, EVENT_CASE_CRACK, EVENT_CUTTER_USED, EVENT_ESCAPED, EVENT_FOOTSTEP, EVENT_LOOT_LIFTED, EVENT_NOISE_MADE, EVENT_SPOTTED, PHASE_CAUGHT, PHASE_ESCAPED } from './world.js';
import { ACTION_PAUSE, ACTION_RESTART, ACTION_START, createInput } from './input.js';
import { createRenderer, SCREEN_CAUGHT, SCREEN_ESCAPED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.2;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best night then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  if (!scene) {
    // An unknown ?shot= would otherwise paint the title forever with no clue why the capture
    // came out wrong. Say so in the DOM and still mark ready, so the harness fails loudly
    // rather than hanging on a page that never finishes.
    document.body.dataset.shotError = `unknown shot: ${name}`;
    window.__shotReady = true;
    return;
  }
  let painted = 0;
  // The scene is staged once and then repainted every frame: a late resize or a compositor
  // flush clears the backing store, and a shot page that stops painting would screenshot black.
  function paint() {
    renderer.draw(world, scene.screen, world.state.score);
    painted += 1;
    if (painted === 2) window.__shotReady = true;
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let wasUnlocked = false;

  function announce(message) {
    status.textContent = message;
  }

  function beginNight() {
    world.reset(seed);
    input.clearActions();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('The house is quiet. Four pieces, and the Ledger among them.');
  }

  function endNight(escaped) {
    screen = escaped ? SCREEN_ESCAPED : SCREEN_CAUGHT;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (escaped) {
      audio.escaped();
      announce(`Clean away. ${best} dollars is the best night.`);
    } else {
      audio.caught();
      announce('Caught. The house keeps the pieces.');
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_START && screen === SCREEN_TITLE) beginNight();
    else if (actions & (ACTION_START | ACTION_RESTART) && (screen === SCREEN_CAUGHT || screen === SCREEN_ESCAPED)) beginNight();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_START) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Back in the house.');
    }
  }

  /** Turn the step's event flags into sound, announcements and screen changes. */
  function react(events) {
    if (events & EVENT_FOOTSTEP) audio.footstep(world.player.gait);
    if (events & EVENT_CASE_CRACK) audio.caseCrack();
    if (events & EVENT_CUTTER_USED) audio.cutter();
    if (events & EVENT_LOOT_LIFTED) audio.lift();
    if (events & EVENT_SPOTTED) audio.spotted();
    if (events & EVENT_NOISE_MADE) audio.noiseMaker();
    if (events & EVENT_ALARM_HIGH) announce('The alarm is at its ceiling.');
    if (events & EVENT_CAUGHT) endNight(false);
    else if (events & EVENT_ESCAPED) endNight(true);
    audio.setAlarm(world.alarm.value / 100);
    audio.setTension(world.alarm.value / 100);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    if (!wasUnlocked) {
      wasUnlocked = true;
      audio.unlock();
    }

    handleActions();
    if (screen === SCREEN_PLAY) {
      const intent = input.read();
      if (intent.x !== 0 || intent.y !== 0 || intent.work) audio.unlock();
      let guard = 0;
      while (accumulator >= STEP && screen === SCREEN_PLAY && guard < 8) {
        const events = world.step(STEP, intent);
        react(events);
        accumulator -= STEP;
        guard += 1;
      }
      if (guard === 8) accumulator = 0;
    } else {
      accumulator = 0;
      audio.setAlarm(0);
    }

    renderer.draw(world, screen, best);
  }

  // Leaving the tab pauses a running night rather than letting the guards walk it down unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('The Velvet Ledger. Press Enter or click to begin.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
