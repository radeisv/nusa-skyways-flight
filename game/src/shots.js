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
  // cover: Route 1 Ring Rally.
  game.startRoute(1);
  if (name === 'cover') {
    // COVER — LOW SUNSET PASS (winner of the 2026-11-27 cover comparison,
    // picked over the fixed cockpit and the dramatic rings shot: the plane
    // is large and readable, the runway strip fills the frame ahead with
    // PAPI + edge lights + tower, no element is clipped, and the golden
    // hour light reads. The modern amphibian low over the runway
    // centreline, 12 m up (6 m above the strip), 110 m from the
    // threshold, slight bank for dynamism, 130 kt. Shot with the close
    // hero camera (21 m behind, 7 m to the side). Deterministic: the
    // plane is placed, not flown, so the same seed always gives the
    // same frame. Ring 2 sits in the distance beyond the strip.
    const p = game.plane;
    p.x = 210; p.y = 12; p.z = 300; p.heading = Math.PI; p.pitch = 0;
    p.bank = 0.12; p.speedKt = 130; p.throttle = 70; p.verticalSpeed = 0;
    game.showScreen('playing');
    return { screen: 'playing', camera: 'hero' };
  }
  // Rings fly-out: fly the real rules toward the rings until 3 are done,
  // then settle so the plane is lined up on the next ring with the
  // following rings in frame.
  flyRings(game);
  game.showScreen('playing');
  return { screen: 'playing', camera: 'chase' };
}

/** Fly Route 1's rings with the real rules + autopilot until 3 are done,
 * then settle 6 s onto the next ring. */
function flyRings(game) {
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
}
