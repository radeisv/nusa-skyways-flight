// Landing grading: four parameters decide a touchdown — speed, sink rate,
// roll and pitch — instead of the old two. Forgiving by design: a smooth
// landing earns points, a firm one still counts, only a truly hard one hurts.
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round1(v) { return Math.round(v * 10) / 10; }

/** Grade a touchdown. kind is 'runway' or 'water' (water allows a harder
 * sink and a lower speed, matching the old rules). Returns the grading
 * object the debrief line and the mission bonus are built from. */
export function gradeLanding(plane, kind) {
  const speedKt = Math.round(plane.speedKt);
  const sinkMs = round1(Math.max(0, -(plane.verticalSpeed || 0)));
  const rollDeg = Math.round(Math.abs(plane.bank || 0) * 180 / Math.PI);
  const pitchDeg = Math.round((plane.pitch || 0) * 180 / Math.PI);
  const hardSink = kind === 'water' ? 12 : 7;
  const hardSpeed = kind === 'water' ? 140 : 150;
  const ok = sinkMs <= hardSink && speedKt <= hardSpeed && rollDeg <= 20
    && pitchDeg >= -4 && pitchDeg <= 14;

  // Score out of 100: start perfect, deduct per parameter.
  let deductions = 0;
  if (sinkMs > 4) deductions += Math.min(40, (sinkMs - 4) * 8 + (sinkMs > hardSink ? 16 : 0));
  if (speedKt < 90 || speedKt > 135) deductions += Math.min(20, Math.abs(speedKt - 112) * 0.4);
  if (rollDeg > 5) deductions += Math.min(25, (rollDeg - 5) * 1.5 + (rollDeg > 15 ? 8 : 0));
  if (pitchDeg < -1 || pitchDeg > 10) deductions += Math.min(15, Math.abs(pitchDeg - 4.5) * 1.5);
  const score = Math.max(0, Math.round(100 - deductions));
  const label = score >= 90 ? 'SMOOTH' : score >= 75 ? 'GOOD' : score >= 55 ? 'FIRM'
    : score >= 35 ? 'HARD' : 'ROUGH';
  return {
    kind, speedKt, sinkMs, rollDeg, pitchDeg, score, label, ok,
    points: Math.round(score / 2), // 0-50 bonus points on top of the route reward
    scored: false,
  };
}

/** The debrief line shown after a landing (HUD message + complete screen). */
export function scoreTouchdown(g) {
  if (!g) return '';
  return `Touchdown ${g.speedKt} kt · sink ${g.sinkMs} m/s · roll ${g.rollDeg}° · pitch ${g.pitchDeg}° — ${g.label} +${g.points}`;
}
