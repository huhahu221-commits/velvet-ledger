// The HUD: the alarm meter across the top, the catalogue's four pips, the night's take, the
// tool charges and the ticker line along the footer. Everything is drawn on the same 1280x720
// stage as the house, so it scales with the window and never covers the floor the thief needs.
// Numbers are formatted here and nowhere else.
import { ALARM, FIELD, FONT, HUD, PALETTE } from './config.js';
import { CASE_OPEN, CASE_SEALED, CASE_TAKEN, CASE_WORKING } from './loot.js';
import { THREAT_ALARM, THREAT_HUNTED, THREAT_WATCHFUL } from './alarm.js';

export const STRIP = { x: 20, y: 8, w: FIELD.width - 40, h: 72 };
export const FOOTER_Y = 694;

const THREAT_TEXT = {
  calm: ['QUIET', PALETTE.safe],
  watchful: ['WATCHFUL', PALETTE.gold],
  hunted: ['HUNTED', PALETTE.amber],
  alarm: ['ALARM', PALETTE.danger],
};

/** $1,715,000 — grouped, no decimals, because a heist counts in whole notes. */
export function money(value) {
  const digits = Math.round(value).toString();
  let out = '';
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) out += ',';
    out += digits[index];
  }
  return '$' + out;
}

/** 3:07 — a night's clock, minutes and seconds. */
export function clock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

function roundRect(context, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.quadraticCurveTo(x + w, y, x + w, y + r);
  context.lineTo(x + w, y + h - r);
  context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  context.lineTo(x + r, y + h);
  context.quadraticCurveTo(x, y + h, x, y + h - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

export function createHud(context) {
  const fonts = new Map();
  function font(size, family = FONT.ui, weight = '400') {
    const key = `${weight} ${size} ${family}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${family}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, colour, align = 'left', family = FONT.ui, weight = '400') {
    context.font = font(size, family, weight);
    context.fillStyle = colour;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function spaced(value, x, y, size, colour, tracking, align = 'left', weight = '600') {
    context.font = font(size, FONT.ui, weight);
    context.fillStyle = colour;
    context.textAlign = 'left';
    let width = 0;
    for (const character of value) width += context.measureText(character).width + tracking;
    let cursor = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    for (const character of value) {
      context.fillText(character, cursor, y);
      cursor += context.measureText(character).width + tracking;
    }
  }

  /** The brass plate the whole strip sits on. */
  function plate() {
    context.save();
    const gradient = context.createLinearGradient(0, STRIP.y, 0, STRIP.y + STRIP.h);
    gradient.addColorStop(0, 'rgba(24,17,33,0.96)');
    gradient.addColorStop(1, 'rgba(14,10,20,0.96)');
    roundRect(context, STRIP.x, STRIP.y, STRIP.w, STRIP.h, 6);
    context.fillStyle = gradient;
    context.fill();
    context.strokeStyle = 'rgba(217,179,108,0.34)';
    context.lineWidth = 1;
    context.stroke();
    context.restore();
  }

  function crest(x, y) {
    context.save();
    context.translate(x, y);
    context.strokeStyle = PALETTE.gold;
    context.lineWidth = 1.4;
    context.beginPath();
    context.moveTo(0, -13);
    context.lineTo(11, -7);
    context.lineTo(11, 5);
    context.lineTo(0, 13);
    context.lineTo(-11, 5);
    context.lineTo(-11, -7);
    context.closePath();
    context.stroke();
    context.fillStyle = PALETTE.gold;
    context.beginPath();
    context.arc(0, 0, 3.1, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  /**
   * The alarm meter: eight segments that light in order, a moving needle, the percentage and
   * the house's word for how bad it is. It is the biggest thing on the strip on purpose.
   *
   * The threat word sits beside the ALARM label rather than past the trough's right end: the
   * catalogue starts a few pixels beyond that, and a word drawn there reads as one string with
   * "CATALOGUE" — "QUIET TALOGUE" — which is the kind of thing a screenshot makes permanent.
   */
  function alarmMeter(alarm, threat) {
    const x = 330;
    // The plate starts at STRIP.y, so the meter's own y has to clear it: at 22 the label's
    // cap-height broke the plate's top edge and read as clipped.
    const y = 30;
    const width = 372;
    const height = 18;
    const ratio = Math.min(1, alarm / ALARM.max);
    const [word, colour] = THREAT_TEXT[threat] ?? THREAT_TEXT.calm;

    // The word sits on its own row, under the trough's left end, so nothing can collide with
    // the ALARM label above it or the catalogue to its right.
    spaced('ALARM', x, y - 6, 9.5, PALETTE.muted, 2.1, 'left', '700');
    text(`${Math.round(alarm)}%`, x + width, y - 6, 10, colour, 'right', FONT.mono, '600');

    // The trough, then the eight segments, then the needle.
    roundRect(context, x, y, width, height, 3);
    context.fillStyle = 'rgba(255,255,255,0.045)';
    context.fill();
    context.strokeStyle = 'rgba(217,179,108,0.22)';
    context.lineWidth = 1;
    context.stroke();

    const segments = 8;
    const gap = 3;
    const cell = (width - gap * (segments - 1)) / segments;
    for (let index = 0; index < segments; index += 1) {
      const from = index / segments;
      const filled = ratio > from + 0.001;
      const sx = x + index * (cell + gap);
      let colourForSegment = PALETTE.safe;
      if (from >= 0.72) colourForSegment = PALETTE.danger;
      else if (from >= 0.45) colourForSegment = PALETTE.amber;
      else if (from >= 0.22) colourForSegment = PALETTE.gold;
      context.fillStyle = filled ? colourForSegment : 'rgba(255,255,255,0.055)';
      roundRect(context, sx, y + 3, cell, height - 6, 2);
      context.fill();
    }

    // The needle, so a hair's movement is visible.
    const nx = x + width * ratio;
    context.save();
    context.strokeStyle = 'rgba(255,248,232,0.9)';
    context.lineWidth = 1.6;
    context.beginPath();
    context.moveTo(nx, y - 3);
    context.lineTo(nx, y + height + 3);
    context.stroke();
    context.restore();

    // The word, and a row of notches under the trough at the meter's own thresholds.
    for (const mark of [26, 62, 100]) {
      const mx = x + width * (mark / ALARM.max);
      context.fillStyle = 'rgba(243,233,214,0.3)';
      context.fillRect(mx, y + height, 1, 3);
    }
    // The threat word on its own line below the trough: the row above is shared with the
    // percentage, and the strip's right-hand rows belong to the catalogue and the take, so
    // this is the one place a word of any length sits alone.
    text(word, x, y + height + 17, 11, colour, 'left', FONT.ui, '700');
    return x + width;
  }

  /** Four pips: sealed is a hollow diamond, working a half one, open a bright one, taken a tick. */
  function catalogue(loot, x, y) {
    spaced('CATALOGUE', x, y - 6, 9.5, PALETTE.muted, 2.1, 'left', '700');
    let taken = 0;
    for (let index = 0; index < loot.length; index += 1) {
      const item = loot[index];
      const cx = x + 7 + index * 30;
      const cy = y + 10;
      const isTaken = item.state === CASE_TAKEN;
      if (isTaken) taken += 1;
      context.save();
      context.translate(cx, cy);
      context.rotate(Math.PI / 4);
      const size = 7.5;
      context.beginPath();
      context.rect(-size / 2, -size / 2, size, size);
      if (isTaken) {
        context.fillStyle = item.colour;
        context.fill();
        context.strokeStyle = PALETTE.cream;
        context.lineWidth = 1.2;
        context.stroke();
      } else if (item.state === CASE_OPEN) {
        context.fillStyle = item.colour;
        context.globalAlpha = 0.85;
        context.fill();
        context.globalAlpha = 1;
        context.strokeStyle = PALETTE.cream;
        context.lineWidth = 1.2;
        context.stroke();
      } else if (item.state === CASE_WORKING) {
        context.strokeStyle = item.colour;
        context.lineWidth = 1.6;
        context.stroke();
        context.fillStyle = item.colour;
        context.fillRect(-size / 2, size / 2 - size * item.progress, size, size * item.progress);
      } else if (item.state === CASE_SEALED) {
        context.strokeStyle = 'rgba(243,233,214,0.34)';
        context.lineWidth = 1.2;
        context.stroke();
      }
      context.restore();
    }
    text(`${taken}/4`, x + 130, y + 14, 13, taken === 4 ? PALETTE.gold : PALETTE.cream, 'left', FONT.mono, '600');
    return x + 130;
  }

  /** The take, the tool charges and the clock. */
  function ledger(state, tools, score, best, x, y) {
    spaced('TAKE', x, y - 6, 9.5, PALETTE.muted, 2.1, 'left', '700');
    text(money(score), x, y + 15, 17, PALETTE.goldBright, 'left', FONT.mono, '600');
    text(`BEST ${money(best)}`, x + 108, y + 15, 9.5, PALETTE.muted, 'left', FONT.mono, '400');

    spaced('KIT', x + 216, y - 6, 9.5, PALETTE.muted, 2.1, 'left', '700');
    // Two rows of little tokens: coins for the noise makers, blades for the cutters.
    for (let index = 0; index < 3; index += 1) {
      const cx = x + 222 + index * 15;
      const live = index < tools.noiseCharges;
      context.beginPath();
      context.arc(cx, y + 8, 4.6, 0, Math.PI * 2);
      context.fillStyle = live ? PALETTE.gold : 'rgba(255,255,255,0.08)';
      context.fill();
      context.strokeStyle = live ? 'rgba(243,233,214,0.6)' : 'rgba(255,255,255,0.12)';
      context.lineWidth = 1;
      context.stroke();
    }
    for (let index = 0; index < 2; index += 1) {
      const bx = x + 276 + index * 15;
      const live = index < tools.cutters;
      context.save();
      context.translate(bx, y + 8);
      context.rotate(-0.5);
      context.fillStyle = live ? PALETTE.cyan : 'rgba(255,255,255,0.08)';
      context.fillRect(-1.4, -5.4, 2.8, 10.8);
      context.restore();
    }
    text(clock(state.elapsed), x + 330, y + 15, 12, PALETTE.muted, 'left', FONT.mono, '500');
  }

  /** The footer: what just happened on the left, the keys that do it on the right. */
  function footer(state, exitOpen) {
    context.save();
    context.fillStyle = 'rgba(10,7,15,0.92)';
    context.fillRect(0, FOOTER_Y - 6, FIELD.width, FIELD.height - FOOTER_Y + 6);
    context.strokeStyle = 'rgba(217,179,108,0.16)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, FOOTER_Y - 6.5);
    context.lineTo(FIELD.width, FOOTER_Y - 6.5);
    context.stroke();
    context.restore();

    // The ticker, with a small gold rule that carries the house's mood.
    const tint = exitOpen ? PALETTE.goldBright : PALETTE.muted;
    context.fillStyle = exitOpen ? PALETTE.gold : 'rgba(217,179,108,0.4)';
    context.fillRect(22, FOOTER_Y + 4, 3, 12);
    text(state.ticker, 34, FOOTER_Y + 14, 12.5, tint, 'left', FONT.ui, '400');

    const legend = 'WASD move  ·  SHIFT run  ·  CTRL sneak  ·  E work  ·  F take  ·  Q coin  ·  R cutter  ·  G jam  ·  P pause';
    text(legend, FIELD.width - 22, FOOTER_Y + 14, 10.5, 'rgba(154,143,174,0.85)', 'right', FONT.ui, '400');
  }

  /** The whole strip, in the order the eye should read it. */
  function draw(state, world, score, best) {
    plate();
    crest(STRIP.x + 30, STRIP.y + 36);
    text('THE VELVET LEDGER', STRIP.x + 52, STRIP.y + 30, 14.5, PALETTE.cream, 'left', FONT.display, '700');
    spaced('NIGHT AUCTION · 11:47 PM', STRIP.x + 52, STRIP.y + 46, 8.5, PALETTE.muted, 1.6, 'left', '600');

    const meterEnd = alarmMeter(world.alarm.value, state.threat);
    catalogue(world.loot, meterEnd + 34, STRIP.y + 28);
    ledger(state, world.tools, score, best, STRIP.x + STRIP.w - 356, STRIP.y + 28);
    footer(state, state.exitOpen);
  }

  return { draw, text, spaced, money, clock, roundRect };
}
