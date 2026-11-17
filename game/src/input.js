// Input: keyboard + pointer-lock mouse on desktop, and a minimal touch
// fallback for phones — a left virtual joystick to move, drag on the right
// half to look, and FIRE / RELOAD / BUY / ACT buttons. The touch UI is built
// only on touch devices and never touches the desktop path.
// Discrete presses land in `pressed` and are cleared by endFrame() each tick.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const look = { x: 0, y: 0 };
  const touchMove = { x: 0, y: 0 };
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  let firing = false;
  let aiming = false;
  let locked = false;

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) { firing = false; aiming = false; }
    onLockChange(locked);
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    look.x += e.movementX || 0;
    look.y += e.movementY || 0;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (!locked) return;
    if (e.button === 0) firing = true;
    if (e.button === 2) aiming = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) firing = false;
    if (e.button === 2) aiming = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  if (isTouch) buildTouchUi();

  function buildTouchUi() {
    const ui = document.createElement('div');
    ui.id = 'touch-ui';
    ui.innerHTML =
      '<div id="joy"><div id="joy-knob"></div></div>' +
      '<div class="tbtn" id="btn-fire">FIRE</div>' +
      '<div class="tbtn small" id="btn-reload">RELOAD</div>' +
      '<div class="tbtn small" id="btn-act">PLANT</div>' +
      '<div class="tbtn small" id="btn-buy">BUY</div>';
    const style = document.createElement('style');
    style.textContent =
      '#touch-ui{position:fixed;inset:0;pointer-events:none;z-index:30}' +
      '#joy{position:absolute;left:26px;bottom:96px;width:118px;height:118px;border-radius:50%;' +
      'border:2px solid rgba(236,231,219,.35);background:rgba(18,21,26,.3);pointer-events:auto}' +
      '#joy-knob{position:absolute;left:50%;top:50%;width:52px;height:52px;border-radius:50%;' +
      'background:rgba(236,231,219,.4);transform:translate(-50%,-50%)}' +
      '.tbtn{position:absolute;border-radius:50%;border:2px solid rgba(236,231,219,.35);' +
      'background:rgba(18,21,26,.4);color:#ece7db;font:600 13px system-ui;display:grid;' +
      'place-items:center;pointer-events:auto;user-select:none;-webkit-user-select:none}' +
      '#btn-fire{right:30px;bottom:96px;width:96px;height:96px;background:rgba(240,168,48,.35)}' +
      '#btn-reload{right:140px;bottom:76px;width:60px;height:60px}' +
      '#btn-act{right:44px;bottom:206px;width:60px;height:60px}' +
      '#btn-buy{right:140px;bottom:160px;width:60px;height:60px}';
    document.head.appendChild(style);
    document.body.appendChild(ui);

    const joy = ui.querySelector('#joy');
    const knob = ui.querySelector('#joy-knob');
    let joyId = null;
    let lookId = null;
    let lookLast = { x: 0, y: 0 };

    function joyMove(t) {
      const r = joy.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = (t.clientX - cx) / (r.width / 2);
      let dy = (t.clientY - cy) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      touchMove.x = dx;
      touchMove.y = dy;
      knob.style.transform = `translate(calc(-50% + ${dx * 32}px), calc(-50% + ${dy * 32}px))`;
    }
    joy.addEventListener('touchstart', (e) => { e.preventDefault(); joyId = e.changedTouches[0].identifier; joyMove(e.changedTouches[0]); }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) joyMove(t);
        else if (t.identifier === lookId) {
          look.x += (t.clientX - lookLast.x) * 2.4;
          look.y += (t.clientY - lookLast.y) * 2.4;
          lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: false });
    window.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          joyId = null;
          touchMove.x = 0;
          touchMove.y = 0;
          knob.style.transform = 'translate(-50%,-50%)';
        }
        if (t.identifier === lookId) lookId = null;
      }
    });
    // Look drags start anywhere on the right half that is not a button.
    document.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX > window.innerWidth * 0.45 && lookId === null && joyId !== t.identifier) {
          if (t.target.closest && t.target.closest('.tbtn')) continue;
          lookId = t.identifier;
          lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: true });

    const bind = (id, down, up) => {
      const el = ui.querySelector(id);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); down(); }, { passive: false });
      if (up) el.addEventListener('touchend', (e) => { e.preventDefault(); up(); }, { passive: false });
    };
    bind('#btn-fire', () => { firing = true; }, () => { firing = false; });
    bind('#btn-reload', () => pressed.add('KeyR'));
    bind('#btn-buy', () => pressed.add('KeyB'));
    bind('#btn-act', () => keys.add('KeyE'), () => keys.delete('KeyE'));
  }

  return {
    keys,
    pressed,
    touchMove,
    isTouch,
    get firing() { return firing; },
    get aiming() { return aiming; },
    get locked() { return locked; },
    lookDelta() {
      const d = { x: look.x, y: look.y };
      look.x = 0;
      look.y = 0;
      return d;
    },
    requestLock() {
      if (!isTouch && canvas.requestPointerLock) canvas.requestPointerLock();
    },
    endFrame() { pressed.clear(); },
  };
}
