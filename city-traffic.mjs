const cabinParts = [
  [0,.67,0,1.98,.61,4.82,'body'],
  [0,.48,0,1.99,.14,4.73,0x263245],
  [0,1.17,-.32,1.75,.42,2.42,0x263e51],
  [0,1.46,-.37,1.73,.18,2.22,'body'],
  [0,1.058,1.42,1.92,.147,1.17,'body'],
  [0,1.20,-1.64,1.87,.23,.65,'body'],
  [-.70,.78,2.431,.43,.15,.033,0xffeac1],
  [.70,.78,2.431,.43,.15,.033,0xffeac1],
  [-.70,.74,-2.429,.39,.136,.031,0xf9807f],
  [.70,.74,-2.429,.39,.136,.031,0xf9807f],
  [0,.56,2.43,.80,.09,.031,0x28384a],
  [0,.53,-2.43,.72,.084,.031,0xa3b4c5],
];
const roofFor = {
  taxi:[[0,1.17,-.32,1.75,.42,2.42,0x263e51],[0,1.46,-.37,1.73,.18,2.22,'body']],
  sedan:[[0,1.204,-.25,1.59,.43,2.29,0x263e51],[0,1.506,-.31,1.57,.187,2.02,'body']],
  suv:[[0,1.184,-.49,1.82,.52,2.82,0x263e51],[0,1.517,-.52,1.79,.168,2.70,'body']],
};
const wheelPositions = [[-.896,.365,1.42],[.896,.365,1.42],[-.896,.365,-1.43],[.896,.365,-1.43]];
const outfits = [0x355f80,0xc57a58,0x56685a,0x87649a,0xe3a459,0x5d7386,0x936554];
const faces = [0xcf966c,0xe6b692,0xaf7454,0xd8a78c];
const cars = [
  [0xffbe28,'taxi',-42,-42],[0xeab231,'taxi',0,-42],[0x718db1,'sedan',-42,0],[0x844c51,'suv',0,0],
  [0xffbd2b,'taxi',42,42],[0x718478,'suv',-84,-42],[0x4b6f79,'sedan',42,-42],[0xdfad37,'taxi',0,42],
];

export function createVehicle(THREE, color, taxi=false) {
  const group=new THREE.Group();
  const box=new THREE.BoxGeometry();
  const wheel=new THREE.CylinderGeometry(.36,.36,.20,12).rotateZ(Math.PI/2);
  for(const [x,y,z,w,h,d,paint] of cabinParts){
    const mesh=new THREE.Mesh(box,new THREE.MeshStandardMaterial({color:paint==='body'?color:paint,roughness:.63}));
    mesh.position.set(x,y,z);
    mesh.scale.set(w,h,d);
    group.add(mesh);
  }
  const tires=new THREE.MeshStandardMaterial({color:0x1f2a36,roughness:.98});
  for(const [x,y,z] of wheelPositions){
    const mesh=new THREE.Mesh(wheel,tires);
    mesh.position.set(x,y,z);
    group.add(mesh);
  }
  if(taxi){
    const sign=new THREE.Mesh(box,new THREE.MeshBasicMaterial({color:0xffdf95,toneMapped:false}));
    sign.position.set(0,1.587,-.42);
    sign.scale.set(.81,.026,.32);
    group.add(sign);
  }
  return group;
}

function rectangle(x,z,step,offset){
  return [[x+offset,z+offset],[x+step-offset,z+offset],[x+step-offset,z+step-offset],[x+offset,z+step-offset]];
}

function along(points, distance, out) {
  for(let i=0;i<points.length;i++){
    const [x,z]=points[i];
    const [X,Z]=points[(i+1)%points.length];
    const edge=Math.abs(X-x)+Math.abs(Z-z);
    if(distance<edge||i===points.length-1){
      const t=Math.min(1,distance/edge);
      out.x=x+(X-x)*t;
      out.z=z+(Z-z)*t;
      out.yaw=Math.atan2(X-x,Z-z);
      return;
    }
    distance-=edge;
  }
}

export function streets(THREE, scene, navigation, bounds) {
  const dummy = new THREE.Object3D();
  const root = new THREE.Object3D();
  const local = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const paint = new THREE.Color();
  const angle = new THREE.Euler();
  const v=(x,y,z)=>new THREE.Vector3(x,y,z);
  const frameCache={x:0,z:0,yaw:0};
  function batch(geometry, count, roughness=.91){
    const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({roughness}),count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled=false;
    scene.add(mesh);
    return mesh;
  }
  const carShell=batch(new THREE.BoxGeometry(),cars.length*(cabinParts.length+1),.65);
  const lamps=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial({toneMapped:false}),cars.length*4);
  lamps.frustumCulled=false;
  lamps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(lamps);
  const tires=batch(new THREE.CylinderGeometry(.36,.36,.20,10).rotateZ(Math.PI/2),cars.length*4);
  const carsData=cars.map(([body,kind,x,z],i)=>{
    const track=rectangle(x,z,42,1.72);
    for(const [index,[a,b]] of track.entries()){
      const [c,d]=track[(index+1)%track.length];
      if(navigation.sweep(THREE,v(a,.15,b),v(c,.15,d),bounds,2.2).distanceTo(v(c,.15,d))>.01)
        throw new Error('Traffic lane must clear the city grid');
    }
    cabinParts.forEach((part,n)=>carShell.setColorAt(i*(cabinParts.length+1)+n,paint.setHex(part[6]==='body'?body:part[6])));
    carShell.setColorAt(i*(cabinParts.length+1)+cabinParts.length,paint.setHex(0xffe1a0));
    for(let n=0;n<4;n++)tires.setColorAt(i*4+n,paint.setHex(0x212a38));
    const parts=cabinParts.map((part,index)=>index===2||index===3?roofFor[kind][index-2]:part);
    parts.slice(6,10).forEach((part,n)=>lamps.setColorAt(i*4+n,paint.setHex(part[6])));
    return {track,parts,taxi:kind==='taxi',speed:7.9+(i%3)*.39,start:(i*19.1)%145};
  });
  const pedestrianTracks=[[-84,-42],[-42,-42],[0,-42],[-42,0],[0,0],[42,0],[0,42]];
  const manners=pedestrianTracks.flatMap(([x,z],ring)=>Array.from({length:4},(_,i)=>({
    track:rectangle(x,z,42,4.82), speed:1.19+.12*((ring+i)%4), shift:i*33.9+ring*6.2,
    scale:.92+(i%3)*.045, coat:outfits[(i+ring)%outfits.length],face:faces[(i+ring*2)%4],
  })));
  const people=batch(new THREE.BoxGeometry(),manners.length*5);
  const heads=batch(new THREE.SphereGeometry(1,8,6),manners.length*2);
  manners.forEach((walker,i)=>{
    const colors=[walker.coat,0x243343,0x243343,walker.coat,walker.coat];
    colors.forEach((color,b)=>people.setColorAt(i*5+b,paint.setHex(color)));
    heads.setColorAt(i*2,paint.setHex(walker.face));
    heads.setColorAt(i*2+1,paint.setHex(walker.coat));
  });

  function transform(frame, elevation, scale=1){
    root.position.set(frame.x,elevation,frame.z);
    root.rotation.set(0,frame.yaw,0);
    root.scale.setScalar(scale);
    root.updateMatrix();
  }
  function put(mesh,i,x,y,z,w,h,d,pitch=0){
    dummy.position.set(x,y,z);
    dummy.scale.set(w,h,d);
    rotation.setFromEuler(angle.set(pitch,0,0));
    local.compose(dummy.position,rotation,dummy.scale).premultiply(root.matrix);
    mesh.setMatrixAt(i,local);
  }

  let last=-1;
  function update(time,motion){
    const tick=motion?Math.floor(time*30):0;
    if(tick===last)return;
    last=tick;
    carsData.forEach(({ track,parts,taxi,speed,start },i)=>{
      along(track,(start+tick/30*speed)%(4*(42-3.44)),frameCache);
      transform(frameCache,-.087);
      parts.forEach(([x,y,z,w,h,d],n)=>{
        if(n>=6&&n<=9){
          put(lamps,i*4+n-6,x,y,z,w,h,d);
          put(carShell,i*(cabinParts.length+1)+n,x,y,z,0,0,0);
        }else put(carShell,i*(cabinParts.length+1)+n,x,y,z,w,h,d);
      });
      put(carShell,i*(cabinParts.length+1)+cabinParts.length,0,1.586,-.42,taxi ? .82 : 0,taxi ? .026 : 0,taxi ? .31 : 0);
      wheelPositions.forEach(([x,y,z],n)=>put(tires,i*4+n,x,y,z,1,1,1));
    });
    manners.forEach(({track,speed,shift,scale},i)=>{
      along(track,(shift+tick/30*speed)%(4*(42-9.64)),frameCache);
      const gait=motion?Math.sin(tick/30*speed*8+i)*.45:0;
      transform(frameCache,.16,scale);
      const idx=i*5;
      put(people,idx,0,1.11,0,.45,.58,.31);
      put(people,idx+1,-.116,.48,.11*gait,.155,.72,.165,gait);
      put(people,idx+2,.116,.48,-.11*gait,.155,.72,.165,-gait);
      put(people,idx+3,-.284,1.02,-.11*gait,.131,.47,.142,-gait);
      put(people,idx+4,.284,1.02,.11*gait,.131,.47,.142,gait);
      put(heads,i*2,0,1.55,0,.164,.224,.165);
      put(heads,i*2+1,0,1.69,-.025,.178,.091,.177);
    });
    for(const mesh of [carShell,tires,people,heads,lamps])mesh.instanceMatrix.needsUpdate=true;
  }
  return { update };
}

export function createSnow(THREE,scene) {
  const count=4000;
  const field=new Float32Array(count*3);
  const volume=new THREE.Vector3(282,108,282);
  for(let i=0;i<count;i++){
    field[i*3]=(i*119.713)%volume.x;
    field[i*3+1]=(i*137.117)%volume.y;
    field[i*3+2]=(i*192.817)%volume.z;
  }
  const texture=document.createElement('canvas');
  texture.width=texture.height=32;
  const ctx=texture.getContext('2d');
  const fade=ctx.createRadialGradient(16,16,2,16,16,16);
  fade.addColorStop(0,'#fff');
  fade.addColorStop(.34,'#ffffffee');
  fade.addColorStop(1,'#ffffff00');
  ctx.fillStyle=fade;
  ctx.fillRect(0,0,32,32);
  const material=new THREE.PointsMaterial({ color:0xecf9ff,size:.6,transparent:true,opacity:.9,depthWrite:false,
    alphaTest:.07,map:new THREE.CanvasTexture(texture)});
  const center={value:new THREE.Vector3()};
  const elapsed={value:0};
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{uSnowCenter:center,uSnowTime:elapsed,uSnowVolume:{value:volume}});
    shader.vertexShader='uniform vec3 uSnowCenter; uniform vec3 uSnowVolume; uniform float uSnowTime;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      'float speed=1.85+mod(position.x, 2.8); vec3 motion=vec3(uSnowTime*.41, -uSnowTime*speed, 0.0);\n'+
      'vec3 halfBox=uSnowVolume*.5; vec3 transformed=uSnowCenter+mod(position+motion-uSnowCenter+halfBox,uSnowVolume)-halfBox;');
    shader.vertexShader=shader.vertexShader.replace('#include <logdepthbuf_vertex>','gl_PointSize=min(gl_PointSize, 17.0);\n#include <logdepthbuf_vertex>');
  };
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(field,3));
  const points=new THREE.Points(geometry,material);
  points.name='world-space-snow';
  points.frustumCulled=false;
  scene.add(points);
  return { points,center,elapsed, update(time,camera,enabled){
    points.visible=enabled;
    center.value.copy(camera.position);
    // The origin follows translation only. No orientation or forward vector enters this calculation.
    center.value.y=Math.max(9, camera.position.y*.44);
    elapsed.value=time;
  }};
}
