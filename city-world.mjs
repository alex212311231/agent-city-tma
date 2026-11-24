import { createAssets, createPipeline } from 'city/assets';
import { buildHomes } from 'city/homes';

const central = [
  { id:'hq', col:3, row:3, style:'stone', facing:1, height:140, tiers:[
    {top:14.76,w:25,d:24},{top:58,w:23.8,d:22.8},{top:78,w:19.1,d:18.4},
    {top:101,w:14,d:13.2},{top:119,w:8.6,d:8.1},{top:128,w:4.5,d:4.3},{top:132,w:2.7,d:2.7},
  ]},
  { id:'moex', col:4, row:3, style:'steel', facing:1, height:68, tiers:[
    {top:17,w:24,d:23},{top:55,w:21,d:20},{top:63,w:17.2,d:16.4},{top:68,w:10,d:9.6},
  ]},
  { id:'dev', col:3, row:4, style:'brick', facing:-1, height:57, tiers:[
    {top:16,w:23.4,d:23.6},{top:47,w:22,d:22.4},{top:54,w:18,d:17},{top:57,w:12.4,d:12.1},
  ]},
  { id:'grants', col:4, row:4, style:'grants', facing:-1, height:64, tiers:[
    {top:18,w:24,d:24},{top:56,w:21.7,d:21},{top:61,w:15.8,d:15.3},{top:64,w:11,d:10},
  ]},
];

function cityPlan(cells) {
  const result=[...central];
  const blocked=new Set(central.map(tower=>tower.col+':'+tower.row));
  for(let col=0;col<cells;col++){
    for(let row=0;row<cells;row++){
      const signature=col+':'+row;
      const inner=col>=2&&col<=5&&row>=2&&row<=5;
      const variation=(col*71+row*43+col*row*13+23)%131;
      if(blocked.has(signature)||inner||(variation%17===0))continue;
      const height=25+variation%41;
      const width=16+variation%8;
      const depth=17+(variation*3)%8;
      result.push({
        id:'block-'+col+'-'+row,col,row,height,
        style:['slate','brick','steel','mist'][variation%4],
        tiers:[{top:height-4,w:width,d:depth},{top:height,w:width-3.4,d:depth-3.2}],
      });
    }
  }
  return result;
}

function image(width,height) {
  const canvas=document.createElement('canvas');
  canvas.width=width;
  canvas.height=height;
  return canvas;
}

const paintSchemes={
  stone:['#c2ad92','#e0c8a5','#314553','#efbd76'],
  crown:['#d7ae79','#efd2a0','#494653','#ffd18c'],
  steel:['#748a9b','#a1b3bb','#263d4c','#aadbbf'],
  brick:['#895c52','#b68270','#273944','#fac582'],
  grants:['#706a80','#97879b','#334352','#e7b686'],
};

function skins(THREE) {
  const result={},walls={},lights=[];
  for(const [name,[wall,trim,glass,warm]] of Object.entries(paintSchemes)){
    const facade=image(128,128), emission=image(128,128), surface=image(128,128);
    const ctx=facade.getContext('2d'), lamp=emission.getContext('2d'), rough=surface.getContext('2d');
    ctx.fillStyle=wall;ctx.fillRect(0,0,128,128);
    ctx.fillStyle=trim;ctx.fillRect(0,0,9,128);ctx.fillRect(119,0,9,128);ctx.fillRect(0,119,128,9);
    ctx.fillStyle='#1c2733';ctx.fillRect(18,24,92,82);
    const reflection=ctx.createLinearGradient(22,102,104,29);
    reflection.addColorStop(0,'#192b39');reflection.addColorStop(1,glass);
    ctx.fillStyle=reflection;ctx.fillRect(21,27,86,76);
    ctx.fillStyle=warm+'aa';ctx.fillRect(71,57,33,43);
    ctx.fillStyle=trim;ctx.fillRect(62,26,4,79);
    ctx.fillStyle=trim+'90';ctx.fillRect(16,106,96,4);
    lamp.fillStyle='#000';lamp.fillRect(0,0,128,128);
    lamp.fillStyle=warm;lamp.fillRect(71,57,33,43);
    rough.fillStyle='#ddd';rough.fillRect(0,0,128,128);
    rough.fillStyle='#444';rough.fillRect(21,27,86,76);
    function texture(canvas,colorSpace){
      const map=new THREE.CanvasTexture(canvas);
      map.colorSpace=colorSpace;
      map.wrapS=map.wrapT=THREE.RepeatWrapping;
      map.anisotropy=4;
      return map;
    }
    const material=new THREE.MeshStandardMaterial({
      map:texture(facade,THREE.SRGBColorSpace),emissiveMap:texture(emission,THREE.SRGBColorSpace),
      emissive:0xffe2c0,emissiveIntensity:name==='crown'?1.10:.38,
      roughness:.82,roughnessMap:texture(surface,THREE.NoColorSpace),metalness:name==='steel'?.24:.09,
      side:THREE.DoubleSide,
    });
    result[name]=material;
    const masonry=image(128,128), stone=masonry.getContext('2d');
    stone.fillStyle=wall;stone.fillRect(0,0,128,128);
    for(let row=0;row<4;row++){
      stone.fillStyle='#131f2825';stone.fillRect(0,row*32,128,1);
      stone.fillStyle='#ffffff1c';stone.fillRect(0,row*32+1,128,1);
      const joint=row%2?30:94;
      stone.fillStyle='#131f2819';stone.fillRect(joint,row*32+2,1,29);
    }
    walls[name]=new THREE.MeshStandardMaterial({map:texture(masonry,THREE.SRGBColorSpace),
      roughness:.83,side:THREE.DoubleSide});
    if(name!=='crown')lights.push(material);
  }
  return {result,walls,lights};
}

function skyMap(THREE){
  const canvas=image(4,256),ctx=canvas.getContext('2d');
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.mapping=THREE.EquirectangularReflectionMapping;
  return {texture,set(colors){
    const gradient=ctx.createLinearGradient(0,0,0,256);
    for(const [index,color] of colors.entries())gradient.addColorStop([0,.51,1][index],color);
    ctx.fillStyle=gradient;ctx.fillRect(0,0,4,256);texture.needsUpdate=true;
  }};
}

function towerShell(THREE,plot,skin,cap,crown,basePaint,windowTrim) {
  const vertices=[], uvs=[], panes=[];
  const geometry=new THREE.BufferGeometry();
  const bottom=.16;
  const doorWidth=4.9;
  const doorTop=5.1;
  function quad(a,b,c,d,uv,mat){
    const offset=vertices.length/3;
    vertices.push(...a,...b,...c,...a,...c,...d);
    const [u,v,U,V]=uv;
    uvs.push(u,v,U,v,U,V,u,v,U,V,u,V);
    geometry.addGroup(offset,6,mat);
  }
  function wall(start,end,low,high,cut,decorated){
    const width=Math.hypot(end[0]-start[0],end[1]-start[1]);
    const pitch=decorated?2.05:3.15;
    const mat=decorated?2:low===bottom&&plot.facing?3:0;
    function strip(u,U,v,V){
      const ax=start[0]+(end[0]-start[0])*u;
      const az=start[1]+(end[1]-start[1])*u;
      const bx=start[0]+(end[0]-start[0])*U;
      const bz=start[1]+(end[1]-start[1])*U;
      quad([ax,v,az],[bx,v,bz],[bx,V,bz],[ax,V,az],[u*width/pitch,v/3.65,U*width/pitch,V/3.65],mat);
    }
    if(!plot.facing||low>bottom){strip(0,1,low,high);return;}
    const openings=[];
    if(cut){
      const side=(1-doorWidth/width)/2;
      openings.push({a:side,b:1-side,low,high:doorTop,door:true});
    }
    for(const sill of [1.4,6.45,11.39]) {
      for(const x of [.12,.29,.46,.63,.80]){
        const size=.098;
        if(cut&&sill<doorTop && x+size>.38&&x<.62)continue;
        openings.push({a:x,b:x+size,low:sill,high:sill+2.14,door:false});
      }
    }
    const stops=[...new Set([low,high,...openings.flatMap(item=>[item.low,item.high])
      .filter(value=>value>low&&value<high)])].sort((a,b)=>a-b);
    for(let i=1;i<stops.length;i++){
      const v=stops[i-1],V=stops[i],mid=(v+V)/2;
      let cursor=0;
      const dx=end[0]-start[0],dz=end[1]-start[1];
      for(const slot of openings.filter(item=>item.low<mid&&item.high>mid).sort((a,b)=>a.a-b.a)){
        if(slot.a>cursor)strip(cursor,slot.a,v,V);
        if(!slot.door){
          const offsetX=dz/width*.021,offsetZ=-dx/width*.021;
          const A=[start[0]+dx*slot.a+offsetX,v,start[1]+dz*slot.a+offsetZ];
          const B=[start[0]+dx*slot.b+offsetX,v,start[1]+dz*slot.b+offsetZ];
          const C=[B[0],V,B[2]],D=[A[0],V,A[2]];
          panes.push(...A,...B,...C,...A,...C,...D);
          const rail=(u,U,y,Y)=>{
            const X=t=>start[0]+dx*t-offsetX*1.5;
            const Z=t=>start[1]+dz*t-offsetZ*1.5;
            quad([X(u),y,Z(u)],[X(U),y,Z(U)],[X(U),Y,Z(U)],[X(u),Y,Z(u)],[0,0,1,1],4);
          };
          const edge=.065/width,middle=(slot.a+slot.b)/2;
          rail(slot.a-edge,slot.a+edge,v,V);
          rail(slot.b-edge,slot.b+edge,v,V);
          rail(middle-edge*.64,middle+edge*.64,v,V);
          const sill=(y,Y)=>{
            rail(slot.a+edge,middle-edge*.64,y,Y);
            rail(middle+edge*.64,slot.b-edge,y,Y);
          };
          if(v===slot.low)sill(v-.046,v+.054);
          if(V===slot.high)sill(V-.042,V+.042);
        }
        cursor=Math.max(cursor,slot.b);
      }
      if(cursor<1)strip(cursor,1,v,V);
    }
  }
  const terrace=(left,right,near,far,y)=>quad([left,y,far],[right,y,far],[right,y,near],[left,y,near],[0,0,1,1],1);
  let low=bottom;
  for(const [i,tier] of plot.tiers.entries()){
    const {w,d,top}=tier;
    const x=w/2,z=d/2;
    const decorated=plot.id==='hq'&&i>=4;
    wall([-x,z],[x,z],low,top,i===0&&plot.facing===1,decorated);
    wall([x,z],[x,-z],low,top,false,decorated);
    wall([x,-z],[-x,-z],low,top,i===0&&plot.facing===-1,decorated);
    wall([-x,-z],[-x,z],low,top,false,decorated);
    const next=plot.tiers[i+1];
    if(next){
      const nx=next.w/2,nz=next.d/2;
      terrace(-x,x,nz,z,top);
      terrace(-x,x,-z,-nz,top);
      terrace(-x,-nx,-nz,nz,top);
      terrace(nx,x,-nz,nz,top);
    }else terrace(-x,x,-z,z,top);
    low=top;
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.computeVertexNormals();
  // One draw per surface type, including the crown.
  const ordered=[0,1,2,3,4].flatMap(type=>geometry.groups.filter(group=>group.materialIndex===type)
    .flatMap(group=>Array.from({length:group.count},(_,i)=>group.start+i)));
  const counts=[0,1,2,3,4].map(type=>geometry.groups.filter(group=>group.materialIndex===type).reduce((total,group)=>total+group.count,0));
  geometry.setIndex(ordered);
  geometry.clearGroups();
  let offset=0;
  counts.forEach((count,type)=>{if(count)geometry.addGroup(offset,count,type);offset+=count;});
  const shell=new THREE.Mesh(geometry,[skin,cap,crown,basePaint,windowTrim]);
  if(panes.length){
    const panel=new THREE.BufferGeometry();
    panel.setAttribute('position',new THREE.Float32BufferAttribute(panes,3));
    panel.computeVertexNormals();
    const glass=new THREE.MeshStandardMaterial({color:0x697e8c,opacity:.61,transparent:true,depthWrite:false,roughness:.18,metalness:.18,envMapIntensity:1.1,side:THREE.DoubleSide});
    shell.add(new THREE.Mesh(panel,glass));
  }
  return shell;
}

function buildDecor(THREE,scene,navigation,material,box,grid,assets) {
  const { plan,edge,lines }=navigation;
  const city=new THREE.Group();
  scene.add(city);
  const asphalt=assets.materials.asphalt;
  const curb=material(0x7e898d,.94);
  const snow=material(0xe3e5e2,.91);
  const slush=material(0x8b9eaa,.88);
  const marking=material(0xc0c7b2,.86);
  box(city,asphalt,0,-.62,0,edge*2+19,1,edge*2+19).receiveShadow=true;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(6200,6200),material(0x384e63,.9));
  ground.rotation.x=-Math.PI/2;
  ground.position.y=-1.01;
  city.add(ground);
  box(city,material(0x334a5b,1),305,-.89,0,968,.4,1500);
  const water=material(0x17364e,.31,.44);
  box(city,water,-242,-.78,0,132,.22,740);
  box(city,curb,-174,-.20,0,2.5,.67,edge*2+18);

  const geometry=new THREE.BoxGeometry(1,1,1);
  const footpaths=new THREE.InstancedMesh(geometry,curb,plan.cells**2);
  const lots=new THREE.InstancedMesh(geometry,snow,plan.cells**2);
  const matrix=new THREE.Matrix4();
  const paving=plan.step-plan.street-.38;
  let index=0;
  for(let col=0;col<plan.cells;col++){
    for(let row=0;row<plan.cells;row++){
      const x=lines[col]+plan.step/2,z=lines[row]+plan.step/2;
      footpaths.setMatrixAt(index,matrix.makeScale(paving,.18,paving).setPosition(x,-.025,z));
      lots.setMatrixAt(index,matrix.makeScale(paving-.48,.055,paving-.48).setPosition(x,.105,z));
      index++;
    }
  }
  city.add(footpaths,lots);


  const details=[];
  for(const street of lines){
    for(let i=0;i<plan.cells;i++){
      const start=lines[i]+8.2;
      const finish=lines[i+1]-8.2;
      for(let at=start;at<finish;at+=6.8){
        details.push([marking,at,-.103,street,2.15,.014,.10]);
        details.push([marking,street,-.103,at,.10,.014,2.15]);
      }
      for(let at=start+1;at<finish;at+=5.9){
        details.push([slush,at,-.075,street+5.54,2.8,.066,.30]);
        details.push([slush,street-5.54,-.075,at,.30,.066,2.8]);
      }
    }
  }
  for(const x of [-42,0,42]){
    for(const z of [-42,0,42]){
      for(const sign of [-1,1]){
        for(let i=-3;i<=3;i++){
          details.push([marking,x+sign*6.2,-.093,z+i*1.2,1.70,.02,.51]);
          details.push([marking,x+i*1.2,-.090,z+sign*6.2,.51,.02,1.70]);
        }
      }
    }
  }
  for(const style of [marking,slush]){
    const sections=details.filter(row=>row[0]===style);
    const batch=new THREE.InstancedMesh(geometry,style,sections.length);
    sections.forEach(([,x,y,z,w,h,d],i)=>batch.setMatrixAt(i,matrix.makeScale(w,h,d).setPosition(x,y,z)));
    city.add(batch);
  }
  const gold=new THREE.MeshBasicMaterial({color:new THREE.Color(0xffce86).multiplyScalar(2.15)});
  const lampBulbs=[];
  const lampPlacements=[], markings=[], parking=[], pines=[], benches=[];
  function streetLamp(x,z) {
    lampPlacements.push({x,z,yaw:x<0?Math.PI/2:-Math.PI/2,height:5.67});
    for(let i=0;i<12;i++)lampBulbs.push([x+Math.sin(i*1.4)*.092,.69+i*.24,z+Math.cos(i*1.4)*.092]);
  }
  for(let col=0;col<plan.cells;col++)for(let row=0;row<plan.cells;row++) {
    if(grid[col][row])continue;
    const x=lines[col]+plan.step/2,z=lines[row]+plan.step/2;
    const publicSquare=col===2&&row===4;
    if(!publicSquare&&(col+row)%3===1){
      parking.push([x,.17,z,22,.067,20]);
      for(let n=-2;n<3;n++)markings.push([x+n*4.1,.216,z,.075,.026,17]);
    }else{
      for(const offset of [-8,8]){
        benches.push({x:x+offset,y:.14,z:z+6,yaw:Math.PI});
        pines.push({x:x+offset,z:z+(publicSquare?8:-7),height:5.8+(col+row)%4,yaw:col*.6});
      }
    }
    streetLamp(x-11,z+11);
    streetLamp(x+11,z-10);
  }
  function pile(shape,paint,items){
    const batch=new THREE.InstancedMesh(shape,paint,items.length);
    items.forEach(([x,y,z,w,h,d],i)=>batch.setMatrixAt(i,matrix.makeScale(w,h,d).setPosition(x,y,z)));
    city.add(batch);
  }
  for(const street of lines)for(const side of [-1,1]) {
    for(let i=0;i<plan.cells;i++){
      const middle=(lines[i]+lines[i+1])/2;
      markings.push([street+side*4.82,.071,middle,.84,.14,32],[middle,.075,street+side*4.82,32,.14,.84]);
    }
  }
  for(const x of [-48,-36,-6,6,36,48]){
    for(const z of [-48,-36,-6,6,36,48]){
      if(Math.abs(x)>8&&Math.abs(z)>8&&(x+z)%24!==0)continue;
      streetLamp(x,z);
    }
  }
  assets.instance(city,'street-lamp',lampPlacements,source=>{
    if(!source.emissive?.getHex())return source;
    const lamp=source.clone();
    lamp.emissive.setHex(0xffd194);
    lamp.emissiveIntensity=2.4;
    return lamp;
  });
  assets.instance(city,'pine',pines);
  assets.instance(city,'bench',benches);
  const pool=image(64,64);
  const paint=pool.getContext('2d');
  const fade=paint.createRadialGradient(32,32,0,32,32,32);
  fade.addColorStop(0,'#ffc77ea6');
  fade.addColorStop(.45,'#ffc48266');
  fade.addColorStop(1,'#ffcb8800');
  paint.fillStyle=fade;
  paint.fillRect(0,0,64,64);
  const spread=new THREE.CanvasTexture(pool);
  spread.colorSpace=THREE.SRGBColorSpace;
  const shine=new THREE.MeshBasicMaterial({
    map:spread,transparent:true,opacity:.25,depthWrite:false,blending:THREE.AdditiveBlending,
  });
  const footprint=new THREE.PlaneGeometry(6.4,5).rotateX(-Math.PI/2);
  const pools=new THREE.InstancedMesh(footprint,shine,lampPlacements.length);
  lampPlacements.forEach(({x,z},i)=>pools.setMatrixAt(i,matrix.makeTranslation(x+(x<0?1.24:-1.24),.163,z)));
  city.add(pools);
  pile(geometry,material(0x4b5760,.65,.08),parking);
  pile(geometry,material(0x8e9ca4,.94),markings);
  const lights=new THREE.InstancedMesh(new THREE.SphereGeometry(.047,5,4),gold,lampBulbs.length);
  lampBulbs.forEach(([x,y,z],i)=>lights.setMatrixAt(i,matrix.makeTranslation(x,y,z)));
  city.add(lights);
  return shine;
}

export function createCity(THREE, OrbitControls, navigation, displays, offices, traffic, ui) {
  const vector=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
  const colors=new Map();
  const cube=new THREE.BoxGeometry();
  function material(color,roughness=.76,metalness=0) {
    const key=[color,roughness,metalness].join(':');
    if(!colors.has(key))colors.set(key,new THREE.MeshStandardMaterial({color,roughness,metalness}));
    return colors.get(key);
  }
  function box(parent,paint,x,y,z,w,h,d){
    const shape=new THREE.Mesh(cube,paint);
    shape.position.set(x,y,z);
    shape.scale.set(w,h,d);
    parent.add(shape);
    return shape;
  }

  const scene=new THREE.Scene();
  const sky=skyMap(THREE);
  sky.set(['#8ca8c0','#d9e3e6','#869da8']);
  scene.background=sky.texture;
  scene.fog=new THREE.FogExp2(0x7e9bb6,.0022);
  const renderer=new THREE.WebGLRenderer({canvas:ui.canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
  const mobile=matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.06;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false;
  const assets=createAssets(renderer,scene);
  const pipeline=createPipeline(renderer,scene);
  const diffuse=new THREE.HemisphereLight(0xdacbed,0x718496,1.65);
  const sun=new THREE.DirectionalLight(0xffe1b2,2.1);
  sun.position.set(-116,66,65);
  sun.castShadow=true;
  sun.shadow.mapSize.setScalar(mobile?512:1024);
  Object.assign(sun.shadow.camera,{left:-75,right:75,top:85,bottom:-70,near:2,far:290});
  sun.shadow.normalBias=.07;
  sun.shadow.bias=-.00026;
  // Keep a fixed light count so entering an office does not recompile the city's materials.
  const warmOffice=new THREE.PointLight(0xffcb98,0,13,2);
  const fillOffice=new THREE.PointLight(0xc8e7ff,0,12,2);
  scene.add(diffuse,sun,warmOffice,fillOffice);
  const { grid,lots }=navigation.makeGrid(THREE,cityPlan(navigation.plan.cells));
  const bounding=lots.map(plot=>plot.bounds);
  const walls=[];
  const orbitObstacles=[];
  const places=new Map();
  const panels=[];
  const rooms=[];
  const {result:skin,walls:baseSkin,lights}=skins(THREE);
  const crownCap=material(0xe3c99e,.76);
  const grayCap=material(0xa6b5bd,.82);
  const streetGlow=buildDecor(THREE,scene,navigation,material,box,grid,assets);
  const ink=material(0x172338,.82);
  const brass=material(0xb39368,.47,.32);
  const glazing=material(0x526a7d,.19,.42);

  function plane(parent,appearance,w,h,x,y,z,rotation){
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),appearance);
    mesh.position.set(x,y,z);
    mesh.rotation.y=rotation;
    parent.add(mesh);
    return mesh;
  }
  function wallBounds(minX,minY,minZ,maxX,maxY,maxZ){
    return new THREE.Box3(vector(minX,minY,minZ),vector(maxX,maxY,maxZ));
  }
  function portal(plot){
    const direction=plot.facing;
    const front=plot.z+direction*plot.depth/2;
    const outer=plot.bounds;
    const thickness=.43;
    const minZ=Math.min(front,front-direction*thickness);
    const maxZ=Math.max(front,front-direction*thickness);
    const far=plot.z-direction*plot.depth/2;
    const oppositeMin=Math.min(far,far+direction*thickness);
    const oppositeMax=Math.max(far,far+direction*thickness);
    const mx=outer.min.x,Mx=outer.max.x,mz=outer.min.z,Mz=outer.max.z;
    const west=plot.x-2.45,east=plot.x+2.45;
    const staticWalls=[
      wallBounds(mx,0,mz,mx+thickness,plot.height,Mz),
      wallBounds(Mx-thickness,0,mz,Mx,plot.height,Mz),
      wallBounds(mx,0,oppositeMin,Mx,plot.height,oppositeMax),
      wallBounds(mx,0,minZ,west,plot.height,maxZ),
      wallBounds(east,0,minZ,Mx,plot.height,maxZ),
      wallBounds(west,5.10,minZ,east,plot.height,maxZ),
    ];
    const blocker=wallBounds(west,0,minZ,east,5.1,maxZ);
    const hinges=[];
    for(const side of [-1,1]){
      const edges=new THREE.Group();
      edges.position.set(side*2.393,.20,direction*(plot.depth/2-.12));
      plot.root.add(edges);
      box(edges,glazing,-side*1.181,2.18,0,2.33,4.33,.14);
      box(edges,brass,-side*.128,2.18,direction*.127,.10,4.26,.092);
      box(edges,brass,-side*2.227,2.18,direction*.127,.10,4.26,.092);
      box(edges,brass,-side*1.179,.31,direction*.127,1.96,.13,.092);
      box(edges,brass,-side*1.179,4.04,direction*.127,1.96,.13,.092);
      hinges.push({side,edges});
    }
    const light=new THREE.MeshBasicMaterial({color:0xffcc88,toneMapped:false});
    for(const x of [-2.80,2.80])box(plot.root,light,x,3.38,direction*(plot.depth/2+.15),.12,2.1,.14);
    walls.push(...staticWalls);
    return { staticWalls,blocker,hinges,open:0,front };
  }
  function mount(plot,panel,face,y,width,height,center=0){
    const frame=new THREE.Group();
    const normal=face==='north'||face==='south' ? plot.depth/2 : plot.width/2;
    const offset=normal+.39;
    if(face==='north'||face==='south'){
      frame.position.set(center,y,(face==='north'?-1:1)*offset);
      frame.rotation.y=face==='north'?Math.PI:0;
    }else{
      frame.position.set((face==='west'?-1:1)*offset,y,center);
      frame.rotation.y=face==='west'?-Math.PI/2:Math.PI/2;
    }
    plot.root.add(frame);
    (plot.signs??=[]).push(frame);
    box(frame,ink,0,0,0,width+.56,height+.60,.30);
    plane(frame,panel.material,width,height,0,0,.162,0);
  }

  const templates=new Map();
  const silhouettes=[];
  function setSilhouette(plot, visible){
    if(plot.rendered===visible)return;
    plot.rendered=visible;
    plot.skyline.show(plot.index,visible);
  }
  const skylineModels={slate:'apartment',brick:'apartment',steel:'tower',mist:'residential'};
  for(const plot of lots.filter(item=>!item.facing)){
    const name=skylineModels[plot.style];
    const list=templates.get(name)??[];
    templates.set(name,[...list,plot]);
  }
  for(const [name,list] of templates){
    const skyline=assets.instance(scene,name,list.map(plot=>({
      x:plot.x,z:plot.z,height:plot.height,width:plot.width,depth:plot.depth,
      yaw:(plot.row+plot.col)%2*Math.PI,
    })),material=>{
      if(!material.isMeshStandardMaterial||material.transparent)return material;
      const adjusted=material.clone();
      if(material.name.includes('glass'))adjusted.roughness=Math.min(.26,material.roughness);
      return adjusted;
    });
    list.forEach((plot,index)=>{
      Object.assign(plot,{skyline,index,rendered:true});
      silhouettes.push(plot);
      walls.push(plot.bounds);
      orbitObstacles.push({box:plot.bounds,plot});
    });
  }
  const perimeter=[];
  for(let ring=0;ring<3;ring++){
    const radius=193+ring*45;
    for(let i=-5-ring;i<=5+ring;i++){
      const cross=i*38;
      const height=27+((i+10)*17+ring*11)%32;
      const dimensions={width:24+(i%3)*2,depth:23,height};
      perimeter.push({x:cross,z:-radius,...dimensions},{x:cross,z:radius,...dimensions,yaw:Math.PI});
      if(Math.abs(cross)<radius-23)perimeter.push({x:radius,z:cross,...dimensions,yaw:Math.PI/2});
    }
  }
  const distantPaint=skin.steel.clone();
  for(const key of ['map','emissiveMap','roughnessMap']){
    distantPaint[key]=distantPaint[key].clone();
    distantPaint[key].repeat.set(3,9);
  }
  distantPaint.emissiveIntensity=.27;
  const distant=new THREE.InstancedMesh(cube,distantPaint,perimeter.length);
  const roofColor=material(0xadbabc,.88);
  const roofline=new THREE.InstancedMesh(cube,roofColor,perimeter.length);
  const placement=new THREE.Matrix4();
  for(const [i,{x,z,width,height,depth,yaw=0}] of perimeter.entries()){
    const turned=Math.abs(Math.sin(yaw))>.5;
    const w=turned?depth:width,d=turned?width:depth;
    distant.setMatrixAt(i,placement.makeScale(w,height,d).setPosition(x,height*.5,z));
    roofline.setMatrixAt(i,placement.makeScale(w*.72,1.45,d*.72).setPosition(x,height+.72,z));
  }
  scene.add(distant,roofline);
  for(const {x,z,width,height,depth,yaw=0} of perimeter){
    const turned=Math.abs(Math.sin(yaw))>.5;
    const dx=(turned?depth:width)/2,dz=(turned?width:depth)/2;
    orbitObstacles.push({box:wallBounds(x-dx,0,z-dz,x+dx,height+1.45,z+dz)});
  }
  for(const plot of lots.filter(item=>item.facing)){
    const root=new THREE.Group();
    root.position.set(plot.x,0,plot.z);
    plot.root=root;
    plot.label=ui.districts[plot.id]?.label;
    scene.add(root);
    const shell=towerShell(THREE,plot,skin[plot.style],plot.style==='stone'?crownCap:grayCap,skin.crown,baseSkin[plot.style],brass);
    shell.castShadow=true;
    shell.receiveShadow=false;
    plot.shell=shell;
    root.add(shell);
    if(plot.id==='dev')assets.place(shell,'water-tower',{x:2.2,y:plot.height-.01,z:1.8,height:3.7});
    if(plot.id==='hq'){
      const spire=new THREE.Mesh(new THREE.CylinderGeometry(.036,.67,7.94,12),brass);
      spire.position.y=136.03;
      root.add(spire);
    }
    plot.door=portal(plot);
    plot.office=offices.buildOffice(THREE,plot,displays,assets);
    let base=0;
    for(const {w,d,top} of plot.tiers){
      orbitObstacles.push({box:wallBounds(plot.x-w/2,base,plot.z-d/2,plot.x+w/2,top,plot.z+d/2),plot});
      base=top;
    }
    if(plot.id==='hq')orbitObstacles.push({box:wallBounds(plot.x-.7,132,plot.z-.7,plot.x+.7,140,plot.z+.7),plot});
    rooms.push(plot);
    const display=displays.billboard(THREE,plot.id);
    panels.push(display);
    const front=plot.facing===1?'south':'north';
    const side=plot.x<0?'east':'west';
    mount(plot,display,front,14.5,21.0,10.3);
    mount(plot,display,side,17.2,19.3,9.65);
    // High-mounted copies keep the original street-facing panels visible from orbit.
    if(plot.id==='hq')mount(plot,display,'east',39.4,21.1,10.6);
    if(plot.id==='moex')mount(plot,display,'south',35.1,19.8,9.9);
    if(plot.id==='dev')mount(plot,display,'east',31.4,19.2,9.6);
    if(plot.id==='grants')mount(plot,display,'east',33.4,19.2,9.6);
    plot.work=vector(plot.x+1.65,.18,plot.z+plot.facing*1.25);
    plot.entry=vector(plot.x,.18,plot.door.front+plot.facing*.67);
    places.set(plot.id,plot);
    skin[plot.style].needsUpdate=true;
  }

  const park={id:'lounge',x:-63,z:21,work:vector(-47.5,.18,22),entry:vector(-47.5,.18,10.7),facing:-1};
  places.set(park.id,park);
  assets.place(scene,'tree',{x:park.x,y:.15,z:25.4,height:10.1});
  const homes=buildHomes(THREE,scene,ui.profiles);
  for(const home of homes.values()){
    home.roadZ=0;
    places.set(home.id,home);
    walls.push(home.bounds);
    orbitObstacles.push({box:home.bounds,plot:home});
  }
  const placards=new Map();
  for(const place of places.values()){
    if(place.profileId)continue;
    const button=document.createElement('button');
    button.className='marker';
    button.type='button';
    button.textContent=ui.districts[place.id].label;
    button.addEventListener('click',()=>ui.onSelect(place.id));
    placards.set(place.id,button);
    ui.markers.append(button);
  }

  const transit=traffic.streets(THREE,scene,navigation,bounding,assets);

  function makeRoute(points) {
    const pieces=[];
    let elapsed=0;
    for(let i=1;i<points.length;i++){
      const from=points[i-1],to=points[i];
      const distance=from.point.distanceTo(to.point);
      if(distance<.01)continue;
      const duration=distance/(to.drive?11:3.45);
      pieces.push({from:from.point,to:to.point,drive:to.drive,duration,total:elapsed});
      elapsed+=duration;
    }
    return pieces;
  }
  function nameplate(profile,parent){
    const canvas=image(256,56);
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#192a3c';
    ctx.beginPath();ctx.roundRect(2,2,252,52,14);ctx.fill();
    ctx.fillStyle=profile.color;
    ctx.beginPath();ctx.arc(24,28,7,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f5eddd';
    ctx.font='600 25px "Segoe UI", sans-serif';
    ctx.textBaseline='middle';
    ctx.fillText(profile.title,43,29,204);
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthWrite:false,toneMapped:false}));
    label.position.y=2.21;
    label.scale.set(2.5,.55,1);
    parent.add(label);
    return label;
  }

  function person(profile,index) {
    const home=homes.get(profile.id);
    const wrapper=new THREE.Group();
    wrapper.name='agent-'+profile.id;
    const body=new THREE.Group();
    wrapper.add(body);
    scene.add(wrapper);
    const rig=assets.character(body,index,1.68+(index%5)*.037);
    const cab=traffic.createVehicle(THREE,assets,'taxi');
    const label=nameplate(profile,wrapper);
    wrapper.add(cab);
    cab.visible=false;
    wrapper.position.copy(home.work);
    return { profile,index,home,wrapper,body,cab,label,rig,place:home.id,goal:home.id,
      route:null,row:{action:'idle',activity:'idle'},elapsed:0,to:null,wait:0 };
  }
  const actors=ui.profiles.filter(profile=>!profile.job).map(person);

  function positionAt(place,index) {
    return place.work.clone().add(vector(place.profileId?0:index*.38,0,0));
  }

  function travel(origin,destination,drive){
    const points=[{point:origin.work,drive:false}];
    const add=(x,y,z,vehicle=false)=>points.push({point:vector(x,y,z),drive:vehicle});
    const walk=(x,z)=>add(x,navigation.streetHeight(x,z),z);
    const roadFrom=origin.roadZ??origin.z+origin.facing*21;
    const roadTo=destination.roadZ??destination.z+destination.facing*21;
    const a=origin.entry.x,b=destination.entry.x;
    const corridor=origin.id==='lounge'||destination.id==='lounge'||origin.profileId||destination.profileId?-42:0;
    const direct=roadFrom===roadTo;
    const direction=Math.sign((direct?b:corridor)-a);
    const turn=Math.sign(roadTo-roadFrom);
    const laneY=navigation.roadHeight;

    add(a,origin.work.y,origin.work.z);
    add(a,origin.entry.y,origin.entry.z);
    walk(a,roadFrom-origin.facing*6.67);
    if(drive){
      const laneFrom=roadFrom+direction*1.75;
      const laneTo=roadTo+(direct?direction:Math.sign(b-corridor))*1.75;
      walk(a,laneFrom);
      if(!direct){
        const laneX=corridor-turn*1.75;
        add(laneX,laneY,laneFrom,true);
        add(laneX,laneY,laneTo,true);
      }
      add(b,laneY,laneTo,true);
    }else{
      const walkFrom=roadFrom-origin.facing*6.67;
      const walkTo=roadTo-destination.facing*6.67;
      const crossing=corridor+Math.sign(a-corridor)*6.67;
      if(direct&&origin.facing!==destination.facing){
        walk(a,walkTo);
      }else if(!direct){
        walk(crossing,walkFrom);
        walk(crossing,walkTo);
      }
    }
    walk(b,roadTo-destination.facing*6.67);
    add(b,destination.entry.y,destination.entry.z);
    add(b,destination.work.y,destination.work.z);
    add(destination.work.x,destination.work.y,destination.work.z);
    return points;
  }

  function beginTravel(actor){
    const origin=places.get(actor.place);
    const goal=places.get(actor.goal);
    if(origin===goal)return;
    const hq=places.get('hq');
    const destination=origin===actor.home&&goal.office&&goal!==hq?hq:goal;
    const drive=options.transport==='car'||options.transport==='mixed'&&actor.index%2===0;
    actor.wrapper.position.copy(positionAt(origin,actor.index));
    const points=[{point:actor.wrapper.position.clone(),drive:false},...travel(origin,destination,drive),
      {point:positionAt(destination,actor.index),drive:false}];
    actor.route=makeRoute(points);
    actor.elapsed=0;
    actor.to=destination.id;
  }

  const camera=new THREE.PerspectiveCamera(51,1,.2,3200);
  const target=vector(0,61,-5);
  const direction=vector(109,114,151);
  camera.position.copy(target).add(direction);
  const orbit=new OrbitControls(camera,ui.canvas);
  orbit.target.copy(target);
  orbit.enableDamping=true;
  orbit.dampingFactor=.085;
  orbit.minDistance=85;
  orbit.maxDistance=475;
  orbit.minPolarAngle=.26;
  orbit.maxPolarAngle=1.43;
  orbit.enablePan=false;
  orbit.update();

  const roomAt=position=>rooms.find(place=>position.x>place.bounds.min.x&&position.x<place.bounds.max.x&&
    position.z>place.bounds.min.z&&position.z<place.bounds.max.z);
  const terrain=position=>navigation.streetHeight(position.x,position.z);
  function nearLift(){
    if(!walking)return null;
    const office=roomAt(walker.camera.position)?.office;
    const info=office?.info(walker.camera.position,walker.feet);
    return info?{office,info}:null;
  }
  const walker=navigation.walkingCamera(THREE,{
    canvas:ui.canvas,movePad:ui.movePad,lookPad:ui.lookPad, label:ui.walkPlace,
    initial:{x:-7,z:9,yaw:Math.atan2(14,18)},
    getObstacles:(position,feet)=>[...walls,...rooms.flatMap(p=>p.door.open<.7?[p.door.blocker]:[]),
      ...(roomAt(position)?.office.collision(position,feet)??[])],
    getRoom:roomAt,
    getFeet:(position,feet)=>roomAt(position)?.office.walkHeights(position,feet)??terrain(position),
  });
  let walking=false,focus=null,follow=null,tween;
  let chosenFloor=null;
  let resolution=1;
  let samples=0, misses=0, stableWindows=0;
  let layoutDirty=true;
  let isDemo=false;
  let width=1,height=1,dockSize=-1;
  let options={light:'day',snow:true,transport:'mixed'};
  let snapshot={};
  let relay=null;
  const projected=vector();
  const before=vector();
  const orbitSlide=vector();
  const neighborhoodView=new THREE.Spherical().setFromVector3(vector(41,50,-90));
  const cameraOffset=new THREE.Spherical();
  let turnToHomes=false;
  let cameraWalls=orbitObstacles.map(entry=>entry.box);
  const heightProbe=vector();
  const approach=new THREE.Ray();
  const clearSamples=central.flatMap(tower=>{
    const place=places.get(tower.id);
    return [vector(place.x,tower.height*.6,place.z),vector(place.x+(place.x<0?12:-12),14,place.z),
      vector(place.x,16,place.z+place.facing*13)];
  });

  const homeSightlines=[...homes.values()].flatMap(home=>[
    vector(home.x,2.2,home.work.z),vector(home.x,5.7,home.z),
  ]);
  const snowfall=traffic.createSnow(THREE,scene,rooms);

  const signal=new THREE.Mesh(new THREE.OctahedronGeometry(1.35),new THREE.MeshBasicMaterial({color:0x78e7fc,fog:false}));
  scene.add(signal);
  signal.visible=false;
  let skyLight;
  function setOptions(next) {
    options=next;
    const state=ui.lightMode();
    const flag={
      day:[0x6889aa,0x879db5,.55,0xffead1,2.36,.54,1.07,1.16],
      dusk:[0x62639b,0x8797aa,.58,0xffc798,1.60,.84,1.0,.86],
      night:[0x172944,0x43556e,.38,0xbbd5ff,.65,1.32,1.0,.64],
    }[state];
    if(state!==skyLight){
      skyLight=state;
      sky.set({
        day:['#8daaba','#e5e7dc','#8b9daa'],
        dusk:['#495c7b','#dec0aa','#7c8998'],
        night:['#19283e','#71879e','#405569'],
      }[state]);
    }
    scene.backgroundIntensity=flag[6];
    scene.environmentIntensity=flag[7];
    scene.fog.color.setHex(flag[1]);
    scene.fog.density=state==='day'?.0016:state==='dusk'?.00185:.0020;
    diffuse.intensity=flag[2];
    sun.color.setHex(flag[3]);
    sun.intensity=flag[4];
    streetGlow.opacity=state==='day'?.17:state==='dusk'?.42:.64;
    for(const skin of lights)skin.emissiveIntensity=flag[5];
    renderer.shadowMap.needsUpdate=true;
  }

  function resizePipeline(){
    const w=Math.max(1,Math.round(width*resolution));
    const h=Math.max(1,Math.round(height*resolution));
    renderer.setSize(w,h,false);
    pipeline.resize(w,h);
  }

  function layout(){
    const bounds=ui.canvas.getBoundingClientRect();
    width=Math.max(1,bounds.width);
    height=Math.max(1,bounds.height);
    const ratio=width/height;
    const halfW=Math.max(73,(width<700?98:111)*ratio);
    camera.aspect=ratio;
    camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(halfW/ratio/direction.length()));
    dockSize=ui.board.offsetHeight;
    const homesFocused=focus==='lounge'||Boolean(places.get(focus)?.profileId);
    camera.setViewOffset(width,height,0,Math.round(dockSize*(homesFocused?.48:.14)),width,height);
    walker.camera.aspect=ratio;
    walker.camera.updateProjectionMatrix();
    resizePipeline();
    layoutDirty=true;
  }
  const resize=new ResizeObserver(layout);
  resize.observe(ui.canvas);
  resize.observe(ui.board);

  function showFloor(value) {
    chosenFloor=value==='auto'?null:Number(value);
    if(!focus||!places.get(focus)?.office)return;
    const place=places.get(focus);
    const level=offices.floors[chosenFloor??place.office.floor];
    tween={at:vector(place.x,level+2,place.z),zoom:width<720?4.6:6.05};
    follow=null;
    layoutDirty=true;
  }
  function select(id,profileId) {
    focus=id;
    cameraWalls=orbitObstacles.filter(entry=>entry.plot?.id!==id||!entry.plot?.office).map(entry=>entry.box);
    follow=actors.find(actor=>actor.profile.id===profileId);
    turnToHomes=id==='lounge'||Boolean(places.get(id)?.profileId);
    chosenFloor=null;
    ui.onOffice(Boolean(places.get(focus)?.office),true);
    layout();
    if(places.get(focus)?.office&&!follow){showFloor('auto');return;}
    const place=places.get(focus);
    if(place===park){
      tween={at:vector(park.x,3.55,15.4),zoom:width<700?2.62:3.28};
    }else{
      tween=place?{at:vector(place.x,place.profileId?2.6:6,place.z),zoom:place.profileId?7:2.7}:{at:target.clone(),zoom:1};
    }
    layoutDirty=true;
  }

  function update(data,nextRelay,snap=false,nextSnapshot={}){
    snapshot=nextSnapshot;
    isDemo=Boolean(nextSnapshot.demoActivity);
    relay=nextRelay;
    for(const actor of actors){
      const row=data.get(actor.profile.id);
      if(!row)continue;
      const goal=row.district;
      actor.row=row;
      actor.goal=goal;
      if(snap){
        actor.route=null;
        actor.place=goal;
        actor.to=null;
        actor.wait=0;
        actor.wrapper.position.copy(positionAt(places.get(goal),actor.index));
      }else if(!actor.route&&actor.wait<=0)beginTravel(actor);
    }
    for(const plot of rooms){
      const active=[...data].filter(([,row])=>row.district===plot.id&&row.activity!=='idle')
        .sort(([,a],[,b])=>Number(b.activity==='error')-Number(a.activity==='error'))[0];
      const profile=active&&ui.profiles.find(item=>item.id===active[0]);
      const telemetry=profile?(profile.job?snapshot.jobs?.[profile.job]:snapshot.agents?.[profile.id]):undefined;
      const demo=plot.id==='dev'&&nextSnapshot.demoActivity;
      plot.office.set(demo?{...nextSnapshot.demoScene,activity:demo}:
        {...telemetry,activity:active?.[1].activity??'idle',title:profile?.title,
          subject:telemetry?.subject??telemetry?.files?.[0]});
    }
    if(isDemo&&focus==='dev'&&chosenFloor===null)showFloor('auto');
  }

  const nextPosition=vector();
  function moveAlong(actor,time){
    const segment=actor.route.find(piece=>time<piece.total+piece.duration);
    if(!segment)return null;
    const phase=(time-segment.total)/segment.duration;
    nextPosition.lerpVectors(segment.from,segment.to,Math.max(0,phase));
    const mesh=actor.wrapper;
    if(!segment.drive){
      nextPosition.y=roomAt(nextPosition)? .18 : terrain(nextPosition);
      for(const plot of rooms){
        if(plot.door.open>=.7)continue;
        const permitted=navigation.sweep(THREE,mesh.position,nextPosition,[plot.door.blocker],.25);
        if(permitted.distanceToSquared(nextPosition)>.0001)return segment;
      }
    }
    mesh.position.copy(nextPosition);
    mesh.rotation.y=Math.atan2(segment.to.x-segment.from.x,segment.to.z-segment.from.z);
    actor.elapsed=time;
    return segment;
  }

  function walk(active){
    walking=active;
    walker.setActive(active);
    orbit.enabled=!active;
    ui.onWalk(active);
    ui.onOffice(!active&&Boolean(places.get(focus)?.office),false);
    layoutDirty=true;
    layout();
  }
  let last=performance.now()/1000;
  let readyToAdapt;
  const markerAt=vector(Infinity,Infinity,Infinity);
  let markerZoom=-1;
  let backgroundAt=vector(Infinity,Infinity,Infinity);
  let lastWalking;
  let liftStamp='';
  function liftRequest(destination){
    const current=nearLift();
    if(current)current.office.request(walker.camera.position,walker.feet,destination);
  }
  let panelPair=0;
  function texts(){
    if(document.hidden)return;
    const now=performance.now()/1000;
    const motion=!ui.reducedMotion.matches;
    const first=panelPair++%2;
    for(let index=first;index<panels.length;index+=2)panels[index].animate(motion?now:0,snapshot,!motion);
    for(const plot of rooms)if(plot.office.root.visible)plot.office.textures();
  }
  setInterval(texts,400);
  function render(ms){
    const clock=ms/1000;
    const dt=Math.min(.16,Math.max(0,clock-last));
    last=clock;
    const motion=!ui.reducedMotion.matches;
    if(walking)walker.update(dt);
    for(const plot of central.map(block=>places.get(block.id))){
      const { door }=plot;
      const nearby=position=>Math.abs(position.x-plot.x)<3.25&&Math.abs(position.z-door.front)<4.6;
      const open=walking&&nearby(walker.camera.position)||actors.some(actor=>actor.route&&nearby(actor.wrapper.position));
      door.open+=((open?1:0)-door.open)*(1-Math.exp(-dt*7.9));
      for(const {side,edges} of door.hinges)edges.rotation.y=-side*plot.facing*door.open*1.45;
    }
    const officeSlots=new Map();
    for(const actor of actors){
      let part=null;
      if(actor.route){
        part=motion?moveAlong(actor,actor.elapsed+dt):null;
        if(!part){
          actor.place=actor.to;
          actor.route=null;
          actor.to=null;
          actor.wrapper.position.copy(positionAt(places.get(actor.place),actor.index));
          if(actor.place==='hq'&&actor.goal!==actor.place)actor.wait=motion?.85:0;
        }
      }
      if(!actor.route&&actor.place!==actor.goal){
        actor.wait=Math.max(0,actor.wait-dt);
        if(actor.wait===0)beginTravel(actor);
      }
      const place=places.get(actor.place);
      const home=place===actor.home&&!actor.route;
      if(actor.occupied!==home){
        actor.home.setOccupied(home);
        actor.occupied=home;
      }
      const driving=Boolean(part?.drive);
      actor.cab.visible=driving;
      actor.body.visible=!driving;
      let mode=part?'walk':'idle';
      if(!actor.route&&place.office){
        const activity=actor.place===actor.goal?actor.row.activity:'idle';
        const level=offices.stages[activity]?.level??0;
        const key=place.id+':'+level;
        const slot=officeSlots.get(key)??0;
        officeSlots.set(key,slot+1);
        const station=place.office.station(activity,slot);
        actor.wrapper.position.copy(station.point);
        actor.wrapper.rotation.y=station.rotation;
        mode=station.mode;
      }
      const visibleOffice=walking?Math.hypot(walker.camera.position.x-place.x,walker.camera.position.z-place.z)<26:
        (follow===actor||focus===place.id)&&Math.abs(actor.wrapper.position.y-offices.floors[chosenFloor??place.office?.floor??0])<.22;
      actor.wrapper.visible=!home&&(Boolean(actor.route)||!place.office||visibleOffice);
      actor.label.position.y=driving?2.19:mode==='typing'?1.74:2.21;
      actor.label.visible=!walking||walker.camera.position.distanceToSquared(actor.wrapper.position)>7;
      if(actor.wrapper.visible&&!driving)actor.rig.update(motion?dt:0,mode,2.3,clock);
    }
    transit.update(clock,dt,motion);
    const focused=follow?(follow.route?null:places.get(follow.place)):places.get(focus);
    const focusRoom=focused?.office;
    const litRoom=walking?roomAt(walker.camera.position):focusRoom?focused:null;
    if(litRoom){
      const level=walking?walker.feet:offices.floors[chosenFloor??litRoom.office.floor];
      warmOffice.position.set(litRoom.x+3.8,level+3.74,litRoom.z-3.35*litRoom.facing);
      fillOffice.position.set(litRoom.x-4.2,level+3.60,litRoom.z+3.05*litRoom.facing);
    }
    warmOffice.intensity=litRoom?16:0;
    fillOffice.intensity=litRoom?12:0;
    const lift=nearLift();
    const nextLiftStamp=JSON.stringify(lift?.info??null);
    if(nextLiftStamp!==liftStamp){liftStamp=nextLiftStamp;ui.onLift(lift?.info??null);}
    for(const plot of rooms){
      const cutaway=!walking&&focusRoom===plot.office;
      plot.shell.visible=!cutaway;
      for(const sign of plot.signs)sign.visible=!cutaway;
      plot.office.show(walking,cutaway,cutaway?chosenFloor??plot.office.floor:null,walker.camera.position);
      plot.office.update(clock,dt,motion);
    }

    if(!walking){
      before.copy(camera.position);
      if(follow||tween){
        const destination=follow?heightProbe.copy(follow.wrapper.position).add(vector(0,1.6,0)):tween.at;
        const zoom=follow?(follow.place===follow.home.id&&!follow.route?7:5.7):tween.zoom;
        const ease=motion?1-Math.exp(-dt*6):1;
        projected.copy(orbit.target).lerp(destination,ease).sub(orbit.target);
        orbit.target.add(projected);
        camera.position.add(projected);
        if(turnToHomes){
          cameraOffset.setFromVector3(orbitSlide.copy(camera.position).sub(orbit.target));
          const angle=Math.atan2(Math.sin(neighborhoodView.theta-cameraOffset.theta),Math.cos(neighborhoodView.theta-cameraOffset.theta));
          const distance=neighborhoodView.radius-cameraOffset.radius;
          cameraOffset.theta+=angle*ease;
          cameraOffset.phi+=(neighborhoodView.phi-cameraOffset.phi)*ease;
          cameraOffset.radius+=distance*ease;
          camera.position.copy(orbitSlide.setFromSpherical(cameraOffset).add(orbit.target));
          if(Math.abs(angle)<.012&&Math.abs(distance)<.1)turnToHomes=false;
        }
        camera.zoom+=(zoom-camera.zoom)*ease;
        camera.updateProjectionMatrix();
        if(!follow&&!turnToHomes&&Math.abs(camera.zoom-zoom)<.005&&orbit.target.distanceTo(destination)<.05)tween=null;
      }
      orbit.update();
      const safe=navigation.sweep(THREE,before,camera.position,cameraWalls,.78);
      if(safe.distanceToSquared(camera.position)>.0001){
        for(const axis of ['x','z','y']){
          orbitSlide.copy(safe);
          orbitSlide[axis]=camera.position[axis];
          safe.copy(navigation.sweep(THREE,safe,orbitSlide,cameraWalls,.78));
        }
        camera.position.copy(safe);
        camera.lookAt(orbit.target);
      }
    }
    camera.updateMatrixWorld();

    const view=walking?walker.camera:camera;
    if(walking!==lastWalking||!walking&&backgroundAt.distanceToSquared(camera.position)>4) {
      backgroundAt.copy(camera.position);
      lastWalking=walking;
      for(const plot of silhouettes) {
        const homeFocus=!walking&&(focus==='lounge'||places.get(focus)?.profileId);
        const samples=homeFocus?homeSightlines:clearSamples;
        const visible=walking||!samples.some(at=>{
          approach.origin.copy(camera.position);
          approach.direction.copy(at).sub(camera.position).normalize();
          const hit=approach.intersectBox(plot.bounds,heightProbe);
          return hit&&camera.position.distanceToSquared(hit)<camera.position.distanceToSquared(at);
        });
        setSilhouette(plot,visible);
      }
    }
    if(layoutDirty||markerAt.distanceToSquared(camera.position)>.003||camera.zoom!==markerZoom) {
      markerAt.copy(camera.position);
      markerZoom=camera.zoom;
      layoutDirty=false;
      for(const [id,marker] of placards){
        const place=places.get(id);
        projected.set(place.x,id==='lounge'?13:place.height+2,place.z).project(camera);
        const x=(projected.x*.5+.5)*width;
        const y=(-projected.y*.5+.5)*height;
        marker.hidden=walking||Boolean(focus||follow)||x<23||x>width-23||y<46||y>height-dockSize-52;
        if(!marker.hidden)marker.style.transform='translate('+x+'px,'+y+'px) translate(-50%,-100%)';
      }
    }
    snowfall.update(motion?clock:0,view,options.snow);
    const receiving=relay?.stage==='receiving';
    signal.visible=Boolean(receiving||relay?.stage==='returning');
    if(signal.visible){
      const phase=motion?(clock*.28)%1:.45;
      const hq=places.get('hq');
      signal.position.set(hq.x,141+22*(receiving?1-phase:phase),hq.z);
    }
    // Keep the CSS size fixed while reducing GPU fill under sustained overload.
    if(clock>=readyToAdapt&&dt>.022)misses++;
    if(clock>=readyToAdapt&&++samples>=48){
      const old=resolution;
      if(misses>4){
        resolution=Math.max(.56,resolution*.87);
        stableWindows=0;
      }else if(misses<=1){
        if(++stableWindows>=5&&resolution<1){resolution=Math.min(1,resolution+.08);stableWindows=0;}
      }else stableWindows=0;
      misses=samples=0;
      if(old!==resolution)resizePipeline();
    }
    pipeline.render(view);
  }
  async function prepare(){
    await assets.ready();
    await pipeline.prepare(camera);
    last=performance.now()/1000;
    readyToAdapt=last+1;
    render(performance.now());
    renderer.setAnimationLoop(render);
  }
  layout();
  const ready=prepare();
  return { layout,select,walk,update,setOptions,showFloor,liftRequest,ready };
}
