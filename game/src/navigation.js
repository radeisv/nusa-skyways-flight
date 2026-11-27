// Navigation: ILS approach math, nearest airfield, and the GPS minimap.
// The runway runs along Z (heading 0); approaches come from the south
// (z > threshold) flying north (heading PI) onto a 3-degree glidepath.
import { RUNWAY, WATER_ZONE, ISLANDS } from './terrain.js';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

const TOUCHDOWN = { x: RUNWAY.x, z: 120 }; // touchdown point, south of centre
const GLIDE_DEG = 3; // degrees

/** ILS deviation for the runway approach. loc: +1 = right of the centreline
 * (fly left); gs: +1 = above the glidepath (fly down). onApproach is true
 * while the plane is south of the runway, within 1500 m and 300 m of the
 * centreline. distM is the distance to the touchdown point. */
export function glideSlopeDeviation(plane) {
  const d = plane.z - TOUCHDOWN.z; // along-track distance, south positive
  const lat = plane.x - RUNWAY.x; // lateral offset, + = east / right
  const onApproach = d > 0 && d < 1500 && Math.abs(lat) < 300;
  const idealAlt = RUNWAY.groundY + Math.tan(GLIDE_DEG * Math.PI / 180) * d;
  return {
    loc: clamp(lat / 60, -1, 1),
    gs: clamp((plane.y - idealAlt) / 40, -1, 1),
    distM: Math.round(Math.hypot(lat, d)),
    idealAlt: Math.round(idealAlt),
    onApproach,
  };
}

/** The one airfield in the archipelago: distance + bearing from the plane. */
export function nearestAirfield(plane) {
  const dx = RUNWAY.x - plane.x, dz = RUNWAY.z - plane.z;
  const distM = Math.round(Math.hypot(dx, dz));
  const bearingDeg = Math.round(((Math.atan2(dx, dz) * 180 / Math.PI) % 360 + 360) % 360);
  return { name: 'NUSA AIRSTRIP', distM, bearingDeg };
}

// Minimap: world 2400x2400 m drawn north-up, sea + islands + runway +
// rings/pads + water zone + the plane. One canvas, redrawn every frame.
const MAP_SIZE = 180;
const SCALE = MAP_SIZE / 2400;

function toMap(x, z) {
  return [(x + 1200) * SCALE, (z + 1200) * SCALE];
}

/** Redraw the GPS minimap from live state. `timeSec` drives the target pulse. */
export function updateMinimap(canvas, plane, mission, timeSec) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  // Sea.
  ctx.fillStyle = '#0f3550';
  ctx.fillRect(0, 0, w, h);
  // Islands.
  for (const isl of ISLANDS) {
    const [x, y] = toMap(isl.x, isl.z);
    const r = isl.r * SCALE;
    ctx.fillStyle = isl.kind === 'volcano' ? '#6b5a4e' : '#3d8a4a';
    ctx.beginPath(); ctx.arc(x, y, Math.max(2, r), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e8d29a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, Math.max(2, r), 0, Math.PI * 2); ctx.stroke();
  }
  // Water zone (Seaplane Bay).
  {
    const [x, y] = toMap(WATER_ZONE.x, WATER_ZONE.z);
    ctx.strokeStyle = '#37e08a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, WATER_ZONE.r * SCALE, 0, Math.PI * 2); ctx.stroke();
  }
  // Runway: white strip, 26 x 260 m.
  {
    const [x, y] = toMap(RUNWAY.x, RUNWAY.z);
    ctx.fillStyle = '#f5f2ea';
    ctx.fillRect(x - (RUNWAY.width / 2) * SCALE, y - (RUNWAY.length / 2) * SCALE,
      RUNWAY.width * SCALE, RUNWAY.length * SCALE);
  }
  // Rings (yellow = next, green = done) and mail pads (orange squares).
  if (mission) {
    for (const ring of mission.rings || []) {
      const [x, y] = toMap(ring.x, ring.z);
      ctx.fillStyle = ring.done ? '#37e08a' : '#ffd23d';
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // Mail pads: orange squares (green once dropped on). `drops` carries the
    // done flag; `pads` is the same list without it.
    for (const pad of mission.drops || []) {
      const [x, y] = toMap(pad.x, pad.z);
      ctx.fillStyle = pad.done ? '#37e08a' : '#ff9a3d';
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
    // Next target: pulsing ring.
    const next = (mission.rings || []).find((r) => !r.done)
      || (mission.drops || []).find((p) => !p.done);
    if (next) {
      const [x, y] = toMap(next.x, next.z);
      const pr = 6 + Math.sin((timeSec || 0) * 4) * 2;
      ctx.strokeStyle = '#ffd23d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // The plane: white triangle, rotated to the heading (north = up).
  {
    const [x, y] = toMap(plane.x, plane.z);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI - plane.heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#12233d'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // Frame + north arrow.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = '#ffd23d'; ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('N', 6, 4);
}
