const central = [
  { id:'hq', col:3, row:3, style:'stone', facing:1, height:140, tiers:[
    {top:13,w:25,d:24},{top:58,w:23.8,d:22.8},{top:78,w:19.1,d:18.4},
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
  stone:['#baa88d','#eddbb9','#304359','#a6bac9','#e0ad64'],
  crown:['#d9c190','#fff1c8','#644b37','#b19577','#ffc473'],
  steel:['#546f84','#9fb7c5','#263a5f','#739cbb','#b9deea'],
  brick:['#93574e','#ca9681','#273953','#7197a7','#f5b478'],
  grants:['#685c74','#ac9bad','#271d45','#776c9d','#ffa5c8'],
  slate:['#596c7d','#8296a5','#27384f','#617d99','#b9c3cc'],
  mist:['#728595','#a6b5c2','#3e5568','#90aec3','#ccdce2'],
};

function skins(THREE) {
  const result={};
  const lights=[];
  for(const [name,[dark,light,window,reflection,warm]] of Object.entries(paintSchemes)){
    const source=image(384,384);
    const emission=image(384,384);
    const ctx=source.getContext('2d');
    const torch=emission.getContext('2d');
    const body=ctx.createLinearGradient(0,0,384,0);
    body.addColorStop(0,dark);
    body.addColorStop(.11,light);
    body.addColorStop(.74,light);
    body.addColorStop(.94,dark);
    ctx.fillStyle=body;
    ctx.fillRect(0,0,384,384);
    torch.fillStyle='#000';
    torch.fillRect(0,0,384,384);
    for(let x=6;x<379;x+=10){
      ctx.fillStyle=x>40&&x<339?'#ffffff09':'#ffffff38';
      ctx.fillRect(x,0,2,384);
    }
    ctx.fillStyle='#ffffff58';
    ctx.fillRect(5,0,8,384);
    ctx.fillRect(367,0,6,384);
    ctx.fillRect(0,15,384,5);
    ctx.fillStyle='#00000028';
    ctx.fillRect(0,307,384,4);
    ctx.fillRect(0,359,384,4);
    const glazing=ctx.createLinearGradient(70,260,264,36);
    glazing.addColorStop(0,window);
    glazing.addColorStop(.58,window);
    glazing.addColorStop(1,reflection);
    ctx.fillStyle=dark;
    ctx.fillRect(54,45,276,240);
    ctx.fillStyle=glazing;
    ctx.fillRect(65,57,252,216);
    ctx.fillStyle='#ffffff27';
    ctx.fillRect(77,66,8,196);
    ctx.fillRect(195,57,5,216);
    ctx.fillRect(65,142,252,4);
    ctx.fillStyle='#070f2448';
    ctx.fillRect(85,213,111,46);
    ctx.fillRect(201,182,105,78);
    ctx.fillStyle=warm;
    const lit=name==='crown'? .82:.46;
    ctx.globalAlpha=lit;
    ctx.fillRect(208,156,87,93);
    ctx.globalAlpha=1;
    torch.fillStyle=warm;
    torch.globalAlpha=name==='crown'?.87:.44;
    torch.fillRect(208,156,87,93);
    torch.globalAlpha=1;
    ctx.fillStyle=light;
    ctx.fillRect(49,275,285,10);
    // Mortar and stone speckle live in the same surface instead of overlapping trim meshes.
    for(let i=0;i<8500;i++){
      const x=(i*97.419)%384;
      const y=(i*38.171)%384;
      if(x>57&&x<328&&y>43&&y<289)continue;
      ctx.fillStyle=i%3===0?'#ffffff24':'#00000014';
      ctx.fillRect(x,y,1+i%2,1+i%3);
    }
    function asTexture(surface){
      const texture=new THREE.CanvasTexture(surface);
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      texture.anisotropy=4;
      return texture;
    }
    const material=new THREE.MeshStandardMaterial({
      map:asTexture(source),emissiveMap:asTexture(emission),emissive:0xffffff,
      emissiveIntensity:name==='crown'?1.12:.27,roughness:.71,metalness:name==='steel'?.16:.05,
    });
    result[name]=material;
    if(name!=='crown')lights.push(material);
  }
  return { result,lights };
}

// Each tower is one exterior shell. Setbacks have four terrace strips, with no hidden slab faces.
function towerShell(THREE,plot,skin,cap,crown) {
  const vertices=[], uvs=[];
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
    const mat=decorated?2:0;
    function strip(u,U,v,V){
      const ax=start[0]+(end[0]-start[0])*u;
      const az=start[1]+(end[1]-start[1])*u;
      const bx=start[0]+(end[0]-start[0])*U;
      const bz=start[1]+(end[1]-start[1])*U;
      quad([ax,v,az],[bx,v,bz],[bx,V,bz],[ax,V,az],[u*width/pitch,v/3.65,U*width/pitch,V/3.65],mat);
    }
    if(!cut){strip(0,1,low,high);return;}
    const side=(1-doorWidth/width)/2;
    strip(0,side,low,high);
    strip(1-side,1,low,high);
    strip(side,1-side,doorTop,high);
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
  const ordered=[0,1,2].flatMap(type=>geometry.groups.filter(group=>group.materialIndex===type)
    .flatMap(group=>Array.from({length:group.count},(_,i)=>group.start+i)));
  const counts=[0,1,2].map(type=>geometry.groups.filter(group=>group.materialIndex===type).reduce((total,group)=>total+group.count,0));
  geometry.setIndex(ordered);
  geometry.clearGroups();
  let offset=0;
  counts.forEach((count,type)=>{if(count)geometry.addGroup(offset,count,type);offset+=count;});
  return new THREE.Mesh(geometry,[skin,cap,crown]);
}

function buildDecor(THREE,scene,navigation,material,box) {
  const { plan,edge,lines }=navigation;
  const city=new THREE.Group();
  scene.add(city);
  const asphalt=material(0x263647,.92);
  const curb=material(0x8294a3,.94);
  const snow=material(0xcadae1,.91);
  const slush=material(0x8b9eaa,.88);
  const marking=material(0xc0c7b2,.86);
  const asphaltFloor=box(city,asphalt,0,-.62,0,edge*2+19,1,edge*2+19);
  asphaltFloor.receiveShadow=true;
  box(city,material(0x1c3046,1),37,-.89,0,490,.4,800);
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
  lots.receiveShadow=true;

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
  const poles=material(0x354555,.71,.2);
  const gold=new THREE.MeshBasicMaterial({color:0xffd899,toneMapped:false});
  const lampBulbs=[];
  for(const x of [-48,-36,-6,6,36,48]){
    for(const z of [-48,-36,-6,6,36,48]){
      if(Math.abs(x)>8&&Math.abs(z)>8&&(x+z)%24!==0)continue;
      box(city,poles,x,2.48,z,.126,4.68,.126);
      box(city,poles,x+.42,4.87,z,.92,.088,.116);
      box(city,gold,x+.85,4.77,z,.29,.09,.22);
      for(let i=0;i<12;i++)lampBulbs.push([x+Math.sin(i*1.4)*.092,.69+i*.24,z+Math.cos(i*1.4)*.092]);
    }
  }
  const lights=new THREE.InstancedMesh(new THREE.SphereGeometry(.047,5,4),gold,lampBulbs.length);
  lampBulbs.forEach(([x,y,z],i)=>lights.setMatrixAt(i,matrix.makeTranslation(x,y,z)));
  city.add(lights);
  return gold;
}

export function createCity(THREE, OrbitControls, navigation, displays, ui) {
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
  scene.background=new THREE.Color(0x537594);
  scene.fog=new THREE.FogExp2(0x7e9bb6,.0022);
  const renderer=new THREE.WebGLRenderer({canvas:ui.canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  const mobile=matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobile?1.25:1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.06;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false;
  const diffuse=new THREE.HemisphereLight(0xdacbed,0x718496,1.65);
  const sun=new THREE.DirectionalLight(0xffe1b2,2.1);
  sun.position.set(-90,115,41);
  sun.castShadow=true;
  sun.shadow.mapSize.setScalar(mobile?768:1536);
  Object.assign(sun.shadow.camera,{left:-75,right:75,top:85,bottom:-70,near:2,far:290});
  sun.shadow.normalBias=.12;
  sun.shadow.bias=-.00026;
  scene.add(diffuse,sun);
  const { grid,lots }=navigation.makeGrid(THREE,cityPlan(navigation.plan.cells));
  const bounding=lots.map(plot=>plot.bounds);
  const walls=[];
  const places=new Map();
  const panels=[];
  const rooms=[];
  const {result:skin,lights}=skins(THREE);
  const crownCap=material(0xe3c99e,.76);
  const grayCap=material(0xa6b5bd,.82);
  const holidayLight=buildDecor(THREE,scene,navigation,material,box);
  const ink=material(0x172338,.82);
  const brass=material(0xb39368,.47,.32);
  const glazing=material(0x426079,.34,.16);

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
  function lobby(plot) {
    const interior=new THREE.Group();
    plot.root.add(interior);
    const floor=box(interior,material(0x617283,.79),0,.157,0,plot.width-1.07,.025,plot.depth-1.08);
    floor.receiveShadow=true;
    box(interior,material(0xd3c4a5,.76),0,3.67,-plot.facing*(plot.depth/2-.58),plot.width-1.37,6.86,.18);
    for(const sign of [-1,1]){
      box(interior,material(0xbbaf9f,.79),sign*(plot.width/2-.57),3.67,0,.16,6.86,plot.depth-1.49);
    }
    box(interior,material(0x9ca2a3,.82),0,6.91,0,plot.width-1.27,.12,plot.depth-1.28);
    for(const x of [-5.2,5.2]){
      box(interior,material(0xf2e5ca,.76),x,6.74,0,2.2,.072,17);
      box(interior,holidayLight,x,6.66,0,1.77,.035,14);
    }
    const codeMonitor=displays.monitor(THREE);
    const x=4.75;
    const z=-plot.facing*4.6;
    const wood=material(0x815e4e,.63);
    box(interior,wood,x,1.26,z,3.09,.17,1.57);
    for(const side of [-1,1])box(interior,ink,x+side*1.25,.724,z,.16,.87,1.11);
    box(interior,ink,x,1.50,z,.217,.26,.39);
    box(interior,ink,x,2.15,z,.073+2.21,1.294,.16);
    plane(interior,codeMonitor.material,2.18,1.216,x,2.15,z+plot.facing*.089,plot.facing===1?0:Math.PI);
    rooms.push({plot,codeMonitor});
    walls.push(wallBounds(plot.x+x-1.50,.16,plot.z+z-.79,plot.x+x+1.50,1.40,plot.z+z+.79));
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
    box(frame,ink,0,0,0,width+.56,height+.60,.30);
    plane(frame,panel.material,width,height,0,0,.162,0);
  }

  for(const plot of lots){
    const root=new THREE.Group();
    root.position.set(plot.x,0,plot.z);
    plot.root=root;
    plot.label=ui.districts[plot.id]?.label;
    scene.add(root);
    const shell=towerShell(THREE,plot,skin[plot.style],plot.style==='stone'?crownCap:grayCap,skin.crown);
    shell.castShadow=Boolean(plot.facing);
    shell.receiveShadow=Boolean(plot.facing);
    root.add(shell);
    if(!plot.facing){walls.push(plot.bounds);continue;}
    if(plot.id==='hq'){
      const spire=new THREE.Mesh(new THREE.CylinderGeometry(.036,.67,7.94,12),brass);
      spire.position.y=136.03;
      root.add(spire);
    }
    plot.door=portal(plot);
    lobby(plot);
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
    plot.work=vector(plot.x+5.93,.18,plot.z-plot.facing*3.05);
    plot.entry=vector(plot.x,.18,plot.door.front+plot.facing*.67);
    places.set(plot.id,plot);
    skin[plot.style].needsUpdate=true;
  }

  const park={id:'lounge',x:-63,z:21,work:vector(-60,.18,27),entry:vector(-60,.18,10.7),facing:-1};
  places.set(park.id,park);
  const tree=new THREE.Group();
  tree.position.set(park.x,.15,19);
  scene.add(tree);
  const greenery=material(0x28595d,.97);
  for(let tier=0;tier<7;tier++){
    const radius=5.9-tier*.71;
    const cone=new THREE.Mesh(new THREE.ConeGeometry(radius,3.9,15),greenery);
    cone.position.y=2.2+tier*1.67;
    tree.add(cone);
  }
  const ornaments=[];
  for(let i=0;i<112;i++){
    const fraction=i/111;
    const heading=fraction*Math.PI*17;
    const radius=5.55*(1-fraction*.90);
    ornaments.push([radius*Math.cos(heading),.94+12.53*fraction,radius*Math.sin(heading)]);
  }
  const bulbs=new THREE.InstancedMesh(new THREE.SphereGeometry(.145,8,4),holidayLight,ornaments.length);
  const matrix=new THREE.Matrix4();
  ornaments.forEach(([x,y,z],index)=>bulbs.setMatrixAt(index,matrix.makeTranslation(x,y,z)));
  tree.add(bulbs);
  const star=new THREE.Mesh(new THREE.OctahedronGeometry(.74),holidayLight);
  star.position.y=14.7;
  tree.add(star);
  const placards=new Map();
  for(const place of places.values()){
    const button=document.createElement('button');
    button.className='marker';
    button.type='button';
    button.textContent=ui.districts[place.id].label;
    button.addEventListener('click',()=>ui.onSelect(place.id));
    placards.set(place.id,button);
    ui.markers.append(button);
  }

  function vehicle(parent,color) {
    const frame=new THREE.Group();
    const paint=material(color,.61,.10);
    parent.add(frame);
    box(frame,paint,0,.66,0,1.68,.63,3.10);
    box(frame,glazing,0,1.154,-.13,1.41,.35,1.60);
    box(frame,paint,0,1.405,-.13,1.40,.128,1.57);
    box(frame,holidayLight,0,1.56,-.31,.52,.095,.31);
    for(const x of [-.63,.63]){
      box(frame,holidayLight,x,.715,1.575,.29,.153,.068);
      for(const z of [-1.01,.98]){
        const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.31,.31,.18,12),ink);
        wheel.rotation.z=Math.PI/2;
        wheel.position.set(x*1.39,.32,z);
        frame.add(wheel);
      }
    }
    return frame;
  }

  function makeRoute(points) {
    const pieces=[];
    let meters=0;
    for(let i=1;i<points.length;i++){
      const from=points[i-1],to=points[i];
      const distance=from.point.distanceTo(to.point);
      if(distance<.01)continue;
      const duration=distance/(to.drive?14:7);
      pieces.push({from:from.point,to:to.point,drive:to.drive,duration,total:meters});
      meters+=duration;
    }
    return { pieces, duration:meters };
  }
  function trafficRoute(cx,cz) {
    const points=[[cx,cz],[cx+42,cz],[cx+42,cz+42],[cx,cz+42],[cx,cz]]
      .map(([x,z])=>({point:vector(x,-.097,z),drive:true}));
    for(let i=1;i<points.length;i++){
      if(navigation.sweep(THREE,points[i-1].point,points[i].point,bounding,1.2).distanceTo(points[i].point)>.01){
        throw new Error('Traffic intersects a plot');
      }
    }
    return makeRoute(points);
  }
  const taxis=[[-42,-42],[-42,0],[0,-42],[0,0],[42,42],[-84,-42]].map(([x,z],i)=>({
    mesh:vehicle(scene,i%3===0?0xf8bf3a:0xeeb135),route:trafficRoute(x,z),phase:i*2.17,
  }));

  function person(profile,index) {
    const wrapper=new THREE.Group();
    const body=new THREE.Group();
    wrapper.add(body);
    scene.add(wrapper);
    const coat=material(profile.color,.88);
    box(body,coat,0,1.04,0,.63,.82,.44);
    box(body,material(0xbfd0cd,.92),0,1.45,.044,.66,.136,.47);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.223,10,7),material(index%3===1?0xc89674:0xe5b99e,.81));
    head.position.y=1.69;
    body.add(head);
    const hat=new THREE.Mesh(new THREE.SphereGeometry(.225,9,6),coat);
    hat.position.set(0,1.80,-.012);
    hat.scale.y=.56;
    body.add(hat);
    const steps=[-.17,.17].map(x=>{
      const leg=new THREE.Group();
      leg.position.set(x,.66,0);
      box(leg,ink,0,-.27,0,.237,.53,.24);
      box(leg,ink,0,-.57,.083,.25,.119,.36);
      body.add(leg);
      return leg;
    });
    const cab=vehicle(wrapper,0xf0b739);
    cab.visible=false;
    wrapper.position.copy(park.work).add(vector((index%3)*1.25,0,Math.floor(index/3)*1.65));
    return { profile,index,wrapper,body,cab,steps,place:'lounge',goal:'lounge',route:null,row:{action:'idle'} };
  }
  const actors=ui.profiles.map(person);

  function travel(origin,destination,drive) {
    const points=[{point:origin.work,drive:false}];
    const add=(x,y,z,drive=false)=>points.push({point:vector(x,y,z),drive});
    const aRoad=origin.z+origin.facing*21;
    const bRoad=destination.z+destination.facing*21;
    const intersection=origin.x+Math.sign(-origin.x)*21;
    add(origin.entry.x,.18,origin.work.z);
    add(origin.entry.x,.18,origin.entry.z);
    add(origin.entry.x,-.09,aRoad);
    add(intersection,-.09,aRoad,drive);
    add(intersection,-.09,bRoad,drive);
    add(destination.entry.x,-.09,bRoad,drive);
    add(destination.entry.x,.18,destination.entry.z);
    add(destination.entry.x,.18,destination.work.z);
    add(destination.work.x,.18,destination.work.z);
    return points;
  }

  const camera=new THREE.OrthographicCamera(-150,150,105,-105,.1,1200);
  const target=vector(0,61,-5);
  const direction=vector(95,129,157);
  camera.position.copy(target).add(direction);
  const orbit=new OrbitControls(camera,ui.canvas);
  orbit.target.copy(target);
  orbit.enableDamping=true;
  orbit.dampingFactor=.085;
  orbit.minZoom=.58;
  orbit.maxZoom=7.2;
  orbit.minPolarAngle=.26;
  orbit.maxPolarAngle=1.43;
  orbit.enablePan=false;
  orbit.update();

  const walker=navigation.walkingCamera(THREE,{
    canvas:ui.canvas,movePad:ui.movePad,lookPad:ui.lookPad, label:ui.walkPlace,
    initial:{x:-7,z:9,yaw:Math.atan2(14,18)},
    getObstacles:()=>[...walls,...Array.from(places.values()).flatMap(p=>p.door&&p.door.open<.7?[p.door.blocker]:[])],
    getRoom:position=>Array.from(places.values()).find(place=>place.door&&
      place.bounds.min.x<position.x&&place.bounds.max.x>position.x&&place.bounds.min.z<position.z&&place.bounds.max.z>position.z),
  });
  let walking=false,focus=null,follow=null,tween;
  let width=1,height=1,dockSize=-1;
  let options={light:'day',snow:true,transport:'mixed'};
  let snapshot={};
  let relay=null;
  const projected=vector();
  const before=vector();
  const aim=vector();
  const heightProbe=vector();
  const approach=new THREE.Ray();
  const clearSamples=central.flatMap(tower=>{
    const place=places.get(tower.id);
    return [vector(place.x,tower.height*.6,place.z),vector(place.x+(place.x<0?12:-12),14,place.z),
      vector(place.x,16,place.z+place.facing*13)];
  });

  const count=4000;
  const field=new Float32Array(count*3);
  const snowfallGeometry=new THREE.BufferGeometry();
  snowfallGeometry.setAttribute('position',new THREE.BufferAttribute(field,3));
  const flake=image(64,64);
  const flakeInk=flake.getContext('2d');
  const halo=flakeInk.createRadialGradient(32,32,3,32,32,32);
  halo.addColorStop(0,'#fff');
  halo.addColorStop(.36,'#fff');
  halo.addColorStop(.68,'#ffffff77');
  halo.addColorStop(1,'#ffffff00');
  flakeInk.fillStyle=halo;
  flakeInk.fillRect(0,0,64,64);
  const flakeTexture=new THREE.CanvasTexture(flake);
  const snowflakes=new THREE.Points(snowfallGeometry,new THREE.PointsMaterial({
    color:0xeef7ff,map:flakeTexture,alphaTest:.06,size:.6,transparent:true,opacity:.9,depthWrite:false,
  }));
  snowflakes.name='snow-4000';
  snowflakes.frustumCulled=false;
  scene.add(snowflakes);
  function placeSnow(clock,view){
    const spread=walking?86:263;
    view.getWorldDirection(aim);
    snowflakes.position.copy(view.position).addScaledVector(aim,walking?48:158);
    const origin=snowflakes.position;
    const viewX=view.position.x-origin.x;
    const viewY=view.position.y-origin.y;
    const viewZ=view.position.z-origin.z;
    for(let i=0;i<count;i++){
      const offset=i*3;
      field[offset]=((i*119.713)%spread)-spread/2+Math.sin(clock*.44+i)*1.28;
      field[offset+1]=((i*137.117-clock*(1.4+i%4)+10000)%spread)-spread/2;
      field[offset+2]=((i*192.817)%spread)-spread/2+Math.cos(clock*.29+i)*.8;
      if(walking&&(field[offset]-viewX)**2+(field[offset+1]-viewY)**2+(field[offset+2]-viewZ)**2<36){
        field[offset+1]=spread;
      }
    }
    snowfallGeometry.attributes.position.needsUpdate=true;
  }

  const signal=new THREE.Mesh(new THREE.OctahedronGeometry(1.35),new THREE.MeshBasicMaterial({color:0x78e7fc,fog:false}));
  scene.add(signal);
  signal.visible=false;
  function setOptions(next) {
    options=next;
    const state=ui.lightMode();
    const flag={
      day:[0x6889aa,0x91aec7,1.63,0xffe1b2,2.18,.29],
      dusk:[0x62639b,0x9391b1,1.11,0xffb77d,1.47,.57],
      night:[0x172944,0x2d4165,.83,0xb2cfff,.78,.86],
    }[state];
    scene.background.setHex(flag[0]);
    scene.fog.color.setHex(flag[1]);
    diffuse.intensity=flag[2];
    sun.color.setHex(flag[3]);
    sun.intensity=flag[4];
    for(const skin of lights)skin.emissiveIntensity=flag[5];
    renderer.shadowMap.needsUpdate=true;
  }

  function layout(){
    const bounds=ui.canvas.getBoundingClientRect();
    width=Math.max(1,bounds.width);
    height=Math.max(1,bounds.height);
    const ratio=width/height;
    const halfW=Math.max(73,(width<700?98:111)*ratio);
    camera.left=-halfW;
    camera.right=halfW;
    camera.top=halfW/ratio;
    camera.bottom=-halfW/ratio;
    dockSize=ui.board.offsetHeight;
    camera.setViewOffset(width,height,0,Math.round(dockSize*.14),width,height);
    walker.camera.aspect=ratio;
    walker.camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
  }
  const resize=new ResizeObserver(layout);
  resize.observe(ui.canvas);

  function select(id,profileId){
    focus=id;
    follow=actors.find(actor=>actor.profile.id===profileId);
    const point=follow?.wrapper.position??places.get(focus);
    const level=follow?1.5:focus==='hq'?54:focus==='lounge'?7:31;
    tween=point?{at:vector(point.x,point.y===undefined?level:point.y+level,point.z),zoom:follow?4.3:focus==='hq'?1.51:2.05}:
      {at:target.clone(),zoom:1};
  }

  function update(data,nextRelay,snap=false,nextSnapshot={}){
    snapshot=nextSnapshot;
    relay=nextRelay;
    for(const actor of actors){
      const row=data.get(actor.profile.id);
      if(!row)continue;
      const goal=row.district;
      actor.row=row;
      if(snap){
        actor.route=null;
        actor.place=goal;
        actor.goal=goal;
        actor.wrapper.position.copy(places.get(goal).work).add(vector(actor.index*.51,0,0));
      }else if(goal!==actor.goal){
        actor.goal=goal;
        const now=performance.now()/1000;
        const origin=places.get(actor.place),destination=places.get(goal);
        const drive=options.transport==='car'||options.transport==='mixed'&&actor.index%2===0;
        let points=[{point:actor.wrapper.position.clone(),drive:false}];
        if(actor.route){
          const traveled=actor.route.pieces.filter(part=>part.total<now-actor.started).reverse();
          points.push(...traveled.map(part=>({point:part.from,drive:part.drive})));
        }else points.push({point:origin.work,drive:false});
        if(origin!==destination){
          if(actor.place==='lounge'&&goal!=='hq'&&goal!=='lounge'){
            const hq=places.get('hq');
            points.push(...travel(origin,hq,drive),...travel(hq,destination,drive));
          }else points.push(...travel(origin,destination,drive));
        }
        actor.route=makeRoute(points);
        actor.started=now;
      }
    }
    for(const {plot,codeMonitor} of rooms){
      const current=actors.find(actor=>!actor.profile.job&&actor.row.action!=='idle'&&actor.goal===plot.id&&
        (snapshot.agents?.[actor.profile.id]?.code_snippet||snapshot.agents?.[actor.profile.id]?.current_log));
      codeMonitor.show(current?.profile.title,snapshot.agents?.[current?.profile.id]);
    }
  }

  function moveAlong(mesh,route,time){
    const segment=route.pieces.find(piece=>time<piece.total+piece.duration);
    if(!segment)return null;
    const phase=(time-segment.total)/segment.duration;
    mesh.position.lerpVectors(segment.from,segment.to,Math.max(0,phase));
    mesh.rotation.y=Math.atan2(segment.to.x-segment.from.x,segment.to.z-segment.from.z);
    return segment;
  }

  function walk(active){
    walking=active;
    walker.setActive(active);
    orbit.enabled=!active;
    ui.onWalk(active);
    layout();
  }
  let last=performance.now()/1000;
  let frames=0;
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
    for(const actor of actors){
      let part=null;
      if(actor.route){
        part=moveAlong(actor.wrapper,actor.route,motion?clock-actor.started:Infinity);
        if(!part){
          actor.place=actor.goal;
          actor.route=null;
          actor.wrapper.position.copy(places.get(actor.place).work).add(vector(actor.index*.51,0,0));
        }
      }
      const driving=Boolean(part?.drive);
      actor.cab.visible=driving;
      actor.body.visible=!driving;
      actor.wrapper.visible=!actor.profile.job||actor.row.action!=='idle';
      const gait=part&&!driving&&motion?Math.sin(clock*16)*.60:0;
      actor.steps[0].rotation.x=gait;
      actor.steps[1].rotation.x=-gait;
    }
    for(const taxi of taxis)moveAlong(taxi.mesh,taxi.route,motion?(clock+taxi.phase)%taxi.route.duration:taxi.phase%taxi.route.duration);

    if(!walking){
      before.copy(camera.position);
      if(follow||tween){
        const destination=follow?heightProbe.copy(follow.wrapper.position).add(vector(0,1.6,0)):tween.at;
        const zoom=follow?4.3:tween.zoom;
        const ease=motion?1-Math.exp(-dt*6):1;
        projected.copy(orbit.target).lerp(destination,ease).sub(orbit.target);
        orbit.target.add(projected);
        camera.position.add(projected);
        camera.zoom+=(zoom-camera.zoom)*ease;
        camera.updateProjectionMatrix();
        if(!follow&&Math.abs(camera.zoom-zoom)<.005&&orbit.target.distanceTo(destination)<.05)tween=null;
      }
      orbit.update();
      const safe=navigation.sweep(THREE,before,camera.position,bounding,1.2);
      if(safe.distanceToSquared(camera.position)>.0001){
        camera.position.copy(safe);
        camera.lookAt(orbit.target);
      }
    }
    if(dockSize!==ui.board.offsetHeight)layout();
    camera.updateMatrixWorld();

    // Foreground blocks regain their full geometry in walking mode.
    for(const plot of lots){
      if(plot.facing)continue;
      plot.root.visible=walking||!clearSamples.some(at=>{
        approach.origin.copy(camera.position);
        approach.direction.copy(at).sub(camera.position).normalize();
        const hit=approach.intersectBox(plot.bounds,heightProbe);
        return hit&&camera.position.distanceToSquared(hit)<camera.position.distanceToSquared(at);
      });
    }
    for(const [id,marker] of placards){
      const place=places.get(id);
      projected.set(place.x,id==='lounge'?13:place.height+2,place.z).project(camera);
      const x=(projected.x*.5+.5)*width;
      const y=(-projected.y*.5+.5)*height;
      marker.hidden=walking||Boolean(focus||follow)||x<23||x>width-23||y<46||y>height-dockSize-52;
      if(!marker.hidden)marker.style.transform='translate('+x+'px,'+y+'px) translate(-50%,-100%)';
    }
    for(const display of panels)display.animate(motion?clock:0,snapshot,!motion);
    snowflakes.visible=options.snow;
    if(snowflakes.visible)placeSnow(motion?clock:0,walking?walker.camera:camera);
    const receiving=relay?.stage==='receiving';
    signal.visible=Boolean(receiving||relay?.stage==='returning');
    if(signal.visible){
      const phase=motion?(clock*.28)%1:.45;
      const hq=places.get('hq');
      signal.position.set(hq.x,141+22*(receiving?1-phase:phase),hq.z);
    }
    if(frames++%14===0)renderer.shadowMap.needsUpdate=true;
    renderer.render(scene,walking?walker.camera:camera);
  }
  layout();
  renderer.setAnimationLoop(render);
  return { layout,select,walk,update,setOptions };
}
