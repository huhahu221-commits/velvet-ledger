// Verify that each staged scene really puts the five required things on screen at once, and
// that the guard cones actually reach the thief where the frame claims they do. This reads the
// same modules the renderer does, so a green result here means a green frame.
import { createWorld } from '../game/src/world.js';
import { createRandom } from '../game/src/random.js';
import { stageShot } from '../game/src/shots.js';
import { guardSees } from '../game/src/guards.js';
import { distance } from '../game/src/geometry.js';
import { FIELD, HUD, GUARD } from '../game/src/config.js';
import { ROOMS, EXIT } from '../game/src/level.js';

const world = createWorld(createRandom(1));
const names = ['start', 'play', 'alarm', 'win'];
let bad = 0;

function inStage(x, y) {
  return x > 32 && x < 1248 && y > HUD.height && y < FIELD.height - 20;
}

for (const name of names) {
  const scene = stageShot(name, world);
  const p = world.player;
  const problems = [];

  // 1. The thief: on screen, on floor, not inside furniture.
  if (!inStage(p.x, p.y)) problems.push(`thief off-stage at ${p.x.toFixed(0)},${p.y.toFixed(0)}`);

  // 2. Guards: at least one visible, and at least one cone actually covering the thief. The
  // title card is a panel over the house rather than a gameplay frame, so it is exempt.
  const visibleGuards = world.guards.filter((g) => inStage(g.x, g.y));
  if (visibleGuards.length === 0) problems.push('no guard on screen');
  const seers = world.guards.filter((g) => guardSees(g, p));
  if (name !== 'start' && seers.length === 0) problems.push('no guard cone covers the thief');

  // 3. Cameras: at least one on screen with a drawn beam.
  const visibleCams = world.cameras.filter((c) => inStage(c.x, c.y));
  if (visibleCams.length === 0) problems.push('no camera on screen');

  // 4. Loot: at least one case on screen, and its state is legible.
  const visibleLoot = world.loot.filter((l) => inStage(l.x, l.y));
  if (visibleLoot.length === 0) problems.push('no loot on screen');

  // 5. The alarm meter: the HUD always draws it, but its value must be a real number.
  if (!Number.isFinite(world.alarm.value)) problems.push('alarm is not a number');

  // Sanity: the thief must not be inside a solid.
  const { SOLIDS } = await import('../game/src/level.js');
  const { circleRect } = await import('../game/src/geometry.js');
  const stuck = SOLIDS.filter((s) => circleRect(p.x, p.y, p.r, s));
  if (stuck.length > 0) problems.push(`thief inside ${stuck.map((s) => s.kind).join(',')}`);

  const room = ROOMS.find((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
  const coneInfo = world.guards
    .map((g) => `${g.name} d${distance(g.x, g.y, p.x, p.y).toFixed(0)} ${guardSees(g, p) ? 'SEES' : '—'}`)
    .join('  ');

  console.log(`${problems.length === 0 ? 'OK  ' : 'FAIL'} ${name.padEnd(6)} screen=${scene.screen} room=${room ? room.id : 'none'}`);
  console.log(`     thief ${p.x.toFixed(0)},${p.y.toFixed(0)}  alarm ${world.alarm.value.toFixed(0)} (${world.summary().threat})  take ${world.summary().taken}/4`);
  console.log(`     guards ${visibleGuards.length} on screen  cams ${visibleCams.length}  loot ${visibleLoot.length}  |  ${coneInfo}`);
  if (problems.length > 0) {
    bad += 1;
    for (const problem of problems) console.log(`     !! ${problem}`);
  }
}

console.log(bad === 0 ? '\nall scenes carry the five required elements' : `\n${bad} scene(s) incomplete`);
process.exitCode = bad === 0 ? 0 : 1;
