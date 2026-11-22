// Drawing, and nothing else: world state in, pixels out. The 1280x720 stage is scaled to the
// window and centred, and the house itself is baked once into an offscreen canvas (floors,
// rugs, walls, furniture, gilding) so a frame only paints the live things: light pools, the
// guards' cones, the camera beams, the bodies, the cases and the HUD.
//
// The palette does the reading for the player: warm gold is what pays, amber is a guard's eye,
// cyan is a lens, red is the alarm, and the thief is the only cool white in the house.
import { ALARM, CAMERA, FIELD, FONT, GUARD, HUD, PALETTE, PLAYER } from './config.js';
import { conePoints, TAU, clamp, distance, lerp } from './geometry.js';
import { BLOCKERS, CAMERAS, DECOR, EXIT, ROOMS, SOLIDS, WALLS } from './level.js';
import { CASE_OPEN, CASE_TAKEN, CASE_WORKING } from './loot.js';
import { MOOD_CHASE, MOOD_SEARCH } from './guards.js';
import { THREAT_ALARM, THREAT_HUNTED, THREAT_WATCHFUL } from './alarm.js';
import { createHud, money } from './hud.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CAUGHT = 'caught';
export const SCREEN_ESCAPED = 'escaped';

/** Cone sampling: more rays when the cone is wide, so the edge stays a curve, not a fan of lines. */
const CONE_RAYS = 44;

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const hud = createHud(context);
  const view = { scale: 1, x: 0, y: 0 };
  const staticLayer = document.createElement('canvas');
  staticLayer.width = FIELD.width;
  staticLayer.height = FIELD.height;
  const backdrop = staticLayer.getContext('2d');
  let baked = false;

  function resize() {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  // ---------------------------------------------------------------- the static house

  function roundRect(ctx, x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /** Parquet: long planks in a herringbone, drawn faintly so it reads as grain, not pattern. */
  function parquet(ctx, room) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(room.x, room.y, room.w, room.h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,235,200,0.035)';
    ctx.lineWidth = 1;
    for (let y = room.y; y < room.y + room.h; y += 14) {
      ctx.beginPath();
      ctx.moveTo(room.x, y);
      ctx.lineTo(room.x + room.w, y);
      ctx.stroke();
      const offset = ((y / 14) % 2) * 46;
      for (let x = room.x + offset; x < room.x + room.w; x += 92) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 14);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function floor() {
    backdrop.fillStyle = '#151020';
    backdrop.fillRect(0, 0, FIELD.width, FIELD.height);

    for (const room of ROOMS) {
      const gradient = backdrop.createLinearGradient(room.x, room.y, room.x + room.w * 0.4, room.y + room.h);
      gradient.addColorStop(0, room.floor);
      gradient.addColorStop(1, shade(room.floor, -14));
      backdrop.fillStyle = gradient;
      backdrop.fillRect(room.x, room.y, room.w, room.h);
      parquet(backdrop, room);
    }

    // The gallery's runner and the vault's rug: velvet, with a woven border.
    for (const rug of DECOR.filter((piece) => piece.kind === 'rug')) {
      backdrop.save();
      backdrop.globalAlpha = 0.5;
      const gradient = backdrop.createLinearGradient(rug.x, rug.y, rug.x, rug.y + rug.h);
      gradient.addColorStop(0, '#5b2f44');
      gradient.addColorStop(0.5, '#4a2338');
      gradient.addColorStop(1, '#3a1a2c');
      backdrop.fillStyle = gradient;
      roundRect(backdrop, rug.x, rug.y, rug.w, rug.h, 4);
      backdrop.fill();
      backdrop.strokeStyle = 'rgba(217,179,108,0.24)';
      backdrop.lineWidth = 2;
      roundRect(backdrop, rug.x + 7, rug.y + 7, rug.w - 14, rug.h - 14, 3);
      backdrop.stroke();
      backdrop.restore();
    }

    // The vault's floor mosaic: the house's crest, laid in brass.
    const vault = ROOMS.find((room) => room.id === 'vault');
    if (vault) {
      backdrop.save();
      backdrop.translate(vault.x + vault.w / 2, vault.y + vault.h / 2);
      backdrop.strokeStyle = 'rgba(217,179,108,0.12)';
      backdrop.lineWidth = 1.5;
      for (let ring = 0; ring < 3; ring += 1) {
        backdrop.beginPath();
        backdrop.arc(0, 0, 26 + ring * 16, 0, TAU);
        backdrop.stroke();
      }
      backdrop.restore();
    }
  }

  /** Lighten or darken a hex colour by a percentage; used for the floors' gradients. */
  function shade(hex, amount) {
    const value = hex.replace('#', '');
    const r = clamp(parseInt(value.slice(0, 2), 16) + amount, 0, 255);
    const g = clamp(parseInt(value.slice(2, 4), 16) + amount, 0, 255);
    const b = clamp(parseInt(value.slice(4, 6), 16) + amount, 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  /** Walls read as stone with a lit top edge and a shadow cast onto the floor below. */
  function walls() {
    for (const wall of WALLS) {
      backdrop.save();
      backdrop.fillStyle = 'rgba(6,4,10,0.5)';
      roundRect(backdrop, wall.x + 3, wall.y + 4, wall.w, wall.h, 2);
      backdrop.fill();
      backdrop.restore();

      const gradient = backdrop.createLinearGradient(wall.x, wall.y, wall.x, wall.y + wall.h);
      gradient.addColorStop(0, wall.kind === 'outer' ? '#4a4166' : '#3c3452');
      gradient.addColorStop(0.45, wall.kind === 'outer' ? '#39314f' : '#2e2740');
      gradient.addColorStop(1, '#221c2e');
      backdrop.fillStyle = gradient;
      backdrop.fillRect(wall.x, wall.y, wall.w, wall.h);

      backdrop.strokeStyle = 'rgba(217,179,108,0.2)';
      backdrop.lineWidth = 1;
      backdrop.beginPath();
      backdrop.moveTo(wall.x, wall.y + 0.5);
      backdrop.lineTo(wall.x + wall.w, wall.y + 0.5);
      backdrop.stroke();

      if (wall.w > 40) {
        backdrop.strokeStyle = 'rgba(255,255,255,0.045)';
        for (let x = wall.x + 22; x < wall.x + wall.w - 10; x += 44) {
          backdrop.beginPath();
          backdrop.moveTo(x, wall.y + 3);
          backdrop.lineTo(x, wall.y + wall.h - 3);
          backdrop.stroke();
        }
      }
    }
  }

  function furniture() {
    for (const prop of SOLIDS) {
      if (prop.sight === undefined) continue; // walls already drawn
      const { x, y, w, h, kind } = prop;
      backdrop.save();
      backdrop.fillStyle = 'rgba(6,4,10,0.55)';
      roundRect(backdrop, x + 3, y + 4, w, h, 3);
      backdrop.fill();

      switch (kind) {
        case 'plinth': {
          // Marble plinth: a lit top, a dark body, a brass plaque on the front.
          const gradient = backdrop.createLinearGradient(x, y, x, y + h);
          gradient.addColorStop(0, '#6a5c7e');
          gradient.addColorStop(0.5, '#4a3f5c');
          gradient.addColorStop(1, '#332a44');
          backdrop.fillStyle = gradient;
          roundRect(backdrop, x, y, w, h, 3);
          backdrop.fill();
          backdrop.strokeStyle = 'rgba(243,233,214,0.16)';
          backdrop.lineWidth = 1;
          roundRect(backdrop, x + 0.5, y + 0.5, w - 1, h - 1, 3);
          backdrop.stroke();
          backdrop.fillStyle = 'rgba(217,179,108,0.5)';
          backdrop.fillRect(x + w / 2 - 8, y + h - 9, 16, 2.5);
          break;
        }
        case 'pedestal': {
          const gradient = backdrop.createRadialGradient(x + w / 2, y + h / 2, 4, x + w / 2, y + h / 2, w);
          gradient.addColorStop(0, '#5d4a6e');
          gradient.addColorStop(1, '#2b2338');
          backdrop.fillStyle = gradient;
          roundRect(backdrop, x, y, w, h, 5);
          backdrop.fill();
          backdrop.strokeStyle = 'rgba(217,179,108,0.5)';
          backdrop.lineWidth = 1.4;
          roundRect(backdrop, x + 3.5, y + 3.5, w - 7, h - 7, 4);
          backdrop.stroke();
          break;
        }
        case 'crate': {
          backdrop.fillStyle = '#3a2d26';
          roundRect(backdrop, x, y, w, h, 2);
          backdrop.fill();
          backdrop.strokeStyle = '#5b4636';
          backdrop.lineWidth = 2;
          backdrop.strokeRect(x + 4, y + 4, w - 8, h - 8);
          backdrop.beginPath();
          backdrop.moveTo(x + 4, y + 4);
          backdrop.lineTo(x + w - 4, y + h - 4);
          backdrop.moveTo(x + w - 4, y + 4);
          backdrop.lineTo(x + 4, y + h - 4);
          backdrop.stroke();
          break;
        }
        case 'pallet': {
          backdrop.fillStyle = '#463527';
          backdrop.fillRect(x, y, w, h);
          backdrop.strokeStyle = '#63492f';
          backdrop.lineWidth = 2;
          for (let i = 0; i < 4; i += 1) {
            backdrop.beginPath();
            backdrop.moveTo(x, y + 6 + i * (h / 4));
            backdrop.lineTo(x + w, y + 6 + i * (h / 4));
            backdrop.stroke();
          }
          break;
        }
        case 'desk': {
          backdrop.fillStyle = '#33202a';
          roundRect(backdrop, x, y, w, h, 3);
          backdrop.fill();
          backdrop.strokeStyle = 'rgba(217,179,108,0.28)';
          backdrop.lineWidth = 1;
          backdrop.stroke();
          // Papers and a lamp's pool on the blotter.
          backdrop.fillStyle = 'rgba(243,233,214,0.14)';
          backdrop.fillRect(x + 12, y + 12, 26, 18);
          backdrop.fillRect(x + 44, y + 16, 20, 14);
          backdrop.fillStyle = 'rgba(240,207,142,0.18)';
          backdrop.beginPath();
          backdrop.arc(x + w - 22, y + h / 2, 13, 0, TAU);
          backdrop.fill();
          break;
        }
        case 'cabinet': {
          backdrop.fillStyle = '#2b2536';
          roundRect(backdrop, x, y, w, h, 2);
          backdrop.fill();
          backdrop.strokeStyle = 'rgba(255,255,255,0.09)';
          backdrop.lineWidth = 1;
          for (let i = 1; i < 4; i += 1) {
            backdrop.beginPath();
            backdrop.moveTo(x + 3, y + i * (h / 4));
            backdrop.lineTo(x + w - 3, y + i * (h / 4));
            backdrop.stroke();
          }
          break;
        }
        case 'bench': {
          backdrop.fillStyle = '#3b2b23';
          roundRect(backdrop, x, y, w, h, 2);
          backdrop.fill();
          backdrop.fillStyle = 'rgba(243,233,214,0.1)';
          backdrop.fillRect(x + 8, y + 8, 30, 12);
          backdrop.fillStyle = 'rgba(111,216,255,0.16)';
          backdrop.beginPath();
          backdrop.arc(x + w - 24, y + h / 2, 9, 0, TAU);
          backdrop.fill();
          break;
        }
        case 'stand': {
          backdrop.fillStyle = '#453553';
          roundRect(backdrop, x, y, w, h, 4);
          backdrop.fill();
          backdrop.strokeStyle = 'rgba(217,179,108,0.42)';
          backdrop.lineWidth = 1.2;
          backdrop.stroke();
          break;
        }
        case 'case': {
          backdrop.fillStyle = '#2d2438';
          roundRect(backdrop, x, y, w, h, 2);
          backdrop.fill();
          backdrop.strokeStyle = 'rgba(111,216,255,0.24)';
          backdrop.lineWidth = 1;
          backdrop.stroke();
          break;
        }
        case 'boiler': {
          backdrop.fillStyle = '#3a3140';
          roundRect(backdrop, x, y, w, h, 5);
          backdrop.fill();
          backdrop.strokeStyle = 'rgba(255,179,71,0.3)';
          backdrop.lineWidth = 1.5;
          backdrop.beginPath();
          backdrop.arc(x + w / 2, y + h / 2, 13, 0, TAU);
          backdrop.stroke();
          break;
        }
        case 'pipes': {
          backdrop.fillStyle = '#2f2a3a';
          backdrop.fillRect(x, y, w, h);
          backdrop.strokeStyle = 'rgba(160,160,190,0.22)';
          backdrop.lineWidth = 4;
          for (let i = 0; i < 3; i += 1) {
            backdrop.beginPath();
            backdrop.moveTo(x + 8, y + 12 + i * 16);
            backdrop.lineTo(x + w - 8, y + 12 + i * 16);
            backdrop.stroke();
          }
          break;
        }
        case 'podium': {
          backdrop.fillStyle = '#4a3040';
          roundRect(backdrop, x, y, w, h, 3);
          backdrop.fill();
          backdrop.strokeStyle = 'rgba(217,179,108,0.4)';
          backdrop.lineWidth = 1.2;
          backdrop.stroke();
          backdrop.fillStyle = 'rgba(217,179,108,0.65)';
          backdrop.fillRect(x + w / 2 - 6, y + h - 10, 12, 3);
          break;
        }
        case 'chair': {
          // Velvet chairs, seen from above: a back and a seat, low enough to see over.
          backdrop.fillStyle = '#4d2b3c';
          roundRect(backdrop, x, y, w, h, 3);
          backdrop.fill();
          backdrop.fillStyle = 'rgba(0,0,0,0.28)';
          backdrop.fillRect(x + 3, y + h - 8, w - 6, 5);
          break;
        }
        default: {
          backdrop.fillStyle = '#3a3350';
          backdrop.fillRect(x, y, w, h);
        }
      }
      backdrop.restore();
    }
  }

  function dressing() {
    for (const piece of DECOR) {
      if (piece.kind === 'painting') {
        backdrop.fillStyle = 'rgba(217,179,108,0.55)';
        backdrop.fillRect(piece.x - 3, piece.y - 3, piece.w + 6, piece.h + 6);
        backdrop.fillStyle = piece.colour;
        backdrop.fillRect(piece.x, piece.y, piece.w, piece.h);
        backdrop.fillStyle = 'rgba(0,0,0,0.3)';
        backdrop.fillRect(piece.x, piece.y + piece.h * 0.6, piece.w, piece.h * 0.4);
      } else if (piece.kind === 'sconce') {
        const glow = backdrop.createRadialGradient(piece.x, piece.y, 0, piece.x, piece.y, 26);
        glow.addColorStop(0, 'rgba(255,214,150,0.5)');
        glow.addColorStop(1, 'rgba(255,214,150,0)');
        backdrop.fillStyle = glow;
        backdrop.beginPath();
        backdrop.arc(piece.x, piece.y, 26, 0, TAU);
        backdrop.fill();
        backdrop.fillStyle = '#f0cf8e';
        backdrop.beginPath();
        backdrop.arc(piece.x, piece.y, 3, 0, TAU);
        backdrop.fill();
      }
    }

    // The exit shutter, stencilled: the way in, and the way out.
    backdrop.save();
    backdrop.fillStyle = '#1a1424';
    backdrop.fillRect(EXIT.x, EXIT.y, EXIT.w, EXIT.h);
    backdrop.strokeStyle = 'rgba(217,179,108,0.3)';
    backdrop.lineWidth = 1;
    for (let i = 1; i < 8; i += 1) {
      backdrop.beginPath();
      backdrop.moveTo(EXIT.x + 2, EXIT.y + i * (EXIT.h / 8));
      backdrop.lineTo(EXIT.x + EXIT.w - 2, EXIT.y + i * (EXIT.h / 8));
      backdrop.stroke();
    }
    backdrop.save();
    backdrop.translate(EXIT.x + EXIT.w / 2, EXIT.y + EXIT.h / 2);
    backdrop.rotate(-Math.PI / 2);
    backdrop.fillStyle = 'rgba(217,179,108,0.55)';
    backdrop.font = `700 9px ${FONT.ui}`;
    backdrop.textAlign = 'center';
    backdrop.textBaseline = 'middle';
    backdrop.fillText('LOADING BAY', 0, 0);
    backdrop.restore();
    backdrop.restore();
  }

  function bake() {
    if (baked) return;
    floor();
    walls();
    furniture();
    dressing();
    baked = true;
  }

  // ---------------------------------------------------------------- live light

  function drawLightPools(state) {
    for (const piece of DECOR) {
      if (piece.kind !== 'chandelier') continue;
      const flicker = 0.94 + Math.sin(state.elapsed * 2.1 + piece.x) * 0.05;
      const glow = context.createRadialGradient(piece.x, piece.y, 6, piece.x, piece.y, piece.r * 5.2);
      glow.addColorStop(0, `rgba(255,214,150,${0.3 * flicker})`);
      glow.addColorStop(0.45, `rgba(255,190,120,${0.14 * flicker})`);
      glow.addColorStop(1, 'rgba(255,190,120,0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(piece.x, piece.y, piece.r * 5.2, 0, TAU);
      context.fill();
    }
  }

  function drawChandeliers(state) {
    for (const piece of DECOR) {
      if (piece.kind !== 'chandelier') continue;
      const flicker = 0.9 + Math.sin(state.elapsed * 2.7 + piece.x * 0.1) * 0.08;
      context.save();
      context.translate(piece.x, piece.y);
      context.strokeStyle = 'rgba(217,179,108,0.7)';
      context.lineWidth = 1.4;
      context.beginPath();
      context.arc(0, 0, piece.r, 0, TAU);
      context.stroke();
      for (let arm = 0; arm < 8; arm += 1) {
        const angle = (arm / 8) * TAU;
        const ax = Math.cos(angle) * piece.r;
        const ay = Math.sin(angle) * piece.r;
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(ax, ay);
        context.stroke();
        context.fillStyle = `rgba(255,232,190,${flicker})`;
        context.beginPath();
        context.arc(ax, ay, 2.6, 0, TAU);
        context.fill();
        const spark = context.createRadialGradient(ax, ay, 0, ax, ay, 11);
        spark.addColorStop(0, `rgba(255,214,150,${0.4 * flicker})`);
        spark.addColorStop(1, 'rgba(255,214,150,0)');
        context.fillStyle = spark;
        context.beginPath();
        context.arc(ax, ay, 11, 0, TAU);
        context.fill();
      }
      context.fillStyle = 'rgba(240,207,142,0.9)';
      context.beginPath();
      context.arc(0, 0, 4, 0, TAU);
      context.fill();
      context.restore();
    }
  }

  /**
   * A vision cone: a radial gradient from the eye outward, its far edge cut to the walls by
   * the ray cast, and its colour by the guard's mood. This is the shape the player reads.
   */
  function drawCone(ox, oy, angle, halfAngle, range, colour, alpha, hot) {
    const points = conePoints(ox, oy, angle, halfAngle, range, BLOCKERS, CONE_RAYS);
    context.save();
    context.beginPath();
    context.moveTo(ox, oy);
    for (let index = 0; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
    context.closePath();

    const gradient = context.createRadialGradient(ox, oy, 4, ox, oy, range);
    gradient.addColorStop(0, `rgba(${colour},${alpha * 0.95})`);
    gradient.addColorStop(0.55, `rgba(${colour},${alpha * 0.5})`);
    gradient.addColorStop(1, `rgba(${colour},0)`);
    context.fillStyle = gradient;
    context.fill();

    // The cone's own edge, brighter at the tip: the guard's gaze has a lip you can see.
    context.strokeStyle = `rgba(${colour},${alpha * (hot ? 1.5 : 0.85)})`;
    context.lineWidth = hot ? 1.6 : 1;
    context.stroke();
    context.restore();
  }

  function drawGuards(world) {
    for (const guard of world.guards) {
      const chasing = guard.mood === MOOD_CHASE;
      const searching = guard.mood === MOOD_SEARCH;
      const base = chasing ? '255,77,99' : searching ? '255,179,71' : '240,207,142';
      const alpha = chasing ? 0.34 : searching ? 0.26 : 0.2;
      const pulse = chasing ? 0.85 + Math.sin(world.state.elapsed * 12) * 0.15 : 1;
      drawCone(guard.x, guard.y, guard.angle, GUARD.halfAngle, GUARD.range, base, alpha * pulse, chasing);

      // The body: a coat, a shoulder line, and the eye at the front of the head.
      context.save();
      context.translate(guard.x, guard.y);
      context.fillStyle = 'rgba(4,2,8,0.5)';
      context.beginPath();
      context.ellipse(2, 4, 13, 10, 0, 0, TAU);
      context.fill();

      context.rotate(guard.angle);
      context.fillStyle = guard.colour;
      context.beginPath();
      context.arc(0, 0, 9.5, 0, TAU);
      context.fill();
      context.fillStyle = 'rgba(10,6,16,0.55)';
      context.beginPath();
      context.arc(2.5, 0, 6.2, 0, TAU);
      context.fill();
      context.fillStyle = '#f3e9d6';
      context.beginPath();
      context.arc(6.4, 0, 2.6, 0, TAU);
      context.fill();
      // A peaked cap's brim, so the facing is unmistakable at a glance.
      context.strokeStyle = 'rgba(10,6,16,0.8)';
      context.lineWidth = 2.4;
      context.beginPath();
      context.arc(0, 0, 9.5, -0.55, 0.55);
      context.stroke();
      context.restore();

      // Suspicion, drawn as a rising ring around the guard: the tell before the chase.
      if (guard.suspicion > 0.04 && !chasing) {
        context.save();
        context.strokeStyle = `rgba(255,179,71,${0.35 + guard.suspicion * 0.6})`;
        context.lineWidth = 2.2;
        context.beginPath();
        context.arc(guard.x, guard.y, 15, -Math.PI / 2, -Math.PI / 2 + TAU * guard.suspicion);
        context.stroke();
        context.restore();
      }
      if (chasing) {
        context.save();
        context.fillStyle = `rgba(255,77,99,${0.7 + Math.sin(world.state.elapsed * 14) * 0.3})`;
        context.font = `700 10px ${FONT.ui}`;
        context.textAlign = 'center';
        context.fillText('!', guard.x, guard.y - 17);
        context.restore();
      }
    }
  }

  function drawCameras(world) {
    for (const camera of world.cameras) {
      const jammed = camera.jam > 0;
      const watching = camera.watching;
      const colour = jammed ? '120,120,140' : watching ? '255,77,99' : '111,216,255';
      if (!jammed) {
        // A camera's beam is a long thin wedge, dimmer than a guard's but reaching further.
        drawCone(camera.x, camera.y, camera.angle, camera.halfAngle, camera.range, colour, watching ? 0.24 : 0.1, watching);
      }

      context.save();
      context.translate(camera.x, camera.y);
      // Housing: a bracket, then the lens body turned along the beam.
      context.fillStyle = 'rgba(6,4,10,0.6)';
      context.beginPath();
      context.arc(1.5, 2.5, 9, 0, TAU);
      context.fill();
      context.fillStyle = '#2b2436';
      context.beginPath();
      context.arc(0, 0, 8, 0, TAU);
      context.fill();
      context.strokeStyle = `rgba(${colour},0.9)`;
      context.lineWidth = 1.4;
      context.stroke();
      context.rotate(camera.angle);
      context.fillStyle = jammed ? '#3a3a46' : '#4a4058';
      roundRect(context, 2, -5, 13, 10, 2);
      context.fill();
      context.fillStyle = `rgba(${colour},${watching ? 0.95 : 0.7})`;
      context.beginPath();
      context.arc(15, 0, 2.6, 0, TAU);
      context.fill();
      context.restore();

      // Its lamp: a slow blink while it watches, dark when jammed, a red tell when it sees.
      const blink = 0.5 + Math.sin(world.state.elapsed * (watching ? 9 : 3)) * 0.5;
      context.fillStyle = jammed ? 'rgba(90,90,110,0.5)' : `rgba(255,77,99,${0.25 + blink * 0.6})`;
      context.beginPath();
      context.arc(camera.x, camera.y, 2, 0, TAU);
      context.fill();

      // The label, so the frame names what the thing is.
      context.save();
      context.font = `600 8px ${FONT.mono}`;
      context.fillStyle = jammed ? 'rgba(154,143,174,0.5)' : `rgba(${colour},0.72)`;
      context.textAlign = 'center';
      context.fillText(jammed ? `${camera.name} OFFLINE` : camera.name, camera.x, camera.y - 13);
      context.restore();
    }
  }

  // ---------------------------------------------------------------- bodies and loot

  /**
   * The thief, drawn to be unmistakable at a glance and at contact-sheet size: a long pale-lined
   * coat, a cream head with the mask's dark band across it, and a gold take at the belt. The
   * house is purple and gold, so the thief's own colour is a cool near-white — he is the only
   * cool thing on the floor, which is what makes him findable in a single look.
   */
  function drawThief(world) {
    const player = world.player;
    const bob = Math.sin(world.state.elapsed * 9) * player.bob * 0.7;
    context.save();
    context.fillStyle = 'rgba(3,2,6,0.6)';
    context.beginPath();
    context.ellipse(player.x + 2, player.y + 5, 13, 9, 0, 0, TAU);
    context.fill();
    context.restore();

    context.save();
    context.translate(player.x, player.y + bob);
    context.rotate(player.angle);

    // The coat: a wide body with a pale rim, so the silhouette survives a dark floor.
    context.fillStyle = '#20203a';
    context.beginPath();
    context.ellipse(-1.5, 0, 12, 9.5, 0, 0, TAU);
    context.fill();
    context.strokeStyle = 'rgba(226,236,248,0.95)';
    context.lineWidth = 2;
    context.stroke();

    // A shoulder line and the coat's opening, so it reads as a figure and not an oval.
    context.strokeStyle = 'rgba(226,236,248,0.45)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(-4, -8.4);
    context.lineTo(-4, 8.4);
    context.stroke();

    // The head, then the mask band across the eyes: the thief's own tell.
    context.fillStyle = '#e8eef8';
    context.beginPath();
    context.arc(6.5, 0, 5.6, 0, TAU);
    context.fill();
    context.fillStyle = '#12101c';
    context.fillRect(5.4, -5.4, 4.4, 10.8);
    context.fillStyle = 'rgba(243,233,214,0.98)';
    context.fillRect(8.6, -3.2, 1.5, 2);
    context.fillRect(8.6, 1.2, 1.5, 2);

    // The bag, which grows with the take.
    if (player.carrying > 0) {
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.arc(-9, -5, 2.8 + player.carrying * 0.8, 0, TAU);
      context.fill();
      context.strokeStyle = 'rgba(20,14,28,0.85)';
      context.lineWidth = 1;
      context.stroke();
    }
    context.restore();

    // The gait ring: cyan for a sneak, amber for a sprint, so the cost of a move is visible.
    if (player.moving) {
      const colour = player.gait === 'sneak' ? '89,214,208' : player.gait === 'sprint' ? '255,179,71' : '207,216,230';
      context.save();
      context.strokeStyle = `rgba(${colour},0.4)`;
      context.lineWidth = 1.2;
      context.beginPath();
      context.arc(player.x, player.y, 17, 0, TAU);
      context.stroke();
      context.restore();
    }
  }

  function drawNoise(world) {
    const noise = world.state.noise;
    if (!noise) return;
    const life = clamp(noise.life / Math.max(0.001, noise.max), 0, 1);
    context.save();
    context.strokeStyle = `rgba(240,207,142,${0.55 * life})`;
    context.lineWidth = 2;
    const ring = noise.radius * (1 - life);
    context.beginPath();
    context.arc(noise.x, noise.y, Math.max(4, ring), 0, TAU);
    context.stroke();
    context.strokeStyle = `rgba(240,207,142,${0.25 * life})`;
    context.beginPath();
    context.arc(noise.x, noise.y, Math.max(2, ring * 0.55), 0, TAU);
    context.stroke();
    context.restore();
  }

  /** A display case: a glass lid over the piece, with the work ring while it is being opened. */
  function drawLoot(world) {
    for (const item of world.loot) {
      if (item.state === CASE_TAKEN) {
        // An empty case: the lid open, the velvet bare.
        context.save();
        context.fillStyle = 'rgba(255,255,255,0.04)';
        context.beginPath();
        context.arc(item.x, item.y, 13, 0, TAU);
        context.fill();
        context.strokeStyle = 'rgba(217,179,108,0.25)';
        context.lineWidth = 1;
        context.beginPath();
        context.arc(item.x, item.y, 13, 0, TAU);
        context.stroke();
        context.restore();
        continue;
      }

      const pulse = 0.6 + Math.sin(world.state.elapsed * 2.4 + item.x * 0.01) * 0.4;
      const glowRadius = item.id === 'ledger' ? 46 : 32;
      const glow = context.createRadialGradient(item.x, item.y, 2, item.x, item.y, glowRadius);
      glow.addColorStop(0, `rgba(240,207,142,${0.32 * pulse + 0.1})`);
      glow.addColorStop(1, 'rgba(240,207,142,0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(item.x, item.y, glowRadius, 0, TAU);
      context.fill();

      // The glass: a cool pane over a warm piece, with a highlight across the corner.
      context.save();
      context.fillStyle = 'rgba(12,10,20,0.55)';
      context.beginPath();
      context.arc(item.x, item.y, 16, 0, TAU);
      context.fill();
      context.strokeStyle = item.state === CASE_OPEN ? 'rgba(240,207,142,0.95)' : 'rgba(207,224,239,0.5)';
      context.lineWidth = 1.6;
      context.beginPath();
      context.arc(item.x, item.y, 16, 0, TAU);
      context.stroke();
      context.fillStyle = item.colour;
      if (item.id === 'ledger') {
        roundRect(context, item.x - 8, item.y - 6, 16, 12, 1.5);
        context.fill();
        context.fillStyle = 'rgba(20,10,16,0.6)';
        context.fillRect(item.x - 6, item.y - 4, 12, 1.4);
        context.fillRect(item.x - 6, item.y - 1, 12, 1.4);
        context.fillRect(item.x - 6, item.y + 2, 12, 1.4);
      } else if (item.id === 'cameo') {
        context.beginPath();
        context.ellipse(item.x, item.y, 6.5, 8, 0.2, 0, TAU);
        context.fill();
        context.fillStyle = 'rgba(120,70,90,0.75)';
        context.beginPath();
        context.arc(item.x, item.y - 1, 3.4, 0, TAU);
        context.fill();
      } else if (item.id === 'chalice') {
        context.beginPath();
        context.moveTo(item.x - 6, item.y - 6);
        context.lineTo(item.x + 6, item.y - 6);
        context.lineTo(item.x + 3, item.y + 1);
        context.lineTo(item.x + 1.6, item.y + 6);
        context.lineTo(item.x - 1.6, item.y + 6);
        context.lineTo(item.x - 3, item.y + 1);
        context.closePath();
        context.fill();
      } else {
        roundRect(context, item.x - 5, item.y - 7, 10, 14, 2);
        context.fill();
      }
      context.strokeStyle = 'rgba(255,255,255,0.4)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(item.x - 9, item.y - 9);
      context.lineTo(item.x - 3, item.y - 13);
      context.stroke();
      context.restore();

      if (item.state === CASE_WORKING) {
        context.save();
        context.strokeStyle = 'rgba(20,14,28,0.8)';
        context.lineWidth = 3.4;
        context.beginPath();
        context.arc(item.x, item.y, 21, -Math.PI / 2, -Math.PI / 2 + TAU);
        context.stroke();
        context.strokeStyle = PALETTE.goldBright;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(item.x, item.y, 21, -Math.PI / 2, -Math.PI / 2 + TAU * item.progress);
        context.stroke();
        context.restore();
      }
      if (item.state === CASE_OPEN) {
        context.save();
        context.strokeStyle = `rgba(240,207,142,${0.5 + Math.sin(world.state.elapsed * 6) * 0.4})`;
        context.lineWidth = 1.4;
        context.beginPath();
        context.arc(item.x, item.y, 24, 0, TAU);
        context.stroke();
        context.fillStyle = PALETTE.cream;
        context.font = `700 8px ${FONT.ui}`;
        context.textAlign = 'center';
        context.fillText('TAKE', item.x, item.y + 36);
        context.restore();
      }
    }
  }

  function drawExit(world) {
    const open = world.summary().exitOpen;
    const cx = EXIT.x + EXIT.w / 2;
    const cy = EXIT.y + EXIT.h / 2;
    context.save();
    if (open) {
      const glow = context.createRadialGradient(cx, cy, 4, cx, cy, 78);
      glow.addColorStop(0, 'rgba(240,207,142,0.3)');
      glow.addColorStop(1, 'rgba(240,207,142,0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(cx, cy, 78, 0, TAU);
      context.fill();
      context.strokeStyle = `rgba(240,207,142,${0.6 + Math.sin(world.state.elapsed * 3) * 0.3})`;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(cx, cy, 40, 0, TAU);
      context.stroke();
      context.fillStyle = PALETTE.goldBright;
      context.font = `700 10px ${FONT.ui}`;
      context.textAlign = 'center';
      context.fillText('EXIT', cx, cy - 48);
    } else {
      context.fillStyle = 'rgba(154,143,174,0.5)';
      context.font = `600 8px ${FONT.ui}`;
      context.textAlign = 'center';
      context.fillText('SHUTTER SEALED', cx, cy + 4);
    }
    context.restore();
  }

  function drawAim(world, aim) {
    if (!aim) return;
    const focus = world.state.focus;
    if (!focus) return;
    context.save();
    context.strokeStyle = 'rgba(240,207,142,0.4)';
    context.setLineDash([3, 4]);
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(world.player.x, world.player.y);
    context.lineTo(focus.x, focus.y);
    context.stroke();
    context.restore();
  }

  /** The darkness around the house, and the vignette that keeps the eye on the floor. Soft
   *  enough that a screenshot still reads at contact-sheet size: the house is lit, not lost. */
  function vignette() {
    const gradient = context.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 300, FIELD.width / 2, FIELD.height / 2, 820);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.72, 'rgba(4,2,8,0.14)');
    gradient.addColorStop(1, 'rgba(3,1,6,0.52)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function scanlines() {
    context.save();
    context.globalAlpha = 0.018;
    context.fillStyle = '#f3e9d6';
    for (let y = 0; y < FIELD.height; y += 3) context.fillRect(0, y, FIELD.width, 1);
    context.restore();
  }

  // ---------------------------------------------------------------- screens

  function panel(title, kicker, lines, prompt, accent = PALETTE.gold) {
    const width = 640;
    const height = 300 + lines.length * 26;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.save();
    context.fillStyle = 'rgba(6,4,11,0.82)';
    roundRect(context, x, y, width, height, 8);
    context.fill();
    context.strokeStyle = 'rgba(217,179,108,0.5)';
    context.lineWidth = 1.2;
    roundRect(context, x + 0.5, y + 0.5, width - 1, height - 1, 8);
    context.stroke();
    context.strokeStyle = 'rgba(217,179,108,0.22)';
    roundRect(context, x + 9, y + 9, width - 18, height - 18, 5);
    context.stroke();

    context.textAlign = 'center';
    context.fillStyle = accent;
    context.font = `600 10px ${FONT.ui}`;
    context.fillText(kicker.toUpperCase(), FIELD.width / 2, y + 52);
    context.fillStyle = PALETTE.cream;
    context.font = `700 44px ${FONT.display}`;
    context.fillText(title, FIELD.width / 2, y + 104);
    context.strokeStyle = 'rgba(217,179,108,0.4)';
    context.beginPath();
    context.moveTo(FIELD.width / 2 - 110, y + 124);
    context.lineTo(FIELD.width / 2 + 110, y + 124);
    context.stroke();

    context.font = `400 13px ${FONT.ui}`;
    lines.forEach((line, index) => {
      context.fillStyle = index === 0 ? PALETTE.cream : PALETTE.muted;
      context.fillText(line, FIELD.width / 2, y + 158 + index * 26);
    });
    context.fillStyle = accent;
    context.font = `600 13px ${FONT.ui}`;
    context.fillText(prompt, FIELD.width / 2, y + height - 34);
    context.restore();
  }

  const TITLE_LINES = [
    'Four pieces are on the block tonight. One of them is the house\'s own ledger.',
    'Walk, run or creep. Watch the cones, time the sweeps, work the cases.',
    'Take the Ledger and the loading-bay shutter opens. Take everything else first.',
  ];

  function drawTitle(state, best, world) {
    context.fillStyle = 'rgba(5,3,9,0.6)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    // The house's crest, big, above the card.
    context.save();
    context.translate(FIELD.width / 2, 118);
    context.strokeStyle = 'rgba(217,179,108,0.55)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, -46);
    context.lineTo(38, -24);
    context.lineTo(38, 18);
    context.lineTo(0, 46);
    context.lineTo(-38, 18);
    context.lineTo(-38, -24);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.arc(0, 0, 15, 0, TAU);
    context.stroke();
    context.fillStyle = 'rgba(217,179,108,0.85)';
    context.beginPath();
    context.arc(0, 0, 5, 0, TAU);
    context.fill();
    context.restore();

    panel('The Velvet Ledger', 'a heist in one night', TITLE_LINES, 'PRESS ENTER OR CLICK TO BEGIN', PALETTE.gold);

    context.save();
    context.textAlign = 'center';
    context.font = `400 11px ${FONT.ui}`;
    context.fillStyle = 'rgba(154,143,174,0.9)';
    context.fillText(`BEST NIGHT ${money(best)}  ·  WASD TO MOVE  ·  SHIFT RUNS  ·  CTRL SNEAKS`, FIELD.width / 2, FIELD.height - 46);
    context.restore();
  }

  function drawPaused() {
    context.fillStyle = 'rgba(5,3,9,0.66)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    panel('Paused', 'the house waits', ['The guards hold their breath. The lenses hold their sweep.'], 'PRESS P TO RETURN', PALETTE.gold);
  }

  function drawEnd(world, screen, best) {
    const escaped = screen === SCREEN_ESCAPED;
    context.fillStyle = escaped ? 'rgba(4,8,6,0.62)' : 'rgba(12,3,7,0.7)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    const score = world.state.score;
    const taken = world.summary().taken;
    const lines = escaped
      ? [
          world.state.endReason,
          `${taken} of 4 pieces lifted  ·  ${money(score)} on the night`,
          score >= best ? 'That is the best night yet.' : `Best night ${money(best)}.`,
        ]
      : [
          world.state.endReason,
          `${taken} of 4 pieces lifted  ·  ${money(score)} recovered by the house`,
          'A caught thief keeps nothing. The Ledger goes back on the block.',
        ];
    panel(escaped ? 'Clean Away' : 'Caught', escaped ? 'the shutter closes behind you' : 'the house has you', lines, 'PRESS ENTER TO TRY ANOTHER NIGHT', escaped ? PALETTE.safe : PALETTE.danger);
  }

  // ---------------------------------------------------------------- the frame

  function draw(world, screen, best, aim) {
    bake();
    const state = world.state;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    context.drawImage(staticLayer, 0, 0);
    drawLightPools(state);

    if (screen === SCREEN_TITLE) {
      drawCameras(world);
      drawGuards(world);
      drawLoot(world);
      drawThief(world);
      drawExit(world);
      drawChandeliers(state);
      vignette();
      scanlines();
      hud.draw(world.summary(), world, 0, best);
      drawTitle(state, best, world);
      return;
    }

    drawCameras(world);
    drawNoise(world);
    drawLoot(world);
    drawExit(world);
    drawGuards(world);
    drawAim(world, aim);
    drawThief(world);
    drawChandeliers(state);
    vignette();
    scanlines();

    hud.draw(world.summary(), world, state.score, best);

    // The alarm's own wash: the frame bleeds red as the meter climbs.
    const alarmValue = world.alarm.value;
    if (alarmValue > 30) {
      const intensity = Math.min(0.3, (alarmValue - 30) / 70 * 0.3);
      const pulse = 0.75 + Math.sin(state.elapsed * 7) * 0.25;
      const wash = context.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 200, FIELD.width / 2, FIELD.height / 2, 720);
      wash.addColorStop(0, 'rgba(200,69,90,0)');
      wash.addColorStop(1, `rgba(200,69,90,${intensity * pulse})`);
      context.fillStyle = wash;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }

    if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_CAUGHT || screen === SCREEN_ESCAPED) drawEnd(world, screen, best);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize, hud };
}
