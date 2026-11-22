// Plain 2D geometry: angles, ray casts against rectangles, vision-cone fans and collision.
// Nothing here knows about the game's rules or its drawing; walls and props are both just
// axis-aligned rectangles with a position and a size.

export const TAU = Math.PI * 2;

export function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function angleOf(dx, dy) {
  return Math.atan2(dy, dx);
}

/** The shortest signed turn from `from` to `to`, in (-PI, PI]. */
export function angleDelta(from, to) {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta <= -Math.PI) delta += TAU;
  return delta;
}

/** Turn `current` toward `target` by at most `maxStep` radians, the short way round. */
export function turnToward(current, target, maxStep) {
  const delta = angleDelta(current, target);
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

/**
 * Distance along the ray (ox, oy) + t * (dx, dy) to the first side of `rect` it meets, or
 * Infinity. The direction need not be normalised; the distance is in units of its length.
 * A ray that starts inside the rectangle meets it at t = 0.
 */
export function rayRect(ox, oy, dx, dy, rect) {
  let near = 0;
  let far = Infinity;
  if (Math.abs(dx) < 1e-9) {
    if (ox < rect.x || ox > rect.x + rect.w) return Infinity;
  } else {
    let t1 = (rect.x - ox) / dx;
    let t2 = (rect.x + rect.w - ox) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    near = Math.max(near, t1);
    far = Math.min(far, t2);
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < rect.y || oy > rect.y + rect.h) return Infinity;
  } else {
    let t1 = (rect.y - oy) / dy;
    let t2 = (rect.y + rect.h - oy) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    near = Math.max(near, t1);
    far = Math.min(far, t2);
  }
  if (far < near) return Infinity;
  return near;
}

/** True when the segment a -> b is not crossed by any of the sight blockers. */
export function segmentClear(ax, ay, bx, by, blockers) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return true;
  const ux = dx / length;
  const uy = dy / length;
  for (let index = 0; index < blockers.length; index += 1) {
    const hit = rayRect(ax, ay, ux, uy, blockers[index]);
    if (hit < length - 0.5) return false;
  }
  return true;
}

/**
 * The far edge of a vision cone: one point per sampled ray, each pulled back to the first
 * blocker it meets. The renderer walks origin -> points -> origin to fill the lit sector.
 */
export function conePoints(ox, oy, angle, halfAngle, range, blockers, steps) {
  const points = [];
  const count = Math.max(6, steps);
  for (let index = 0; index <= count; index += 1) {
    const rayAngle = angle - halfAngle + (2 * halfAngle * index) / count;
    const dx = Math.cos(rayAngle);
    const dy = Math.sin(rayAngle);
    let reach = range;
    for (let b = 0; b < blockers.length; b += 1) {
      const hit = rayRect(ox, oy, dx, dy, blockers[b]);
      if (hit < reach) reach = hit;
    }
    points.push({ x: ox + dx * reach, y: oy + dy * reach });
  }
  return points;
}

/** True when a circle and a rectangle overlap. */
export function circleRect(x, y, radius, rect) {
  const nearestX = clamp(x, rect.x, rect.x + rect.w);
  const nearestY = clamp(y, rect.y, rect.y + rect.h);
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 < radius * radius;
}

/**
 * Move a circle by (dx, dy) and slide it out of every solid rectangle it ends up inside.
 * Axes are resolved one at a time, so a body pushed into a wall corner slides along it
 * instead of stopping dead.
 *
 * Each axis pushes out by the shallowest escape on that axis. Pushing to the far side of the
 * rectangle instead — the obvious `rect.x + rect.w + r` — teleports a body that was resting
 * flush against an edge straight across it, because a body on the boundary is "inside" by a
 * hair of floating point. That reads as a body stuck shivering against a plinth forever.
 */
export function moveCircle(body, dx, dy, solids) {
  function slide(axis, delta, size) {
    if (delta === 0) return;
    body[axis] += delta;
    for (let index = 0; index < solids.length; index += 1) {
      const rect = solids[index];
      if (!circleRect(body.x, body.y, body.r, rect)) continue;
      const near = rect[axis];
      const far = near + rect[size];
      const outLow = body[axis] + body.r - near;
      const outHigh = far - (body[axis] - body.r);
      body[axis] = outLow < outHigh ? near - body.r : far + body.r;
    }
  }
  slide('x', dx, 'w');
  slide('y', dy, 'h');
}

/** True when the point lies inside the rectangle, grown by `pad` on every side. */
export function inRect(x, y, rect, pad = 0) {
  return x >= rect.x - pad && x <= rect.x + rect.w + pad && y >= rect.y - pad && y <= rect.y + rect.h + pad;
}

/** The point on a rectangle's edge nearest to (x, y): where a guard walks to when searching. */
export function nearestEdgePoint(x, y, rect) {
  const cx = clamp(x, rect.x, rect.x + rect.w);
  const cy = clamp(y, rect.y, rect.y + rect.h);
  return { x: cx, y: cy };
}
