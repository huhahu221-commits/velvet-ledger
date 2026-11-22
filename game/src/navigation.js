// Navigation: a coarse walkability grid over the floor plan and an A* search on it. Guards
// re-plan only when they reach a waypoint or their quarry moves, so a night of patrols costs
// a handful of searches. Paths are smoothed by dropping every point the body can walk past in
// a straight line, which is what stops the guards from marching cell by cell.
import { SOLIDS } from './level.js';
import { circleRect, distance } from './geometry.js';

export const CELL = 12;
const ORIGIN_X = 32;
const ORIGIN_Y = 88;
const WIDTH = Math.ceil((1248 - ORIGIN_X) / CELL);
const HEIGHT = Math.ceil((692 - ORIGIN_Y) / CELL);
/** How much room a walker needs from a solid to pass a cell. The thief is the narrowest body
 *  at r = 11, so a cell this clear is a cell every body can legally stand in — which is what
 *  keeps a resting body from sitting in a cell the pathfinder calls blocked. */
const CLEARANCE = 11;

const NEIGHBOURS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
];

/** The grid is built once per night: walkable cells are those a body of CLEARANCE fits in. */
export function buildNavGrid(solids = SOLIDS) {
  const walkable = new Uint8Array(WIDTH * HEIGHT);
  for (let gy = 0; gy < HEIGHT; gy += 1) {
    for (let gx = 0; gx < WIDTH; gx += 1) {
      const x = ORIGIN_X + gx * CELL + CELL / 2;
      const y = ORIGIN_Y + gy * CELL + CELL / 2;
      let free = 1;
      for (let index = 0; index < solids.length; index += 1) {
        if (circleRect(x, y, CLEARANCE, solids[index])) {
          free = 0;
          break;
        }
      }
      walkable[gy * WIDTH + gx] = free;
    }
  }
  return { walkable, width: WIDTH, height: HEIGHT, cell: CELL, originX: ORIGIN_X, originY: ORIGIN_Y };
}

export function gridPoint(grid, x, y) {
  return {
    gx: Math.max(0, Math.min(grid.width - 1, Math.floor((x - grid.originX) / grid.cell))),
    gy: Math.max(0, Math.min(grid.height - 1, Math.floor((y - grid.originY) / grid.cell))),
  };
}

function cellCentre(grid, gx, gy) {
  return { x: grid.originX + gx * grid.cell + grid.cell / 2, y: grid.originY + gy * grid.cell + grid.cell / 2 };
}

/** The nearest walkable cell to a point, searched in rings: used when a target sits in furniture. */
export function nearestWalkable(grid, x, y) {
  const start = gridPoint(grid, x, y);
  const seen = new Uint8Array(grid.width * grid.height);
  const queue = [start.gy * grid.width + start.gx];
  seen[queue[0]] = 1;
  for (let head = 0; head < queue.length && head < 900; head += 1) {
    const index = queue[head];
    const gx = index % grid.width;
    const gy = (index - gx) / grid.width;
    if (grid.walkable[index]) return { gx, gy };
    for (let n = 0; n < 4; n += 1) {
      const nx = gx + NEIGHBOURS[n][0];
      const ny = gy + NEIGHBOURS[n][1];
      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
      const next = ny * grid.width + nx;
      if (seen[next]) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return start;
}

/**
 * A* from (sx, sy) to (tx, ty), returned as a list of world points with the target appended.
 * An unreachable target returns the straight line, which the body will bump along rather than
 * freeze on.
 */
export function findPath(grid, sx, sy, tx, ty) {
  const from = nearestWalkable(grid, sx, sy);
  const to = nearestWalkable(grid, tx, ty);
  const startIndex = from.gy * grid.width + from.gx;
  const goalIndex = to.gy * grid.width + to.gx;
  if (startIndex === goalIndex) return [{ x: tx, y: ty }];

  const count = grid.width * grid.height;
  const gScore = new Float32Array(count).fill(Infinity);
  const cameFrom = new Int32Array(count).fill(-1);
  const closed = new Uint8Array(count);
  const heap = [];
  const goal = cellCentre(grid, to.gx, to.gy);

  function heuristic(index) {
    const gx = index % grid.width;
    const gy = (index - gx) / grid.width;
    const point = cellCentre(grid, gx, gy);
    return distance(point.x, point.y, goal.x, goal.y);
  }

  function push(index, f) {
    heap.push({ index, f });
    let child = heap.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (heap[parent].f <= heap[child].f) break;
      [heap[parent], heap[child]] = [heap[child], heap[parent]];
      child = parent;
    }
  }

  function pop() {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let parent = 0;
      for (;;) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let best = parent;
        if (left < heap.length && heap[left].f < heap[best].f) best = left;
        if (right < heap.length && heap[right].f < heap[best].f) best = right;
        if (best === parent) break;
        [heap[parent], heap[best]] = [heap[best], heap[parent]];
        parent = best;
      }
    }
    return top;
  }

  gScore[startIndex] = 0;
  push(startIndex, heuristic(startIndex));
  let found = false;

  while (heap.length > 0) {
    const current = pop().index;
    if (closed[current]) continue;
    closed[current] = 1;
    if (current === goalIndex) {
      found = true;
      break;
    }
    const gx = current % grid.width;
    const gy = (current - gx) / grid.width;
    for (let n = 0; n < NEIGHBOURS.length; n += 1) {
      const nx = gx + NEIGHBOURS[n][0];
      const ny = gy + NEIGHBOURS[n][1];
      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
      const next = ny * grid.width + nx;
      if (!grid.walkable[next] || closed[next]) continue;
      // No corner cutting: a diagonal step needs both of its orthogonal neighbours open.
      if (NEIGHBOURS[n][0] !== 0 && NEIGHBOURS[n][1] !== 0) {
        if (!grid.walkable[gy * grid.width + nx] || !grid.walkable[ny * grid.width + gx]) continue;
      }
      const tentative = gScore[current] + NEIGHBOURS[n][2];
      if (tentative >= gScore[next]) continue;
      gScore[next] = tentative;
      cameFrom[next] = current;
      push(next, tentative + heuristic(next));
    }
  }

  if (!found) return [{ x: tx, y: ty }];

  const cells = [];
  let cursor = goalIndex;
  while (cursor !== -1 && cells.length < 4000) {
    cells.push(cursor);
    if (cursor === startIndex) break;
    cursor = cameFrom[cursor];
  }
  cells.reverse();
  const raw = cells.map((index) => {
    const gx = index % grid.width;
    return cellCentre(grid, gx, (index - gx) / grid.width);
  });
  raw.push({ x: tx, y: ty });
  return smoothPath(raw);
}

/** Drop a point when the previous one can see the next: long straight legs, no stair-steps. */
function smoothPath(points) {
  if (points.length <= 2) return points;
  const kept = [points[0]];
  let anchor = 0;
  for (let index = 2; index < points.length; index += 1) {
    const a = points[anchor];
    const b = points[index];
    if (lineWalkable(a.x, a.y, b.x, b.y)) continue;
    kept.push(points[index - 1]);
    anchor = index - 1;
  }
  kept.push(points[points.length - 1]);
  return kept;
}

/** True when a straight walk between two points stays clear of every solid. The probe is the
 *  same width as the widest body, so a leg the smoother keeps is a leg a guard can walk. */
export function lineWalkable(ax, ay, bx, by) {
  const length = distance(ax, ay, bx, by);
  const steps = Math.max(1, Math.ceil(length / (CELL * 0.5)));
  for (let step = 1; step < steps; step += 1) {
    const t = step / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    for (let index = 0; index < SOLIDS.length; index += 1) {
      if (circleRect(x, y, CLEARANCE, SOLIDS[index])) return false;
    }
  }
  return true;
}
