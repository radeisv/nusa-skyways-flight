// Mouse + rudder + flaps controls. Mouse steering is a virtual stick:
// hold the left button and drag — right banks right, up climbs — and the
// stick springs back to centre on release. Keyboard always still works and
// wins while a key is held. Q/E rudder yaws the nose, F cycles the flaps.
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Wire the extra controls onto the game canvas. Returns the control state
 * the main loop reads every frame. */
export function createControls(canvas) {
  const state = {
    mouseActive: false, mouseX: 0, mouseY: 0, mouseCX: 0, mouseCY: 0,
    flaps: 0, rudderKeys: new Set(),
  };
  const stick = document.getElementById('mouse-stick');
  const dot = document.getElementById('mouse-stick-dot');

  function stickRect() {
    return canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 1280, height: 720 };
  }
  function updateStickIndicator() {
    if (!stick || !dot) return;
    stick.style.display = state.mouseActive ? 'block' : 'none';
    if (!state.mouseActive) return;
    const r = stickRect();
    const dx = clamp((state.mouseX - state.mouseCX) / (r.width * 0.35), -1, 1);
    const dy = clamp((state.mouseY - state.mouseCY) / (r.height * 0.35), -1, 1);
    dot.style.transform = `translate(calc(-50% + ${dx * 26}px), calc(-50% + ${dy * 26}px))`;
  }

  if (canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = stickRect();
      state.mouseActive = true;
      state.mouseCX = r.left + r.width / 2;
      state.mouseCY = r.top + r.height / 2;
      state.mouseX = e.clientX;
      state.mouseY = e.clientY;
      updateStickIndicator();
    });
    window.addEventListener('pointermove', (e) => {
      if (!state.mouseActive) return;
      state.mouseX = e.clientX;
      state.mouseY = e.clientY;
      updateStickIndicator();
    });
    function endDrag() {
      if (!state.mouseActive) return;
      state.mouseActive = false;
      updateStickIndicator();
    }
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('blur', endDrag);
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyQ') state.rudderKeys.add('q');
    else if (e.code === 'KeyE') state.rudderKeys.add('e');
    else if (e.code === 'KeyF' && !e.repeat) {
      state.flaps = (state.flaps + 1) % 3;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyQ') state.rudderKeys.delete('q');
    else if (e.code === 'KeyE') state.rudderKeys.delete('e');
  });
  window.addEventListener('blur', () => state.rudderKeys.clear());

  return {
    /** Proportional mouse steering, or null when the stick is not held. */
    mouseSteering() {
      if (!state.mouseActive) return null;
      const r = stickRect();
      const dx = clamp((state.mouseX - state.mouseCX) / (r.width * 0.35), -1, 1);
      const dy = clamp((state.mouseY - state.mouseCY) / (r.height * 0.35), -1, 1);
      const dead = 0.08;
      const bankAmount = Math.abs(dx) < dead ? 0 : dx;
      const pitchAmount = Math.abs(dy) < dead ? 0 : -dy; // mouse up = climb
      return { bankAmount, pitchAmount };
    },
    /** Rudder input from Q/E: -1 (left) .. +1 (right). */
    rudderInput() {
      return (state.rudderKeys.has('e') ? 1 : 0) - (state.rudderKeys.has('q') ? 1 : 0);
    },
    /** Flaps control: 0, 1 or 2, cycled with F. */
    flapsControl() { return state.flaps; },
    /** Test hook: set the flaps directly. */
    setFlaps(n) { state.flaps = clamp(n | 0, 0, 2); },
    get mouseActive() { return state.mouseActive; },
  };
}
