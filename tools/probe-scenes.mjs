// A headless harness: run the real modules in Node, with no canvas at all, and print what each
// staged scene actually contains. This is the determinism check too — two runs must agree.
import { createWorld } from '../game/src/world.js';
import { createRandom } from '../game/src/random.js';
import { stageShot } from '../game/src/shots.js';

const world = createWorld(createRandom(1));
const scenes = ['start', 'play', 'alarm', 'win'];

for (const name of scenes) {
  const scene = stageShot(name, world);
  const s = world.state;
  const loot = world.loot.map((item) => `${item.id}:${item.state}${item.state === 'working' ? `(${item.progress.toFixed(2)})` : ''}`).join(' ');
  const guards = world.guards.map((g) => `${g.name}@${g.x.toFixed(0)},${g.y.toFixed(0)}[${g.mood} s${g.suspicion.toFixed(2)}]`).join(' ');
  const cams = world.cameras.map((c) => `${c.name}@${(c.angle).toFixed(2)}${c.watching ? '*' : ''}`).join(' ');
  console.log(`--- ${name} -> screen=${scene.screen} t=${s.elapsed.toFixed(1)}s phase=${s.phase}`);
  console.log(`    thief ${world.player.x.toFixed(0)},${world.player.y.toFixed(0)} gait=${world.player.gait}`);
  console.log(`    alarm=${world.alarm.value.toFixed(1)} threat=${world.summary().threat} loot=${loot}`);
  console.log(`    guards ${guards}`);
  console.log(`    cams ${cams}`);
  console.log(`    score=${s.score} taken=${world.summary().taken} exitOpen=${world.summary().exitOpen} ticker="${s.ticker}"`);
}

// Determinism: the same seed must reproduce the same night byte for byte.
const fingerprint = () => {
  const w = createWorld(createRandom(1));
  stageShot('win', w);
  return JSON.stringify({
    p: [w.player.x, w.player.y],
    a: w.alarm.value,
    g: w.guards.map((g) => [g.x, g.y, g.suspicion, g.mood]),
    l: w.loot.map((l) => [l.state, l.progress]),
    c: w.cameras.map((c) => [c.angle, c.jam]),
  });
};
const one = fingerprint();
const two = fingerprint();
console.log(`\ndeterministic: ${one === two} (${one.length} bytes of state)`);
