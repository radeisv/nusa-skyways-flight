// Three.js rendering: ACES-toned golden-hour light with soft shadows, a
// gradient sky dome with sun and stars, the rebuilt mail plane, chase /
// cockpit / wing cameras, and the mission markers (rings, mail pads, water
// zone) that update as the mission advances. Visuals only — no gameplay,
// physics or mission logic lives here.
import { PALETTE } from './config.js';
import { buildTerrain, RUNWAY, WATER_ZONE, groundHeight } from './terrain.js';

// Radial glow sprite texture, generated at runtime (no file, no network).
function makeGlowTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Soft-edged propeller blur disc: dark centre fading to transparent at the
// rim, so the spinning prop reads as motion blur, not a grey dinner plate.
function makeDiscTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(16,18,26,0.5)');
  g.addColorStop(0.55, 'rgba(16,18,26,0.28)');
  g.addColorStop(0.85, 'rgba(16,18,26,0.08)');
  g.addColorStop(1, 'rgba(16,18,26,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** The mail plane, rebuilt as a MODERN current amphibian (Cessna 208 Caravan
 * Amphibian / Icon A5 class): sleek glossy-white fuselage with a dark teal
 * cheatline, large tinted glass canopy, 3-blade prop that fades into a blur
 * disc at speed, T-tail with winglets, streamlined floats. Footprint is
 * IDENTICAL to the old plane (length ~11.4 m, span 15 m, same origin and
 * attachment points, wing stays mid at y 0.1) so the screenshot staging,
 * wing camera and flight behaviour are unchanged. */
export function buildPlane(THREE) {
  const plane = new THREE.Group();
  // Modern livery, defined locally (config PALETTE is off limits for this).
  const white = new THREE.MeshStandardMaterial({ color: 0xf7f5ef, metalness: 0.30, roughness: 0.28 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x14425e, metalness: 0.45, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.3, roughness: 0.6 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x1a2f45, shininess: 200, specular: 0xdfefff });
  const winMat = new THREE.MeshBasicMaterial({ color: 0x101c28 });
  // Shadows only on the main masses: fuselage, wing, fin, floats.
  function add(mesh, casts) {
    plane.add(mesh);
    mesh.castShadow = casts === true;
    return mesh;
  }

  // Sleek fuselage: 24-seg tapered cylinder + rounded nose cap + tail cone.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.05, 9, 24), white);
  fuselage.rotation.x = Math.PI / 2;
  add(fuselage, true);
  const noseCap = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 16), white);
  noseCap.scale.set(1, 1, 0.85);
  noseCap.position.z = -4.9;
  add(noseCap, true);
  const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.32, 2.2, 14), white);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.z = 5.5;
  add(tailCone, true);
  // Teal tail band: reads from directly behind, where the cheatline hides.
  const tailBand = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.6, 14), teal);
  tailBand.rotation.x = Math.PI / 2;
  tailBand.position.z = 5.5;
  add(tailBand);
  // Teal cheatline stripes along both flanks.
  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 7.2), teal);
    stripe.position.set(side * 1.47, 0.15, -0.3);
    add(stripe);
  }
  // Large tinted glass canopy + separate windscreen.
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(1.35, 20, 14), glass);
  cabin.scale.set(1, 0.72, 1.9);
  cabin.position.set(0, 1.2, -0.9);
  add(cabin);
  const windscreen = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 10), glass);
  windscreen.scale.set(1, 0.62, 1.1);
  windscreen.position.set(0, 1.05, -2.6);
  add(windscreen);
  // Teal belly stripe: breaks up the white underside seen from below.
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 6), teal);
  belly.position.set(0, -1.38, -0.5);
  add(belly);
  // Cabin windows, four a side.
  const winGeo = new THREE.CircleGeometry(0.32, 12);
  for (const side of [-1, 1]) {
    for (const z of [0.6, 1.7, 2.8, 3.9]) {
      const win = new THREE.Mesh(winGeo, winMat);
      win.position.set(side * 1.44, 0.6, z);
      win.rotation.y = side * Math.PI / 2;
      add(win);
    }
  }
  // Main wing (mid, y 0.1) with teal winglets and nav lights.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(15, 0.35, 2.6), white);
  wing.position.set(0, 0.1, -0.4);
  add(wing, true);
  for (const side of [-1, 1]) {
    const winglet = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.2, 2.2), teal);
    winglet.position.set(side * 7.55, 0.7, -0.4);
    add(winglet, true);
  }
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2a22 }));
  navL.position.set(-7.9, 0.1, -0.4);
  add(navL);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0x2aff66 }));
  navR.position.set(7.9, 0.1, -0.4);
  add(navR);
  // T-tail: tall fin with a teal stripe, stabiliser on TOP of the fin.
  const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.2, 1.8), white);
  tailFin.position.set(0, 1.9, 4.2);
  add(tailFin, true);
  const finStripe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.1, 1.8), teal);
  finStripe.position.set(0, 2.6, 4.2);
  add(finStripe);
  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.3, 1.6), white);
  tailWing.position.set(0, 3.3, 4.2);
  add(tailWing, true);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }));
  strobe.position.set(0, 3.55, 4.2);
  add(strobe);
  // Propeller: 3 thin blades at 120 degrees, fading with throttle so at
  // full power only the blur disc reads — never a black X.
  const prop = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: 0.4, roughness: 0.5, transparent: true });
  for (let i = 0; i < 3; i += 1) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.8, 0.15), bladeMat);
    blade.rotation.z = (i * Math.PI * 2) / 3;
    prop.add(blade);
  }
  prop.position.z = -6.9;
  plane.add(prop);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 12), white);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -7.0;
  add(spinner);
  const spinnerTip = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 12), teal);
  spinnerTip.rotation.x = -Math.PI / 2;
  spinnerTip.position.z = -7.5;
  add(spinnerTip);
  const blurDisc = new THREE.Mesh(new THREE.CircleGeometry(2.9, 28),
    new THREE.MeshBasicMaterial({ map: makeDiscTexture(THREE), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  blurDisc.position.z = -6.82;
  add(blurDisc);
  // Landing gear: struts + wheels (kept, tucked for the amphibian).
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.3, 0.25), dark);
    strut.position.set(side * 1.3, -1.6, 0.9);
    add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.3, -2.25, 0.9);
    add(wheel);
  }
  // Streamlined floats with a teal stripe and step, same positions as before.
  for (const side of [-1, 1]) {
    const float = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.4, 5.4, 10), white);
    float.rotation.x = Math.PI / 2;
    float.position.set(side * 2.2, -1.9, -0.5);
    add(float, true);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 10), white);
    tip.rotation.x = -Math.PI / 2;
    tip.position.set(side * 2.2, -1.9, -3.4);
    add(tip, true);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 4.6), teal);
    stripe.position.set(side * 2.78, -1.9, -0.5);
    add(stripe);
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 0.5), dark);
    step.position.set(side * 2.2, -2.35, 0.6);
    add(step);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.25), dark);
    strut.position.set(side * 2.2, -1.1, -0.5);
    add(strut);
  }
  plane.userData.prop = prop;
  plane.userData.blurDisc = blurDisc;
  plane.userData.strobe = strobe;
  plane.userData.bladeMat = bladeMat;
  return plane;
}

export function createRenderer(canvas) {
  const THREE = window.THREE;
  // Correct colour pipeline (three r149): hex colours are authored in sRGB
  // and converted to the linear working space, ACES films the result, and
  // the output is encoded back to sRGB. Without this, sRGB output double-
  // brightens every material and the whole scene washes out.
  THREE.ColorManagement.legacyMode = false;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  // Modern tone: ACES filmic + sRGB output, soft shadows.
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ec9e8);
  scene.fog = new THREE.Fog(0xd6ab7f, 1100, 3200);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 9000);

  // --- Gradient sky dome with sun disc + glow, and stars at night. ---
  const SUN_DIR = new THREE.Vector3(-0.55, 0.38, -0.55).normalize();
  const skyUniforms = {
    uTop: { value: new THREE.Color(0x2f6fc4) },
    uHorizon: { value: new THREE.Color(0xdfa172) },
    uSunDir: { value: SUN_DIR },
    uSunColor: { value: new THREE.Color(0xffe9b8) },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uTop, uHorizon, uSunDir, uSunColor;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.08, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(max(h, 0.0), 0.45));
        float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(s, 700.0) * 1.2 + pow(s, 24.0) * 0.12 + pow(s, 6.0) * 0.015);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4200, 24, 14), skyMat);
  scene.add(sky);
  // Stars, visible only at night.
  const starGeo = new THREE.BufferGeometry();
  {
    const n = 350;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const y = 0.12 + Math.random() * 0.85;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      pos[i * 3] = Math.cos(a) * r * 4100;
      pos[i * 3 + 1] = y * 4100;
      pos[i * 3 + 2] = Math.sin(a) * r * 4100;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  }
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // --- Lights: warm directional sun (casts the soft shadows), sky/ground
  // hemisphere fill, and a low ambient so nothing crushes to black. ---
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -320;
  sun.shadow.camera.right = 320;
  sun.shadow.camera.top = 320;
  sun.shadow.camera.bottom = -320;
  sun.shadow.camera.near = 50;
  sun.shadow.camera.far = 1600;
  sun.shadow.bias = -0.0008;
  sun.position.copy(SUN_DIR).multiplyScalar(700);
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a6b52, 0.75);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0xbfd9e8, 0.3));

  const glowTex = makeGlowTexture(THREE);
  const plane = buildPlane(THREE);
  scene.add(plane);

  let terrain = null;
  let markers = null;
  let night = false;
  let snapNext = true; // first frame (or after a route start) snaps, never swoops from the origin

  // --- Cheap particle pool: wingtip contrails + water splash. ---
  const PARTICLES = 40;
  const particles = [];
  for (let i = 0; i < PARTICLES; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
    }));
    sprite.visible = false;
    scene.add(sprite);
    particles.push({ sprite, life: 0, maxLife: 1, vel: new THREE.Vector3(), grow: 1 });
  }
  let particleCursor = 0;
  let contrailFlip = false;
  let splashActive = false;
  function spawnParticle(x, y, z, vx, vy, vz, life, size, grow, opacity) {
    const p = particles[particleCursor];
    particleCursor = (particleCursor + 1) % PARTICLES;
    p.sprite.visible = true;
    p.sprite.position.set(x, y, z);
    p.sprite.scale.set(size, size, 1);
    p.sprite.material.opacity = opacity;
    p.sprite.material.color.setHex(0xffffff);
    p.vel.set(vx, vy, vz);
    p.life = life;
    p.maxLife = life;
    p.grow = grow;
    p.baseOpacity = opacity;
  }
  function updateParticles(dt) {
    for (const p of particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sprite.visible = false; p.sprite.material.opacity = 0; continue; }
      p.sprite.position.addScaledVector(p.vel, dt);
      const f = p.life / p.maxLife;
      p.sprite.material.opacity = p.baseOpacity * f;
      const s = p.sprite.scale.x + p.grow * dt;
      p.sprite.scale.set(s, s, 1);
    }
  }

  function setNight(isNight) {
    night = isNight;
    if (isNight) {
      skyUniforms.uTop.value.setHex(0x0a1830);
      skyUniforms.uHorizon.value.setHex(0x1a2f4a);
      skyUniforms.uSunColor.value.setHex(0xdfe9ff);
      scene.background.setHex(PALETTE.skyNight);
      scene.fog.color.setHex(0x16283f);
      sun.intensity = 0.35;
      sun.color.setHex(0x8fb0ff);
      hemi.intensity = 0.35;
      starMat.opacity = 0.9;
    } else {
      skyUniforms.uTop.value.setHex(0x2f6fc4);
      skyUniforms.uHorizon.value.setHex(0xdfa172);
      skyUniforms.uSunColor.value.setHex(0xffe9b8);
      scene.background.setHex(PALETTE.skyDay);
      scene.fog.color.setHex(0xd6ab7f);
      sun.intensity = 2.2;
      sun.color.setHex(0xffd9a0);
      hemi.intensity = 0.75;
      starMat.opacity = 0;
    }
    if (terrain && terrain.group.userData.seaMat) {
      terrain.group.userData.seaMat.uniforms.uNight.value = isNight ? 1 : 0;
      terrain.group.userData.seaMat.uniforms.uFogColor.value.setHex(isNight ? 0x16283f : 0xd6ab7f);
    }
  }

  function loadWorld(seed, isNight, storm) {
    if (terrain) { scene.remove(terrain.group); }
    const built = buildTerrain(THREE, seed, isNight, storm);
    terrain = built;
    scene.add(built.group);
    setNight(isNight);
    return built.stormCells;
  }

  function buildMarkers(mission) {
    if (markers) { scene.remove(markers); }
    markers = new THREE.Group();
    const ringGeo = new THREE.TorusGeometry(26, 1.8, 10, 28);
    for (const ring of mission.rings || []) {
      const color = ring.fuel ? 0x37e08a : PALETTE.ringNext;
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.position.set(ring.x, ring.y, ring.z);
      mesh.userData.ring = ring;
      markers.add(mesh);
      // Soft halo so the ring pops against sky and sea.
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color, transparent: true, opacity: 0.3, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      halo.scale.set(70, 70, 1);
      halo.position.copy(mesh.position);
      halo.userData.ring = ring;
      markers.add(halo);
    }
    const padGeo = new THREE.CylinderGeometry(30, 30, 1, 24);
    for (const pad of mission.pads || []) {
      // Pads sit on the hilltops: rest the disc and its pole on the real ground.
      const gy = groundHeight(pad.x, pad.z, mission.route.seed);
      const mesh = new THREE.Mesh(padGeo,
        new THREE.MeshBasicMaterial({ color: PALETTE.pad, transparent: true, opacity: 0.85 }));
      mesh.position.set(pad.x, gy + 0.6, pad.z);
      markers.add(mesh);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 26, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff }));
      pole.position.set(pad.x, gy + 13, pad.z);
      markers.add(pole);
      const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0xffd23d, transparent: true, opacity: 0.55, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      beacon.scale.set(60, 60, 1);
      beacon.position.set(pad.x, gy + 28, pad.z);
      markers.add(beacon);
    }
    if (mission.waterTarget) {
      const zone = new THREE.Mesh(new THREE.TorusGeometry(WATER_ZONE.r, 2, 8, 40),
        new THREE.MeshBasicMaterial({ color: 0x37e08a }));
      zone.rotation.x = Math.PI / 2;
      zone.position.set(WATER_ZONE.x, 2, WATER_ZONE.z);
      markers.add(zone);
    }
    scene.add(markers);
  }

  function updateMarkers(mission) {
    if (!markers) return;
    for (const child of markers.children) {
      if (child.userData.ring) {
        const ring = child.userData.ring;
        const done = ring.done;
        const color = done ? 0x2a7a55 : (ring.fuel ? 0x37e08a : PALETTE.ringNext);
        if (child.isSprite) {
          child.material.color.setHex(color);
          child.material.opacity = done ? 0.08 : 0.3;
        } else {
          child.material.color.setHex(color);
          child.material.transparent = done;
          child.material.opacity = done ? 0.25 : 1;
        }
      }
    }
  }

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const planePos = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const tmpV = new THREE.Vector3();

  function draw(planeState, mode, dt, timeSec) {
    planePos.set(planeState.x, planeState.y, planeState.z);
    plane.position.copy(planePos);
    // Three.js: forward is -Z; our heading 0 faces +Z, so rotate by heading + PI.
    plane.rotation.order = 'YXZ';
    plane.rotation.y = planeState.heading + Math.PI;
    plane.rotation.z = -planeState.bank * 0.9;
    plane.rotation.x = -planeState.pitch * 0.8;
    if (plane.userData.prop) {
      plane.userData.prop.rotation.z += dt * (4 + planeState.throttle * 0.55);
    }
    if (plane.userData.blurDisc) {
      plane.userData.blurDisc.material.opacity = 0.7 + (planeState.throttle / 100) * 0.3;
    }
    if (plane.userData.bladeMat) {
      plane.userData.bladeMat.opacity = Math.min(0.5, Math.max(0.08, 1 - planeState.throttle * 0.01));
    }
    // Tail strobe: short double blink, once a second.
    if (plane.userData.strobe) {
      const ph = timeSec % 1;
      plane.userData.strobe.visible = ph < 0.08 || (ph > 0.16 && ph < 0.24);
    }
    // Sun + shadows follow the plane so the shadow frustum stays crisp.
    sun.position.copy(planePos).addScaledVector(SUN_DIR, 700);
    sun.target.position.copy(planePos);
    sun.target.updateMatrixWorld();
    // Living world: sea waves, drifting clouds, bobbing boats, lava pulse.
    if (terrain) {
      const ud = terrain.group.userData;
      if (ud.seaMat) ud.seaMat.uniforms.uTime.value = timeSec;
      if (ud.clouds) {
        ud.clouds.position.x += dt * 2.5;
        if (ud.clouds.position.x > 1200) ud.clouds.position.x = -1200;
      }
      if (ud.boats) {
        for (const b of ud.boats) {
          b.mesh.position.y = 0.4 + Math.sin(timeSec * 1.1 + b.phase) * 0.25;
          b.mesh.rotation.z = Math.sin(timeSec * 0.9 + b.phase) * 0.03;
        }
      }
      if (ud.lavaMat) ud.lavaMat.opacity = 0.85 + Math.sin(timeSec * 2) * 0.15;
      if (ud.lavaLight) ud.lavaLight.intensity = 1.2 + Math.sin(timeSec * 2) * 0.4;
    }
    // Wingtip contrails when banking hard and fast.
    if (planeState.airborne && Math.abs(planeState.bank) > 0.55 && planeState.speedKt > 110) {
      contrailFlip = !contrailFlip;
      const side = contrailFlip ? 1 : -1;
      tmpV.set(side * 7.5, 0.1, -0.4);
      plane.localToWorld(tmpV);
      spawnParticle(tmpV.x, tmpV.y, tmpV.z, 0, 0.2, 0, 0.9, 2.5, 5, 0.32);
    }
    // Splash on a water touchdown.
    const overWater = groundHeight(planeState.x, planeState.z, 101) <= 0.5;
    if (planeState.landed && overWater && planeState.speedKt > 25 && !splashActive) {
      splashActive = true;
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        spawnParticle(
          planeState.x + Math.cos(a) * 3, 1.5, planeState.z + Math.sin(a) * 3,
          Math.cos(a) * 6, 4 + Math.random() * 4, Math.sin(a) * 6,
          0.8, 3, 6, 0.5);
      }
    }
    if (!planeState.landed) splashActive = false;
    updateParticles(dt);
    fwd.set(Math.sin(planeState.heading), 0, Math.cos(planeState.heading));
    if (mode === 'cockpit') {
      camPos.copy(planePos).addScaledVector(fwd, -1.5);
      camPos.y += 1.6;
      camLook.copy(planePos).addScaledVector(fwd, 60);
      camLook.y += Math.sin(planeState.pitch) * 30;
      camera.position.copy(camPos);
      camera.up.copy(up);
      camera.lookAt(camLook);
      plane.visible = false;
    } else if (mode === 'wing') {
      camPos.copy(planePos);
      camPos.x += Math.cos(planeState.heading) * 9;
      camPos.z -= Math.sin(planeState.heading) * 9;
      camPos.y += 1.2;
      camera.position.copy(camPos);
      camera.lookAt(planePos.x + fwd.x * 40, planePos.y, planePos.z + fwd.z * 40);
      plane.visible = true;
    } else {
      // Chase: behind, above and a little to the side, easing toward the
      // plane so the camera never fights — a three-quarter rear view that
      // shows the fuselage, wing and tail, not just the tail cap.
      const right = new THREE.Vector3(Math.cos(planeState.heading), 0, -Math.sin(planeState.heading));
      const want = new THREE.Vector3(
        planePos.x - fwd.x * 26 + right.x * 7, planePos.y + 7.5, planePos.z - fwd.z * 26 + right.z * 7);
      if (snapNext) camera.position.copy(want);
      else camera.position.lerp(want, Math.min(1, dt * 4.5));
      snapNext = false;
      if (camera.position.distanceTo(planePos) > 60) camera.position.copy(want);
      camLook.copy(planePos).addScaledVector(fwd, 34);
      camLook.y += 2;
      camera.lookAt(camLook);
      plane.visible = true;
    }
    // Rings gently pulse so the next target reads at a glance.
    if (markers) {
      for (const child of markers.children) {
        if (child.userData.ring && !child.userData.ring.done && !child.isSprite) {
          const s = 1 + Math.sin(timeSec * 3) * 0.05;
          child.scale.set(s, s, s);
        }
      }
    }
    renderer.render(scene, camera);
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return {
    loadWorld, buildMarkers, updateMarkers, draw, resize, setNight,
    snapCamera() { snapNext = true; },
    cameraPosition() { return { x: camera.position.x, y: camera.position.y, z: camera.position.z }; },
    debugScene() {
      const out = [];
      scene.traverse((o) => {
        if (o.isMesh) {
          out.push({ type: o.geometry?.type, pos: [+o.position.x.toFixed(1), +o.position.y.toFixed(1), +o.position.z.toFixed(1)],
            scale: [+o.scale.x.toFixed(2), +o.scale.y.toFixed(2), +o.scale.z.toFixed(2)],
            color: o.material?.color ? '#' + o.material.color.getHexString() : null,
            visible: o.visible });
        }
      });
      return out;
    },
    get night() { return night; },
  };
}
