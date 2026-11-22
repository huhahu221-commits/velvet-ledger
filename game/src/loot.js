// The catalogue: four pieces, each on its own case, each needing to be worked open before it
// can be lifted. A case takes time — the thief stands over it, a ring fills, and the house's
// alarm takes a small jolt when the lid gives. The ledger is the night's real prize: the exit
// stays shut until it is in the bag, and the other three are what pays for the getaway.
import { LOOT } from './config.js';
import { distance } from './geometry.js';
import { LOOT as CATALOGUE } from './level.js';

export const CASE_SEALED = 'sealed';
export const CASE_WORKING = 'working';
export const CASE_OPEN = 'open';
export const CASE_TAKEN = 'taken';

export function createLoot() {
  return CATALOGUE.map((entry) => ({
    id: entry.id,
    name: entry.name,
    subtitle: entry.subtitle,
    x: entry.x,
    y: entry.y,
    value: entry.value,
    channel: entry.channel,
    room: entry.room,
    colour: entry.colour,
    state: CASE_SEALED,
    /** 0..1 progress on the current attempt. */
    progress: 0,
    /** Seconds of steady work the case needs. */
    needed: entry.channel,
    /** The floor a thief stands on to work it, which is also where the autopilot walks. */
    stand: { x: entry.stand.x, y: entry.stand.y },
    /** Set for one step when the case gives, so the caller can play the crack. */
    cracked: false,
  }));
}

export function resetLoot(loot) {
  for (const item of loot) {
    item.state = CASE_SEALED;
    item.progress = 0;
    item.needed = item.channel;
    item.cracked = false;
  }
}

/** The case nearest enough to work, or null. Distance is measured from where a thief would
 *  stand to work it, not from the piece itself, so a case set back on a pedestal still opens. */
export function focusLoot(loot, x, y, range = LOOT.range) {
  let best = null;
  let bestDistance = range;
  for (const item of loot) {
    if (item.state === CASE_TAKEN) continue;
    const gap = Math.min(
      distance(x, y, item.stand.x, item.stand.y),
      distance(x, y, item.x, item.y),
    );
    if (gap <= bestDistance) {
      bestDistance = gap;
      best = item;
    }
  }
  return best;
}

export function takenCount(loot) {
  let count = 0;
  for (const item of loot) if (item.state === CASE_TAKEN) count += 1;
  return count;
}

export function totalValue(loot) {
  let value = 0;
  for (const item of loot) if (item.state === CASE_TAKEN) value += item.value;
  return value;
}

export function ledgerTaken(loot) {
  for (const item of loot) if (item.id === 'ledger') return item.state === CASE_TAKEN;
  return false;
}

/**
 * One fixed step of a case being worked. `holding` is true while the thief keeps the work key
 * down and stays in reach. Returns the case's state after the step.
 */
export function workCase(item, dt, holding) {
  item.cracked = false;
  // A case that is already open (or already emptied) is not worked again: doing so would knock
  // it back to "working" and the thief could never take what he has already opened.
  if (item.state === CASE_TAKEN || item.state === CASE_OPEN) return item.state;

  if (!holding) {
    // Letting go keeps the progress but lets it settle a little; a case is not lost, just slower.
    item.state = item.progress > 0 ? CASE_WORKING : CASE_SEALED;
    item.progress = Math.max(0, item.progress - dt * 0.12);
    return item.state;
  }

  item.state = CASE_WORKING;
  item.progress = Math.min(1, item.progress + dt / item.needed);
  if (item.progress >= 1) {
    item.state = CASE_OPEN;
    item.cracked = true;
  }
  return item.state;
}

/**
 * Spend a glass cutter on a case: a big head start on the work and a loud jolt on the meter.
 * Returns true when the charge was spent.
 */
export function cutCase(item, tools) {
  if (tools.cutters <= 0 || item.state === CASE_TAKEN || item.state === CASE_OPEN) return false;
  tools.cutters -= 1;
  tools.usedCutter = true;
  item.state = CASE_WORKING;
  item.progress = Math.min(1, item.progress + 0.55);
  if (item.progress >= 1) {
    item.state = CASE_OPEN;
    item.cracked = true;
  }
  return true;
}

/** Lift an opened case's piece. Returns the value lifted, or 0 when there was nothing to lift. */
export function liftCase(item) {
  if (item.state !== CASE_OPEN) return 0;
  item.state = CASE_TAKEN;
  item.progress = 1;
  return item.value;
}

export function createTools() {
  return {
    noiseCharges: 3,
    cutters: 2,
    /** Set for one step after a tool is spent, for the HUD's flash and the sound. */
    usedNoise: false,
    usedCutter: false,
  };
}

export function resetTools(tools) {
  tools.noiseCharges = 3;
  tools.cutters = 2;
  tools.usedNoise = false;
  tools.usedCutter = false;
}
