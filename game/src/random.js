// A small seeded generator (mulberry32): the same seed gives the same night, which is what
// makes the screenshot scenes and the two hand-in runs repeatable. Nothing in the game calls
// Math.random, so every frame of a staged scene is a pure function of the seed and the step count.

export function createRandom(seed) {
  let state = seed | 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [lo, hi], from a random source. */
export function randomInt(random, lo, hi) {
  return lo + Math.floor(random() * (hi - lo + 1));
}

/** One of the entries, from a random source. */
export function pick(random, list) {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}
