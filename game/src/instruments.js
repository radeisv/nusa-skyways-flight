// Cockpit instruments: a lit six-pack of steam gauges, ILS needles and a
// compass strip, drawn live from the flight model on one canvas that sits
// as the dashboard at the bottom of the screen in cockpit view.
// Six-pack steam gauges + ILS, drawn live from the flight model.
const PANEL_W = 1280, PANEL_H = 200;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Needle angle for a 270-degree dial: -135 deg (bottom-left) to +135 deg.
function dialAngle(v, max) { return (-135 + clamp(v, 0, max) / max * 270) * Math.PI / 180; }
function needleXY(cx, cy, r, a) { return [cx + Math.sin(a) * r, cy - Math.cos(a) * r]; }

function drawDialFace(ctx, cx, cy, r, label) {
  ctx.fillStyle = '#101c2e';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#e8f2ff'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(232,242,255,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, r - 5, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffce4a'; ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, cx, cy + r + 16);
}

function drawTicks(ctx, cx, cy, r, max, step, labelEvery) {
  ctx.fillStyle = '#e8f2ff'; ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#e8f2ff'; ctx.lineWidth = 2;
  for (let v = 0; v <= max; v += step) {
    const a = dialAngle(v, max);
    const [x1, y1] = needleXY(cx, cy, r - 4, a);
    const [x2, y2] = needleXY(cx, cy, r - 12, a);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    if (v % labelEvery === 0) {
      const [lx, ly] = needleXY(cx, cy, r - 24, a);
      ctx.fillText(String(v), lx, ly);
    }
  }
}

function drawNeedle(ctx, cx, cy, r, a, color, width) {
  const [x, y] = needleXY(cx, cy, r - 10, a);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
}

function drawDigital(ctx, cx, cy, text, color) {
  ctx.fillStyle = color || '#ffffff'; ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
}

/** Airspeed gauge: 0-220 kt dial + digital readout. */
function drawAirspeed(ctx, cx, cy, r, plane) {
  drawDialFace(ctx, cx, cy, r, 'AIRSPEED');
  drawTicks(ctx, cx, cy, r, 220, 20, 40);
  // Red arc above 190 kt.
  ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, r - 8, dialAngle(190, 220) - Math.PI / 2, dialAngle(220, 220) - Math.PI / 2); ctx.stroke();
  drawNeedle(ctx, cx, cy, r, dialAngle(plane.speedKt, 220), '#ffd23d', 3.5);
  drawDigital(ctx, cx, cy + r * 0.42, `${Math.round(plane.speedKt)}`, '#ffd23d');
}

/** Altimeter: 100-ft needle + 1000-ft needle + digital feet. */
function drawAltimeter(ctx, cx, cy, r, plane) {
  const ft = Math.max(0, plane.y * 3.28084);
  drawDialFace(ctx, cx, cy, r, 'ALTITUDE');
  drawTicks(ctx, cx, cy, r, 1000, 100, 200);
  drawNeedle(ctx, cx, cy, r, dialAngle((ft % 1000), 1000), '#ffd23d', 3.5);
  drawNeedle(ctx, cx, cy, r * 0.62, dialAngle((ft % 10000) / 10, 1000), '#ffffff', 4.5);
  drawDigital(ctx, cx, cy + r * 0.42, `${Math.round(ft / 100) * 100}`, '#ffffff');
}

/** Attitude indicator: sky/ground horizon with pitch ladder + bank pointer. */
function drawAttitudeGauge(ctx, cx, cy, r, plane) {
  drawDialFace(ctx, cx, cy, r, 'ATTITUDE');
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r - 3, 0, Math.PI * 2); ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.bank);
  const pitchPx = clamp(plane.pitch * r * 1.6, -r, r);
  const sky = ctx.createLinearGradient(0, -r * 2 - pitchPx, 0, -pitchPx);
  sky.addColorStop(0, '#7ec3ee'); sky.addColorStop(1, '#3f8fd2');
  ctx.fillStyle = sky;
  ctx.fillRect(-r * 2, -r * 2 - pitchPx, r * 4, r * 2 + pitchPx);
  const gnd = ctx.createLinearGradient(0, -pitchPx, 0, r * 2 - pitchPx);
  gnd.addColorStop(0, '#c98a4b'); gnd.addColorStop(1, '#7a5230');
  ctx.fillStyle = gnd;
  ctx.fillRect(-r * 2, -pitchPx, r * 4, r * 2 + pitchPx);
  // Pitch ladder lines every 10 degrees.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
  for (const deg of [-20, -10, 10, 20]) {
    const y = -pitchPx - deg * r * 0.09;
    const w = deg % 20 === 0 ? r * 0.5 : r * 0.32;
    ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-r, -pitchPx); ctx.lineTo(r, -pitchPx); ctx.stroke();
  ctx.restore();
  // Bank pointer at the top.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.bank);
  ctx.fillStyle = '#ffd23d';
  ctx.beginPath(); ctx.moveTo(0, -r + 2); ctx.lineTo(-6, -r + 14); ctx.lineTo(6, -r + 14); ctx.closePath(); ctx.fill();
  ctx.restore();
  // Fixed wings marker.
  ctx.strokeStyle = '#ffd23d'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.7, cy); ctx.lineTo(cx - r * 0.25, cy);
  ctx.moveTo(cx + r * 0.25, cy); ctx.lineTo(cx + r * 0.7, cy);
  ctx.stroke();
  ctx.fillStyle = '#ffd23d';
  ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();
}

/** Turn coordinator: banked wings + inclinometer ball. */
function drawTurnCoordinator(ctx, cx, cy, r, plane) {
  drawDialFace(ctx, cx, cy, r, 'TURN');
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.bank);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-r * 0.55, 0); ctx.lineTo(-r * 0.15, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(r * 0.15, 0); ctx.lineTo(r * 0.55, 0); ctx.stroke();
  ctx.fillStyle = '#ffd23d';
  ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Inclinometer ball: slides with the bank.
  const ballX = cx + clamp(-plane.bank * 42, -r * 0.55, r * 0.55);
  ctx.fillStyle = '#101c2e';
  ctx.fillRect(cx - r * 0.6, cy + r * 0.52, r * 1.2, 12);
  ctx.strokeStyle = '#e8f2ff'; ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - r * 0.6, cy + r * 0.52, r * 1.2, 12);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(ballX, cy + r * 0.52 + 6, 5, 0, Math.PI * 2); ctx.fill();
  const bankDeg = Math.round(plane.bank * 180 / Math.PI);
  drawDigital(ctx, cx, cy - r * 0.45, `${bankDeg}°`, '#e8f2ff');
}

/** Heading indicator: rotating compass card + lubber line. */
function drawHeading(ctx, cx, cy, r, plane) {
  drawDialFace(ctx, cx, cy, r, 'HEADING');
  const deg = ((plane.heading * 180 / Math.PI) % 360 + 360) % 360;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r - 3, 0, Math.PI * 2); ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.heading);
  ctx.fillStyle = '#e8f2ff'; ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const pts = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
  for (const [label, d] of pts) {
    const a = d * Math.PI / 180;
    ctx.fillText(label, Math.sin(a) * (r - 22), -Math.cos(a) * (r - 22));
  }
  ctx.strokeStyle = '#e8f2ff'; ctx.lineWidth = 2;
  for (let d = 0; d < 360; d += 30) {
    const a = d * Math.PI / 180;
    const x1 = Math.sin(a) * (r - 6), y1 = -Math.cos(a) * (r - 6);
    const x2 = Math.sin(a) * (r - 14), y2 = -Math.cos(a) * (r - 14);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.restore();
  // Lubber line at the top.
  ctx.fillStyle = '#ffd23d';
  ctx.beginPath(); ctx.moveTo(cx, cy - r + 2); ctx.lineTo(cx - 6, cy - r + 14); ctx.lineTo(cx + 6, cy - r + 14); ctx.closePath(); ctx.fill();
  drawDigital(ctx, cx, cy + r * 0.42, `${Math.round(deg)}°`, '#ffd23d');
}

/** Vertical speed indicator: -15..+15 m/s tape + digital readout. */
function drawVSI(ctx, cx, cy, r, plane) {
  drawDialFace(ctx, cx, cy, r, 'VERT SPD');
  const vs = clamp(plane.verticalSpeed || 0, -15, 15);
  drawTicks(ctx, cx, cy, r, 30, 5, 10);
  // Needle on the 0-30 dial where 15 m/s sits at the top.
  drawNeedle(ctx, cx, cy, r, dialAngle(vs + 15, 30), vs < -1 ? '#ff6a5e' : '#4be08a', 3.5);
  const sign = vs > 0.5 ? '+' : '';
  drawDigital(ctx, cx, cy + r * 0.42, `${sign}${vs.toFixed(1)}`, '#ffffff');
}

/** The six-pack, left to right: ASI, attitude, altimeter, turn, heading, VSI. */
export function drawSteamGauges(ctx, plane) {
  const r = 50;
  const centers = [66, 178, 290, 402, 514, 626];
  const cy = 98;
  drawAirspeed(ctx, centers[0], cy, r, plane);
  drawAttitudeGauge(ctx, centers[1], cy, r, plane);
  drawAltimeter(ctx, centers[2], cy, r, plane);
  drawTurnCoordinator(ctx, centers[3], cy, r, plane);
  drawHeading(ctx, centers[4], cy, r, plane);
  drawVSI(ctx, centers[5], cy, r, plane);
}

/** ILS cross indicator: localizer needle (vertical) + glideslope needle
 * (horizontal). Needles show where the runway is relative to the plane:
 * above the glidepath the GS needle sits low (fly down), right of the
 * centreline the LOC needle sits left (fly left). Dimmed when not on approach. */
export function drawILSNeedles(ctx, ils, cx, cy, size) {
  const half = size / 2;
  ctx.fillStyle = '#101c2e';
  ctx.beginPath(); ctx.arc(cx, cy, half, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#e8f2ff'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy, half, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffce4a'; ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('ILS RWY 18', cx, cy + half + 16);
  if (!ils || !ils.onApproach) {
    ctx.fillStyle = 'rgba(232,242,255,0.5)'; ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText('NO ILS', cx, cy + 5);
    return;
  }
  // Cross hairs.
  ctx.strokeStyle = 'rgba(232,242,255,0.4)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx - half + 8, cy); ctx.lineTo(cx + half - 8, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - half + 8); ctx.lineTo(cx, cy + half - 8); ctx.stroke();
  // Centre circle.
  ctx.strokeStyle = '#e8f2ff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.stroke();
  // Localizer needle (vertical bar): left/right of centre.
  const locX = cx - clamp(ils.loc, -1, 1) * (half - 14);
  ctx.strokeStyle = '#4be08a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(locX, cy - half + 12); ctx.lineTo(locX, cy + half - 12); ctx.stroke();
  // Glideslope needle (horizontal bar): above path -> needle low.
  const gsY = cy + clamp(ils.gs, -1, 1) * (half - 14);
  ctx.beginPath(); ctx.moveTo(cx - half + 12, gsY); ctx.lineTo(cx + half - 12, gsY); ctx.stroke();
  // Distance to threshold.
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(`${Math.round(ils.distM)} m`, cx, cy + half - 12);
}

/** Compass strip: scrolling heading tape across the top of the panel. */
export function drawCompassStrip(ctx, headingRad, x, y, w, h) {
  const deg = ((headingRad * 180 / Math.PI) % 360 + 360) % 360;
  ctx.fillStyle = '#0a1424';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  const pxPerDeg = w / 120;
  const cx = x + w / 2;
  ctx.fillStyle = '#e8f2ff'; ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#e8f2ff'; ctx.lineWidth = 1.5;
  for (let d = Math.floor(deg - 60); d <= deg + 60; d += 5) {
    const dd = ((d % 360) + 360) % 360;
    const px = cx + (d - deg) * pxPerDeg;
    if (px < x + 4 || px > x + w - 4) continue;
    const major = dd % 30 === 0;
    ctx.beginPath(); ctx.moveTo(px, y + h - 6); ctx.lineTo(px, y + h - (major ? 16 : 10)); ctx.stroke();
    if (major) {
      const label = dd === 0 ? 'N' : dd === 90 ? 'E' : dd === 180 ? 'S' : dd === 270 ? 'W' : String(dd);
      ctx.fillText(label, px, y + 11);
    }
  }
  // Lubber line + current heading.
  ctx.fillStyle = '#ffd23d';
  ctx.beginPath(); ctx.moveTo(cx, y + h - 2); ctx.lineTo(cx - 7, y + h - 12); ctx.lineTo(cx + 7, y + h - 12); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd23d'; ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`${Math.round(deg)}°`, cx, y + h / 2 - 2);
}

/** Right-hand flight-data block: wind, flaps, next target. */
function drawFlightData(ctx, extra) {
  const x = 880, y = 52;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffce4a'; ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('FLIGHT DATA', x, y);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 19px system-ui, sans-serif';
  const wind = extra && extra.windKt != null ? `${extra.windDir}° · ${Math.round(extra.windKt)} kt` : '—';
  ctx.fillText(`WIND  ${wind}`, x, y + 28);
  ctx.fillText(`FLAPS  ${extra && extra.flaps != null ? extra.flaps : 0}`, x, y + 56);
  if (extra && extra.target) {
    const t = extra.target;
    const brg = Math.round(((Math.atan2(t.x - (extra.px || 0), t.z - (extra.pz || 0)) * 180 / Math.PI) % 360 + 360) % 360);
    const dist = Math.round(Math.hypot(t.x - (extra.px || 0), t.z - (extra.pz || 0)));
    ctx.fillText(`NEXT  ${String(brg).padStart(3, '0')}° · ${dist} m`, x, y + 84);
  }
  ctx.fillStyle = '#4be08a'; ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('COCKPIT · ILS · GPS · 6 ROUTES', x, y + 112);
}

/** Build the dashboard panel (DOM) and return its controller. */
export function createInstruments() {
  const panel = document.getElementById('cockpit-panel');
  const canvas = document.getElementById('panel-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  let last = { visible: false, asi: 0, alt: 0, hdg: 0, ilsLoc: 0, ilsGs: 0, onApproach: false };
  return {
    setVisible(v) {
      if (panel) panel.style.display = v ? 'block' : 'none';
      last.visible = !!v;
      // Lift the HUD bars/help above the panel in cockpit view.
      const hud = document.getElementById('hud');
      if (hud) hud.classList.toggle('cockpit', !!v);
    },
    draw(plane, ils, extra) {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, PANEL_W, PANEL_H);
      ctx.fillStyle = '#0d1626';
      ctx.fillRect(0, 0, PANEL_W, PANEL_H);
      // Panel top edge: a gold pinstripe, like a real glareshield trim.
      ctx.fillStyle = '#ffd23d';
      ctx.fillRect(0, 0, PANEL_W, 3);
      drawCompassStrip(ctx, plane.heading, 16, 10, PANEL_W - 32, 30);
      drawSteamGauges(ctx, plane);
      drawILSNeedles(ctx, ils, 760, 98, 120);
      drawFlightData(ctx, extra);
      const deg = ((plane.heading * 180 / Math.PI) % 360 + 360) % 360;
      last = {
        visible: last.visible,
        asi: Math.round(plane.speedKt),
        alt: Math.round(plane.y * 3.28084),
        hdg: Math.round(deg),
        vsi: +(plane.verticalSpeed || 0).toFixed(1),
        ilsLoc: ils ? +clamp(ils.loc, -1, 1).toFixed(2) : 0,
        ilsGs: ils ? +clamp(ils.gs, -1, 1).toFixed(2) : 0,
        onApproach: !!(ils && ils.onApproach),
      };
    },
    lastValues() { return last; },
  };
}
