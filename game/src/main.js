// NUSA SKYWAYS — Archipelago Air Mail: boot and the one loop.
// Input is read every frame, the world advances in fixed 1/60 s steps, and the
// renderer paints what is there. Screens: title, campaign select, hangar,
// playing, paused, mission complete, crash. ?shot=cover|rings|landing|campaign
// stages that scene instead of running the loop and sets window.__shotReady.
import { STEP, ROUTES, UPGRADES, CAMERA_MODES } from './config.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_CAMERA, ACTION_RESTART, ACTION_MUTE } from './input.js';
import { createPlaneState, stepFlight, EVENT_CRASH, EVENT_LANDED } from './flight-model.js';
import { createMission, updateMission, currentTarget } from './missions.js';
import { loadSave, storeSave, awardRoute, buyUpgrade, routeById, upgradeCost } from './campaign.js';
import { createRenderer } from './render.js';
import { updateHud, setHudVisible } from './hud.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { groundHeight } from './terrain.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const overlay = document.getElementById('overlay');
const menu = document.getElementById('menu');
const renderer = createRenderer(canvas);
const audio = createAudio();
const input = createInput(canvas);

let save = loadSave();
let screen = 'title';
let route = ROUTES[0];
let plane = null;
let mission = null;
let stormCells = [];
let timeSec = 0;
let cameraMode = 'chase';
let elapsed = 0;
let dropPressed = false;
let lastWarnBeep = 0;

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyK' && !e.repeat) dropPressed = true;
});

function announce(message) { status.textContent = message; }

// ---------- screens ----------
function showScreen(next) {
  screen = next;
  const inFlight = next === 'playing' || next === 'paused';
  setHudVisible(inFlight);
  if (next === 'paused') {
    // Pause keeps the HUD and shows a small panel on top of the frozen scene.
    overlay.classList.remove('hidden');
    menu.innerHTML = `<h2>PAUSED</h2>
      <p>${route.name} — ${mission ? mission.objective : ''}</p>
      <div><button class="btn" data-action="resume">RESUME (P)</button>
      <button class="btn secondary" data-action="retry">RESTART ROUTE (R)</button>
      <button class="btn secondary" data-action="campaign">QUIT TO ROUTES</button></div>`;
    return;
  }
  overlay.classList.toggle('hidden', inFlight);
  if (inFlight) return;
  if (next === 'title') {
    menu.innerHTML = `
      <h1>NUSA SKYWAYS</h1>
      <div class="tag">✈ ARCHIPELAGO AIR MAIL — fly the mail across Indonesia's islands ✈</div>
      <p>Chase view over a living archipelago. Six routes, rings to thread, mail to
      drop, storms to dodge, runways to kiss — with fuel that runs out and an
      airframe that remembers every hard landing.</p>
      <div><button class="btn" data-action="campaign">FLY — CHOOSE A ROUTE</button>
      <button class="btn secondary" data-action="hangar">HANGAR &amp; UPGRADES</button></div>
      <div class="keys"><b>W/S</b> throttle &nbsp; <b>←/→</b> bank &amp; turn &nbsp; <b>I/K</b> pitch &nbsp;
      <b>K</b> drop mail &nbsp; <b>C</b> camera &nbsp; <b>P</b> pause &nbsp; <b>R</b> restart &nbsp; <b>M</b> mute<br>
      Land gently on the runway or splash down on the floats. Watch fuel, stall and storms.</div>
      <p class="coins-line">🪙 ${save.coins} coins &nbsp;·&nbsp; Routes cleared: ${Object.keys(save.stamps).length}/6</p>`;
  } else if (next === 'campaign') {
    const cards = ROUTES.map((r) => {
      const locked = r.id > save.unlocked;
      const stamped = save.stamps[r.id];
      const best = save.best[r.id];
      return `<div class="card ${locked ? 'locked' : ''}">
        <h3>${r.id}. ${r.name}</h3><div class="sub">${r.sub.toUpperCase()}</div>
        <p>${r.desc}</p>
        <div class="meta">Par ${Math.floor(r.par / 60)}:${String(r.par % 60).padStart(2, '0')} · Reward ${r.coins} coins
        ${r.night ? ' · 🌙 night' : ''}${r.storm ? ' · ⛈ storm' : ''}</div>
        <div class="meta">${stamped ? `<span class="stamp">✔ COMPLETED${best ? ` · best ${best} pts` : ''}</span>` : (locked ? '🔒 Locked — finish the previous route' : 'Ready to fly')}</div>
        <button class="btn" data-action="fly" data-route="${r.id}" ${locked ? 'disabled' : ''}>${stamped ? 'FLY AGAIN' : 'FLY'}</button>
      </div>`;
    }).join('');
    menu.innerHTML = `<h2>CHOOSE A ROUTE</h2>
      <p class="coins-line">🪙 ${save.coins} coins &nbsp;·&nbsp; ${save.unlocked <= 6 ? `Route ${save.unlocked} is your next stop` : 'All routes open!'}</p>
      <div class="cards">${cards}</div>
      <button class="btn secondary" data-action="title">← BACK</button>
      <button class="btn secondary" data-action="hangar">HANGAR</button>`;
  } else if (next === 'hangar') {
    const cards = UPGRADES.map((u) => {
      const level = save.upgrades[u.id] || 0;
      const maxed = level >= u.max;
      const cost = maxed ? 0 : upgradeCost(u, level);
      return `<div class="card">
        <h3>${u.name}</h3><div class="sub">LEVEL ${level}/${u.max}</div>
        <p>${u.desc}</p>
        <div class="meta">${maxed ? 'Fully upgraded' : `Next level: ${cost} coins`}</div>
        <button class="btn" data-action="buy" data-upgrade="${u.id}" ${maxed || save.coins < cost ? 'disabled' : ''}>${maxed ? 'MAXED' : `BUY — ${cost} 🪙`}</button>
      </div>`;
    }).join('');
    menu.innerHTML = `<h2>HANGAR</h2>
      <p>Spend the coins you earn flying. Upgrades apply to every route.</p>
      <p class="coins-line">🪙 ${save.coins} coins</p>
      <div class="cards">${cards}</div>
      <button class="btn secondary" data-action="title">← BACK</button>
      <button class="btn secondary" data-action="campaign">ROUTES</button>`;
  } else if (next === 'complete') {
    const nextRoute = route.id < 6 ? ROUTES[route.id] : null;
    menu.innerHTML = `<h2>ROUTE COMPLETE! 🎉</h2>
      <p class="tag">${route.name} — ${route.sub}</p>
      <p>Score <b>${mission.score}</b> &nbsp;·&nbsp; Time ${fmtTime(timeSec)} &nbsp;·&nbsp;
      Coins earned <b>+${lastAward.coinsEarned}</b> ${lastAward.first ? '(first flight bonus!)' : ''}</p>
      <p class="coins-line">🪙 ${save.coins} coins &nbsp;·&nbsp; ${nextRoute ? `Next: Route ${nextRoute.id} ${nextRoute.name} is now open` : 'All routes complete — you are the sky!'}</p>
      <div><button class="btn" data-action="fly" data-route="${nextRoute ? nextRoute.id : route.id}">${nextRoute ? 'NEXT ROUTE →' : 'FLY AGAIN'}</button>
      <button class="btn secondary" data-action="campaign">ROUTES</button>
      <button class="btn secondary" data-action="hangar">HANGAR</button></div>`;
  } else if (next === 'crash') {
    menu.innerHTML = `<h2>CRASHED 💥</h2>
      <p class="tag">${plane ? plane.crashReason : 'The plane went down.'}</p>
      <p>Score ${mission ? mission.score : 0} &nbsp;·&nbsp; ${route.name} — ${route.sub}<br>
      Tip: keep speed above 55 kt, watch the fuel gauge, and land gently.</p>
      <div><button class="btn" data-action="retry">TRY AGAIN (R)</button>
      <button class="btn secondary" data-action="campaign">ROUTES</button></div>`;
  }
}

function fmtTime(t) {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}

let lastAward = { coinsEarned: 0, first: false };

// ---------- game object used by shots.js ----------
function startRoute(id) {
  route = routeById(id);
  plane = createPlaneState(route, save.upgrades);
  mission = createMission(route);
  stormCells = renderer.loadWorld(route.seed, route.night, !!route.storm);
  renderer.buildMarkers(mission);
  renderer.snapCamera();
  timeSec = 0;
  elapsed = 0;
  showScreen('playing');
  announce(`Route ${route.id}: ${route.name}. ${mission.objective}`);
}

function stepGame(ctl) {
  const events = { ring: false, drop: false, landed: false, dropKey: dropPressed };
  dropPressed = false;
  const flightEvents = stepFlight(plane, ctl, STEP, route.seed,
    route.storm ? stormCells : [], route.kind === 'water');
  if (flightEvents & EVENT_CRASH) {
    audio.crash();
    showScreen('crash');
    announce(`Crashed. ${plane.crashReason}`);
    return;
  }
  if (flightEvents & EVENT_LANDED) events.landed = true;
  const result = updateMission(mission, plane, events, STEP);
  if (events.ring) audio.ring();
  if (events.drop) audio.drop();
  if (events.landed && mission.kind !== 'water') audio.land();
  if (result === 'complete') {
    const timeBonus = Math.max(0, Math.round((route.par - timeSec) * 2));
    mission.score += timeBonus;
    lastAward = awardRoute(save, route, mission.score, timeSec);
    audio.win();
    showScreen('complete');
    announce(`Route complete. Score ${mission.score}.`);
  }
}

const game = {
  get plane() { return plane; },
  get mission() { return mission; },
  get screen() { return screen; },
  startRoute,
  showScreen,
  step(ctl) {
    timeSec += STEP;
    stepGame(ctl);
  },
};

// Menu clicks (mouse).
menu.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  audio.unlock();
  const action = btn.dataset.action;
  if (action === 'campaign') showScreen('campaign');
  else if (action === 'hangar') showScreen('hangar');
  else if (action === 'title') showScreen('title');
  else if (action === 'fly') startRoute(Number(btn.dataset.route));
  else if (action === 'retry') startRoute(route.id);
  else if (action === 'resume') showScreen('playing');
  else if (action === 'buy') {
    if (buyUpgrade(save, btn.dataset.upgrade)) { audio.ring(); showScreen('hangar'); }
  }
});

// ---------- main loop ----------
function readControls() {
  return {
    throttleUp: input.throttleUp(), throttleDown: input.throttleDown(),
    pitchUp: input.pitchUp(), pitchDown: input.pitchDown(),
    bankLeft: input.bankLeft(), bankRight: input.bankRight(),
  };
}

function handleActions() {
  const actions = input.takeActions();
  if (actions & ACTION_MUTE) audio.setMuted(!audio.isMuted());
  if (actions & ACTION_CAMERA) {
    cameraMode = CAMERA_MODES[(CAMERA_MODES.indexOf(cameraMode) + 1) % CAMERA_MODES.length];
  }
  if (screen === 'playing') {
    if (actions & ACTION_PAUSE) showScreen('paused');
    else if (actions & ACTION_RESTART) startRoute(route.id);
  } else if (screen === 'paused') {
    if (actions & ACTION_PAUSE) showScreen('playing');
    else if (actions & ACTION_RESTART) startRoute(route.id);
    else if (actions & ACTION_CONFIRM) showScreen('playing');
  } else if (screen === 'crash' || screen === 'complete') {
    if (actions & ACTION_RESTART) startRoute(route.id);
    else if (actions & ACTION_CONFIRM && screen === 'crash') startRoute(route.id);
  } else if (actions & ACTION_CONFIRM) {
    if (screen === 'title') showScreen('campaign');
  }
}

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  elapsed += dt;
  handleActions();
  if (screen === 'playing' && plane && mission) {
    accumulator += dt;
    while (accumulator >= STEP && screen === 'playing') {
      timeSec += STEP;
      stepGame(readControls());
      accumulator -= STEP;
    }
    if (plane.fuel < 25 && elapsed - lastWarnBeep > 2) { lastWarnBeep = elapsed; audio.warn(); }
    audio.update(plane.throttle, plane.speedKt);
    updateHud(plane, mission, timeSec, mission.score, save.coins, cameraMode, route.name);
    renderer.updateMarkers(mission);
  }
  if (plane) renderer.draw(plane, cameraMode, dt, elapsed);
}

let accumulator = 0;
let last = performance.now();

// ---------- boot ----------
showScreen('title');
if (shot) {
  // Stage the scene with the real rules, paint it, and signal the screenshot.
  startRoute(1);
  const shown = stageShot(shot, game);
  if (shown === 'campaign') {
    renderer.draw(plane, 'chase', 0.016, 1);
  } else {
    updateHud(plane, mission, timeSec, mission.score, save.coins, cameraMode, route.name);
    renderer.updateMarkers(mission);
    renderer.draw(plane, 'chase', 0.016, 1);
  }
  // Two painted frames, then ready.
  requestAnimationFrame(() => {
    if (plane) renderer.draw(plane, 'chase', 0.016, 1.5);
    requestAnimationFrame(() => { window.__shotReady = true; });
  });
} else {
  // Idle title backdrop: the plane parked over the lagoon.
  startRoute(1);
  showScreen('title');
  requestAnimationFrame(frame);
}

// Debug / playtest handle (used by the maker's own verification scripts).
window.__nusa = {
  get screen() { return screen; },
  get plane() { return plane; },
  get mission() { return mission; },
  get route() { return route; },
  get save() { return save; },
  get timeSec() { return timeSec; },
  startRoute, showScreen,
  step: (ctl) => stepGame(ctl),
  groundAt: (x, z) => groundHeight(x, z, route.seed),
  cameraPosition: () => renderer.cameraPosition(),
  debugScene: () => renderer.debugScene(),
};
