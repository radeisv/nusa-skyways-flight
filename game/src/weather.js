// Live weather: wind with gusts that actually push the plane, rain cells
// on storm routes, and a flyable cloud layer you can enter (whiteout +
// turbulence inside). Deterministic per route seed, so screenshots and
// autopilot runs always see the same sky. Fair by design: gusts are
// readable on the wind indicator and never strong enough to decide a route.
import { createRandom, hashNoise } from './random.js';

export const CLOUD_BAND = { y0: 300, y1: 420 }; // flyable cloud layer, metres

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Build the weather for one route. route.storm means rain + stronger wind. */
export function createWeather(seed, route) {
  const rand = createRandom(seed * 13 + 7);
  const dirDeg = Math.floor(rand() * 360); // wind FROM this compass bearing
  const baseKt = route.storm ? 10 + rand() * 4 : route.kind === 'landing' ? 3 + rand() * 2 : 4 + rand() * 3;
  const gustPhase1 = rand() * Math.PI * 2;
  const gustPhase2 = rand() * Math.PI * 2;
  const rain = !!route.storm;
  let rainField = null;
  let rainTHREE = null;

  function gustKt(t) {
    return Math.sin(t * 0.9 + gustPhase1) * 2.5 + Math.sin(t * 0.37 + gustPhase2) * 1.5;
  }

  const weather = {
    seed, dirDeg, baseKt, rain,
    /** Current wind vector in m/s (world x/z) plus its speed + direction. */
    windAt(t) {
      const kt = Math.max(1, baseKt + gustKt(t));
      const dirRad = dirDeg * Math.PI / 180;
      const ms = kt * 0.514444;
      // Wind blows FROM dirDeg, so the vector points the opposite way.
      return { x: Math.sin(dirRad + Math.PI) * ms, z: Math.cos(dirRad + Math.PI) * ms, kt, dirDeg };
    },
    /** Crosswind gusts at time t, in knots (the number the HUD shows). */
    readout(t) {
      const w = weather.windAt(t);
      return { kt: w.kt, dirDeg: w.dirDeg, gustKt: gustKt(t) };
    },
    /** How deep the plane is inside the cloud layer, 0 (clear) to 1. */
    inCloud(plane) {
      const y = plane.y;
      const edge = 25;
      const fadeIn = clamp((y - (CLOUD_BAND.y0 - edge)) / edge, 0, 1);
      const fadeOut = clamp(((CLOUD_BAND.y1 + edge) - y) / edge, 0, 1);
      const cover = hashNoise(plane.x * 0.008, plane.z * 0.008, seed) > 0.42 ? 1 : 0;
      return clamp(Math.min(fadeIn, fadeOut) * cover, 0, 1);
    },
    /** Turbulence rates (rad/s) to add to pitch/bank: inside clouds, and a
     * little everywhere when a gust peaks. Deterministic (sines, no random). */
    turbulence(t, plane) {
      const cloud = weather.inCloud(plane);
      const gustAmp = Math.max(0, gustKt(t)) / 8; // 0..~0.5 in a strong gust
      const amp = cloud * 0.08 + gustAmp * 0.03;
      return {
        pitch: Math.sin(t * 3.7) * amp,
        bank: Math.sin(t * 2.9 + 1.3) * amp,
      };
    },
    /** Whiteout overlay opacity for the in-cloud moment. */
    whiteout(plane) {
      return clamp(weather.inCloud(plane) * 0.85, 0, 0.85);
    },
    /** Build the rain streak field (only on storm routes). */
    attachRain(THREE) {
      if (!rain) return null;
      rainTHREE = THREE;
      const N = 260;
      const pos = new Float32Array(N * 6);
      for (let i = 0; i < N; i += 1) {
        const x = (Math.random() - 0.5) * 90;
        const y = Math.random() * 50;
        const z = (Math.random() - 0.5) * 90;
        pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
        pos[i * 6 + 3] = x; pos[i * 6 + 4] = y - 1.4; pos[i * 6 + 5] = z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xaaccee, transparent: true, opacity: 0.45 });
      rainField = new THREE.LineSegments(geo, mat);
      rainField.frustumCulled = false;
      return rainField;
    },
    get rainField() { return rainField; },
    /** Keep the rain box centred on the camera, falling and wrapping. */
    updateRain(camPos, t) {
      if (!rainField) return;
      rainField.position.set(camPos.x, camPos.y - 12 - ((t * 22) % 50), camPos.z);
    },
  };
  return weather;
}

/** Crosswind gusts at time t for a weather object (the HUD number). */
export function crosswindGusts(weather, t) {
  return weather.readout(t);
}

/** Rain cells: whether this route has rain, and how hard it falls. */
export function updateRainCells(weather) {
  return { raining: !!weather.rain, intensity: weather.rain ? 0.45 : 0 };
}

/** Cloud density at altitude y: 1 inside the flyable layer, 0 outside. */
export function cloudLayerAt(y) {
  return (y >= CLOUD_BAND.y0 && y <= CLOUD_BAND.y1) ? 1 : 0;
}
