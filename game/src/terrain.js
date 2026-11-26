// Procedural low-poly archipelago: sea, islands with hills and beaches, clouds,
// sun, storm cells and the runway. The analytic groundHeight(x, z) is the single
// source of truth — the meshes are built from it, and the flight model crashes
// against it, so what you see is what you hit.
import { PALETTE, WORLD } from './config.js';
import { createRandom, hashNoise } from './random.js';

// Island table: centre, radius, peak height, kind. One consistent style.
export const ISLANDS = [
  { x: 0, z: 0, r: 420, h: 150, kind: 'main' },
  { x: 620, z: -380, r: 300, h: 190, kind: 'volcano' },
  { x: -640, z: -300, r: 280, h: 120, kind: 'hill' },
  { x: -560, z: 520, r: 240, h: 95, kind: 'hill' },
  { x: 560, z: 560, r: 260, h: 110, kind: 'hill' },
  { x: 60, z: -780, r: 200, h: 80, kind: 'hill' },
  { x: -180, z: 820, r: 170, h: 65, kind: 'hill' },
];

// The lit runway sits on the main island. Its length runs along Z, the
// approach direction from the south, so a landing plane has 260 m of strip
// to touch down on instead of crossing a 26 m edge.
export const RUNWAY = { x: 210, z: 60, heading: 0, length: 260, width: 26, groundY: 6 };
export const WATER_ZONE = { x: -350, z: 700, r: 150 }; // Seaplane Bay lagoon, open sea

export function groundHeight(x, z, seed) {
  let h = 0;
  for (const isl of ISLANDS) {
    const dx = x - isl.x, dz = z - isl.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= isl.r) continue;
    const fall = 1 - d / isl.r;
    let hill = isl.h * Math.pow(fall, 1.6);
    hill += hashNoise(x * 0.02, z * 0.02, seed + isl.x) * 9 * fall;
    if (isl.kind === 'volcano') hill += isl.h * 0.55 * Math.max(0, 1 - d / (isl.r * 0.32));
    h = Math.max(h, hill);
  }
  // Flatten the runway strip so landings are fair (length along Z).
  const rx = x - RUNWAY.x, rz = z - RUNWAY.z;
  if (Math.abs(rx) < RUNWAY.width / 2 + 30 && Math.abs(rz) < RUNWAY.length / 2 + 30) {
    h = Math.min(h, RUNWAY.groundY);
  }
  // Flatten the approach corridor south of the runway, so a final approach
  // on the runway line never meets a hill before the strip.
  if (Math.abs(x - RUNWAY.x) < 70 && z > -100 && z < 450) {
    h = Math.min(h, 8);
  }
  return h;
}

function islandColour(kind, h, peak) {
  if (h < 4) return PALETTE.sand;
  if (kind === 'volcano' && h > peak * 0.72) return PALETTE.volcano;
  if (h > peak * 0.55) return PALETTE.rock;
  return h > peak * 0.25 ? PALETTE.hill : PALETTE.grass;
}

/** Build one island as a flat-shaded displaced disc mesh. */
function buildIsland(THREE, isl, seed) {
  const seg = 40, rings = 14;
  const geo = new THREE.PlaneGeometry(isl.r * 2, isl.r * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  const colour = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i) + isl.x, z = pos.getZ(i) + isl.z;
    const h = groundHeight(x, z, seed);
    // The vertex itself must move to the island's centre too: the height is
    // evaluated at the island's real position, so the mesh has to live there.
    pos.setX(i, x);
    pos.setY(i, h);
    pos.setZ(i, z);
    colour.setHex(islandColour(isl.kind, h, isl.h));
    // Slight per-vertex jitter for a hand-made low-poly feel.
    const j = 1 + hashNoise(x, z, seed + 7) * 0.05;
    colours[i * 3] = colour.r * j; colours[i * 3 + 1] = colour.g * j; colours[i * 3 + 2] = colour.b * j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, 0);
  return mesh;
}

function buildRunway(THREE, night) {
  const group = new THREE.Group();
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(RUNWAY.width, 1.6, RUNWAY.length),
    new THREE.MeshLambertMaterial({ color: PALETTE.runway }),
  );
  strip.position.set(RUNWAY.x, RUNWAY.groundY + 0.8, RUNWAY.z);
  group.add(strip);
  // Centre dashes along the strip.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = -5; i <= 5; i += 1) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 10), dashMat);
    dash.position.set(RUNWAY.x, RUNWAY.groundY + 1.8, RUNWAY.z + i * 22);
    group.add(dash);
  }
  // Edge lights along the strip: always on, brighter at night.
  const lightMat = new THREE.MeshBasicMaterial({ color: night ? 0xffe9a8 : 0xffd23d });
  for (let i = -6; i <= 6; i += 1) {
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), lightMat);
      lamp.position.set(RUNWAY.x + side * (RUNWAY.width / 2 + 2), RUNWAY.groundY + 2.2, RUNWAY.z + i * 22);
      group.add(lamp);
    }
  }
  // White edge lines along the strip so it reads in daylight and at night.
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, RUNWAY.length), edgeMat);
    edge.position.set(RUNWAY.x + side * (RUNWAY.width / 2 - 0.6), RUNWAY.groundY + 1.8, RUNWAY.z);
    group.add(edge);
  }
  // Approach lights marching south from the threshold, so the runway is
  // visible from far out on final.
  for (let i = 0; i < 5; i += 1) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), lightMat);
    lamp.position.set(RUNWAY.x, RUNWAY.groundY + 2.5, RUNWAY.z + RUNWAY.length / 2 + 24 + i * 26);
    group.add(lamp);
  }
  // A small tower beside the strip, on the flat corridor ground, with a beacon.
  const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 12, 4),
    new THREE.MeshLambertMaterial({ color: 0x8a94a6 }));
  tower.position.set(RUNWAY.x + 40, RUNWAY.groundY + 8, RUNWAY.z + 40);
  group.add(tower);
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  beacon.position.set(RUNWAY.x + 40, RUNWAY.groundY + 14.5, RUNWAY.z + 40);
  group.add(beacon);
  return group;
}

function buildClouds(THREE, rand) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: PALETTE.cloud, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 26; i += 1) {
    const puff = new THREE.Group();
    const n = 3 + Math.floor(rand() * 3);
    for (let j = 0; j < n; j += 1) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(14 + rand() * 16, 7, 6), mat);
      s.position.set((rand() - 0.5) * 50, (rand() - 0.5) * 6, (rand() - 0.5) * 22);
      s.scale.y = 0.55;
      puff.add(s);
    }
    puff.position.set((rand() - 0.5) * 2200, 260 + rand() * 180, (rand() - 0.5) * 2200);
    group.add(puff);
  }
  return group;
}

function buildStormCells(THREE, rand, seed) {
  // Dark thunderheads drifting over the strait between the main island and the volcano.
  const cells = [];
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: PALETTE.storm, transparent: true, opacity: 0.9 });
  const spots = [[300, -120, 150], [120, -320, 130], [480, 120, 170], [-80, -480, 140]];
  for (const [x, z, r] of spots) {
    const cell = new THREE.Group();
    for (let j = 0; j < 5; j += 1) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r * (0.35 + rand() * 0.3), 7, 6), mat);
      s.position.set((rand() - 0.5) * r, (rand() - 0.5) * 18, (rand() - 0.5) * r);
      s.scale.y = 0.6;
      cell.add(s);
    }
    cell.position.set(x, 170 + rand() * 40, z);
    group.add(cell);
    cells.push({ x, z, r: r * 0.9, y: 170 });
  }
  return { group, cells };
}

/**
 * Build the whole world for a route seed. Returns { group, stormCells, night }.
 * The scene (lights, sky, fog) is configured by render.js from `night`.
 */
export function buildTerrain(THREE, seed, night, storm) {
  const rand = createRandom(seed * 31 + 5);
  const group = new THREE.Group();
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size * 2.4, WORLD.size * 2.4, 1, 1),
    new THREE.MeshLambertMaterial({ color: night ? 0x0e2a44 : PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0;
  group.add(sea);
  for (const isl of ISLANDS) group.add(buildIsland(THREE, isl, seed));
  // Volcano crater glow.
  const lava = new THREE.Mesh(new THREE.CircleGeometry(26, 12),
    new THREE.MeshBasicMaterial({ color: PALETTE.lava }));
  lava.rotation.x = -Math.PI / 2;
  const volc = ISLANDS[1];
  lava.position.set(volc.x, 298, volc.z);
  group.add(lava);
  group.add(buildRunway(THREE, night));
  group.add(buildClouds(THREE, rand));
  // Storm cells only on storm routes — a clear lagoon should look clear.
  const stormBuilt = storm ? buildStormCells(THREE, rand, seed) : { group: new THREE.Group(), cells: [] };
  group.add(stormBuilt.group);
  return { group, stormCells: stormBuilt.cells, night };
}
