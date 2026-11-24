const size = 1024;
const snowColor = 0xd2e2eb;
const roadColor = 0xa9b3ba;

function canvas(w, h = w) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  const image = document.createElement('canvas');
  image.width = w;
  image.height = h;
  return image;
}

function sampler(initial) {
  let state = initial;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function textures(THREE, kind, seed, repeats) {
  const images = Array.from({ length: 3 }, () => canvas(size));
  const [color, rough, height] = images.map(image => image.getContext('2d'));
  const random = sampler(seed);
  const layouts = {
    limestone: { base: '#d6cab4', mortar: '#9e988b', rows: 8, cols: 5, grain: '#79695a' },
    brick: { base: '#c59581', mortar: '#b2a29a', rows: 17, cols: 8, grain: '#4d3027' },
    glass: { base: '#abc5d2', mortar: '#607682', rows: 7, cols: 4, grain: '#435966' },
  };
  const layout = layouts[kind];
  color.fillStyle = layout?.mortar ?? (kind === 'snow' ? '#dbe7eb' : '#535d62');
  rough.fillStyle = kind === 'glass' ? '#222' : kind === 'road' ? '#676767' : '#c9c9c9';
  height.fillStyle = layout ? '#444' : '#888';
  for (const ctx of [color, rough, height]) ctx.fillRect(0, 0, size, size);

  if (layout) {
    const { rows, cols, base } = layout;
    const w = size / cols;
    const h = size / rows;
    const joint = kind === 'limestone' ? 3 : kind === 'glass' ? 6 : 5;
    for (let row = 0; row < rows; row++) {
      const start = row % 2 && kind !== 'glass' ? -.5 : 0;
      for (let n = 0; n <= cols; n++) {
        const x = (start + n) * w + joint / 2;
        const y = row * h + joint / 2;
        color.fillStyle = base;
        color.fillRect(x, y, w - joint, h - joint);
        color.fillStyle = random() > .44 ? '#fff' : kind === 'glass' ? '#224568' : layout.grain;
        color.globalAlpha = .04 + random() * .13;
        color.fillRect(x, y, w - joint, h - joint);
        color.globalAlpha = 1;
        if (kind === 'glass') {
          const glare = color.createLinearGradient(x, y, x + w, y + h);
          glare.addColorStop(0, '#d8e8ef99');
          glare.addColorStop(.55, '#b1c6de33');
          glare.addColorStop(1, '#56798d58');
          color.fillStyle = glare;
          color.fillRect(x, y, w - joint, h - joint);
        }
        height.fillStyle = kind === 'glass' ? '#777' : '#aaa';
        height.fillRect(x, y, w - joint, h - joint);
        const shade = kind === 'glass' ? 45 + random() * 26 : 167 + random() * 49;
        rough.fillStyle = 'rgb(' + [shade, shade, shade].map(Math.round).join(',') + ')';
        rough.fillRect(x, y, w - joint, h - joint);
      }
    }
  }

  for (let i = 0; i < 31000; i++) {
    const x = random() * size;
    const y = random() * size;
    const light = random() > .44;
    const radius = kind === 'road' ? 1 + random() * 3 : .7 + random() * 2.3;
    color.fillStyle = light ? '#ffffff21' : kind === 'snow' ? '#6589a41c' : '#211a1934';
    color.fillRect(x, y, radius, radius);
    height.fillStyle = light ? '#ffffff27' : '#11111131';
    height.fillRect(x, y, radius, radius);
    if (i % 5 === 0) {
      rough.fillStyle = light ? '#ffffff20' : '#11111131';
      rough.fillRect(x, y, radius * 2, radius);
    }
  }

  if (kind === 'road' || kind === 'snow') {
    for (let i = 0; i < 60; i++) {
      const x = random() * size;
      const y = random() * size;
      const radius = 12 + random() * 39;
      const patch = color.createRadialGradient(x, y, 0, x, y, radius);
      patch.addColorStop(0, kind === 'road' ? '#161d2449' : '#b8c9d139');
      patch.addColorStop(1, '#182b3900');
      color.fillStyle = patch;
      color.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }

  const [map, roughnessMap, bumpMap] = images.map((image, i) => {
    const texture = new THREE.CanvasTexture(image);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeats);
    texture.anisotropy = 4;
    if (i === 0) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
  return { map, roughnessMap, bumpMap };
}

function winterSky(THREE, renderer, scene) {
  const extent = 96;
  const rays = [
    (u,v) => [1,-v,-u], (u,v) => [-1,-v,u], (u,v) => [u,1,v],
    (u,v) => [u,-1,-v], (u,v) => [u,-v,1], (u,v) => [-u,-v,-1],
  ];
  const images = rays.map(ray => {
    const image = canvas(extent);
    const context = image.getContext('2d');
    const pixels = context.createImageData(extent, extent);
    for (let y = 0; y < extent; y++) {
      for (let x = 0; x < extent; x++) {
        const [vx, vy, vz] = ray(x / (extent - 1) * 2 - 1, y / (extent - 1) * 2 - 1);
        const length = Math.hypot(vx, vy, vz);
        const up = vy / length;
        const warm = Math.max(0, (-vx * .83 + vy * .20 + vz * .52) / length) ** 29;
        const sky = Math.max(0, up) ** .6;
        const ground = Math.max(0, -up) * .43;
        const mist = Math.exp(-Math.abs(up) * 9);
        const trail = (Math.sin(vx * 17 / length + Math.sin(vz * 7 / length) + up * 31) * .5 + .5) * mist;
        const p = (y * extent + x) * 4;
        pixels.data[p] = 205 - 64 * sky - 32 * ground + 49 * warm + trail * 9;
        pixels.data[p + 1] = 222 - 39 * sky - 39 * ground + 25 * warm + trail * 5;
        pixels.data[p + 2] = 234 - 14 * sky - 46 * ground - 27 * warm;
        pixels.data[p + 3] = 255;
      }
    }
    context.putImageData(pixels, 0, 0);
    return image;
  });
  const cube = new THREE.CubeTexture(images);
  cube.colorSpace = THREE.SRGBColorSpace;
  cube.needsUpdate = true;
  scene.background = cube;
  const generator = new THREE.PMREMGenerator(renderer);
  scene.environment = generator.fromCubemap(cube).texture;
  generator.dispose();
}

export function createWorld(THREE, renderer, scene) {
  winterSky(THREE, renderer, scene);
  const materials = {
    limestone: new THREE.MeshStandardMaterial({ ...textures(THREE, 'limestone', 172, [1, 1]), roughness: .87, bumpScale: .035 }),
    brick: new THREE.MeshStandardMaterial({ ...textures(THREE, 'brick', 733, [1, 1]), roughness: .85, bumpScale: .054 }),
    glass: new THREE.MeshStandardMaterial({ ...textures(THREE, 'glass', 121, [1, 1]), roughness: .25, metalness: .71, bumpScale: .008, envMapIntensity: 1.18 }),
    asphalt: new THREE.MeshStandardMaterial({ ...textures(THREE, 'road', 283, [3, 1]), color: roadColor, roughness: .76, metalness: .18, bumpScale: .024 }),
    snow: new THREE.MeshStandardMaterial({ ...textures(THREE, 'snow', 83, [4, 4]), roughness: .96, bumpScale: .027 }),
  };
  const random = sampler(57891);
  const group = new THREE.Group();
  scene.add(group);
  const block = new THREE.BoxGeometry();
  const transform = new THREE.Object3D();
  const shade = new THREE.Color();
  const addBlock = (parent, material, x, y, z, w, h, d) => {
    const mesh = new THREE.Mesh(block, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    parent.add(mesh);
    return mesh;
  };
  const base = addBlock(group, materials.snow, 65, -.38, 3, 248, .73, 355);
  base.receiveShadow = true;
  addBlock(group, materials.snow, -168, -.39, 3, 105, .73, 355);
  const quay = new THREE.MeshStandardMaterial({ color: snowColor, roughness: .85 });
  for (const x of [-57.5, -114.5]) {
    addBlock(group, quay, x, -.12, 0, 3.75, .51, 310);
    addBlock(group, new THREE.MeshStandardMaterial({ color: 0x8599a2 }), x - 1.9, .22, 0, .13, .34, 310);
  }
  for (let z = -121; z < 136; z += 16) {
    const road = addBlock(group, materials.asphalt, 55, -.008, z, 220, .034, 3.2);
    road.receiveShadow = true;
  }

  const buildings = [[], [], []];
  const obstacles = [];
  const roofs = [];
  const antennae = [];
  for (let ix = -12; ix <= 11; ix++) {
    for (let iz = -11; iz <= 11; iz++) {
      const x = ix * 14 + (random() - .5) * 3.2;
      const z = iz * 13 + (random() - .5) * 2.8;
      if (x > -119 && x < -46 || Math.abs(x) < 35 && Math.abs(z) < 31) continue;
      if (random() < .095) continue;
      const foreground = Math.abs(z) < 53 && Math.abs(x) < 50;
      const height = 5.5 + random() ** 1.65 * (foreground ? 7 : x < -118 ? 36 : 45);
      const w = 5.1 + random() * 4.7;
      const d = 4.1 + random() * 5.4;
      const variation = Math.floor(random() * 3);
      const tint = [0xd6ccba, 0xd4b4a7, 0xacc0cc, 0xcbd1d2][Math.floor(random() * 4)];
      buildings[variation].push([x, height / 2 - .3, z, w, height, d, tint]);
      if (x > -60 && x < 49 && Math.abs(z) < 44) obstacles.push([x-w/2,x+w/2,z-d/2,z+d/2]);
      roofs.push([x, height - .29, z, w + .21, .23, d + .21, 0xe1eced]);
      if (random() > .61) {
        roofs.push([x + .7, height + .56, z - .6, w * .44, 1.6, d * .49, 0xb1bac3]);
        if (height > 25 && random() > .68) antennae.push([x + .7, height + 2.3, z - .6, .074, 2.4, .074, 0x7d8c97]);
      }
    }
  }
  const fillInstances = (geometry, material, list) => {
    const batch = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach(([x, y, z, w, h, d, color, angle = 0], index) => {
      transform.position.set(x, y, z);
      transform.rotation.set(0, angle, 0);
      transform.scale.set(w, h, d);
      transform.updateMatrix();
      batch.setMatrixAt(index, transform.matrix);
      batch.setColorAt(index, shade.setHex(color));
    });
    group.add(batch);
    return batch;
  };
  [materials.limestone, materials.brick, materials.glass].forEach((material, index) => fillInstances(block, material, buildings[index]));
  fillInstances(block, new THREE.MeshStandardMaterial({ color: 0xf2f5f4, roughness: .87 }), roofs);
  fillInstances(block, new THREE.MeshStandardMaterial({ roughness: .42 }), antennae);

  const reflections = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, daylight: { value: 1 } },
    fog: true,
    vertexShader: `
      #include <fog_pars_vertex>
      varying vec3 surface;
      void main() {
        surface = (modelMatrix * vec4(position, 1.)).xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      varying vec3 surface;
      uniform float time;
      uniform float daylight;
      void main() {
        float wind = sin(surface.z * 2.2 + surface.x * 1.4 + time * .44);
        float ripples = sin(surface.z * 7.0 - surface.x * .8 + time * .87 + wind);
        float bars = smoothstep(.48,.84, sin(surface.z*.48 + wind*.29) * .5 + .5);
        float bank = exp(-min(abs(surface.x+57.),abs(surface.x+114.))*.135);
        vec3 view = normalize(cameraPosition - surface);
        float ref = pow(1.-max(0.,view.y),2.);
        vec3 water = mix(vec3(.075,.148,.188), vec3(.32,.48,.57), ref*.56);
        water += ripples*.025 + wind*.017 + vec3(.23,.28,.31)*bars*bank*(ref+.33);
        water += vec3(.26,.20,.12)*pow(max(0.,wind * .5+.5),11.)*.14;
        gl_FragColor = vec4(water * daylight, 1.);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }`,
  });
  Object.assign(reflections.uniforms, THREE.UniformsUtils.clone(THREE.UniformsLib.fog));
  const river = new THREE.Mesh(new THREE.PlaneGeometry(61, 349), reflections);
  river.rotation.x = -Math.PI / 2;
  river.position.set(-86, -.42, 0);
  group.add(river);
  const chunks = Array.from({ length: 52 }, () => [-61-random()*49, -.395, -117+random()*232, .22+random()*1.1, .039, .18+random()*.92, 0xc2dbe2, random()*6]);
  fillInstances(new THREE.CylinderGeometry(1,.91,1,6), new THREE.MeshStandardMaterial({ roughness:.58 }), chunks);

  const bridge = new THREE.MeshStandardMaterial({ color: 0x627c88, roughness: .74 });
  addBlock(group, bridge, -87, 3, -57, 69, .9, 4);
  for (const x of [-69,-103]) {
    for (const z of [-58.7,-55.2]) addBlock(group, bridge, x, 7.3, z, 1.7, 14.8, 1.6);
    addBlock(group, bridge, x, 12.9, -57, 1.3, .7, 3.5);
    addBlock(group, bridge, x, 9.6, -57, 1.2, .53, 4.2);
  }
  const cablePoints = Array.from({ length: 65 }, (_, n) => {
    const x = -117 + n * .99;
    const dist = Math.min(Math.abs(x + 69), Math.abs(x + 103));
    return [x, 12.5 - Math.min(dist * .52, 8.6)];
  });
  for (const z of [-58.6,-55.4]) {
    const points = cablePoints.map(([x,y]) => new THREE.Vector3(x,y,z));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x5d7985 })));
    for (const [x, y] of cablePoints.filter((_, n) => n % 3 === 0)) {
      if (y > 3.45) addBlock(group, bridge, x, (y+3.2)/2, z, .075, y-3.2, .07);
    }
  }

  return {
    materials,
    obstacles,
    update(time, light) {
      reflections.uniforms.time.value = time;
      reflections.uniforms.daylight.value = light === 'night' ? .44 : light === 'dusk' ? .72 : 1;
    },
  };
}
