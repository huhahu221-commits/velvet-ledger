// The thief: position, stride, the three gaits and what each one costs. Sprinting is fast and
// loud, sneaking is slow and silent, walking is the middle. Carrying a piece slows every gait,
// so a thief with three cases under his coat has to plan the last leg differently.
import { PLAYER } from './config.js';
import { moveCircle, turnToward } from './geometry.js';
import { SOLIDS } from './level.js';

export const GAIT_WALK = 'walk';
export const GAIT_SPRINT = 'sprint';
export const GAIT_SNEAK = 'sneak';

export function createPlayer(start) {
  return {
    x: start.x,
    y: start.y,
    r: PLAYER.radius,
    angle: -Math.PI / 2,
    gait: GAIT_WALK,
    moving: false,
    /** Pixels walked since the last footstep, so steps land with the stride and not with the clock. */
    stride: 0,
    /** Set for one frame by stepPlayer when a footstep falls on this step. */
    footstep: false,
    carrying: 0,
    /** The case being worked, when one is in reach. */
    focus: null,
    /** 0 while standing still, up to 1 at a sprint: drives the walk cycle's swing. */
    bob: 0,
  };
}

/** How fast this gait carries a thief with `carrying` pieces. */
export function gaitSpeed(gait, carrying) {
  const base = gait === GAIT_SPRINT ? PLAYER.sprint : gait === GAIT_SNEAK ? PLAYER.sneak : PLAYER.walk;
  return base * (1 - 0.06 * carrying);
}

/**
 * One fixed step of the thief. `intent` is { x, y, sprint, sneak } with x and y in -1..1 from
 * the keys; the vector is normalised so diagonals are not faster than straight lines.
 */
export function stepPlayer(player, dt, intent, carrying) {
  const gait = intent.sneak ? GAIT_SNEAK : intent.sprint ? GAIT_SPRINT : GAIT_WALK;
  player.gait = gait;
  player.carrying = carrying;
  player.footstep = false;

  let mx = intent.x;
  let my = intent.y;
  const length = Math.hypot(mx, my);
  if (length > 0.001) {
    mx /= length;
    my /= length;
  } else {
    mx = 0;
    my = 0;
  }
  player.moving = length > 0.001;

  const speed = gaitSpeed(gait, carrying);
  if (player.moving) {
    const wanted = Math.atan2(my, mx);
    player.angle = turnToward(player.angle, wanted, PLAYER.turn * dt);
    moveCircle(player, mx * speed * dt, my * speed * dt, SOLIDS);
    player.stride += speed * dt;
    player.bob = Math.min(1, player.bob + dt * 6);
    if (player.stride >= PLAYER.stride) {
      player.stride -= PLAYER.stride;
      player.footstep = true;
    }
  } else {
    player.bob = Math.max(0, player.bob - dt * 5);
  }
  return speed;
}

/** How far a footstep carries, by gait: a sneak is heard at arm's length, a sprint across a room. */
export function footstepNoise(gait) {
  return gait === GAIT_SPRINT ? PLAYER.noiseRadius : gait === GAIT_SNEAK ? 0 : 70;
}

export function resetPlayer(player, start) {
  player.x = start.x;
  player.y = start.y;
  player.angle = -Math.PI / 2;
  player.gait = GAIT_WALK;
  player.moving = false;
  player.stride = 0;
  player.footstep = false;
  player.carrying = 0;
  player.focus = null;
  player.bob = 0;
}
