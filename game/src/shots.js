// Screenshot scenes behind ?shot=cover|rings|landing|campaign. Each one plays
// the real rules forward from a fresh route for a fixed number of steps, steered
// by a simple autopilot (bank toward the target bearing, pitch toward the target
// altitude, throttle to hold speed), so the frame is what real play looks like
// and the same seed always gives the same frame. Nothing here is faked.
import { STEP } from './config.js';
import { currentTarget } from './missions.js';

const SAMPLE = STEP;

/** Autopilot controls for one step toward `target` {x,y,z}. Proportional bank
 * and pitch (not bang-bang), so the plane settles onto the target instead of
 * orbiting it at speed. */
export function autopilotControls(plane, target, throttle) {
  const dx = target.x - plane.x, dz = target.z - plane.z;
  const wantHeading = Math.atan2(dx, dz);
  let err = wantHeading - plane.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  const clamp01 = (v) => Math.max(-1, Math.min(1, v));
  const ctl = {
    throttleUp: false, throttleDown: false,
    pitchUp: false, pitchDown: false, bankLeft: false, bankRight: false,
    bankAmount: clamp01(-err * 1.6),
    pitchAmount: clamp01((target.y - plane.y) / 40),
  };
  const wantThrottle = throttle == null ? 72 : throttle;
  if (plane.throttle < wantThrottle - 2) ctl.throttleUp = true;
  else if (plane.throttle > wantThrottle + 2) ctl.throttleDown = true;
  return ctl;
}

/**
 * Stage the named scene on a live game object (the one main.js builds):
 * game.startRoute(id), game.step(ctl), game.plane, game.mission, game.screen.
 * Returns the screen the shot should show.
 */
export function stageShot(name, game) {
  if (name === 'campaign') {
    game.startRoute(1);
    game.showScreen('campaign');
    return 'campaign';
  }
  if (name === 'landing') {
    game.startRoute(4); // Night Runway
    // Waypoints: join the approach, then descend onto the lit strip. The
    // final waypoint sits below ground level on purpose: the proportional
    // pitch controller must keep descending through the touchdown height,
    // not ease off above it.
    const approach = { x: 210, y: 60, z: 320 };
    const final = { x: 210, y: 18, z: 180 };
    const touch = { x: 210, y: 8, z: 60 };
    for (let i = 0; i < 60 / SAMPLE; i += 1) {
      const d = Math.hypot(game.plane.x - 210, game.plane.z - 60);
      const target = d > 250 ? approach : (d > 130 ? final : touch);
      const thr = d > 130 ? 50 : 25;
      game.step(autopilotControls(game.plane, target, thr));
      if (game.plane.y < 26 && d < 170) break;
      if (game.plane.crashed || game.plane.landed) break;
    }
    game.showScreen('playing');
    return 'playing';
  }
  // cover + rings: Route 1 Ring Rally.
  game.startRoute(1);
  if (name === 'cover') {
    // No hop: stage the spawn frame. Ring 1 sits at y=181, only ~290 m
    // ahead of the spawn and ~120 m above it, while the chase camera looks
    // slightly down — so the ring already fills the top of the frame at
    // spawn (top edge ~27 px inside it), and every second flown toward it
    // steepens its angle until it clips out the top (at 2.4 s the top edge
    // was ~110 px past the frame). The spawn frame keeps the whole ring in
    // view with margin, the plane large, and the runway ahead below it.
    game.showScreen('playing');
    return 'playing';
  }
  const seconds = 55;
  for (let i = 0; i < seconds / SAMPLE; i += 1) {
    const target = currentTarget(game.mission);
    game.step(autopilotControls(game.plane, target, 74));
    if (game.plane.crashed || game.mission.complete) break;
    if (game.mission.done >= 3) break;
  }
  // Settle: the break above catches the plane mid-turn onto the next ring,
  // with that ring swept off the top-right of the frame. Fly on toward the
  // current target until the turn is finished: after 6 s the plane is lined
  // up on ring 5 with rings 5-8 all fully in frame and none clipped at any
  // edge (7 s puts ring 7 half off the right edge; 8 s leaves the faded
  // just-passed ring huge across the frame). Measured with the chase-camera
  // projection for every ring, not just the next one.
  for (let i = 0; i < 6 / SAMPLE; i += 1) {
    const target = currentTarget(game.mission);
    game.step(autopilotControls(game.plane, target, 74));
    if (game.plane.crashed || game.mission.complete) break;
  }
  game.showScreen('playing');
  return 'playing';
}
