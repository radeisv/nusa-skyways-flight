// Keyboard and pointer input. Held keys steer the plane; one-shot presses
// (confirm, pause, camera, restart, mute) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost or counted twice.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CAMERA = 4;
export const ACTION_RESTART = 8;
export const ACTION_MUTE = 16;

const THROTTLE_UP = new Set(['KeyW', 'ArrowUp']);
const THROTTLE_DOWN = new Set(['KeyS', 'ArrowDown']);
const BANK_LEFT = new Set(['ArrowLeft', 'KeyA']);
const BANK_RIGHT = new Set(['ArrowRight', 'KeyD']);
const PITCH_UP = new Set(['KeyI']);
const PITCH_DOWN = new Set(['KeyK']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const CAMERA = new Set(['KeyC']);
const RESTART = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;

  function onKeyDown(event) {
    if (event.repeat) return;
    if (THROTTLE_UP.has(event.code) || THROTTLE_DOWN.has(event.code) ||
        BANK_LEFT.has(event.code) || BANK_RIGHT.has(event.code) ||
        PITCH_UP.has(event.code) || PITCH_DOWN.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
    } else if (CONFIRM.has(event.code)) { actions |= ACTION_CONFIRM; event.preventDefault(); }
    else if (PAUSE.has(event.code)) { actions |= ACTION_PAUSE; }
    else if (CAMERA.has(event.code)) { actions |= ACTION_CAMERA; }
    else if (RESTART.has(event.code)) { actions |= ACTION_RESTART; }
    else if (MUTE.has(event.code)) { actions |= ACTION_MUTE; }
  }
  function onKeyUp(event) { held.delete(event.code); }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => held.clear());
  if (target) target.addEventListener('pointerdown', () => { actions |= ACTION_CONFIRM; });

  function has(set) { for (const c of set) if (held.has(c)) return true; return false; }

  return {
    throttleUp() { return has(THROTTLE_UP); },
    throttleDown() { return has(THROTTLE_DOWN); },
    bankLeft() { return has(BANK_LEFT); },
    bankRight() { return has(BANK_RIGHT); },
    pitchUp() { return has(PITCH_UP); },
    pitchDown() { return has(PITCH_DOWN); },
    takeActions() { const t = actions; actions = 0; return t; },
    // Test/autopilot hook: pretend keys are held.
    inject(codes) { for (const c of codes) held.add(c); },
    releaseAll() { held.clear(); },
  };
}
