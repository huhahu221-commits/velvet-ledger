// Cameras: three fixed lenses on slow sweeps. A camera's beam is a narrow wedge that reaches
// the full range of its mount and is stopped by the same walls a guard's eye is; under the
// lens itself there is a dead zone, so a thief who hugs the wall can cross beneath one. A
// camera never chases: it simply sees, feeds the alarm, and its sweep is on a fixed clock, so
// the whole pattern is learnable.
import { CAMERA } from './config.js';
import { angleOf, distance, segmentClear } from './geometry.js';
import { BLOCKERS, CAMERAS } from './level.js';

export function createCameras() {
  return CAMERAS.map((mount) => ({
    id: mount.id,
    name: mount.name,
    x: mount.x,
    y: mount.y,
    base: mount.angle,
    sweep: mount.sweep,
    range: mount.range,
    halfAngle: mount.halfAngle,
    phase: mount.phase,
    angle: mount.angle,
    /** Seconds of jamming left; a jammed lens is blind and its housing smokes. */
    jam: 0,
    /** True while the lens holds the thief, for the red lamp and the renderer. */
    watching: false,
    /** Set for one step when it first catches him. */
    spotted: false,
  }));
}

export function resetCameras(cameras) {
  for (const camera of cameras) {
    camera.angle = camera.base;
    camera.jam = 0;
    camera.watching = false;
    camera.spotted = false;
  }
}

/**
 * One fixed step: sweep the lens on its own clock, then test the wedge. `elapsed` is the
 * night's own clock so the sweep does not drift with frame timing.
 */
export function stepCameras(cameras, dt, elapsed, thief) {
  const watchers = [];
  for (const camera of cameras) {
    camera.spotted = false;
    if (camera.jam > 0) {
      camera.jam = Math.max(0, camera.jam - dt);
      camera.watching = false;
      camera.angle = camera.base + Math.sin(elapsed * 2.6) * 0.05;
      continue;
    }
    camera.angle = camera.base + Math.sin(elapsed * CAMERA.sweepSpeed + camera.phase) * camera.sweep;
    const gap = distance(camera.x, camera.y, thief.x, thief.y);
    let sees = false;
    if (gap <= camera.range && gap > CAMERA.blind) {
      const toThief = angleOf(thief.x - camera.x, thief.y - camera.y);
      let delta = (toThief - camera.angle) % (Math.PI * 2);
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      if (Math.abs(delta) <= camera.halfAngle) {
        sees = segmentClear(camera.x, camera.y, thief.x, thief.y, BLOCKERS);
      }
    }
    if (sees && !camera.watching) camera.spotted = true;
    camera.watching = sees;
    if (sees) watchers.push({ camera, gap });
  }
  return watchers;
}

/** Blind one lens for a few seconds. Returns false when it was already blind. */
export function jamCamera(camera) {
  if (camera.jam > 0) return false;
  camera.jam = CAMERA.jamSeconds;
  camera.watching = false;
  return true;
}
