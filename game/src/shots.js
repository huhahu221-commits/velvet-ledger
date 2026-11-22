// The screenshot scenes behind ?shot=start|play|alarm|win.
//
// A scene is a *tableau*: a legal state of the real simulation — the thief on floor he could
// really stand on, the guards on their own routes facing a chosen way, the cases in the states
// a night could really have left them in — which is then stepped one frame so every derived
// value (the case in reach, the threat word, what each lens is watching) is computed by the
// real rules rather than typed in. After that the state is frozen and only repainted, so the
// same seed always gives the same frame.
//
// Tableaux rather than scripted routes, because a route has to survive the guards: a scripted
// thief who is spotted halfway to his mark is caught, and the frame becomes a game-over card.
// A tableau cannot be caught out, and it still shows nothing the game could not have reached.
import { STEP } from './config.js';
import { CASE_OPEN, CASE_SEALED, CASE_TAKEN, CASE_WORKING } from './loot.js';
import { MOOD_CHASE, MOOD_PATROL } from './guards.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/** The alarm level each scene freezes at, so the meter reads the scene's own tension. */
const SCENES = {
  start: { mode: 'title', seconds: 2.4 },

  // The cover: the thief a stride south of the chalice's plinth, with Marcel's cone on him and
  // the suspicion ring already climbing, CAM 01's beam raking the gallery behind, and every
  // case still sealed and lit.
  play: {
    thief: { x: 545, y: 545, angle: -Math.PI / 2 },
    intent: { x: -0.35, y: -0.94 },
    guards: {
      marcel: { x: 700, y: 545, angle: Math.PI, suspicion: 0.52 },
      odile: { x: 860, y: 240, angle: Math.PI * 0.85 },
      bruno: { x: 300, y: 620, angle: 0 },
    },
    cameras: { 'cam-gallery': Math.PI / 2 + 0.22 },
    alarm: 19,
    ticker: 'Marcel has not turned yet. Two strides and he will.',
  },

  // The alarm: the same aisle a moment later — the meter well past HUNTED, Marcel turned and
  // coming, the cone gone red. The frame the player is meant to be afraid of.
  alarm: {
    thief: { x: 545, y: 545, angle: Math.PI / 2 },
    intent: { x: 0.2, y: 0.98 },
    guards: {
      marcel: { x: 630, y: 545, angle: Math.PI, mood: MOOD_CHASE, suspicion: 1 },
      odile: { x: 900, y: 270, angle: Math.PI, mood: MOOD_CHASE, suspicion: 0.8 },
      bruno: { x: 700, y: 620, angle: Math.PI },
    },
    cameras: { 'cam-gallery': Math.PI / 2 - 0.3 },
    alarm: 78,
    ticker: 'The alarm is screaming. Every guard is coming.',
  },

  // The long night: the miniature and the chalice are in the bag, and the thief is at the
  // Ledger's pedestal in the vault with the lid half worked. Odile stands in the doorway with
  // her cone raking the gallery; CAM 02's beam crosses the vault behind him.
  win: {
    thief: { x: 472, y: 248, angle: -Math.PI / 2 },
    intent: { x: 0, y: -1, work: true },
    guards: {
      marcel: { x: 884, y: 470, angle: Math.PI * 0.75 },
      // Odile stands in the vault's own doorway, her cone raking north-west across the Ledger's
      // pedestal: the thief is working the case with a cone a stride from his back. The doorway
      // matters — it is the only line from the gallery into the vault, and the cone has to come
      // through it or the wall stops it.
      odile: { x: 437, y: 322, angle: -1.16 },
      bruno: { x: 900, y: 620, angle: Math.PI },
    },
    cameras: { 'cam-vault': 0.62, 'cam-gallery': Math.PI / 2 + 0.3 },
    loot: {
      miniature: { state: CASE_TAKEN },
      chalice: { state: CASE_TAKEN },
      ledger: { state: CASE_WORKING, progress: 0.58 },
      cameo: { state: CASE_SEALED },
    },
    alarm: 24,
    ticker: 'The Ledger is half out of its case. One more turn of the wrist.',
  },
};

/** Put a guard on the floor, facing a chosen way, with his path memory cleared. */
function poseGuard(guard, pose) {
  guard.x = pose.x;
  guard.y = pose.y;
  guard.angle = pose.angle;
  guard.mood = pose.mood ?? MOOD_PATROL;
  guard.suspicion = pose.suspicion ?? 0;
  guard.pause = 0;
  guard.target = 1;
  guard.path = null;
  guard.pathIndex = 0;
  guard.repath = 0;
  guard.lostFor = 0;
  guard.sweep = 0;
  guard.spotted = false;
  guard.lastSeen.x = pose.x;
  guard.lastSeen.y = pose.y;
}

/** Put the catalogue in the states this night left it in. */
function poseLoot(world, poses) {
  for (const item of world.loot) {
    const pose = poses[item.id];
    if (!pose) continue;
    item.state = pose.state;
    item.progress = pose.progress ?? (pose.state === CASE_SEALED ? 0 : 1);
    item.cracked = false;
  }
}

/** The HUD's take, which is the sum of what is already in the bag. */
function syncScore(world) {
  let score = 0;
  let ledger = false;
  for (const item of world.loot) {
    if (item.state !== CASE_TAKEN) continue;
    score += item.value;
    if (item.id === 'ledger') ledger = true;
  }
  world.state.score = score + (ledger ? 250000 : 0);
}

/**
 * Stage a scene and return what to draw over it. The world is reset, posed, and stepped one
 * frame: that single step is what fills in the case in reach, the threat word and the lenses'
 * own angles from the real rules.
 */
export function stageShot(name, world) {
  const scene = SCENES[name];
  // No fallback: a mistyped ?shot= that quietly rendered the play scene would put the wrong
  // picture in the entry's contact sheet and never say so.
  if (!scene) return null;
  world.reset(1);

  if (scene.mode === 'title') {
    const idle = { x: 0, y: 0, sprint: false, sneak: false, work: false, take: false, noise: false, jam: false, useCutter: false };
    for (let index = 0; index < scene.seconds / STEP; index += 1) world.step(STEP, idle);
    return { screen: SCREEN_TITLE };
  }

  world.player.x = scene.thief.x;
  world.player.y = scene.thief.y;
  world.player.angle = scene.thief.angle;

  for (const guard of world.guards) {
    const pose = scene.guards[guard.id];
    if (pose) poseGuard(guard, pose);
  }
  if (scene.loot) poseLoot(world, scene.loot);
  world.alarm.value = scene.alarm;
  world.alarm.quiet = 0;

  // One real step, so the derived state is the game's and not this file's.
  world.step(STEP, {
    x: scene.intent.x,
    y: scene.intent.y,
    sprint: false,
    sneak: false,
    work: scene.intent.work ?? false,
    take: false,
    noise: false,
    jam: false,
    useCutter: false,
  });

  // The alarm is a scene value: one step of being seen would nudge it, and the meter is part of
  // the composition. The lenses are aimed the same way, so each beam reads where it is wanted.
  world.alarm.value = scene.alarm;
  for (const camera of world.cameras) {
    const angle = scene.cameras?.[camera.id];
    if (angle !== undefined) camera.angle = angle;
  }

  syncScore(world);
  world.state.ticker = scene.ticker;
  world.state.tickerAge = 0;
  // A pose, not a frame of animation: the thief reads as mid-stride and the case ring shows.
  world.player.moving = true;
  world.player.bob = 1;
  world.player.gait = 'walk';

  return { screen: SCREEN_PLAY };
}

/** The list of scenes the shot page offers, for the title card's own small print. */
export const SHOT_NAMES = Object.keys(SCENES);
