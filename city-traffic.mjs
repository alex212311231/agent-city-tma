const cars = [
  ['taxi',-84,-84],['taxi',0,-84],['sedan',84,-84],['suv',-84,42],
  ['taxi',0,42],['suv',84,42],['sedan',-84,126],['taxi',0,126],
];

export function createVehicle(THREE,assets,kind) {
  const car=assets.place(new THREE.Group(),kind,{
    width:1.98,height:1.61,depth:4.85,
    onReady(model){
      car.userData.wheels=[];
      model.traverse(node=>{
        if(/^wheel_[FR][LR]$/.test(node.name))car.userData.wheels.push(node);
      });
    },
  });
  car.removeFromParent();
  return car;
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

export function streets(THREE,scene,navigation,bounds,assets) {
  const point=(x,z)=>new THREE.Vector3(x,.15,z);
  const frame={x:0,z:0,yaw:0};
  const vehicles=cars.map(([kind,x,z],index)=>{
    const track=rectangle(x,z,42,1.72);
    for(const [i,[a,b]] of track.entries()){
      const [c,d]=track[(i+1)%track.length];
      if(navigation.sweep(THREE,point(a,b),point(c,d),bounds,2.2).distanceTo(point(c,d))>.01)
        throw new Error('Traffic lane must clear the city grid');
    }
    const model=createVehicle(THREE,assets,kind);
    model.position.y=navigation.roadHeight;
    scene.add(model);
    return {track,model,speed:7.9+(index%3)*.39,start:(index*19.1)%145};
  });

  function update(time,dt,motion){
    const elapsed=motion?time:0;
    for(const {track,model,speed,start} of vehicles){
      along(track,(start+elapsed*speed)%(4*(42-3.44)),frame);
      model.position.set(frame.x,navigation.roadHeight,frame.z);
      model.rotation.y=frame.yaw;
      if(motion)for(const wheel of model.userData.wheels??[])wheel.rotateX(speed*dt/.35);
    }
  }
  return { update };
}

export function createSnow(THREE,scene,offices) {
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
    Object.assign(shader.uniforms,{uSnowCenter:center,uSnowTime:elapsed,uSnowVolume:{value:volume},
      uSnowWalls:{value:offices.map(({bounds})=>new THREE.Vector4(bounds.min.x,bounds.min.z,bounds.max.x,bounds.max.z))},
      uSnowRoofs:{value:offices.map(({ bounds })=>bounds.max.y)}});
    shader.vertexShader='uniform vec3 uSnowCenter; uniform vec3 uSnowVolume; uniform float uSnowTime; uniform vec4 uSnowWalls[4]; uniform float uSnowRoofs[4];\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      'float speed=1.85+mod(position.x, 2.8); vec3 motion=vec3(uSnowTime*.41, -uSnowTime*speed, 0.0);\n'+
      'vec3 halfBox=uSnowVolume*.5; vec3 transformed=uSnowCenter+mod(position+motion-uSnowCenter+halfBox,uSnowVolume)-halfBox;\n'+
      'for(int i=0;i<4;i++){ vec4 wall=uSnowWalls[i]; if(transformed.y<uSnowRoofs[i] && all(greaterThan(transformed.xz,wall.xy)) && all(lessThan(transformed.xz,wall.zw))) { transformed.y=-500.0; }}');
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
