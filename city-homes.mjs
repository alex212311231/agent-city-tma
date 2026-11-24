const sidewalkHeight = .1325;
const width = 4.06;
const depth = 3.6;
const front = -depth / 2;
const firstCenter = -73;
const rowZ = 13.5;
const spacing = 5;

const elevations = {
  coder: { brick: 0x9b7770, trim: 0xbb9e89, door: 0x335750, height: 6.9, lintel: true },
  tester: { brick: 0x7f625e, trim: 0xad9688, door: 0x804f44, height: 7.35, lintel: false },
  reporter: { brick: 0x9b746a, trim: 0xd0b7a0, door: 0x624963, height: 6.75, lintel: true },
  lead: { brick: 0x807b78, trim: 0xc6b3a0, door: 0x405875, height: 7.72, lintel: false },
  scout: { brick: 0x9b8170, trim: 0xb99d82, door: 0x6d5233, height: 7.1, lintel: true },
};

function brickTexture(THREE) {
  const surface = document.createElement('canvas');
  surface.width = surface.height = 256;
  const ctx = surface.getContext('2d');
  ctx.fillStyle = '#88807d';
  ctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 32; row++) {
    for (let col = -1; col < 10; col++) {
      const x = col * 26 + row % 2 * 13;
      const y = row * 8;
      const tone = 184 + (row * 19 + col * 31 + 71) % 32;
      ctx.fillStyle = 'rgb(' + tone + ',' + (tone - 7) + ',' + (tone - 10) + ')';
      ctx.fillRect(x, y, 25, 7);
      ctx.fillStyle = '#ffffff17';
      ctx.fillRect(x, y, 25, 1);
    }
  }
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function addressPlaque(THREE, title, number, accent) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 88;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#202b34';
  ctx.fillRect(0, 0, 384, 88);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 84, 384, 4);
  ctx.fillStyle = '#f4e9d8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 39px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(String(number) + ' · ' + title, 192, 44, 346);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({map:texture});
}

export function buildHomes(THREE, scene, profiles) {
  const brickMap = brickTexture(THREE);
  const solid = new THREE.BoxGeometry(1,1,1);
  const masonry = new THREE.MeshStandardMaterial({color:0x3f494f,roughness:.79});
  const metal = new THREE.MeshStandardMaterial({color:0x243139,roughness:.52,metalness:.28});
  const snow = new THREE.MeshStandardMaterial({color:0xe6edf0,roughness:.88});
  const amber = new THREE.MeshStandardMaterial({color:0xffdcb4,emissive:0xffbf7a,emissiveIntensity:1.26,roughness:.52});
  const green = new THREE.MeshStandardMaterial({color:0x3a5550,roughness:.92});
  const shared = new Map([masonry,metal,snow,amber,green].map(material=>[material,[]]));
  const transform = new THREE.Matrix4();
  function addBatches(parent,materials) {
    for (const [material,specs] of materials) {
      if (!specs.length) continue;
      const batch = new THREE.InstancedMesh(solid,material,specs.length);
      specs.forEach(([x,y,z,w,h,d],index)=>{
        transform.makeScale(w,h,d).setPosition(x,y,z);
        batch.setMatrixAt(index,transform);
      });
      batch.receiveShadow = !material.emissiveIntensity || material.emissive.getHex()===0;
      batch.castShadow = material.map===brickMap;
      parent.add(batch);
    }
  }
  const northFace = new THREE.PlaneGeometry(1.52,.35);
  northFace.rotateY(Math.PI);
  const homes = new Map();
  const row = new THREE.Group();
  row.name = 'Дома агентов';
  scene.add(row);

  for (const [index,profile] of profiles.filter(profile=>!profile.job).entries()) {
    const design = elevations[profile.id] ?? elevations.coder;
    const {height} = design;
    const x = firstCenter + index * spacing;
    const group = new THREE.Group();
    group.name = 'home-'+profile.id;
    group.position.set(x,sidewalkHeight,rowZ);
    row.add(group);
    const brick = new THREE.MeshStandardMaterial({color:design.brick,map:brickMap,roughness:.86});
    const trim = new THREE.MeshStandardMaterial({color:design.trim,roughness:.77});
    const oak = new THREE.MeshStandardMaterial({color:design.door,roughness:.64});
    const glass = new THREE.MeshStandardMaterial({
      color:0xc59467,emissive:0xffba73,emissiveIntensity:.64,roughness:.34,
    });
    const pieces = new Map();
    function add(material,dx,y,z,w,h,d) {
      const sharedPieces = shared.get(material);
      if (sharedPieces) {
        sharedPieces.push([x+dx,sidewalkHeight+y,rowZ+z,w,h,d]);
        return;
      }
      if (!pieces.has(material)) pieces.set(material,[]);
      pieces.get(material).push([dx,y,z,w,h,d]);
    }

    add(brick,0,height/2+.05,0,width,height-.1,depth);
    add(masonry,0,.17,0,width+.06,.34,depth+.05);
    add(trim,0,2.72,front-.033,width+.06,.13,.13);
    add(trim,0,height-.47,0,width+.14,.11,depth+.12);
    add(masonry,0,height-.25,0,width+.22,.32,depth+.20);
    add(trim,0,height-.043,0,width+.28,.12,depth+.26);
    add(snow,0,height+.047,.035,width+.165,.055,depth+.16);
    add(masonry,.98,height+.29,.62,.38,.49,.46);
    add(snow,.98,height+.554,.62,.43,.041,.49);

    function frontWindow(cx,cy,w,h) {
      add(trim,cx,cy,front-.026,w+.24,h+.19,.089);
      add(metal,cx,cy,front-.079,w+.084,h+.062,.059);
      add(glass,cx,cy,front-.111,w,h,.024);
      add(metal,cx,cy,front-.13,.042,h,.015);
      add(metal,cx,cy+h*.15,front-.136,w,.043,.018);
      add(trim,cx,cy-h/2-.083,front-.105,w+.30,.099,.18);
      if (design.lintel) add(trim,cx,cy+h/2+.103,front-.085,w+.30,.085,.14);
    }

    for (const cy of [3.58,height-1.35]) {
      frontWindow(-1.03,cy,.76,1.30);
      frontWindow(0,cy,.74,1.30);
      frontWindow(1.03,cy,.76,1.30);
    }
    frontWindow(-1.12,1.61,.77,1.15);
    frontWindow(1.12,1.61,.77,1.15);

    const back = depth / 2;
    for (const cy of [2.08,4.12,height-1.25]) {
      for (const cx of [-1.03,1.03]) {
        add(trim,cx,cy,back+.03,.87,.97,.087);
        add(glass,cx,cy,back+.084,.66,.75,.027);
        add(metal,cx,cy,back+.104,.04,.75,.019);
      }
    }

    add(trim,0,1.25,front-.028,1.19,2.43,.105);
    add(metal,0,1.19,front-.088,1.00,2.19,.075);
    add(oak,0,1.19,front-.134,.87,2.06,.045);
    add(glass,0,1.93,front-.161,.655,.53,.023);
    add(metal,0,1.93,front-.177,.037,.53,.018);
    add(amber,.27,1.17,front-.172,.060,.12,.028);
    add(trim,0,2.509,front-.079,1.35,.15,.207);
    add(masonry,0,.018,front-.52,1.48,.063,1.18);
    for (const cx of [-.72,.72]) {
      add(metal,cx,.27,front-.79,.046,.44,.055);
      add(metal,cx,.50,front-.74,.048,.044,.60);
    }
    for (const cx of [-1.63,1.63]) {
      add(masonry,cx,.18,front-.27,.42,.34,.42);
      add(green,cx,.42,front-.27,.30,.25,.29);
      add(snow,cx,.558,front-.28,.24,.042,.23);
    }
    add(metal,1.67,2.44,front-.136,.20,.31,.16);
    add(amber,1.67,2.46,front-.224,.129,.188,.042);

    const address = new THREE.Mesh(northFace,addressPlaque(THREE,profile.title,21+index*2,profile.color));
    address.position.set(0,2.47,front-.193);
    group.add(address);
    addBatches(group,pieces);

    homes.set(profile.id,{
      id:group.name,profileId:profile.id,x,z:rowZ,facing:-1,label:'Дом · '+profile.title,root:group,
      entry:new THREE.Vector3(x,sidewalkHeight,10.35),
      work:new THREE.Vector3(x,sidewalkHeight,11.12),
      bounds:new THREE.Box3(
        new THREE.Vector3(x-width/2-.14,sidewalkHeight,rowZ+front-.25),
        new THREE.Vector3(x+width/2+.14,sidewalkHeight+height+.58,rowZ+depth/2+.14)
      ),
      setOccupied(occupied) { glass.emissiveIntensity = occupied ? 1.04 : .52; },
    });
  }
  addBatches(row,shared);
  return homes;
}
