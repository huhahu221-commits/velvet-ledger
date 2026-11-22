// Guards: the house's three pairs of eyes. Each walks a fixed loop and stops at every corner
// to turn and look, which is what gives the thief a rhythm to learn. A guard's suspicion fills
// while the thief stands in the cone (faster up close), decays while he is out of it, and at
// the alert mark the guard abandons the route and gives chase along the nav grid. Losing him
// for a few seconds sends him back to his loop with the alarm meter higher than he found it.
import { GUARD } from './config.js';
import {
  angleOf,
  circleRect,
  distance,
  inRect,
  segmentClear,
  turnToward,
} from './geometry.js';
import { BLOCKERS, GUARDS } from './level.js';
import { findPath, lineWalkable } from './navigation.js';

export const MOOD_PATROL = 'patrol';
export const MOOD_SEARCH = 'search';
export const MOOD_CHASE = 'chase';
export const MOOD_ALARMED = 'alarmed';

export function createGuards() {
  return GUARDS.map((route) => ({
    id: route.id,
    name: route.name,
    role: route.role,
    colour: route.colour,
    route: route.route,
    x: route.route[0].x,
    y: route.route[0].y,
    r: 12,
    angle: 0,
    mood: MOOD_PATROL,
    target: 1,
    pause: 0,
    suspicion: 0,
    /** True on the step this guard first sees the thief, for the sting and the bark. */
    spotted: false,
    /** Where he last had eyes on the thief; a search walks to it. */
    lastSeen: { x: 0, y: 0 },
    lostFor: 0,
    /** The nav path he is following, and the index along it. */
    path: null,
    pathIndex: 0,
    repath: 0,
    /** A glance the other way at a corner: the cone's own sweep, in radians. */
    sweep: 0,
    sweepDir: 1,
  }));
}

export function resetGuards(guards) {
  for (const guard of guards) {
    guard.x = guard.route[0].x;
    guard.y = guard.route[0].y;
    guard.angle = 0;
    guard.mood = MOOD_PATROL;
    guard.target = 1;
    guard.pause = 0;
    guard.suspicion = 0;
    guard.spotted = false;
    guard.lostFor = 0;
    guard.path = null;
    guard.pathIndex = 0;
    guard.repath = 0;
    guard.sweep = 0;
    guard.sweepDir = 1;
  }
}

/**
 * Is the thief inside this guard's cone right now? Distance, then the half-angle, then the
 * line of sight: cheap tests first, the ray cast only for a body already in the wedge.
 */
export function guardSees(guard, target, range = GUARD.range, halfAngle = GUARD.halfAngle) {
  const gap = distance(guard.x, guard.y, target.x, target.y);
  if (gap > range) return false;
  if (gap < 1e-3) return true;
  const toTarget = angleOf(target.x - guard.x, target.y - guard.y);
  let delta = (toTarget - guard.angle) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  if (Math.abs(delta) > halfAngle) return false;
  return segmentClear(guard.x, guard.y, target.x, target.y, BLOCKERS);
}

/** Move a body toward a point; returns true once it is within `arrive` of it. */
function walkToward(guard, x, y, speed, dt, arrive = 8) {
  const gap = distance(guard.x, guard.y, x, y);
  if (gap <= arrive) return true;
  const step = Math.min(gap, speed * dt);
  const ux = (x - guard.x) / gap;
  const uy = (y - guard.y) / gap;
  const before = { x: guard.x, y: guard.y };
  guard.x += ux * step;
  guard.y += uy * step;
  // Keep the body out of the furniture even when a smoothed path cuts a corner close.
  for (let index = 0; index < BLOCKERS.length; index += 1) {
    const rect = BLOCKERS[index];
    if (!circleRect(guard.x, guard.y, guard.r, rect)) continue;
    guard.x = before.x;
    guard.y = before.y;
    return true;
  }
  return distance(guard.x, guard.y, x, y) <= arrive;
}

/** Follow a nav path to (x, y), replanning at most a few times a second. */
function followPath(guard, x, y, dt, speed, nav) {
  guard.repath -= dt;
  if (!guard.path || guard.repath <= 0) {
    guard.path = findPath(nav, guard.x, guard.y, x, y);
    guard.pathIndex = 0;
    guard.repath = 0.7;
  }
  const node = guard.path[Math.min(guard.pathIndex, guard.path.length - 1)];
  if (walkToward(guard, node.x, node.y, speed, dt, 10)) {
    guard.pathIndex += 1;
    if (guard.pathIndex >= guard.path.length) {
      guard.path = null;
      return true;
    }
  }
  return false;
}

/**
 * One fixed step for every guard. `hearing` is a list of {x, y, radius} noises made this step
 * (a sprint's footfalls, a spent noise maker): a guard inside one turns to look that way, and
 * at close range walks over to it. Returns the list of guards holding eyes on the thief, each
 * with how close the thief is, which the caller feeds to the alarm.
 */
export function stepGuards(guards, dt, thief, nav, hearing, chasing) {
  const watchers = [];
  for (const guard of guards) {
    guard.spotted = false;
    const gap = distance(guard.x, guard.y, thief.x, thief.y);
    const sees = guardSees(guard, thief);

    if (sees) {
      guard.suspicion = Math.min(1, guard.suspicion + dt * (gap < GUARD.closeRadius ? GUARD.suspicionGain * 1.7 : GUARD.suspicionGain));
      guard.lastSeen.x = thief.x;
      guard.lastSeen.y = thief.y;
      guard.lostFor = 0;
      if (guard.mood !== MOOD_CHASE && guard.suspicion >= GUARD.alertAt) {
        guard.spotted = true;
        guard.mood = MOOD_CHASE;
        guard.path = null;
        guard.repath = 0;
      }
      watchers.push({ guard, gap });
    } else {
      guard.suspicion = Math.max(0, guard.suspicion - dt * GUARD.suspicionDecay);
      if (guard.mood === MOOD_CHASE) guard.lostFor += dt;
    }

    // Heard something? Turn toward it; at close range go and look.
    if (!sees && hearing.length > 0) {
      let loudest = null;
      for (const noise of hearing) {
        if (distance(guard.x, guard.y, noise.x, noise.y) <= noise.radius) {
          if (!loudest || noise.radius > loudest.radius) loudest = noise;
        }
      }
      if (loudest) {
        const toward = angleOf(loudest.x - guard.x, loudest.y - guard.y);
        guard.angle = turnToward(guard.angle, toward, GUARD.turnRate * dt);
        if (guard.mood === MOOD_PATROL && distance(guard.x, guard.y, loudest.x, loudest.y) < loudest.radius * 0.55) {
          guard.mood = MOOD_SEARCH;
          guard.lastSeen.x = loudest.x;
          guard.lastSeen.y = loudest.y;
          guard.lostFor = 0;
          guard.path = null;
        }
      }
    }

    switch (guard.mood) {
      case MOOD_CHASE: {
        const wanted = angleOf(thief.x - guard.x, thief.y - guard.y);
        guard.angle = turnToward(guard.angle, wanted, GUARD.turnRate * 1.7 * dt);
        if (gap > GUARD.grab * 0.7) followPath(guard, thief.x, thief.y, dt, GUARD.chaseSpeed, nav);
        if (guard.lostFor > GUARD.loseSight) {
          guard.mood = MOOD_SEARCH;
          guard.lostFor = 0;
          guard.path = null;
          guard.suspicion = 0.34;
        }
        break;
      }
      case MOOD_SEARCH: {
        const arrived = followPath(guard, guard.lastSeen.x, guard.lastSeen.y, dt, GUARD.searchSpeed, nav);
        // At the spot, sweep the head both ways; after a while, walk the loop again.
        guard.sweep += dt * 1.9 * guard.sweepDir;
        if (Math.abs(guard.sweep) > 0.95) guard.sweepDir *= -1;
        if (arrived) guard.angle = turnToward(guard.angle, guard.angle + guard.sweep * dt, 3 * dt);
        guard.lostFor += dt;
        if (guard.lostFor > 7.5) {
          guard.mood = MOOD_PATROL;
          guard.sweep = 0;
          guard.path = null;
          guard.lostFor = 0;
        }
        break;
      }
      default: {
        // Patrol: walk the route, pause at each corner, and glance aside while paused.
        if (guard.pause > 0) {
          guard.pause -= dt;
          guard.sweep += dt * 1.5 * guard.sweepDir;
          if (Math.abs(guard.sweep) > 0.7) guard.sweepDir *= -1;
          guard.angle += guard.sweep * dt;
          if (guard.pause <= 0) {
            guard.target = (guard.target + 1) % guard.route.length;
            guard.sweep = 0;
            guard.path = null;
          }
          break;
        }
        const node = guard.route[guard.target];
        if (!guard.path) {
          guard.path = findPath(nav, guard.x, guard.y, node.x, node.y);
          guard.pathIndex = 0;
          guard.repath = 0.8;
        }
        guard.repath -= dt;
        const waypoint = guard.path[Math.min(guard.pathIndex, guard.path.length - 1)];
        const face = angleOf(waypoint.x - guard.x, waypoint.y - guard.y);
        guard.angle = turnToward(guard.angle, face, GUARD.turnRate * dt);
        if (walkToward(guard, waypoint.x, waypoint.y, GUARD.patrolSpeed, dt, 9)) {
          guard.pathIndex += 1;
          if (guard.pathIndex >= guard.path.length) {
            guard.path = null;
            guard.pause = node.pause ?? GUARD.pauseTime;
            // A pause always leaves the cone pointing the way he came, then sweeping.
            guard.angle = face;
          }
        }
        break;
      }
    }

    // The alarm's own effect: once it is screaming, every guard walks the thief down.
    if (chasing && guard.mood === MOOD_PATROL) {
      guard.mood = MOOD_CHASE;
      guard.path = null;
    }
  }
  return watchers;
}

/** True when a guard is standing on the thief: the caught moment. */
export function guardCatches(guard, thief) {
  if (guard.mood !== MOOD_CHASE && guard.mood !== MOOD_ALARMED) return false;
  return distance(guard.x, guard.y, thief.x, thief.y) <= GUARD.grab;
}

/** Is this point inside a room's floor? Used by the HUD to name where the thief is standing. */
export function roomAt(rooms, x, y) {
  for (const room of rooms) if (inRect(x, y, room)) return room;
  return null;
}

export { lineWalkable };
