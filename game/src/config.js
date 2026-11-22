// The Velvet Ledger — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical stage; the renderer scales it to the window,
// so nothing below depends on the size of the screen. Times are seconds.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The top strip holds the alarm meter and the score; the footer holds the key legend. */
export const HUD = { height: 76, footer: 20 };

export const PLAYER = {
  radius: 11,
  walk: 138,
  sprint: 212,
  sneak: 64,
  turn: 14,
  reach: 56,
  /** Sprinting is loud: a noise pulse every this many seconds, heard this far. */
  noiseInterval: 0.36,
  noiseRadius: 220,
  /** A stride's length, in pixels walked, between footstep sounds. */
  stride: 34,
};

export const GUARD = {
  range: 208,
  halfAngle: 0.46,
  patrolSpeed: 62,
  searchSpeed: 100,
  chaseSpeed: 152,
  turnRate: 3.4,
  pauseTime: 1.1,
  /** How fast a guard's suspicion fills while the thief stands in the cone. */
  suspicionGain: 0.95,
  suspicionDecay: 0.62,
  alertAt: 1.0,
  loseSight: 3.4,
  /** Grabbed when this close, in pixels. */
  grab: 34,
};

export const CAMERA = {
  range: 318,
  halfAngle: 0.165,
  /** Directly under the lens the camera is blind: a dead zone, in pixels. */
  blind: 48,
  sweepSpeed: 0.38,
  jamSeconds: 5,
};

export const ALARM = {
  max: 100,
  /** No detector sees the thief for this long before the meter starts falling. */
  decayDelay: 1.5,
  decay: 2.7,
  guardRate: 8.2,
  cameraRate: 6.4,
  /** Standing in a guard's face raises it far faster than a far-off glimpse. */
  closeRate: 26,
  closeRadius: 44,
  /** Each extra detector adds this share of the strongest rate. */
  extraShare: 0.35,
};

export const LOOT = {
  /** How far from a case the thief can stand and still work it. */
  range: 56,
  /** The alarm jolts when a case is cracked open. */
  crackNoise: 6,
};

export const TOOLS = {
  noise: 3,
  cutter: 2,
  cutterAlarm: 9,
  noiseRadius: 250,
  noiseSeconds: 4.5,
};

export const PALETTE = {
  backdrop: '#08060d',
  ink: '#120d1c',
  panel: '#171021',
  panelEdge: '#3a2f4e',
  cream: '#f3e9d6',
  muted: '#9a8fae',
  gold: '#d9b36c',
  goldBright: '#f0cf8e',
  goldDim: '#7d6337',
  crimson: '#c8455a',
  crimsonDeep: '#7d2334',
  amber: '#ffb347',
  teal: '#59d6d0',
  cyan: '#6fd8ff',
  danger: '#ff4d63',
  safe: '#63d69a',
  wall: '#3a3350',
  wallTop: '#4c4468',
  wallEdge: '#6f6394',
  shadow: 'rgba(7,4,12,0.62)',
};

export const FONT = {
  display: 'Georgia, "Palatino Linotype", "Book Antiqua", "Times New Roman", serif',
  ui: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: '"SF Mono", "Cascadia Mono", Menlo, Consolas, monospace',
};

/** Where the best night is kept between visits (this browser only). */
export const BEST_KEY = 'velvet-ledger.best';
