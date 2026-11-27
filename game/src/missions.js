// Missions: the objectives for each route kind, built deterministically from the
// route seed so every attempt flies the same layout. Rings, mail drops, flare
// rings, runway landings and water landings are all tracked here, with score.
import { createRandom } from './random.js';
import { RUNWAY, WATER_ZONE, groundHeight } from './terrain.js';
import { refuel } from './flight-model.js';

export const MISSION_RING = 'ring';
export const MISSION_DROP = 'drop';
export const MISSION_LAND = 'land';
export const MISSION_WATER = 'water';

function ringTargets(route, rand) {
  const targets = [];
  const n = route.rings || 6;
  // A winding path across the archipelago, starting ahead of the runway line.
  let x = 210, z = 300, y = 90;
  for (let i = 0; i < n; i += 1) {
    x += (rand() - 0.5) * 420;
    z -= 160 + rand() * 120;
    y = 70 + rand() * 130;
    x = Math.max(-900, Math.min(900, x));
    z = Math.max(-900, Math.min(700, z));
    targets.push({ x, y, z, r: 26, done: false, fuel: i % 3 === 2 });
  }
  return targets;
}

function dropTargets(route, rand) {
  const pads = [
    { x: -640, z: -300 }, { x: 620, z: -380 }, { x: -560, z: 520 },
    { x: 560, z: 560 }, { x: 60, z: -780 },
  ];
  const targets = [];
  const count = route.drops || 3;
  for (let i = 0; i < count; i += 1) {
    const p = pads[(i * 2 + Math.floor(rand() * 2)) % pads.length];
    targets.push({ x: p.x, y: 0, z: p.z, r: 30, done: false });
  }
  return targets;
}

export function createMission(route) {
  const rand = createRandom(route.seed * 7 + 13);
  const mission = {
    route, kind: route.kind, score: 0, rings: [], drops: [], pads: [],
    landTarget: null, waterTarget: null, phase: 'fly',
    current: 0, done: 0, total: 0, objective: '', complete: false,
    message: '', messageTimer: 0,
  };
  if (route.kind === 'rings') {
    mission.rings = ringTargets(route, rand);
    mission.total = mission.rings.length;
    mission.objective = `Fly through the rings: 0/${mission.total}`;
  } else if (route.kind === 'drops') {
    mission.drops = dropTargets(route, rand);
    mission.pads = mission.drops.map((d) => ({ x: d.x, z: d.z, r: d.r }));
    mission.total = mission.drops.length;
    mission.objective = `Drop mail on the pads (K, low & slow): 0/${mission.total}`;
  } else if (route.kind === 'landing') {
    mission.landTarget = { x: RUNWAY.x, z: RUNWAY.z };
    mission.total = 1;
    mission.objective = 'Land on the lit runway — gentle touchdown';
  } else if (route.kind === 'water') {
    mission.waterTarget = { x: WATER_ZONE.x, z: WATER_ZONE.z, r: WATER_ZONE.r };
    mission.total = 2; // splash down, then take off again
    mission.objective = 'Splash down in Seaplane Bay, then take off';
  } else if (route.kind === 'circuit') {
    mission.rings = ringTargets({ ...route, rings: route.rings || 5 }, rand);
    mission.drops = dropTargets(route, rand);
    mission.landTarget = { x: RUNWAY.x, z: RUNWAY.z };
    mission.total = mission.rings.length + mission.drops.length + 1;
    mission.objective = `Grand Circuit: rings, mail, landing — 0/${mission.total}`;
  }
  return mission;
}

function dist3(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** The next thing the pilot should fly to (ring, pad or runway). */
export function currentTarget(mission) {
  if (mission.kind === 'rings' || mission.kind === 'circuit') {
    const next = mission.rings.find((r) => !r.done);
    if (next) return { x: next.x, y: next.y, z: next.z, kind: 'ring' };
    if (mission.kind === 'circuit') {
      const pad = mission.drops.find((d) => !d.done);
      if (pad) return { x: pad.x, y: 150, z: pad.z, kind: 'drop' };
      return { x: RUNWAY.x, y: 30, z: RUNWAY.z, kind: 'land' };
    }
  }
  if (mission.kind === 'drops') {
    const pad = mission.drops.find((d) => !d.done);
    if (pad) return { x: pad.x, y: 150, z: pad.z, kind: 'drop' };
  }
  if (mission.kind === 'landing') return { x: RUNWAY.x, y: 30, z: RUNWAY.z, kind: 'land' };
  if (mission.kind === 'water') {
    return mission.phase === 'fly'
      ? { x: WATER_ZONE.x, y: 20, z: WATER_ZONE.z, kind: 'water' }
      : { x: WATER_ZONE.x, y: 120, z: WATER_ZONE.z - 300, kind: 'climb' };
  }
  return { x: RUNWAY.x, y: 30, z: RUNWAY.z, kind: 'land' };
}

/**
 * Advance the mission one step. `events` carries { ring, drop, landed } flags
 * for sounds and HUD flashes. Returns 'complete' when the route is finished.
 */
export function updateMission(mission, plane, events, dt) {
  if (mission.messageTimer > 0) mission.messageTimer -= dt;
  const ring = mission.rings[mission.current];
  if (ring && !ring.done && dist3(plane, ring) < ring.r + 18) {
    ring.done = true;
    mission.current += 1; mission.done += 1;
    mission.score += 100;
    if (ring.fuel) { refuel(plane, 35); mission.message = 'FUEL RING — tank topped up!'; }
    else mission.message = `Ring ${mission.done}/${mission.rings.length} — +100`;
    mission.messageTimer = 2.5;
    events.ring = true;
    if (mission.kind === 'rings' && mission.done >= mission.total) {
      mission.complete = true;
      return 'complete';
    }
  }
  if ((mission.kind === 'drops' || mission.kind === 'circuit') && mission.drops.length) {
    const pad = mission.drops.find((d) => !d.done);
    // A drop counts when the plane is low above the pad's ground and slow —
    // pads sit on hilly islands, so height is measured above the terrain.
    const agl = plane.y - groundHeight(plane.x, plane.z, mission.route.seed);
    if (pad && events.dropKey && agl < 100 && agl > 0 && plane.speedKt < 150) {
      const d = Math.hypot(plane.x - pad.x, plane.z - pad.z);
      if (d < pad.r + 10) {
        pad.done = true; mission.done += 1; mission.score += 150;
        mission.message = `Mail delivered — +150 (${mission.done} total)`;
        mission.messageTimer = 2.5;
        events.drop = true;
        // A pure mail route ends when the last bag is down (a drops route
        // has no landing leg — its total is just the pads).
        if (mission.kind === 'drops' && mission.done >= mission.total) {
          mission.complete = true;
          return 'complete';
        }
      }
    }
  }
  if (mission.kind === 'circuit' && mission.rings.every((r) => r.done) &&
      mission.drops.every((d) => d.done) && events.landed) {
    mission.done += 1; mission.complete = true;
    mission.score += 300;
    return 'complete';
  }
  if (mission.kind === 'landing' && events.landed) {
    mission.done = 1; mission.complete = true; mission.score += 300;
    return 'complete';
  }
  if (mission.kind === 'water') {
    if (mission.phase === 'fly' && events.landed) {
      mission.phase = 'takeoff'; mission.done = 1;
      mission.message = 'Splashdown! Now full throttle to take off again.';
      mission.messageTimer = 3;
      events.landed = false;
    } else if (mission.phase === 'takeoff' && plane.airborne && plane.y > 90) {
      mission.done = 2; mission.complete = true; mission.score += 300;
      return 'complete';
    }
  }
  // Objective line stays current.
  if (mission.kind === 'rings') mission.objective = `Fly through the rings: ${mission.done}/${mission.total}`;
  else if (mission.kind === 'drops') mission.objective = `Drop mail on the pads (K, low & slow): ${mission.done}/${mission.total}`;
  else if (mission.kind === 'circuit') mission.objective = `Grand Circuit: rings, mail, landing — ${mission.done}/${mission.total}`;
  else if (mission.kind === 'water') mission.objective = mission.phase === 'fly'
    ? 'Splash down in Seaplane Bay (slow, gentle)' : 'Take off again — full throttle!';
  return null;
}
