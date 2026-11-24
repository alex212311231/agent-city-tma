export const roads = Object.freeze({
  avenues: [-27, -5.65, 5.65, 27],
  crossStreets: [-4.38, 7.9, 21.35],
  halfWidths: [1.36, 1.64, 1.64],
});

const radius = .235;
const opening = 1.96;

export function frontage(spec) {
  return spec.depth / 2 + spec.z;
}

function sidewalk(row) {
  return roads.crossStreets[row] - roads.halfWidths[row] - .37;
}

function rowIndex(spec) {
  return spec.home ? 2 : spec.z < -4.6 ? 0 : 1;
}

function intersect(x, z, block) {
  const dx = x - Math.max(block[0], Math.min(x, block[1]));
  const dz = z - Math.max(block[2], Math.min(z, block[3]));
  return dx * dx + dz * dz < radius * radius;
}

export function canStand(x, z, places, cityBlocks = []) {
  if (x < -54 + radius || x > 43 - radius || z < -36 + radius || z > 34 - radius) return false;
  if (cityBlocks.some(box => intersect(x,z,box))) return false;
  for (const { spec, door, obstacles = [] } of places.values()) {
    if (spec.id === 'lounge') continue;
    const left = spec.x - spec.width / 2;
    const right = spec.x + spec.width / 2;
    const back = spec.z - spec.depth / 2;
    const front = frontage(spec);
    if (x < left - radius || x > right + radius || z < back - radius || z > front + radius) continue;
    if (!door) {
      if (intersect(x, z, [left, right, back, front])) return false;
      continue;
    }
    const half = opening / 2;
    const wall = .20;
    const barriers = [
      [left,right,back,back+wall], [left,left+wall,back,front], [right-wall,right,back,front],
      [left,spec.x-half,front-wall,front], [spec.x+half,right,front-wall,front],
    ];
    if (door.fraction < .70) barriers.push([spec.x-half, spec.x+half, front-wall, front]);
    if (barriers.some(box => intersect(x, z, box)) || obstacles.some(box => intersect(x, z, box))) return false;
  }
  return true;
}

function graph(start, goal, car) {
  const columns = roads.avenues.map(x => x + (car ? 0 : 1.52));
  const rows = roads.crossStreets.map((z,row) => car ? z : sidewalk(row));
  const nodes = new Map();
  const key = (x, row) => x + ':' + row;
  function connect(a, b) {
    const weight = Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
    a.links.push([b, weight]);
    b.links.push([a, weight]);
  }
  for (const [row, z] of rows.entries()) {
    const all = new Set(columns);
    if (start.row === row) all.add(start.x);
    if (goal.row === row) all.add(goal.x);
    let previous;
    for (const x of [...all].sort((a, b) => a-b)) {
      const node = { x, z, links: [] };
      nodes.set(key(x,row), node);
      if (previous) connect(previous, node);
      if (row && columns.includes(x)) connect(nodes.get(key(x,row-1)), node);
      previous = node;
    }
  }
  const origin = nodes.get(key(start.x,start.row));
  const finish = nodes.get(key(goal.x,goal.row));
  const goals = new Map([[origin, 0]]);
  const seen = new Set();
  const from = new Map();
  let pointer = origin;
  while (pointer !== finish) {
    seen.add(pointer);
    for (const [next, meters] of pointer.links) {
      const distance = goals.get(pointer) + meters;
      if (distance < (goals.get(next) ?? Infinity)) {
        goals.set(next, distance);
        from.set(next, pointer);
      }
    }
    pointer = [...goals].filter(([node]) => !seen.has(node)).sort((a,b) => a[1]-b[1])[0][0];
  }
  const result = [finish];
  for (let cursor = finish; from.has(cursor); cursor = from.get(cursor)) result.unshift(from.get(cursor));
  return result.map(({ x, z }) => [x,z]);
}

export function travelBetween(start, destination, drive) {
  const a = start.spec;
  const b = destination.spec;
  const waypoints = [];
  const rowA = rowIndex(a);
  const rowB = rowIndex(b);
  const outbound = (building, row, work) => {
    const z = frontage(building) + .46;
    return [[building.x, work.z, .46], [building.x, z, .18], [building.x, sidewalk(row), .18]];
  };
  for (const [x,z,y] of outbound(a,rowA,start.work)) waypoints.push({ x,y,z, drive: false });
  const network = graph({ x:a.x,row:rowA }, { x:b.x,row:rowB }, drive);
  for (const [index,[x,z]] of network.entries()) waypoints.push({ x,y:.178,z,drive: drive && index > 0 });
  for (const [x,z,y] of outbound(b,rowB,destination.work).reverse()) waypoints.push({ x,y,z,drive:false });
  waypoints.push({ x:destination.work.x, y:destination.work.y, z:destination.work.z, drive:false });
  return waypoints;
}

export function createWalker(THREE, { element, places, obstacles, left, right, hud, name, modeChanged }) {
  const camera = new THREE.PerspectiveCamera(68, 1, .065, 240);
  const keys = new Set();
  const pads = [];
  const motion = typeof matchMedia === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const forward = new THREE.Vector3();
  const direction = new THREE.Vector3();
  let enabled = false;
  let look;
  let yaw = 0;
  let pitch = 0;
  let height = 1.68;
  let elapsed = 0;
  let lastLabel = '';
  const position = new THREE.Vector3(2.7,0,5.18);

  const modalOpen = () => Boolean(document.querySelector('dialog[open]'));
  function pad(element) {
    const state = { x: 0, y: 0, id: null, startX: 0, startY: 0, element };
    const knob = element.querySelector('i');
    function reset() {
      state.x = state.y = 0;
      state.id = null;
      knob.style.transform = '';
    }
    element.addEventListener('pointerdown', event => {
      if (!enabled || state.id !== null) return;
      element.setPointerCapture(event.pointerId);
      state.id = event.pointerId;
      state.startX = event.clientX;
      state.startY = event.clientY;
    });
    element.addEventListener('pointermove', event => {
      if (event.pointerId !== state.id) return;
      const max = Math.max(22, element.clientWidth * .33);
      const x = (event.clientX - state.startX) / max;
      const y = (event.clientY - state.startY) / max;
      const m = Math.max(1, Math.hypot(x,y));
      state.x = x / m;
      state.y = y / m;
      knob.style.transform = 'translate(' + state.x * max + 'px,' + state.y * max + 'px)';
    });
    for (const type of ['pointerup','pointercancel','lostpointercapture']) {
      element.addEventListener(type, event => { if (event.pointerId === state.id) reset(); });
    }
    pads.push(reset);
    return state;
  }
  const move = pad(left);
  const turn = pad(right);

  function rotate(x, y) {
    yaw -= x;
    pitch = Math.min(1.16, Math.max(-1.16, pitch - y));
  }
  function orient() {
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }
  function reset() {
    keys.clear();
    look = null;
    pads.forEach(off => off());
  }

  function setEnabled(value) {
    enabled = value;
    reset();
    modeChanged(value);
    hud.hidden = !value;
    if (value) {
      const destination = places.get('hq').spec;
      yaw = Math.atan2(position.x - destination.x, position.z - frontage(destination));
      pitch = 0;
      orient();
      camera.position.set(position.x,height,position.z);
      element.focus({ preventScroll: true });
    }
  }

  window.addEventListener('keydown', event => {
    const action = ['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'].includes(event.code);
    if (!enabled || !action || modalOpen() || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
    event.preventDefault();
    keys.add(event.code);
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', reset);
  element.addEventListener('pointerdown', event => {
    if (!enabled || event.button !== 0) return;
    look = event.pointerId;
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener('pointermove', event => {
    if (!enabled || look !== event.pointerId) return;
    rotate(event.movementX * .0027, event.movementY * .0027);
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) {
    element.addEventListener(type, event => { if (event.pointerId === look) look = null; });
  }

  function update(dt) {
    if (!enabled) return;
    if (modalOpen()) { reset(); return; }
    orient();
    rotate(turn.x * dt * 2.20, turn.y * dt * 1.80);
    const strafe = Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + move.x;
    const thrust = Number(keys.has('KeyW')) - Number(keys.has('KeyS')) - move.y;
    const length = Math.max(1,Math.hypot(strafe,thrust));
    const seconds = Math.min(dt,.16);
    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(move.x,move.y) > .94) ? 6.35 : 3.7;
    const heading = forward.set(-Math.sin(yaw),0,-Math.cos(yaw));
    direction.set(-heading.z,0,heading.x).multiplyScalar(strafe).addScaledVector(heading,thrust);
    direction.multiplyScalar(seconds * speed / length);
    const steps = Math.max(1,Math.ceil(direction.length()/.14));
    for (let i=0;i<steps;i++) {
      const dx = direction.x/steps;
      const dz = direction.z/steps;
      if (canStand(position.x+dx,position.z,places,obstacles)) position.x += dx;
      if (canStand(position.x,position.z+dz,places,obstacles)) position.z += dz;
    }
    let indoors = false;
    let title = 'Улица';
    for (const { spec, door } of places.values()) {
      if (!door || Math.abs(position.x-spec.x) >= spec.width/2 || Math.abs(position.z-spec.z) >= spec.depth/2) continue;
      indoors = true;
      title = spec.label;
      break;
    }
    if (title !== lastLabel) { lastLabel = title; name.textContent = title; }
    const desired = indoors ? 2.07 : 1.72;
    height += (desired-height)*Math.min(1,dt*12);
    if (motion) elapsed += direction.length() * 7;
    camera.position.set(position.x, height + (motion && direction.lengthSq() > .0001 ? Math.sin(elapsed)*.029 : 0), position.z);
  }

  return { camera, position, setEnabled, update, get active() { return enabled; }, get indoors() { return lastLabel !== 'Улица' && Boolean(lastLabel); } };
}
