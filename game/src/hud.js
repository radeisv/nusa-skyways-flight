// HUD: the DOM instruments — altitude, airspeed, heading compass, artificial
// horizon, throttle / fuel / damage bars, objective, timer, score and warnings.
// Big high-contrast text so every number stays readable when the cover is
// shrunk to 768x480.
const $ = (id) => document.getElementById(id);

function compass(headingRad) {
  const deg = ((headingRad * 180 / Math.PI) % 360 + 360) % 360;
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const label = points[Math.round(deg / 45) % 8];
  return { deg: Math.round(deg), label };
}

function drawAttitude(canvas, pitch, bank) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 3;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-bank);
  const pitchPx = Math.max(-r, Math.min(r, pitch * r * 1.4));
  const skyGrad = ctx.createLinearGradient(0, -r * 2 - pitchPx, 0, -pitchPx);
  skyGrad.addColorStop(0, '#7ec3ee');
  skyGrad.addColorStop(1, '#3f8fd2');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(-r * 2, -r * 2 - pitchPx, r * 4, r * 2 + pitchPx);
  const gndGrad = ctx.createLinearGradient(0, -pitchPx, 0, r * 2 - pitchPx);
  gndGrad.addColorStop(0, '#c98a4b');
  gndGrad.addColorStop(1, '#7a5230');
  ctx.fillStyle = gndGrad;
  ctx.fillRect(-r * 2, -pitchPx, r * 4, r * 2 + pitchPx);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-r, -pitchPx); ctx.lineTo(r, -pitchPx); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  // Fixed wings marker.
  ctx.strokeStyle = '#ffd23d'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.7, cy); ctx.lineTo(cx - r * 0.25, cy);
  ctx.moveTo(cx + r * 0.25, cy); ctx.lineTo(cx + r * 0.7, cy);
  ctx.stroke();
  ctx.fillStyle = '#ffd23d';
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
}

export function updateHud(plane, mission, timeSec, score, coins, cameraMode, routeName, wx) {
  const hud = $('hud');
  if (!hud) return;
  // The bottom-left bars sit over bright terrain: give the whole block the
  // same dark navy panel as the top gauges, so the gold THROTTLE / FUEL /
  // DAMAGE labels stay readable over any ground. (classList.add is
  // idempotent, so this is safe to run every frame.)
  const bars = $('hud-bars');
  if (bars) bars.classList.add('hud-panel');
  const altFt = Math.max(0, Math.round(plane.y * 3.28084));
  const hdg = compass(plane.heading);
  $('hud-alt').textContent = `${altFt.toLocaleString('en-US')} ft`;
  $('hud-spd').textContent = `${Math.round(plane.speedKt)} kt`;
  $('hud-hdg').textContent = `${hdg.deg}° ${hdg.label}`;
  $('hud-thr').style.width = `${plane.throttle}%`;
  $('hud-thr-num').textContent = `${Math.round(plane.throttle)}%`;
  $('hud-fuel').style.width = `${(plane.fuel / plane.fuelMax) * 100}%`;
  $('hud-fuel').className = 'bar-fill fuel' + (plane.fuel < 25 ? ' low' : '');
  $('hud-dmg').style.width = `${plane.damage}%`;
  $('hud-score').textContent = String(score);
  $('hud-coins').textContent = String(coins);
  const mins = Math.floor(timeSec / 60), secs = Math.floor(timeSec % 60);
  $('hud-time').textContent = `${mins}:${String(secs).padStart(2, '0')}`;
  $('hud-route').textContent = routeName;
  $('hud-cam').textContent = cameraMode.toUpperCase();
  // Weather + flaps readout: wind is shown when a route's weather is live.
  if (wx) {
    const windEl = $('hud-wind'), flapsEl = $('hud-flaps');
    const windTxt = (wx.windKt != null && wx.windDir != null)
      ? `WIND ${Math.round(wx.windKt)} kt ${Math.round(wx.windDir)}°` : '';
    const cloudTxt = (wx.inCloud || 0) > 0.4 ? 'IN CLOUDS' : '';
    const line = [windTxt, cloudTxt].filter(Boolean).join('  ·  ');
    if (windEl) { windEl.textContent = line; windEl.style.display = line ? 'block' : 'none'; }
    if (flapsEl) flapsEl.textContent = `FLAPS ${wx.flaps || 0}`;
  }
  $('hud-objective-text').textContent = mission.objective;
  $('hud-objective-sub').textContent = mission.messageTimer > 0 ? mission.message : '';
  const att = $('hud-attitude');
  if (att) drawAttitude(att, plane.pitch, plane.bank);
  // Warnings, loud and centred.
  const warns = [];
  if (plane.fuel < 25 && plane.fuel > 0) warns.push('LOW FUEL');
  if (plane.fuel <= 0) warns.push('FUEL EMPTY');
  if (plane.speedKt < 55 && plane.y > 8) warns.push('STALL');
  if (plane.agl != null && plane.agl < 30 && plane.verticalSpeed < -12) warns.push('PULL UP');
  if (plane.damage > 60) warns.push('DAMAGE CRITICAL');
  const warnEl = $('hud-warn');
  warnEl.textContent = warns.join('  •  ');
  warnEl.style.display = warns.length ? 'block' : 'none';
}

export function setHudVisible(visible) {
  const hud = $('hud');
  if (hud) hud.style.display = visible ? 'block' : 'none';
}
