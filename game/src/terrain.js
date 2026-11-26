// Procedural low-poly archipelago: animated sea, islands with natural blended
// colours, palms, houses, docks and boats, clouds, storm cells and the runway.
// The analytic groundHeight(x, z) is the single source of truth — the meshes
// are built from it, and the flight model crashes against it, so what you see
// is what you hit. Visuals only: groundHeight and the island table are
// unchanged, so every route, mission and landing behaves exactly as before.
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

// --- Natural terrain palette: smooth height-band blending, never neon.
// Values are LINEAR working-space (sRGB output + ACES: authored sRGB values
// converted to linear, so the colours land as intended, not washed out). ---
const C_SAND = [0.73, 0.54, 0.27];
const C_GRASS = [0.08, 0.32, 0.08];
const C_FOREST = [0.022, 0.16, 0.047];
const C_ROCK = [0.27, 0.22, 0.17];
const C_PEAK = [0.08, 0.065, 0.047];
const C_ASH = [0.047, 0.033, 0.027];
const C_CRATER = [0.15, 0.06, 0.03];

function smoothstep(a, b, t) {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}
function mix3(a, b, t, out) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

function islandColour(kind, h, peak, slopeY, out) {
  const t = h / peak;
  // Sand rim -> meadow -> forest -> rock -> dark peak, blended smoothly.
  mix3(C_SAND, C_GRASS, smoothstep(0.02, 0.10, t), out);
  mix3(out, C_FOREST, smoothstep(0.28, 0.45, t), out);
  mix3(out, C_ROCK, smoothstep(0.55, 0.72, t), out);
  mix3(out, C_PEAK, smoothstep(0.82, 0.95, t), out);
  if (kind === 'volcano' && t > 0.68) {
    mix3(out, C_ASH, smoothstep(0.68, 0.82, t), out);
    mix3(out, C_CRATER, smoothstep(0.9, 0.97, t) * 0.7, out);
  }
  // Steep faces read as rock whatever the height.
  if (slopeY < 0.78) mix3(out, C_ROCK, (0.78 - slopeY) * 2.2, out);
  return out;
}

/** Build one island as a flat-shaded displaced disc mesh. */
function buildIsland(THREE, isl, seed) {
  const seg = 48;
  const geo = new THREE.PlaneGeometry(isl.r * 2, isl.r * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i) + isl.x, z = pos.getZ(i) + isl.z;
    const h = groundHeight(x, z, seed);
    // The vertex itself must move to the island's centre too: the height is
    // evaluated at the island's real position, so the mesh has to live there.
    pos.setX(i, x);
    pos.setY(i, h);
    pos.setZ(i, z);
  }
  geo.computeVertexNormals();
  const normals = geo.attributes.normal;
  const colours = new Float32Array(pos.count * 3);
  const rgb = [0, 0, 0];
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = pos.getY(i);
    islandColour(isl.kind, h, isl.h, normals.getY(i), rgb);
    // Slight per-vertex jitter for a hand-made low-poly feel, plus a second
    // high-frequency noise that breaks the visible height-band lines.
    const j = 1 + hashNoise(x, z, seed + 7) * 0.06;
    const j2 = 1 + hashNoise(x * 0.15, z * 0.15, seed + 11) * 0.12;
    colours[i * 3] = rgb[0] * j * j2; colours[i * 3 + 1] = rgb[1] * j * j2; colours[i * 3 + 2] = rgb[2] * j * j2;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// --- Animated sea: vertex waves + sun glint + fog, one shader, no texture. ---
function buildSea(THREE, night) {
  const uniforms = {
    uTime: { value: 0 },
    uNight: { value: night ? 1 : 0 },
    uDeep: { value: new THREE.Color(0x0a4a70) },
    uShallow: { value: new THREE.Color(0x1e8fb8) },
    uSunDir: { value: new THREE.Vector3(-0.55, 0.38, -0.55).normalize() },
    uSunColor: { value: new THREE.Color(0xffd9a0) },
    uFogColor: { value: new THREE.Color(0xd6ab7f) },
    uFogNear: { value: 1100 },
    uFogFar: { value: 3200 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      uniform float uTime;
      varying vec3 vPos; varying vec3 vNormal; varying float vWave;
      float waveH(float x, float z, float t) {
        return sin(x * 0.021 + t * 0.9) * 0.9
             + sin(z * 0.016 + t * 0.6) * 0.7
             + sin((x + z) * 0.012 + t * 0.45) * 0.55
             + sin((x * 2.0 - z * 1.7) * 0.11 + t * 1.7) * 0.16;
      }
      void main() {
        vec3 p = position;
        float w = waveH(p.x, p.y, uTime);
        p.z += w;
        float e = 0.6;
        float wx = (waveH(p.x + e, p.y, uTime) - waveH(p.x - e, p.y, uTime)) / (2.0 * e);
        float wy = (waveH(p.x, p.y + e, uTime) - waveH(p.x, p.y - e, uTime)) / (2.0 * e);
        // Plane is rotated -90deg about X: local (x, y, z) -> world (x, z, -y).
        vNormal = normalize(vec3(-wx, 1.0, wy));
        vWave = w;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uDeep, uShallow, uSunDir, uSunColor, uFogColor;
      uniform float uFogNear, uFogFar, uNight, uTime;
      varying vec3 vPos; varying vec3 vNormal; varying float vWave;
      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(cameraPosition - vPos);
        float fres = pow(1.0 - max(dot(V, N), 0.0), 3.0);
        vec3 col = mix(uDeep, uShallow, clamp(vWave * 0.25 + 0.5, 0.0, 1.0) * 0.55 + fres * 0.45);
        col = mix(col, uFogColor, fres * 0.30);
        vec3 R = reflect(-V, N);
        float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), 200.0);
        col += uSunColor * spec * 2.2;
        float glitter = max(0.0, sin(vPos.x * 1.7 + uTime * 2.0) * sin(vPos.z * 2.3 - uTime * 1.6));
        col += uSunColor * glitter * glitter * 0.08;
        float fogF = smoothstep(uFogNear, uFogFar, distance(cameraPosition, vPos));
        col = mix(col, uFogColor, fogF);
        col *= (1.0 - uNight * 0.55);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.size * 2.4, WORLD.size * 2.4, 96, 96), mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0;
  return { mesh: sea, mat };
}

// White foam rings where the water meets each beach.
function buildFoam(THREE) {
  const group = new THREE.Group();
  const mat1 = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false });
  const mat2 = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false });
  for (const isl of ISLANDS) {
    const ring1 = new THREE.Mesh(new THREE.RingGeometry(isl.r * 0.97, isl.r * 1.06, 48), mat1);
    ring1.rotation.x = -Math.PI / 2;
    ring1.position.set(isl.x, 0.5, isl.z);
    group.add(ring1);
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(isl.r * 1.0, isl.r * 1.13, 48), mat2);
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.set(isl.x, 0.4, isl.z);
    group.add(ring2);
  }
  return group;
}

// Instanced palm trees on the low slopes, clear of the runway and approach.
function buildPalms(THREE, seed) {
  const rand = createRandom(seed * 13 + 3);
  const spots = [];
  for (let i = 0; i < 400 && spots.length < 130; i += 1) {
    const isl = ISLANDS[Math.floor(rand() * ISLANDS.length)];
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * isl.r * 0.88;
    const x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d;
    const h = groundHeight(x, z, seed);
    if (h < 4 || h > 55) continue;
    if (Math.abs(x - RUNWAY.x) < 70 && z > -160 && z < 260) continue; // runway + approach
    if (Math.abs(x - RUNWAY.x) < 55 && Math.abs(z - RUNWAY.z) < RUNWAY.length / 2 + 40) continue;
    spots.push({ x, z, h });
  }
  const group = new THREE.Group();
  if (spots.length === 0) return group;
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.6, 7, 5);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230, flatShading: true });
  const canopyGeo = new THREE.SphereGeometry(2.7, 7, 5);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, spots.length);
  trunks.castShadow = true;
  canopies.castShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  spots.forEach((spot, i) => {
    const tilt = (rand() - 0.5) * 0.16;
    const lean = rand() * Math.PI * 2;
    e.set(Math.cos(lean) * tilt, 0, Math.sin(lean) * tilt);
    q.setFromEuler(e);
    s.set(1, 0.9 + rand() * 0.3, 1);
    p.set(spot.x, spot.h + 3.2, spot.z);
    m.compose(p, q, s);
    trunks.setMatrixAt(i, m);
    e.set(0, rand() * Math.PI, 0);
    q.setFromEuler(e);
    const cs = 0.85 + rand() * 0.45;
    s.set(cs, 0.38 + rand() * 0.1, cs);
    p.set(spot.x, spot.h + 7.4, spot.z);
    m.compose(p, q, s);
    canopies.setMatrixAt(i, m);
    canopies.setColorAt(i, new THREE.Color(rand() < 0.5 ? 0x2f8f46 : 0x3aa855));
  });
  canopies.instanceColor.needsUpdate = true;
  group.add(trunks);
  group.add(canopies);
  return group;
}

// Low shrubs and grass tufts near the beaches, one InstancedMesh, two greens.
function buildBushes(THREE, seed) {
  const rand = createRandom(seed * 17 + 9);
  const spots = [];
  for (let i = 0; i < 500 && spots.length < 200; i += 1) {
    const isl = ISLANDS[Math.floor(rand() * ISLANDS.length)];
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * isl.r * 0.9;
    const x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d;
    const h = groundHeight(x, z, seed);
    if (h < 2 || h > 30) continue;
    if (Math.abs(x - RUNWAY.x) < 70 && z > -160 && z < 260) continue;
    if (Math.abs(x - RUNWAY.x) < 55 && Math.abs(z - RUNWAY.z) < RUNWAY.length / 2 + 40) continue;
    spots.push({ x, z, h });
  }
  const group = new THREE.Group();
  if (spots.length === 0) return group;
  const geo = new THREE.SphereGeometry(1.6, 6, 4);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const bushes = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  spots.forEach((spot, i) => {
    e.set(0, rand() * Math.PI, 0);
    q.setFromEuler(e);
    const bs = 0.7 + rand() * 0.9;
    s.set(bs, bs * 0.45, bs);
    p.set(spot.x, spot.h + 0.5, spot.z);
    m.compose(p, q, s);
    bushes.setMatrixAt(i, m);
    bushes.setColorAt(i, new THREE.Color(rand() < 0.5 ? 0x2a7a3a : 0x4a9a3f));
  });
  bushes.instanceColor.needsUpdate = true;
  group.add(bushes);
  return group;
}

// Small houses with warm windows beside the airstrip, a wooden pier and boats.
function buildSettlement(THREE, seed) {
  const group = new THREE.Group();
  const boats = [];
  const houseColors = [0xf2e6c9, 0xffffff, 0xe8b48a, 0xcfe3ee, 0xf6d9a8];
  const spots = [[258, -24], [264, 28], [256, 82], [302, 8], [296, 62]];
  spots.forEach(([x, z], i) => {
    const gy = groundHeight(x, z, seed);
    const house = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(7, 4.5, 6),
      new THREE.MeshLambertMaterial({ color: houseColors[i % houseColors.length], flatShading: true }));
    base.position.y = 2.25;
    base.castShadow = true;
    house.add(base);
    const roofColors = [0xa85438, 0x2f5a66, 0x3a3f45];
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 3.2, 4),
      new THREE.MeshLambertMaterial({ color: roofColors[i % roofColors.length], flatShading: true }));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 6.1;
    roof.castShadow = true;
    house.add(roof);
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
    for (const wx of [-1.8, 1.8]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), winMat);
      win.position.set(wx, 2.6, 3.02);
      house.add(win);
    }
    house.position.set(x, gy - 0.2, z);
    house.rotation.y = (i % 2 ? 0.4 : -0.3);
    group.add(house);
  });
  // Wooden pier reaching into the sea east of the strip.
  const pier = new THREE.Group();
  const plankMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44, flatShading: true });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(58, 0.5, 3), plankMat);
  deck.position.set(428, 1.0, 150);
  deck.castShadow = true;
  pier.add(deck);
  for (let i = 0; i < 6; i += 1) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.4, 6), plankMat);
    post.position.set(404 + i * 10, 0.2, 150);
    pier.add(post);
  }
  group.add(pier);
  // Two moored boats that bob on the swell.
  const boatSpots = [[472, 168, 0.4], [-450, 610, 2.2]];
  for (const [x, z, phase] of boatSpots) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.6, 3),
      new THREE.MeshLambertMaterial({ color: 0xf5f2ea, flatShading: true }));
    hull.position.y = 0.6;
    boat.add(hull);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.5, 3.1),
      new THREE.MeshLambertMaterial({ color: 0xd43d2a }));
    stripe.position.y = 1.1;
    boat.add(stripe);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 2.2),
      new THREE.MeshLambertMaterial({ color: 0x3a6b8a, flatShading: true }));
    cabin.position.set(-1, 1.9, 0);
    boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6),
      new THREE.MeshLambertMaterial({ color: 0x5a4632 }));
    mast.position.set(1.4, 4.2, 0);
    boat.add(mast);
    boat.position.set(x, 0.4, z);
    boat.rotation.y = phase;
    group.add(boat);
    boats.push({ mesh: boat, phase });
  }
  return { group, boats };
}

// Asphalt texture generated at runtime (no file, no network): speckle
// noise plus two dark tyre streaks running the length of the strip.
function makeAsphaltTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#33373f';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i += 1) {
    const v = 40 + Math.floor(Math.random() * 40);
    ctx.fillStyle = 'rgba(' + v + ',' + (v + 3) + ',' + (v + 8) + ',0.35)';
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  ctx.fillStyle = 'rgba(18,19,23,0.55)';
  ctx.fillRect(38, 0, 10, 128);
  ctx.fillRect(80, 0, 10, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 4);
  return tex;
}

function buildRunway(THREE, night) {
  const group = new THREE.Group();
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(RUNWAY.width, 1.6, RUNWAY.length),
    new THREE.MeshLambertMaterial({ color: 0x33373f }),
  );
  strip.position.set(RUNWAY.x, RUNWAY.groundY + 0.8, RUNWAY.z);
  strip.receiveShadow = true;
  group.add(strip);
  // Textured asphalt skin on top of the strip, under the painted markings.
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(RUNWAY.width, RUNWAY.length),
    new THREE.MeshLambertMaterial({ map: makeAsphaltTexture(THREE) }));
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set(RUNWAY.x, RUNWAY.groundY + 1.62, RUNWAY.z);
  asphalt.receiveShadow = true;
  group.add(asphalt);
  // Threshold piano keys at both ends + touchdown-zone bars.
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const zend of [-1, 1]) {
    for (let k = -2; k <= 2; k += 1) {
      const key = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 8), whiteMat);
      key.position.set(RUNWAY.x + k * 4.4, RUNWAY.groundY + 1.8, RUNWAY.z + zend * (RUNWAY.length / 2 - 8));
      group.add(key);
    }
  }
  for (const zd of [-64, -40, 40, 64]) {
    for (const side of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 2.4), whiteMat);
      bar.position.set(RUNWAY.x + side * 6.5, RUNWAY.groundY + 1.8, RUNWAY.z + zd);
      group.add(bar);
    }
  }
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
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), lightMat);
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
  // PAPI approach lights: two white, two red beside the threshold.
  const papiWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const papiRed = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  for (let i = 0; i < 4; i += 1) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 1.6), i < 2 ? papiWhite : papiRed);
    lamp.position.set(RUNWAY.x + 22, RUNWAY.groundY + 2.0, RUNWAY.z + 92 + i * 5);
    group.add(lamp);
  }
  // Approach lights marching south from the threshold, so the runway is
  // visible from far out on final.
  for (let i = 0; i < 5; i += 1) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 6), lightMat);
    lamp.position.set(RUNWAY.x, RUNWAY.groundY + 2.5, RUNWAY.z + RUNWAY.length / 2 + 24 + i * 26);
    group.add(lamp);
  }
  // Control tower beside the strip, on the flat corridor ground: glass cab,
  // red beacon and antenna.
  const towerMat = new THREE.MeshLambertMaterial({ color: 0x5a6b80, flatShading: true });
  const tower = new THREE.Mesh(new THREE.BoxGeometry(4.5, 13, 4.5), towerMat);
  tower.position.set(RUNWAY.x + 40, RUNWAY.groundY + 8.5, RUNWAY.z + 40);
  tower.castShadow = true;
  group.add(tower);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.6, 6.5),
    new THREE.MeshLambertMaterial({ color: 0x9fd8ef, flatShading: true }));
  cab.position.set(RUNWAY.x + 40, RUNWAY.groundY + 16, RUNWAY.z + 40);
  group.add(cab);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  beacon.position.set(RUNWAY.x + 40, RUNWAY.groundY + 18.2, RUNWAY.z + 40);
  group.add(beacon);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 4, 6),
    new THREE.MeshLambertMaterial({ color: 0x2b2f36 }));
  antenna.position.set(RUNWAY.x + 40, RUNWAY.groundY + 20.5, RUNWAY.z + 40);
  group.add(antenna);
  return group;
}

function buildClouds(THREE, rand) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xf2f5f8, transparent: true, opacity: 0.85 });
  const geo = new THREE.SphereGeometry(1, 7, 6);
  for (let i = 0; i < 18; i += 1) {
    const puff = new THREE.Group();
    const n = 3 + Math.floor(rand() * 2);
    for (let j = 0; j < n; j += 1) {
      const s = new THREE.Mesh(geo, mat);
      const r = 14 + rand() * 22;
      s.scale.set(r, r * 0.5, r * 0.7);
      s.position.set((rand() - 0.5) * 55, (rand() - 0.5) * 6, (rand() - 0.5) * 24);
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
 * group.userData carries the animated bits render.js drives each frame:
 * seaMat (wave time + night), clouds (drift), boats (bob), lavaMat/lavaLight.
 */
export function buildTerrain(THREE, seed, night, storm) {
  const rand = createRandom(seed * 31 + 5);
  const group = new THREE.Group();
  const sea = buildSea(THREE, night);
  group.add(sea.mesh);
  group.add(buildFoam(THREE));
  for (const isl of ISLANDS) group.add(buildIsland(THREE, isl, seed));
  group.add(buildPalms(THREE, seed));
  group.add(buildBushes(THREE, seed));
  const settlement = buildSettlement(THREE, seed);
  group.add(settlement.group);
  // Volcano crater glow: molten disc + warm point light, gently pulsing.
  const lavaMat = new THREE.MeshBasicMaterial({ color: PALETTE.lava, transparent: true, opacity: 0.95 });
  const lava = new THREE.Mesh(new THREE.CircleGeometry(26, 12), lavaMat);
  lava.rotation.x = -Math.PI / 2;
  const volc = ISLANDS[1];
  lava.position.set(volc.x, 298, volc.z);
  group.add(lava);
  const lavaLight = new THREE.PointLight(0xff6a2a, 1.4, 260, 1.5);
  lavaLight.position.set(volc.x, 310, volc.z);
  group.add(lavaLight);
  group.add(buildRunway(THREE, night));
  const clouds = buildClouds(THREE, rand);
  group.add(clouds);
  // Storm cells only on storm routes — a clear lagoon should look clear.
  const stormBuilt = storm ? buildStormCells(THREE, rand, seed) : { group: new THREE.Group(), cells: [] };
  group.add(stormBuilt.group);
  group.userData.seaMat = sea.mat;
  group.userData.clouds = clouds;
  group.userData.boats = settlement.boats;
  group.userData.lavaMat = lavaMat;
  group.userData.lavaLight = lavaLight;
  return { group, stormCells: stormBuilt.cells, night };
}
