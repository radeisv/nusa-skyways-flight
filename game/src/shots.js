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
 * Returns { screen, camera }: the screen to show and the camera mode to
 * paint it with.
 */
export function stageShot(name, game) {
  if (name === 'campaign') {
    game.startRoute(1);
    game.showScreen('campaign');
    return { screen: 'campaign', camera: 'chase' };
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
    return { screen: 'playing', camera: 'chase' };
  }
  // cover + rings: Route 1 Ring Rally.
  game.startRoute(1);
  if (name === 'cover') {
    // COCKPIT view on final approach: the spawn is already on the runway
    // centreline heading north, so fly straight toward the threshold for
    // just ~1.5 s — the target stays ahead of the plane the whole time, so
    // the autopilot keeps correcting any wind/turbulence drift back to the
    // centreline instead of turning around after a passed target. The plane
    // ends up ~340 m out at ~65 m, with the whole runway strip and PAPI
    // ahead through the windscreen above the lit instrument panel.
    // Flaps 1 for the landing configuration (both the control state the
    // HUD reads and the plane's own flaps field).
    const target = { x: 210, y: 70, z: 60 };
    for (let i = 0; i < 1.5 / SAMPLE; i += 1) {
      game.step(autopilotControls(game.plane, target, 60));
      if (game.plane.crashed || game.plane.landed) break;
    }
    if (game.controls) game.controls.setFlaps(1);
    game.plane.flaps = 1;
    game.showScreen('playing');
    return { screen: 'playing', camera: 'cockpit' };
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
  return { screen: 'playing', camera: 'chase' };
}
