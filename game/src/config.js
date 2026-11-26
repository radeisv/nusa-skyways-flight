// NUSA SKYWAYS — Archipelago Air Mail: every tuning number, colour and route
// definition in one place, so no other file hard-codes a magic number.
export const STEP = 1 / 60;
export const SAVE_KEY = 'nusa-skyways.save.v1';

// World: a 2400 x 2400 m archipelago, sea level y = 0, heights in metres.
export const WORLD = { size: 2400, seaLevel: 0, maxAlt: 900 };

export const PLANE = {
  stallKt: 55, maxKt: 220, cruiseKt: 140,
  accelPerSec: 26, dragPerSec: 14,
  climbRate: 9, sinkRate: 6,
  turnRate: 0.7, pitchRate: 0.45, bankRate: 1.4,
  fuelMax: 100, fuelBurn: 0.55, // per second at full throttle
  damageHardLanding: 34, damageStormPerSec: 9, damageTerrain: 100,
};

export const PALETTE = {
  skyDay: 0x8ec9e8, skyNight: 0x0d1b33, fogDay: 0xa8d0e6, fogNight: 0x0a1426,
  sea: 0x1e7fa8, seaDeep: 0x145e86, sand: 0xe8d29a, grass: 0x4da34d,
  hill: 0x3d8a4a, rock: 0x8a7f72, volcano: 0x5a4a42, lava: 0xff5a1f,
  planeRed: 0xd43d2a, planeWhite: 0xf5f2ea, planeGold: 0xf2b234,
  ring: 0x37e08a, ringNext: 0xffd23d, pad: 0xffd23d, runway: 0x3a3f4a,
  cloud: 0xffffff, storm: 0x3c4658,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// The six campaign routes. Each has a seed (terrain + target layout), a kind, a
// par time and a coin reward. kind drives the objective the missions module builds.
export const ROUTES = [
  { id: 1, name: 'Coral Lagoon', sub: 'Ring Rally', kind: 'rings', seed: 101,
    desc: 'Fly 8 glowing rings in order over the lagoon.',
    par: 180, coins: 120, rings: 8, night: false, storm: false },
  { id: 2, name: 'Volcano Pass', sub: 'Island Post', kind: 'drops', seed: 202,
    desc: 'Low passes: drop 3 mail bags on the marked pads.',
    par: 240, coins: 160, drops: 3, night: false, storm: false },
  { id: 3, name: 'Storm Strait', sub: 'Flare Relief', kind: 'rings', seed: 303,
    desc: 'Thread 6 flare rings. Storm cells hurt — steer clear.',
    par: 240, coins: 200, rings: 6, night: false, storm: true },
  { id: 4, name: 'Night Runway', sub: 'Night Landing', kind: 'landing', seed: 404,
    desc: 'Land on the lit runway after dark. Gentle wins.',
    par: 300, coins: 240, night: true, storm: false },
  { id: 5, name: 'Seaplane Bay', sub: 'Water Landing', kind: 'water', seed: 505,
    desc: 'Splash down on the floats, then take off again.',
    par: 300, coins: 260, night: false, storm: false },
  { id: 6, name: 'Grand Circuit', sub: 'Archipelago Tour', kind: 'circuit', seed: 606,
    desc: 'Rings, a mail drop and a runway landing. The full tour.',
    par: 420, coins: 400, rings: 5, drops: 2, night: false, storm: true },
];

export const UPGRADES = [
  { id: 'tank', name: 'Bigger Tank', desc: '+25% fuel capacity', cost: 150, max: 3,
    apply: (u) => 1 + 0.25 * u.tank },
  { id: 'armor', name: 'Tough Airframe', desc: '-30% damage taken', cost: 150, max: 3,
    apply: (u) => 1 - 0.3 * Math.min(1, u.armor / 3) },
  { id: 'engine', name: 'Strong Engine', desc: '+15% climb & speed', cost: 200, max: 3,
    apply: (u) => 1 + 0.15 * u.engine },
];

export const CAMERA_MODES = ['chase', 'cockpit', 'wing'];
