// The alarm meter: one number the whole house shares. Detectors feed it a rate while they hold
// the thief; several at once stack, but each extra pair of eyes adds a shrinking share of the
// strongest one, so three cameras never triple the bleed. Once nobody has seen him for a
// moment the meter falls again — a night can be saved by going quiet, but never fully erased.
import { ALARM } from './config.js';
import { clamp } from './geometry.js';

export const THREAT_CALM = 'calm';
export const THREAT_WATCHFUL = 'watchful';
export const THREAT_HUNTED = 'hunted';
export const THREAT_ALARM = 'alarm';

export const ALARM_CAUGHT = 'caught';
export const ALARM_ESCAPED = 'escaped';

export function createAlarm() {
  return {
    value: 0,
    /** Seconds since any detector last held the thief. */
    quiet: 99,
    /** The strongest rate this step, for the HUD's read-out. */
    rate: 0,
    /** How many detectors hold him right now. */
    watchers: 0,
    /** Set for one step when the meter crosses a threshold, so the caller can sound a sting. */
    crossed: null,
  };
}

export function resetAlarm(alarm) {
  alarm.value = 0;
  alarm.quiet = 99;
  alarm.rate = 0;
  alarm.watchers = 0;
  alarm.crossed = null;
}

export function threatOf(value) {
  if (value >= 100) return THREAT_ALARM;
  if (value >= 62) return THREAT_HUNTED;
  if (value >= 26) return THREAT_WATCHFUL;
  return THREAT_CALM;
}

/**
 * Advance the meter. `rates` is the list of per-step pressures from every detector holding
 * the thief (empty when none do). Returns the meter's new value.
 */
export function stepAlarm(alarm, dt, rates) {
  alarm.crossed = null;
  const before = alarm.value;
  alarm.watchers = rates.length;

  if (rates.length > 0) {
    let strongest = 0;
    let total = 0;
    for (let index = 0; index < rates.length; index += 1) {
      const rate = Number.isFinite(rates[index]) ? rates[index] : 0;
      if (rate > strongest) strongest = rate;
      total += rate;
    }
    // The strongest detector counts in full; the rest share a fraction of it.
    const stacked = strongest + (total - strongest) * ALARM.extraShare;
    alarm.rate = stacked;
    alarm.quiet = 0;
    alarm.value = clamp(alarm.value + stacked * dt, 0, ALARM.max);
  } else {
    alarm.rate = 0;
    alarm.quiet += dt;
    if (alarm.quiet > ALARM.decayDelay) {
      alarm.value = clamp(alarm.value - ALARM.decay * dt, 0, ALARM.max);
    }
  }

  // A NaN here would poison the meter for the rest of the night and hide the HUD's reading;
  // treat it as the floor it should have been.
  if (!Number.isFinite(alarm.value)) alarm.value = 0;

  for (const mark of [26, 62, 100]) {
    if (before < mark && alarm.value >= mark) alarm.crossed = mark;
  }
  return alarm.value;
}
