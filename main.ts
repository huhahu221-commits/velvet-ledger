// The Velvet Ledger — hand-in program (Node 22, standard library only).
//
// The game is game/: plain static files a desktop browser loads with no build step and no
// network request. This program copies game/ and screenshots/ beside itself to the output
// directory and writes dossier.json with the vendored make.fun library, which is what the
// judge reads: a contact sheet of the screenshots plus an outline of the game's own source.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   MAKEFUN_OUTPUT_DIR=out1 node main.ts
//
// It refuses to hand in an entry the gate would refuse — a screenshot over 256 KiB or of the
// wrong shape, a game tree over the file cap — and names the file at fault, because a refusal
// found here costs a minute and one found by the grader costs a submission.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

/** The gate's own caps, in one place, so this program and the dossier agree. */
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/** The gate's screenshot shape: whole PNG or JPEG, long side at most 1280, short side at least 480. */
const SHOT = { min_count: 3, max_count: 4, long_max: 1280, short_min: 480 };

/**
 * The parts of the night's own source the gate counts as authored, so a refusal can say which
 * one is missing rather than only that something is. Kept as a list because the check is about
 * the entry being a game someone wrote, not about any single file being present.
 */
const REQUIRED_GAME_FILES = [
  'index.html',
  'src/main.js',
  'src/config.js',
  'src/level.js',
  'src/render.js',
];

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/**
 * Read a JPEG or PNG's pixel size straight from its header, without decoding the image. A
 * truncated or mislabelled file returns null, which is the gate's own verdict on it.
 */
function imageSize(bytes) {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { kind: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = bytes.readUInt16BE(offset + 2);
      // Every start-of-frame marker but the four that are not frames carries the size at +5.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { kind: 'jpeg', height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

/** Walk the game tree: count entries and bytes, and find anything the gate would refuse. */
function auditGame(dir) {
  let entries = 0;
  let bytes = 0;
  const problems = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const stats = statSync(path, { throwIfNoEntry: false });
      if (!stats) continue;
      entries += 1;
      if (stats.isSymbolicLink()) problems.push(`symlink in game/: ${path}`);
      else if (stats.isDirectory()) stack.push(path);
      else {
        bytes += stats.size;
        if (Buffer.byteLength(path) > CAPS.game_path_max_bytes) problems.push(`path over 1000 bytes: ${path}`);
      }
    }
  }
  return { entries, bytes, problems };
}

/** Check every screenshot against the gate's shape rules and name the one that fails. */
function auditShots(dir) {
  const problems = [];
  if (!existsSync(dir)) return { count: 0, problems: ['screenshots/ is missing'] };
  const names = readdirSync(dir).filter((name) => !name.startsWith('.')).sort();
  for (const name of names) {
    const path = join(dir, name);
    const stats = statSync(path);
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(name)) problems.push(`${name}: not a name the gate accepts`);
    if (stats.size > SHOT.max_bytes) problems.push(`${name}: ${stats.size} bytes, over 256 KiB`);
    const size = imageSize(readFileSync(path));
    if (!size) {
      problems.push(`${name}: not a whole PNG or JPEG`);
      continue;
    }
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    if (long > SHOT.long_max) problems.push(`${name}: ${size.width}x${size.height}, long side over 1280`);
    if (short < SHOT.short_min) problems.push(`${name}: ${size.width}x${size.height}, short side under 480`);
  }
  if (names.length < SHOT.min_count || names.length > SHOT.max_count) {
    problems.push(`${names.length} screenshots, the gate wants ${SHOT.min_count} to ${SHOT.max_count}`);
  }
  return { count: names.length, problems };
}

/**
 * Refuse early, with every fault listed, rather than hand the gate something it will bounce.
 */
function verify(problems, label) {
  if (problems.length === 0) return;
  console.error(`${label} would be refused by the gate:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  throw new Error(`${label} failed its own audit`);
}

/**
 * The game has to be a game: an entry whose tree is missing the files the night is made of is
 * refused here, where the path is still on screen, rather than at the gate.
 */
function auditRequired(dir) {
  const problems = [];
  for (const path of REQUIRED_GAME_FILES) {
    if (!existsSync(join(dir, path))) problems.push(`game/${path} is missing`);
  }
  return problems;
}

function main() {
  const gameDir = join(here, 'game');
  const shotsDir = join(here, 'screenshots');
  if (!existsSync(join(gameDir, 'index.html'))) throw new Error('game/index.html is missing');

  const game = auditGame(gameDir);
  if (game.entries > CAPS.game_max_files) game.problems.push(`${game.entries} entries, over ${CAPS.game_max_files}`);
  if (game.bytes > CAPS.game_max_bytes) game.problems.push(`${game.bytes} bytes, over the 48 MiB cap`);
  game.problems.push(...auditRequired(gameDir));
  verify(game.problems, 'game/');

  const shots = auditShots(shotsDir);
  verify(shots.problems, 'screenshots/');

  mkdirSync(outDir, { recursive: true });
  cpSync(gameDir, join(outDir, 'game'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

  const dossier = buildDossier(outDir, CAPS);
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  console.log(`game/        ${game.entries} entries, ${game.bytes} bytes`);
  console.log(`screenshots/ ${shots.count} files`);
  console.log(`dossier.json ${Buffer.byteLength(dossier)} bytes`);
  console.log(`written to   ${outDir}`);
}

main();
