// Keyboard and pointer input, read as an intent for one fixed step. Held keys give the walk
// vector and the two gaits; the work key is held; the one-shot presses (a coin, a jam, a take,
// start, pause) are latched until the loop takes them, so a press between two frames is never
// lost and never counted twice.

export const ACTION_START = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;

const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  sneak: ['ControlLeft', 'ControlRight', 'KeyC'],
  work: ['KeyE'],
  take: ['KeyF', 'Space'],
  noise: ['KeyQ'],
  cutter: ['KeyR'],
  jam: ['KeyG'],
  pause: ['KeyP', 'Escape'],
  start: ['Enter', 'Space'],
};

/** The one-shot presses, latched until the loop reads them. */
const LATCH_TAKE = 32;
const LATCH_NOISE = 8;
const LATCH_JAM = 16;
const LATCH_CUTTER = 64;

export function createInput(target) {
  const held = new Set();
  let latched = 0;
  let pointerAim = null;

  function matches(code, action) {
    return KEYS[action].includes(code);
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (!matches(event.code, 'work')) return;
    }
    const code = event.code;
    if (matches(code, 'pause')) latched |= ACTION_PAUSE;
    else if (matches(code, 'start')) latched |= ACTION_START;
    else if (matches(code, 'noise')) latched |= LATCH_NOISE;
    else if (matches(code, 'jam')) latched |= LATCH_JAM;
    else if (matches(code, 'take')) latched |= LATCH_TAKE;
    else if (matches(code, 'cutter')) latched |= LATCH_CUTTER;
    else if (
      !matches(code, 'up') && !matches(code, 'down') && !matches(code, 'left') &&
      !matches(code, 'right') && !matches(code, 'sprint') && !matches(code, 'sneak') &&
      !matches(code, 'work')
    ) {
      return;
    }
    held.add(code);
    if (code !== 'F5' && code !== 'F12') event.preventDefault();
  });

  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });

  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => held.clear());

  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    pointerAim = { x: event.clientX - rect.left, y: event.clientY - rect.top, rect };
  });
  target.addEventListener('pointerdown', (event) => {
    if (event.button === 0) latched |= 32;
    else if (event.button === 2) latched |= 8;
  });
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  function any(action) {
    return KEYS[action].some((code) => held.has(code));
  }

  return {
    /** The intent for this step; clears the one-shot latches as it reads them. */
    read() {
      const x = (any('right') ? 1 : 0) - (any('left') ? 1 : 0);
      const y = (any('down') ? 1 : 0) - (any('up') ? 1 : 0);
      const intent = {
        x,
        y,
        sprint: any('sprint'),
        sneak: any('sneak'),
        work: any('work'),
        take: (latched & LATCH_TAKE) !== 0,
        noise: (latched & LATCH_NOISE) !== 0,
        jam: (latched & LATCH_JAM) !== 0,
        useCutter: (latched & LATCH_CUTTER) !== 0,
      };
      latched &= ~(LATCH_NOISE | LATCH_JAM | LATCH_TAKE | LATCH_CUTTER);
      return intent;
    },
    /** The queued screen actions (start, pause, restart) since the last call. */
    takeActions() {
      const taken = latched & (ACTION_START | ACTION_PAUSE | ACTION_RESTART);
      latched &= ~(ACTION_START | ACTION_PAUSE | ACTION_RESTART);
      return taken;
    },
    /** Where the pointer last was, in canvas pixels, for the aim cursor. */
    pointer() {
      return pointerAim;
    },
    clearActions() {
      latched = 0;
    },
  };
}
