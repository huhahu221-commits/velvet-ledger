// The Velvet Ledger's auction house: one night's floor plan, drawn as data. Every room, wall,
// prop, display case, guard route and camera mount lives here, so the rules, the navigation
// grid, the renderer and the screenshot scenes all read the same building. Coordinates are the
// 1280x720 stage; the top 76 pixels are the alarm meter's strip and hold no floor.
//
// Layout (a night auction at a town house):
//
//   workshop | vault      | security | storage     <- north wing, y 104..300
//   ---------+------------+----------+---------
//   loading  |      grand gallery    | auction     <- middle, y 314..560 / 676
//   ---------+-----------------------+
//            |   service corridor    |             <- south, y 574..676
//
// The thief enters by the loading-bay shutter in the south-west and must leave by it.

/** Wall thickness and the room floor rectangles the renderer paints. */
export const WALL = 14;

export const ROOMS = [
  { id: 'workshop', name: 'Restoration Workshop', x: 48, y: 104, w: 252, h: 196, floor: '#3b2f4a', rug: null },
  { id: 'vault', name: 'Vault Room', x: 314, y: 104, w: 306, h: 196, floor: '#453552', rug: '#5b4260' },
  { id: 'security', name: 'Security Office', x: 634, y: 104, w: 306, h: 196, floor: '#382e47', rug: null },
  { id: 'storage', name: 'East Storage', x: 954, y: 104, w: 278, h: 196, floor: '#3a2e45', rug: null },
  { id: 'loading', name: 'Loading Bay', x: 48, y: 314, w: 252, h: 246, floor: '#332a3f', rug: null },
  { id: 'gallery', name: 'Grand Gallery', x: 314, y: 314, w: 626, h: 246, floor: '#483753', rug: '#6b4463' },
  { id: 'auction', name: 'Auction Hall', x: 954, y: 314, w: 278, h: 362, floor: '#45344c', rug: '#5f3b53' },
  { id: 'service', name: 'Service Corridor', x: 48, y: 574, w: 892, h: 102, floor: '#31283c', rug: null },
];

/** Solid rectangles. `sight` walls stop a guard's cone and a camera's beam; the rest do not. */
export const WALLS = [
  // Outer shell.
  { x: 32, y: 88, w: 1216, h: 16, sight: true, kind: 'outer' },
  { x: 32, y: 676, w: 1216, h: 16, sight: true, kind: 'outer' },
  { x: 32, y: 88, w: 16, h: 604, sight: true, kind: 'outer' },
  { x: 1232, y: 88, w: 16, h: 604, sight: true, kind: 'outer' },

  // The north wing's south wall, with four doorways.
  { x: 48, y: 300, w: 102, h: WALL, sight: true, kind: 'wall' },
  { x: 210, y: 300, w: 190, h: WALL, sight: true, kind: 'wall' },
  { x: 470, y: 300, w: 230, h: WALL, sight: true, kind: 'wall' },
  { x: 770, y: 300, w: 310, h: WALL, sight: true, kind: 'wall' },
  { x: 1150, y: 300, w: 82, h: WALL, sight: true, kind: 'wall' },

  // North wing dividers: workshop | vault | security | storage.
  { x: 300, y: 104, w: WALL, h: 86, sight: true, kind: 'wall' },
  { x: 300, y: 260, w: WALL, h: 40, sight: true, kind: 'wall' },
  { x: 620, y: 104, w: WALL, h: 56, sight: true, kind: 'wall' },
  { x: 620, y: 230, w: WALL, h: 70, sight: true, kind: 'wall' },
  { x: 940, y: 104, w: WALL, h: 66, sight: true, kind: 'wall' },
  { x: 940, y: 240, w: WALL, h: 60, sight: true, kind: 'wall' },

  // Loading bay | grand gallery.
  { x: 300, y: 314, w: WALL, h: 86, sight: true, kind: 'wall' },
  { x: 300, y: 470, w: WALL, h: 90, sight: true, kind: 'wall' },

  // Grand gallery | auction hall, with the hall's side door and the corridor's far door.
  { x: 940, y: 314, w: WALL, h: 66, sight: true, kind: 'wall' },
  { x: 940, y: 450, w: WALL, h: 150, sight: true, kind: 'wall' },
  { x: 940, y: 660, w: WALL, h: 16, sight: true, kind: 'wall' },

  // The gallery's south wall, with the bay door and the corridor door.
  { x: 48, y: 560, w: 72, h: WALL, sight: true, kind: 'wall' },
  { x: 190, y: 560, w: 430, h: WALL, sight: true, kind: 'wall' },
  { x: 700, y: 560, w: 240, h: WALL, sight: true, kind: 'wall' },
];

/**
 * Furniture. `sight: false` cover (auction chairs, low crates) stops a body but not a gaze,
 * which is what gives the gallery its several routes: you can walk behind a chair row and
 * still be seen over it, or behind a plinth and vanish.
 */
export const PROPS = [
  // Grand Gallery: five marble plinths, the sight-cover that makes the room a maze.
  { x: 420, y: 366, w: 60, h: 60, sight: true, kind: 'plinth', label: 'Plinth I' },
  { x: 600, y: 366, w: 60, h: 60, sight: true, kind: 'plinth', label: 'Plinth II' },
  { x: 780, y: 366, w: 60, h: 60, sight: true, kind: 'plinth', label: 'Plinth III' },
  { x: 510, y: 460, w: 60, h: 60, sight: true, kind: 'plinth', label: 'Plinth IV' },
  { x: 690, y: 460, w: 60, h: 60, sight: true, kind: 'plinth', label: 'Plinth V' },

  // Vault room: the Ledger's pedestal and two wall cases.
  { x: 440, y: 170, w: 64, h: 64, sight: true, kind: 'pedestal', label: 'Ledger pedestal' },
  { x: 340, y: 120, w: 56, h: 32, sight: true, kind: 'case', label: 'Wall case' },
  { x: 556, y: 252, w: 56, h: 32, sight: true, kind: 'case', label: 'Wall case' },

  // Security office: two desks and a filing cabinet.
  { x: 660, y: 120, w: 100, h: 44, sight: true, kind: 'desk', label: 'Watch desk' },
  { x: 790, y: 120, w: 100, h: 44, sight: true, kind: 'desk', label: 'Watch desk' },
  { x: 880, y: 230, w: 46, h: 56, sight: true, kind: 'cabinet', label: 'Cabinet' },

  // East storage: crates stacked to the ceiling, and one low pallet you can see over.
  { x: 970, y: 120, w: 56, h: 56, sight: true, kind: 'crate', label: 'Crate' },
  { x: 1040, y: 120, w: 56, h: 56, sight: true, kind: 'crate', label: 'Crate' },
  { x: 970, y: 200, w: 56, h: 56, sight: true, kind: 'crate', label: 'Crate' },
  { x: 1140, y: 180, w: 70, h: 70, sight: true, kind: 'crate', label: 'Crate' },
  { x: 1090, y: 250, w: 70, h: 34, sight: false, kind: 'pallet', label: 'Pallet' },

  // Restoration workshop: two benches and the miniature's stand.
  { x: 64, y: 130, w: 96, h: 38, sight: true, kind: 'bench', label: 'Bench' },
  { x: 64, y: 210, w: 96, h: 38, sight: true, kind: 'bench', label: 'Bench' },
  { x: 220, y: 150, w: 44, h: 44, sight: true, kind: 'stand', label: 'Miniature stand' },

  // Loading bay: crates stacked along the west wall, and a low pallet in the corner. The
  // middle of the bay stays clear — it is the corridor in from the shutter, and the way up
  // to the workshop door.
  { x: 64, y: 330, w: 64, h: 64, sight: true, kind: 'crate', label: 'Crate' },
  { x: 64, y: 412, w: 64, h: 64, sight: true, kind: 'crate', label: 'Crate' },
  { x: 110, y: 486, w: 56, h: 48, sight: false, kind: 'pallet', label: 'Pallet' },

  // Service corridor: the boiler and a pipe run, both set against the south wall so the
  // corridor itself stays walkable end to end.
  { x: 380, y: 612, w: 74, h: 48, sight: true, kind: 'boiler', label: 'Boiler' },
  { x: 660, y: 612, w: 74, h: 48, sight: true, kind: 'pipes', label: 'Pipe run' },
  { x: 250, y: 604, w: 50, h: 56, sight: true, kind: 'crate', label: 'Crate' },

  // Auction hall: the podium and three rows of chairs (cover you can be seen over).
  { x: 1050, y: 330, w: 84, h: 36, sight: true, kind: 'podium', label: 'Podium' },
  { x: 1000, y: 412, w: 54, h: 26, sight: false, kind: 'chair', label: 'Chair row' },
  { x: 1066, y: 412, w: 54, h: 26, sight: false, kind: 'chair', label: 'Chair row' },
  { x: 1132, y: 412, w: 54, h: 26, sight: false, kind: 'chair', label: 'Chair row' },
  { x: 1000, y: 460, w: 54, h: 26, sight: false, kind: 'chair', label: 'Chair row' },
  { x: 1066, y: 460, w: 54, h: 26, sight: false, kind: 'chair', label: 'Chair row' },
  { x: 1132, y: 460, w: 54, h: 26, sight: false, kind: 'chair', label: 'Chair row' },
  { x: 1000, y: 508, w: 54, h: 26, sight: false, kind: 'chair', label: 'Chair row' },
  { x: 1066, y: 508, w: 54, h: 26, sight: false, kind: 'chair', label: 'Chair row' },
  { x: 1132, y: 508, w: 54, h: 26, sight: false, kind: 'chair', label: 'Chair row' },
  { x: 1000, y: 596, w: 56, h: 56, sight: true, kind: 'plinth', label: 'Cameo plinth' },
];

/** Everything a body cannot walk through. */
export const SOLIDS = WALLS.concat(PROPS);

/** Only these stop a line of sight. */
export const BLOCKERS = WALLS.concat(PROPS.filter((prop) => prop.sight !== false));

/** The four pieces on the night's catalogue. `x, y` is where the piece sits, on its case;
 *  `stand` is the floor a thief works it from, which the autopilot and the nav grid use. */
export const LOOT = [
  {
    id: 'ledger',
    name: 'The Velvet Ledger',
    subtitle: 'the house ledger, bound in oxblood morocco',
    x: 472,
    y: 202,
    stand: { x: 472, y: 248 },
    value: 1400000,
    channel: 3.2,
    room: 'vault',
    colour: '#d9b36c',
  },
  {
    id: 'cameo',
    name: 'Cameo of the Grey Countess',
    subtitle: 'a cameo the size of a saucer, under glass',
    x: 1028,
    y: 624,
    stand: { x: 982, y: 624 },
    value: 420000,
    channel: 2.2,
    room: 'auction',
    colour: '#e8c8d8',
  },
  {
    id: 'chalice',
    name: 'The Silver Chalice',
    subtitle: 'hammered silver, four hundred years old',
    x: 540,
    y: 490,
    stand: { x: 540, y: 536 },
    value: 310000,
    channel: 2.4,
    room: 'gallery',
    colour: '#cfe0ef',
  },
  {
    id: 'miniature',
    name: 'Ivory Miniature',
    subtitle: 'a portrait no bigger than a thumb',
    x: 242,
    y: 172,
    stand: { x: 242, y: 210 },
    value: 185000,
    channel: 1.8,
    room: 'workshop',
    colour: '#f0e2c4',
  },
];

/**
 * Guard routes. Each guard walks its loop, pausing at every corner to turn and look, so the
 * cones sweep the room in a rhythm the thief can learn and time.
 */
export const GUARDS = [
  {
    id: 'marcel',
    name: 'Marcel',
    role: 'Gallery attendant',
    colour: '#e0768b',
    // The east half of the gallery and the door to the auction hall. The west aisle — the one
    // that runs past the workshop door — is left to CAM 01, which is the room's real lock.
    route: [
      { x: 640, y: 344, pause: 1.0 },
      { x: 884, y: 344, pause: 1.1 },
      { x: 884, y: 540, pause: 0.9 },
      { x: 640, y: 540, pause: 1.2 },
    ],
  },
  {
    id: 'odile',
    name: 'Odile',
    role: 'Night registrar',
    colour: '#8fb6e0',
    // The security office and east storage: she never enters the vault, which is CAM 02's room
    // alone — that is the puzzle the vault is built around.
    route: [
      { x: 700, y: 240, pause: 0.8 },
      { x: 880, y: 240, pause: 0.7 },
      { x: 900, y: 170, pause: 0.9 },
      { x: 1090, y: 170, pause: 0.8 },
      { x: 1180, y: 200, pause: 0.7 },
      { x: 1180, y: 270, pause: 0.9 },
      { x: 900, y: 270, pause: 0.6 },
      { x: 700, y: 270, pause: 0.8 },
    ],
  },
  {
    id: 'bruno',
    name: 'Bruno',
    role: 'Hall porter',
    colour: '#d8b46a',
    route: [
      { x: 140, y: 620, pause: 0.8 },
      { x: 500, y: 620, pause: 0.7 },
      { x: 860, y: 620, pause: 0.6 },
      { x: 975, y: 630, pause: 0.5 },
      { x: 975, y: 570, pause: 0.6 },
      { x: 1190, y: 570, pause: 0.8 },
      { x: 1190, y: 390, pause: 0.9 },
      { x: 975, y: 390, pause: 0.6 },
      { x: 975, y: 570, pause: 0.5 },
      { x: 975, y: 630, pause: 0.5 },
    ],
  },
];

/**
 * Camera mounts. A camera sweeps a narrow beam between `angle - sweep` and `angle + sweep`;
 * its beam is a full line of sight, so a thief who keeps a plinth between himself and the
 * lens walks past it, and the dead zone under the lens is where a bold one crosses.
 *
 * Each lens is aimed down a run of open floor: CAM 01 down the gallery's centre aisle from the
 * security door, CAM 02 east across the vault from its north-west corner, CAM 03 down into the
 * auction hall over the chair rows (chairs stop a body, never a gaze).
 */
export const CAMERAS = [
  { id: 'cam-gallery', name: 'CAM 01', x: 720, y: 312, angle: Math.PI / 2, sweep: 0.4, range: 300, halfAngle: 0.15, phase: 0.0 },
  { id: 'cam-vault', name: 'CAM 02', x: 318, y: 156, angle: 0, sweep: 0.54, range: 300, halfAngle: 0.16, phase: 1.7 },
  { id: 'cam-auction', name: 'CAM 03', x: 1160, y: 312, angle: 2.2, sweep: 0.4, range: 340, halfAngle: 0.15, phase: 3.1 },
];

/** The loading-bay shutter: shut until the ledger is whole, then the way out. */
export const EXIT = { x: 50, y: 466, w: 40, h: 80 };

/** Where the thief comes in. */
export const START = { x: 200, y: 508 };

/** Wall-mounted set dressing: paintings, sconces, the chandelier. Drawn, never solid. */
export const DECOR = [
  { kind: 'painting', x: 360, y: 108, w: 70, h: 26, colour: '#5c3a56' },
  { kind: 'painting', x: 760, y: 108, w: 70, h: 26, colour: '#3f4a68' },
  { kind: 'painting', x: 1000, y: 108, w: 70, h: 26, colour: '#6a4630' },
  { kind: 'painting', x: 320, y: 320, w: 26, h: 62, colour: '#4c3350' },
  { kind: 'sconce', x: 470, y: 308, r: 5 },
  { kind: 'sconce', x: 900, y: 308, r: 5 },
  { kind: 'sconce', x: 300, y: 400, r: 5 },
  { kind: 'chandelier', x: 628, y: 430, r: 34 },
  { kind: 'chandelier', x: 1090, y: 570, r: 26 },
  { kind: 'chandelier', x: 480, y: 196, r: 22 },
  { kind: 'rug', x: 404, y: 352, w: 456, h: 194 },
];

/** The house's own name, shown on the title card and stencilled on the shutter. */
export const HOUSE = 'THE VELVET LEDGER';
export const SUBTITLE = 'A quiet night at the auction house';
