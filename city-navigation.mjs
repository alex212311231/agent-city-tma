export const plan = Object.freeze({ cells: 8, step: 42, street: 12, padding: 2.2 });
export const edge = plan.cells * plan.step / 2;
export const lines = Array.from({ length: plan.cells + 1 }, (_, i) => i * plan.step - edge);

export function makeGrid(THREE, blocks) {
  const grid = Array.from({ length: plan.cells }, () => Array(plan.cells).fill(null));
  const lots = [];
  const lotHalf = (plan.step - plan.street) / 2;
  for (const block of blocks) {
    const { row, col, tiers } = block;
    const x = lines[col] + plan.step / 2;
    const z = lines[row] + plan.step / 2;
    const width = Math.max(...tiers.map(tier => tier.w));
    const depth = Math.max(...tiers.map(tier => tier.d));
    if (!Number.isInteger(col) || !grid[col] || !Number.isInteger(row) || row < 0 || row >= plan.cells ||
        grid[col][row] || Math.max(width, depth) / 2 > lotHalf - plan.padding) {
      throw new Error('Invalid or occupied city plot ' + col + '/' + row);
    }
    const vector = (a,b,c) => new THREE.Vector3(a,b,c);
    const bounds = new THREE.Box3(vector(x-width/2, 0, z-depth/2), vector(x+width/2, block.height, z+depth/2));
    const plot = { ...block, x, z, width, depth, bounds };
    grid[col][row] = plot;
    lots.push(plot);
  }
  return { grid, lots };
}

export const roadHeight = -.12;
export const sidewalkHeight = .1325;

export function streetHeight(x,z) {
  const distance = value => Math.abs(value - Math.round(value / plan.step) * plan.step);
  const curb = plan.street / 2 + .19;
  const inset = Math.min(distance(x), distance(z)) - curb;
  const t = Math.max(0, Math.min(1, inset / .27));
  return roadHeight + (sidewalkHeight - roadHeight) * t;
}

const axes = ['x','y','z'];

// Sweep an object with the supplied half extents. A position on a contact plane
// can slide or move away even when rounding leaves it slightly inside the plane.
export function sweep(THREE, from, to, obstacles, padding) {
  const extent = typeof padding === 'number' ? {x:padding,y:padding,z:padding} : padding;
  const delta = {x:to.x-from.x,y:to.y-from.y,z:to.z-from.z};
  let earliest = 1;
  for (const box of obstacles) {
    let enter = 0, leave = earliest, interior = true;
    let exitDistance = Infinity, escapes = false;
    for (const axis of axes) {
      const low = box.min[axis] - extent[axis];
      const high = box.max[axis] + extent[axis];
      const here = from[axis];
      const distance = delta[axis];
      const fromLow = here - low, fromHigh = high - here;
      interior &&= fromLow >= 0 && fromHigh >= 0;
      const nearest = Math.min(fromLow, fromHigh);
      const outward = distance === 0 || (distance < 0 ? fromLow <= fromHigh : fromHigh <= fromLow);
      if (nearest < exitDistance) {
        exitDistance = nearest;
        escapes = outward;
      } else if (nearest === exitDistance) {
        escapes ||= outward;
      }
      if (Math.abs(distance) < 1e-8) {
        if (here <= low || here >= high) { enter = 2; break; }
      } else {
        const first = (low - here) / distance;
        const second = (high - here) / distance;
        enter = Math.max(enter, Math.min(first, second));
        leave = Math.min(leave, Math.max(first, second));
      }
      if (enter > leave) break;
    }
    if (enter <= leave && !(interior && escapes)) earliest = Math.max(0, enter - .0001);
  }
  return new THREE.Vector3().lerpVectors(from,to,earliest);
}

function controlPad(element) {
  const knob = element.querySelector('i');
  const state = { x:0, y:0, pointer:null };
  let x = 0;
  let y = 0;
  function reset() {
    state.x = state.y = 0;
    state.pointer = null;
    knob.style.transform = '';
  }
  element.addEventListener('pointerdown', event => {
    if (state.pointer !== null) return;
    state.pointer = event.pointerId;
    element.setPointerCapture(event.pointerId);
    x = event.clientX;
    y = event.clientY;
  });
  element.addEventListener('pointermove', event => {
    if (state.pointer !== event.pointerId) return;
    const limit = Math.max(24, element.clientWidth * .38);
    const dx = event.clientX - x;
    const dy = event.clientY - y;
    const magnitude = Math.max(limit, Math.hypot(dx,dy));
    state.x = dx / magnitude;
    state.y = dy / magnitude;
    knob.style.transform = 'translate(' + state.x * limit + 'px,' + state.y * limit + 'px)';
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) {
    element.addEventListener(type, event => { if (event.pointerId === state.pointer) reset(); });
  }
  return { state, reset };
}

export function walkingCamera(THREE, { canvas, movePad, lookPad, initial, label, getObstacles, getRoom, getFeet }) {
  const camera = new THREE.PerspectiveCamera(69, 1, .16, 1000);
  let feet=streetHeight(initial.x,initial.z);
  camera.position.set(initial.x, feet+1.75, initial.z);
  const move = controlPad(movePad);
  const look = controlPad(lookPad);
  const keys = new Set();
  const directions = new Set(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight']);
  let active = false;
  let pitch = .20;
  let yaw = initial.yaw;
  let drag = null;
  let oldLabel = '';
  const vector = new THREE.Vector3();
  const candidate = new THREE.Vector3();
  const body = new THREE.Vector3();
  const padding = {x:.32,y:.83,z:.32};

  function reset() {
    keys.clear();
    drag = null;
    move.reset();
    look.reset();
  }
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', reset);
  window.addEventListener('keydown', event => {
    if (!active || !directions.has(event.code) || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    keys.add(event.code);
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  canvas.addEventListener('pointerdown', event => {
    if (!active || event.button !== 0) return;
    drag = event.pointerId;
    canvas.setPointerCapture(drag);
  });
  canvas.addEventListener('pointermove', event => {
    if (drag !== event.pointerId) return;
    yaw -= event.movementX * .003;
    pitch = Math.max(-1.24, Math.min(1.24, pitch - event.movementY * .003));
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) {
    canvas.addEventListener(type, event => { if (drag === event.pointerId) drag = null; });
  }

  function setActive(enable) {
    active = enable;
    reset();
    if (enable) canvas.focus({ preventScroll:true });
  }

  function update(delta) {
    if (!active || document.querySelector('dialog[open]')) return;
    yaw -= look.state.x * delta * 2;
    pitch = Math.max(-1.24, Math.min(1.24, pitch - look.state.y * delta * 1.55));
    camera.rotation.set(pitch,yaw,0,'YXZ');
    const thrust = Number(keys.has('KeyW')) - Number(keys.has('KeyS')) - move.state.y;
    const strafe = Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + move.state.x;
    const length = Math.max(1, Math.hypot(thrust,strafe));
    const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = running ? 6.2 : 3.25;
    const step = Math.min(.18,delta) * speed / length;
    vector.set(-thrust*Math.sin(yaw) + strafe*Math.cos(yaw), 0, -thrust*Math.cos(yaw) - strafe*Math.sin(yaw)).multiplyScalar(step);
    const pos = camera.position;
    feet=getFeet(pos,feet);
    pos.y=feet+1.75;
    if (vector.lengthSq() > 0) {
      const obstacles = getObstacles(pos,feet);
      const limit = edge - 3;
      body.set(pos.x,feet+.92,pos.z);
      for (const axis of ['x','z']) {
        candidate.copy(body);
        candidate[axis] = Math.max(-limit, Math.min(limit, body[axis] + vector[axis]));
        body.copy(sweep(THREE,body,candidate,obstacles,padding));
      }
      pos.x=body.x;
      pos.z=body.z;
      feet=getFeet(pos,feet);
      pos.y=feet+1.75;
    }
    const room = getRoom(camera.position);
    const name = room ? room.label : 'Таймс-сквер';
    if (name !== oldLabel) label.textContent = oldLabel = name;
  }
  camera.rotation.set(pitch,yaw,0,'YXZ');
  return { camera, setActive, update, get feet(){ return feet; } };
}
