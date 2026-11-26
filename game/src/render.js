// Three.js rendering: the scene, the golden-hour light, the plane built from
// primitives, the chase / cockpit / wing cameras, and the mission markers
// (rings, mail pads, water zone) that update as the mission advances.
import { PALETTE } from './config.js';
import { buildTerrain, RUNWAY, WATER_ZONE, groundHeight } from './terrain.js';

/** The mail plane, built from primitives: fuselage, wings, tail, propeller, floats. */
export function buildPlane(THREE) {
  const plane = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: PALETTE.planeRed });
  const white = new THREE.MeshLambertMaterial({ color: PALETTE.planeWhite });
  const gold = new THREE.MeshLambertMaterial({ color: PALETTE.planeGold });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.1, 9, 10), red);
  fuselage.rotation.x = Math.PI / 2;
  plane.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.4, 10), gold);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -5.6;
  plane.add(nose);
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(1.35, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0x9fd8ef }));
  cabin.scale.set(1, 0.8, 1.6);
  cabin.position.set(0, 1.1, -0.6);
  plane.add(cabin);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(15, 0.35, 2.6), white);
  wing.position.set(0, 0.1, -0.4);
  plane.add(wing);
  const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 2.6), red);
  wingTipL.position.set(-7.6, 0.1, -0.4);
  plane.add(wingTipL);
  const wingTipR = wingTipL.clone();
  wingTipR.position.x = 7.6;
  plane.add(wingTipR);
  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.3, 1.6), white);
  tailWing.position.set(0, 0.5, 4.2);
  plane.add(tailWing);
  const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 1.8), red);
  tailFin.position.set(0, 1.4, 4.2);
  plane.add(tailFin);
  // Propeller (spins in the loop) + spinner.
  const prop = new THREE.Group();
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const blade1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.4, 0.18), bladeMat);
  const blade2 = blade1.clone(); blade2.rotation.z = Math.PI / 2;
  prop.add(blade1); prop.add(blade2);
  prop.position.z = -6.9;
  plane.add(prop);
  // Floats for the seaplane routes.
  for (const side of [-1, 1]) {
    const float = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.4, 5.4, 8), white);
    float.rotation.x = Math.PI / 2;
    float.position.set(side * 2.2, -1.9, -0.5);
    plane.add(float);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.25), dark);
    strut.position.set(side * 2.2, -1.1, -0.5);
    plane.add(strut);
  }
  plane.userData.prop = prop;
  return plane;
}

export function createRenderer(canvas) {
  const THREE = window.THREE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyDay);
  scene.fog = new THREE.Fog(PALETTE.fogDay, 700, 2600);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 5000);

  const sun = new THREE.DirectionalLight(0xffe3b3, 1.35);
  sun.position.set(600, 500, -400);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd9e8, 0.75));
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a6b4a, 0.5);
  scene.add(hemi);

  const plane = buildPlane(THREE);
  scene.add(plane);

  let terrain = null;
  let markers = null;
  let night = false;
  let snapNext = true; // first frame (or after a route start) snaps, never swoops from the origin

  function setNight(isNight) {
    night = isNight;
    scene.background.setHex(isNight ? PALETTE.skyNight : PALETTE.skyDay);
    scene.fog.color.setHex(isNight ? PALETTE.fogNight : PALETTE.fogDay);
    sun.intensity = isNight ? 0.25 : 1.35;
    sun.color.setHex(isNight ? 0x8fb0ff : 0xffe3b3);
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
      const mat = new THREE.MeshBasicMaterial({ color: ring.fuel ? 0x37e08a : PALETTE.ringNext });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.position.set(ring.x, ring.y, ring.z);
      mesh.userData.ring = ring;
      markers.add(mesh);
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
        child.material.color.setHex(ring.done ? 0x2a7a55 : (ring.fuel ? 0x37e08a : PALETTE.ringNext));
        child.material.transparent = ring.done;
        child.material.opacity = ring.done ? 0.25 : 1;
      }
    }
  }

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const planePos = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

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
        if (child.userData.ring && !child.userData.ring.done) {
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
