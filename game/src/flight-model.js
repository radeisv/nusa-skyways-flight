// The flight model: one arcade plane state, stepped at a fixed 1/60 s.
// Throttle sets target speed, pitch sets climb/sink, bank turns the heading.
// Stall, fuel burn, damage and landing/crash detection all live here.
import { PLANE, WORLD } from './config.js';
import { groundHeight, RUNWAY, WATER_ZONE } from './terrain.js';

export const EVENT_NONE = 0;
export const EVENT_CRASH = 1;
export const EVENT_LANDED = 2;
export const EVENT_STALL = 4;
export const EVENT_STORM = 8;

export function createPlaneState(route, upgrades) {
  const fuelMax = PLANE.fuelMax * (1 + 0.25 * (upgrades.tank || 0));
  return {
    x: 210, y: 60, z: 420, heading: Math.PI, pitch: 0, bank: 0,
    speedKt: 90, throttle: 65, fuel: fuelMax, fuelMax,
    damage: 0, airborne: true, landed: false, crashed: false,
    crashReason: '', verticalSpeed: 0, groundSpeed: 90,
    upgrades: { tank: upgrades.tank || 0, armor: upgrades.armor || 0, engine: upgrades.engine || 0 },
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function damageFactor(state) {
  return 1 - 0.3 * Math.min(1, (state.upgrades.armor || 0) / 3);
}
function engineFactor(state) {
  return 1 + 0.15 * (state.upgrades.engine || 0);
}

/**
 * Advance the plane one fixed step. `ctl` is { throttleUp, throttleDown,
 * pitchUp, pitchDown, bankLeft, bankRight }. Returns an event bitmask.
 */
export function stepFlight(state, ctl, dt, seed, stormCells, isWaterRoute) {
  let events = EVENT_NONE;
  if (state.crashed) return events;
  if (state.landed) {
    // Ground / water roll: throttle builds speed, pitch up past 80 kt lifts off.
    if (ctl.throttleUp) state.throttle = clamp(state.throttle + 55 * dt, 0, 100);
    if (ctl.throttleDown) state.throttle = clamp(state.throttle - 55 * dt, 0, 100);
    const target = (state.throttle / 100) * PLANE.maxKt * engineFactor(state);
    state.speedKt += clamp(target - state.speedKt, -PLANE.dragPerSec * dt, PLANE.accelPerSec * dt);
    const speedMs = state.speedKt * 0.514444;
    state.x += Math.sin(state.heading) * speedMs * dt;
    state.z += Math.cos(state.heading) * speedMs * dt;
    state.fuel = Math.max(0, state.fuel - PLANE.fuelBurn * (state.throttle / 100) * dt);
    if (state.speedKt > 80 && ctl.pitchUp) {
      state.landed = false; state.airborne = true; state.y += 3; state.pitch = 0.3;
    }
    return events;
  }

  if (ctl.throttleUp) state.throttle = clamp(state.throttle + 55 * dt, 0, 100);
  if (ctl.throttleDown) state.throttle = clamp(state.throttle - 55 * dt, 0, 100);

  const eng = engineFactor(state);
  const targetSpeed = (state.throttle / 100) * PLANE.maxKt * eng;
  const rate = state.speedKt < targetSpeed ? PLANE.accelPerSec : PLANE.dragPerSec;
  state.speedKt += clamp(targetSpeed - state.speedKt, -rate * dt, rate * dt);
  if (state.speedKt < 0) state.speedKt = 0;

  // Pitch: I climbs, K descends; the plane eases back to level on its own.
  // `ctl` may carry proportional amounts (-1..1) from the autopilot, or the
  // booleans the keyboard sets; both mean the same thing.
  const pitchInput = ctl.pitchAmount != null
    ? ctl.pitchAmount
    : (ctl.pitchUp ? 1 : 0) - (ctl.pitchDown ? 1 : 0);
  const pitchTarget = pitchInput * 0.42;
  state.pitch += clamp(pitchTarget - state.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
  // Bank: arrows roll the plane; heading follows the bank.
  const bankInput = ctl.bankAmount != null
    ? ctl.bankAmount
    : (ctl.bankRight ? 1 : 0) - (ctl.bankLeft ? 1 : 0);
  const bankTarget = bankInput * 0.85;
  state.bank += clamp(bankTarget - state.bank, -PLANE.bankRate * dt, PLANE.bankRate * dt);
  state.heading -= state.bank * PLANE.turnRate * dt * (0.4 + state.speedKt / 160);

  const stalled = state.speedKt < PLANE.stallKt && state.y > 8;
  if (stalled) events |= EVENT_STALL;

  // Vertical speed: pitch lift minus sink; stall drops the nose.
  // (Lift uses metres per second, not knots — the two differ by ~2x.)
  const speedMs = state.speedKt * 0.514444;
  const lift = Math.sin(state.pitch) * speedMs * 0.62 * eng;
  const sink = stalled ? -PLANE.sinkRate * 2.4 : -PLANE.sinkRate * (1 - state.throttle / 140);
  state.verticalSpeed = lift + sink;
  state.x += Math.sin(state.heading) * speedMs * Math.cos(state.pitch) * dt;
  state.z += Math.cos(state.heading) * speedMs * Math.cos(state.pitch) * dt;
  state.y += state.verticalSpeed * dt;
  // Soft world edge: steer back in.
  const edge = WORLD.size / 2 - 60;
  if (Math.abs(state.x) > edge || Math.abs(state.z) > edge) {
    state.heading += Math.PI * dt * 0.5;
  }

  // Fuel: burns with throttle; empty tank means the engine quits.
  state.fuel = Math.max(0, state.fuel - PLANE.fuelBurn * (state.throttle / 100) * dt);
  if (state.fuel <= 0 && state.throttle > 0) state.throttle = Math.max(0, state.throttle - 40 * dt);

  // Storm cells damage the airframe while inside one.
  for (const cell of stormCells || []) {
    const dx = state.x - cell.x, dz = state.z - cell.z;
    if (Math.sqrt(dx * dx + dz * dz) < cell.r && Math.abs(state.y - cell.y) < 90) {
      state.damage += PLANE.damageStormPerSec * damageFactor(state) * dt;
      events |= EVENT_STORM;
    }
  }
  if (state.damage >= 100) {
    state.crashed = true; state.crashReason = 'Airframe broke apart in the storm.';
    return EVENT_CRASH;
  }

  // Ground / water contact.
  const ground = groundHeight(state.x, state.z, seed);
  state.agl = state.y - Math.max(ground, 0);
  const nearRunway = Math.abs(state.x - RUNWAY.x) < RUNWAY.width / 2 + 6 &&
    Math.abs(state.z - RUNWAY.z) < RUNWAY.length / 2;
  const overWater = ground <= 0.5;
  const inWaterZone = isWaterRoute &&
    Math.hypot(state.x - WATER_ZONE.x, state.z - WATER_ZONE.z) < WATER_ZONE.r;

  if (state.y <= Math.max(ground, 0) + 1.0) {
    if (nearRunway) {
      const hard = Math.abs(state.verticalSpeed) > 7 || state.speedKt > 150;
      if (hard) {
        state.damage += PLANE.damageHardLanding * damageFactor(state);
        if (state.damage >= 100) {
          state.crashed = true; state.crashReason = 'Hard landing tore the airframe apart.';
          return EVENT_CRASH;
        }
      }
      state.y = RUNWAY.groundY + 1.2;
      state.landed = true; state.airborne = false;
      state.speedKt = Math.max(0, state.speedKt - 60 * dt);
      return EVENT_LANDED;
    }
    if (overWater && inWaterZone) {
      if (Math.abs(state.verticalSpeed) < 12 && state.speedKt < 140) {
        state.y = 1.2; state.landed = true; state.airborne = false;
        return EVENT_LANDED;
      }
      state.crashed = true; state.crashReason = 'Slammed into the water too hard.';
      return EVENT_CRASH;
    }
    if (overWater) {
      state.crashed = true; state.crashReason = 'Ditched in the sea.';
      return EVENT_CRASH;
    }
    state.crashed = true; state.crashReason = 'Flew into the terrain.';
    return EVENT_CRASH;
  }
  state.airborne = true;
  return events;
}

/** Refuel / repair helpers used by rings and landings. */
export function refuel(state, amount) {
  state.fuel = Math.min(state.fuelMax, state.fuel + amount);
}
