export const floors=[.18,5.12,10.06];
export const stages={
  read_files:{level:2,label:'Архив'},
  write_code:{level:1,label:'Разработка'},
  run_tests:{level:1,label:'Тестирование'},
  error:{level:1,label:'Разбор ошибки'},
  deploy_report:{level:2,label:'Передача отчёта'},
  idle:{level:0,label:'Лаунж'},
};
const shaft={x:-6.8,z:-2.4,w:3.1,d:3.0};

function bubble(THREE,parent,offset=2.42,lateral=0){
  const canvas=document.createElement('canvas');
  canvas.width=480;canvas.height=116;
  const ctx=canvas.getContext('2d');
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthWrite:false,toneMapped:false}));
  sprite.position.set(lateral,offset,0);sprite.scale.set(3.85,.93,1);
  parent.add(sprite);
  let signature;
  let allowed=true;
  let content=false;
  return { near(value){allowed=!value;sprite.visible=allowed&&content;}, show(text,accent='#87e8ff') {
    const key=text+accent;
    if(signature===key)return;
    signature=key;
    content=Boolean(text);
    sprite.visible=allowed&&content;
    if(!text)return;
    ctx.clearRect(0,0,480,116);
    ctx.fillStyle='#0b1628f5';
    ctx.strokeStyle=accent;ctx.lineWidth=5;
    ctx.beginPath();ctx.roundRect(8,9,464,81,17);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(225,89);ctx.lineTo(239,109);ctx.lineTo(253,89);ctx.fill();
    ctx.font='700 43px "Segoe UI", sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#f6faff';
    ctx.fillText(text,240,49,429);
    texture.needsUpdate=true;
  }};
}

export function buildOffice(THREE,plot,displays,assets){
  const unit=new THREE.BoxGeometry();
  const scheme={
    ink:0x243447, wood:0x98694a, pale:0xddd3c1, floor:0x8c9ca8, blue:0x506e87,
    cream:0xf0dfb8, lime:0x419d91, wine:0xa3525d, silver:0xa7b4bb,
  };
  const root=new THREE.Group();
  plot.root.add(root);
  root.visible=false;
  const fixed=new THREE.MeshStandardMaterial({roughness:.75});
  const metals=new Map();
  function color(value){
    const key=scheme[value]??value;
    if(!metals.has(key))metals.set(key,new THREE.MeshStandardMaterial({color:key,roughness:.78}));
    return metals.get(key);
  }
  function group(parent,x=0,y=0,z=0){
    const result=new THREE.Group();
    result.position.set(x,y,z);parent.add(result);return result;
  }
  function block(parent,paint,x,y,z,w,h,d){
    const mesh=new THREE.Mesh(unit,typeof paint==='object'?paint:color(paint));
    mesh.position.set(x,y,z);mesh.scale.set(w,h,d);parent.add(mesh);return mesh;
  }
  const floorGroups=[];
  const ceilings=[];
  const solid=[];
  const faces=[];
  const dashboards=[];
  const rackLights=[];
  const crew=[];
  const facing=plot.facing;
  const front=shaft.z+facing*shaft.d/2;
  const yaw=facing===1?0:Math.PI;
  const labels={hq:'ЭМПАЙР-СТЕЙТ · ШТАБ',moex:'MOEX TOWER',dev:'DEV LAB',grants:'GRANTS RADAR'};
  const silver=color('silver');
  const glass=new THREE.MeshStandardMaterial({color:0xa8e4f7,transparent:true,opacity:.29,roughness:.39,depthWrite:false,side:THREE.DoubleSide});
  const amber=new THREE.MeshBasicMaterial({color:new THREE.Color(0xffdcb2).multiplyScalar(1.36)});
  let activity='idle';
  let model={};
  let previous;
  let started=0;
  let selected=null;
  let visiblePreviously=false;

  function bulk(parent,specs){
    if(!specs.length)return;
    const mesh=new THREE.InstancedMesh(unit,fixed,specs.length);
    const matrix=new THREE.Matrix4(),shade=new THREE.Color();
    specs.forEach(([paint,x,y,z,w,h,d],i)=>{
      matrix.makeScale(w,h,d).setPosition(x,y,z);
      mesh.setMatrixAt(i,matrix);
      mesh.setColorAt(i,shade.set(scheme[paint]??paint));
    });
    parent.add(mesh);
  }
  const worldBox=(x,y,z,w,h,d)=>new THREE.Box3(
    new THREE.Vector3(plot.x+x-w/2,y-h/2,plot.z+z-d/2),
    new THREE.Vector3(plot.x+x+w/2,y+h/2,plot.z+z+d/2));

  const halfW=plot.width/2-.09,halfD=plot.depth/2-.09;
  function deck(specs,y){
    const west=shaft.x-shaft.w/2,east=shaft.x+shaft.w/2;
    const north=shaft.z-shaft.d/2,south=shaft.z+shaft.d/2;
    const join=(x1,x2,z1,z2)=>specs.push(['floor',(x1+x2)/2,y,(z1+z2)/2,x2-x1-.008,.16,z2-z1-.008]);
    join(-halfW,west,-halfD,halfD);join(east,halfW,-halfD,halfD);
    join(west,east,-halfD,north);join(west,east,south,halfD);
  }

  function panel(parent,appearance,w,h,x,y,z,angle=yaw){
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),appearance);
    mesh.position.set(x,y,z);
    mesh.rotation.y=angle;
    parent.add(mesh);
    return mesh;
  }

  function desk(floor,index,x,z,live){
    const angle=yaw;
    const display=live?displays.monitor(THREE):null;
    const y=floors[index];
    assets.place(floor,'desk',{x,z:z*facing,y:.015,yaw:angle,
      onReady(model){
        if(!display)return;
        const screen=model.getObjectByName('screen_lod1');
        const geometry=screen.geometry.clone();
        const points=geometry.getAttribute('position');
        geometry.computeBoundingBox();
        const {min,max}=geometry.boundingBox;
        const uv=new Float32Array(points.count*2);
        for(let i=0;i<points.count;i++){
          uv[i*2]=(points.getX(i)-min.x)/(max.x-min.x);
          uv[i*2+1]=(points.getY(i)-min.y)/(max.y-min.y);
        }
        geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
        screen.geometry=geometry;
        screen.material=display.material;
      }});
    assets.place(floor,'chair',{x,y:.015,z:(z+.78)*facing,yaw:angle+Math.PI});
    solid.push(worldBox(x,y+.37,z*facing,1.40,.74,.72));
    if(display)faces.push({index,display});
    return display;
  }

  function dashboard(floor,index,x,z){
    const board=displays.projectPanel(THREE,labels[plot.id]);
    const light=new THREE.MeshBasicMaterial({color:new THREE.Color(0x6bc6f5).multiplyScalar(2.3)});
    const screen=panel(floor,board.material,2.84,1.44,x,2.12,z*facing);
    block(floor,light,x,1.37,z*facing,2.83,.015,.018);
    block(floor,light,x,2.87,z*facing,2.83,.015,.018);
    const base=block(floor,light,x,.13,(z+.02)*facing,1.24,.023,.29);
    base.name='Панель проекта';
    screen.name='Статус проекта';
    dashboards.push({index,board});
  }

  for(const [index,level] of floors.entries()){
    const floor=group(root,0,level,0);
    const parts=[];
    floorGroups.push(floor);
    deck(parts,-.093);
    block(floor,assets.materials.wood,3.02,.005,0,halfW*2-6.16,.022,halfD*2-.15);
    const ceiling=group(floor);
    const upper=[];
    deck(upper,4.38);
    for(const x of [-4.4,2.94,8.6]){
      upper.push(['ink',x,4.267,0,.69,.066,halfD*2-.63]);
      block(ceiling,amber,x,4.226,0,.126,.025,halfD*2-.78);
    }
    bulk(ceiling,upper);
    ceilings.push(ceiling);

    const rearZ=-(halfD-.17)*facing;
    block(floor,assets.materials.wood,0,1.79,rearZ,10.6,3.52,.29);
    for(const side of [-1,1]){
      const x=side*(halfW-.63);
      block(floor,assets.materials.concrete,x,2.06,0,1.02,4.12,.78);
      block(floor,assets.materials.concrete,x,.43,0,.16,.83,halfD*2-.13);
      if(index>0)block(floor,assets.materials.concrete,0,.42,side*(halfD-.10),halfW*2-.25,.82,.15);
    }
    const sign=displays.officeSign(THREE,labels[plot.id]);
    panel(floor,sign,5.2,.7,0,3.14,rearZ+facing*.16);
    const warm=new THREE.PointLight(0xffcb98,16,13,2);
    const fill=new THREE.PointLight(0xc8e7ff,12,12,2);
    warm.position.set(3.8,3.74,-3.35*facing);
    fill.position.set(-4.2,3.60,3.05*facing);
    floor.add(warm,fill);
    floor.userData.lights=[warm,fill];

    if(index===0){
      assets.place(floor,'reception',{x:4.87,z:-7.13*facing,y:.013,yaw});
      assets.place(floor,'lounge',{x:7.92,z:6.55*facing,y:.018,yaw:yaw+Math.PI});
      assets.place(floor,'plant',{x:9.7,z:5.53*facing,y:.023,height:1.30});
      assets.place(floor,'plant',{x:-9.79,z:-6.5*facing,y:.023,height:1.29});
      const roomX=-6.45,roomZ=4.47;
      assets.place(floor,'meeting',{x:roomX,z:roomZ*facing,y:.027,yaw,
        onReady(room){room.getObjectByName('door').rotation.y=Math.PI*.49;}});
      const doorway=roomX+facing*2;
      solid.push(
        worldBox(roomX-3,level+1.5,roomZ*facing,.15,3,4),
        worldBox(roomX+3,level+1.5,roomZ*facing,.15,3,4),
        worldBox(roomX,level+1.5,(roomZ-2)*facing,6,3,.15),
        worldBox((roomX-3+doorway-.46)/2,level+1.5,(roomZ+2)*facing,doorway-.46-(roomX-3),3,.15),
        worldBox((doorway+.46+roomX+3)/2,level+1.5,(roomZ+2)*facing,roomX+3-doorway-.46,3,.15),
        worldBox(roomX+.60,level+.40,roomZ*facing,2.60,.79,1.15),
        worldBox(4.87,level+.53,-6.88*facing,3.17,1.04,1.69),
        worldBox(7.92,level+.45,6.55*facing,2.0,.9,.84),
        worldBox(9.0,level+.45,2.37*facing,.84,.90,2.0),
        worldBox(-4.2,level+.45,-7.9*facing,2.0,.90,.84));
      assets.place(floor,'lounge',{x:9.0,z:2.37*facing,y:.018,yaw:yaw-Math.PI/2});
      assets.place(floor,'plant',{x:5.92,z:6.7*facing,y:.023,height:1.23});
      assets.place(floor,'lounge',{x:-4.2,z:-7.9*facing,y:.018,yaw});
      desk(floor,index,4.8,-3.21,true);
      dashboard(floor,index,7.64,-3.85);
    }else{
      desk(floor,index,2.35,-2.1,true);
      desk(floor,index,5.25,-1.8,false);
      desk(floor,index,5,3.8,false);
      desk(floor,index,-2.4,4.3,false);
      dashboard(floor,index,5.38,-1.75);
      assets.place(floor,'servers',{x:6.64,z:-7.0*facing,y:.012,yaw,width:5.25,depth:3.23,
        onReady(model){
          model.traverse(mesh=>{
            if(!mesh.isMesh||!mesh.name.startsWith('leds_'))return;
            mesh.material=mesh.material.clone();
            rackLights.push(mesh.material);
          });
          model.getObjectByName('door').rotation.y=Math.PI*.49;
        }});
      solid.push(worldBox(6.64,level+1.34,-7.91*facing,5.27,2.67,1.48));
      for(const x of [-3.7,-.8]){
        assets.place(floor,'archive',{x,z:-6.16*facing,y:.019,yaw,height:2.45,width:1.88});
        solid.push(worldBox(x,level+1.23,-6.16*facing,1.92,2.46,.71));
      }
      block(floor,assets.materials.wood,-5.6,.49,7.81*facing,2.3,.94,.73);
      assets.place(floor,'coffee',{x:-5.96,y:.98,z:7.81*facing,yaw:yaw+Math.PI});
      assets.place(floor,'lounge',{x:-8.76,y:.017,z:5.39*facing,yaw:facing*Math.PI*.5});
      assets.place(floor,'plant',{x:9.25,y:.017,z:6.7*facing,height:1.32});
      solid.push(worldBox(-5.6,level+.49,7.81*facing,2.3,.95,.75));
    }
    bulk(floor,parts);
  }

  const incident=group(floorGroups[1],6.90,2.57,-4.07*facing);
  const incidentGlass=new THREE.MeshBasicMaterial({color:0xf76373,opacity:.34,transparent:true,depthWrite:false});
  block(incident,incidentGlass,0,0,0,2.9,1.29,.030);
  const incidentTitle=bubble(THREE,incident,.10);
  incidentTitle.show('⚠ Разбор ошибки','#ff9299');
  incident.visible=false;
  const cabin=group(root,shaft.x,floors[0],shaft.z);
  block(cabin,'silver',0,-.082,0,shaft.w-.13,.16,shaft.d-.13);
  block(cabin,amber,0,2.76,0,shaft.w-.15,.08,shaft.d-.19);
  for(const side of [-1,1]){
    block(cabin,glass,side*(shaft.w/2-.14),1.26,0,.083,2.53,shaft.d-.19);
    block(cabin,silver,side*(shaft.w/2-.086),1.33,0,.13,2.66,.13);
  }
  block(cabin,glass,0,1.28,-facing*(shaft.d/2-.135),shaft.w-.22,2.56,.081);
  const doors=[-1,1].map(sign=>block(cabin,glass,sign*.734,1.25,facing*(shaft.d/2-.098),1.40,2.50,.057));
  for(const side of [-1,1]){
    const x=shaft.x+side*(shaft.w/2+.16);
    block(root,silver,x,7.51,shaft.z-facing*.73,.15,15,.13);
    solid.push(worldBox(x,7.51,shaft.z,.19,15,shaft.d-.09));
  }
  solid.push(worldBox(shaft.x,7.5,shaft.z-facing*shaft.d/2,shaft.w,15,.17));
  const gates=floorGroups.map(floor=>block(floor,glass,shaft.x,1.25,front+facing*.105,shaft.w-.065,2.50,.044));
  let lift={at:0,target:0,y:floors[0],moving:false,age:0,lastPlayer:-Infinity};

  function person(index){
    const actor=group(root);
    const rig=assets.character(actor,index,1.69+(index%3)*.04);
    const paper=block(rig.hands,new THREE.MeshBasicMaterial({color:0x8be8ff}),0,-.035,.08,.29,.060,.24);
    const cup=new THREE.Mesh(new THREE.CylinderGeometry(.058,.042,.113,16),color('cream'));
    cup.position.set(0,.045,.07);
    rig.hands.add(cup);
    const packet=block(rig.hands,new THREE.MeshBasicMaterial({color:0xffcf77}),0,-.086,.08,.265,.21,.22);
    paper.visible=cup.visible=packet.visible=false;
    const labelOffsets=[[-.60,2.63],[1.03,2.31],[.77,2.98],[-1.07,2.25],[.0,2.73]];
    return {index,actor,rig,paper,cup,packet,
      bubble:bubble(THREE,actor,labelOffsets[index][1],labelOffsets[index][0])};
  }
  for(let i=0;i<5;i++)crew.push(person(i));
  let courier={mode:'idle',since:0,target:0};
  const onLift=(x,z)=>Math.abs(x-shaft.x)<shaft.w/2-.13&&Math.abs(z-shaft.z)<shaft.d/2-.12;
  const outsideFront=(x,z)=>Math.abs(x-shaft.x)<2.15&&Math.abs(z-front)<2.0;
  const local=(position)=>[position.x-plot.x,position.z-plot.z];
  const floorOf=feet=>Math.max(0,Math.min(2,Math.round((feet-floors[0])/(floors[1]-floors[0]))));

  function shift(target,time,player){
    if(lift.moving||target===lift.at)return;
    lift.target=target;lift.moving=true;lift.age=0;
    if(player)lift.lastPlayer=time;
  }
  function info(position,feet){
    const [x,z]=local(position);
    if(!outsideFront(x,z)&&!onLift(x,z))return null;
    return {inside:onLift(x,z),floor:floorOf(feet),at:lift.at,moving:lift.moving};
  }
  function request(position,feet,next,time){
    const current=info(position,feet);
    if(!current||lift.moving)return false;
    if(next===null)shift(current.floor,time,true);
    else if(current.inside&&Number.isInteger(next)&&next>=0&&next<floors.length)shift(next,time,true);
    else return false;
    return true;
  }
  function walkHeights(position,oldFeet){
    const [x,z]=local(position);
    if(onLift(x,z)&&(lift.moving||Math.abs(oldFeet-lift.y)<.67))return lift.y;
    return floors[floorOf(oldFeet)];
  }
  function collision(position,feet){
    const index=floorOf(feet);
    if(!lift.moving&&lift.at===index)return solid;
    return [...solid,worldBox(shaft.x,floors[index]+1.6,front,shaft.w,3.16,.16)];
  }
  function set(next,time){
    const key=[next.activity,next.subject,next.test_result,next.test_count,next.code_snippet,next.current_log].join('\u001f');
    if(key===previous)return;
    previous=key;
    if(next.activity!==activity){
      activity=stages[next.activity]?next.activity:'idle';
      started=time;
      courier={mode:'idle',since:time,target:stages[activity].level};
    }
    model=next;
  }
  function show(walking,focus,chosen,position){
    const visible=walking?Math.hypot(position.x-plot.x,position.z-plot.z)<26:focus;
    selected=walking?null:chosen;
    if(visible!==visiblePreviously){ root.visible=visible;visiblePreviously=visible; }
    floorGroups.forEach((floor,index)=>{
      floor.visible=selected===null||selected===index;
      ceilings[index].visible=selected===null;
      const lit=walking?Math.abs(position.y-floors[index]-1.75)<3.25:index===selected;
      for(const light of floor.userData.lights)light.visible=lit;
    });
  }

  const placements={
    idle:[[7.6,4.8],[5.6,4.9],[6.54,5.76],[-2.3,-3.8],[3.2,-3.6]],
    read_files:[[-3.7,-4.85],[-.7,-4.8],[3.2,1.1],[5.9,1.6],[-2.5,.4]],
    write_code:[[2.35,-1.31],[3.30,-1.39],[5.25,-1.02],[-2.4,5.09],[.48,1.84]],
    run_tests:[[6.28,-4.57],[8.19,-4.54],[7.22,-3.41],[5.15,-3.57],[8.21,-2.88]],
    error:[[6.28,-4.57],[8.19,-4.54],[7.22,-3.47],[5.02,-3.59],[8.19,-2.88]],
    deploy_report:[[2.35,-.88],[4.2,1.26],[6.4,-3.4],[-2.3,2.7],[-3.6,3.7]],
  };
  const courierSpawn=shaft.x;
  function ride(actor,time,dt,motion,playerNear){
    if(activity==='idle'||!motion||(playerNear||time-lift.lastPlayer<8)&&courier.mode==='idle'){
      courier={mode:'idle',since:time,target:stages[activity].level};
      return false;
    }
    const outbound=activity==='deploy_report';
    const target=outbound?0:stages[activity].level;
    const wait=3.5+(plot.col+plot.row)%3;
    if(courier.mode==='idle'&&time-courier.since>wait){
      courier={mode:'approach',since:time,target,origin:outbound?2:0};
    }
    if(courier.mode==='idle')return false;
    const outside=front+1.36*facing;
    const actorY=floors[courier.origin];
    let x=courierSpawn,z=outside,y=actorY;
    if(courier.mode==='approach'){
      const p=Math.min(1,(time-courier.since)/(outbound?2.7:2.1));
      if(outbound){
        const across=Math.min(1,p*1.65);
        x=2.35+(courierSpawn-2.35)*across;
        z=1.25*facing+(outside-1.25*facing)*Math.max(0,(p-.606)/.394);
      }else x=-2.45+(courierSpawn+2.45)*p;
      if(p===1){
        if(!lift.moving&&lift.at!==courier.origin)shift(courier.origin,time,false);
        if(!lift.moving&&lift.at===courier.origin&&lift.age>.33)Object.assign(courier,{mode:'board',since:time});
      }
    }else if(courier.mode==='board'){
      const p=Math.min(1,(time-courier.since)/1.4);
      z=outside+(shaft.z-outside)*p;
      if(p===1){shift(target,time,false);Object.assign(courier,{mode:'ride',since:time});}
    }else if(courier.mode==='ride'){
      z=shaft.z;y=lift.y;
      if(!lift.moving&&lift.at===target&&lift.age>.35)Object.assign(courier,{mode:'leave',since:time});
    }else{
      const p=Math.min(1,(time-courier.since)/1.55);
      z=shaft.z+(outside-shaft.z)*p;
      y=floors[target];
      if(p===1)courier={mode:'idle',since:time,target};
    }
    actor.actor.position.set(x,y,z);
    return true;
  }

  function update(time,dt,motion,player){
    lift.age+=dt;
    if(lift.moving){
      const delta=floors[lift.target]-lift.y;
      const step=Math.min(Math.abs(delta),dt*4.1);
      lift.y+=Math.sign(delta)*step;
      if(Math.abs(delta)<.025){lift.y=floors[lift.target];lift.at=lift.target;lift.moving=false;lift.age=0;}
    }
    cabin.position.y=lift.y;
    cabin.visible=selected===null||Math.abs(lift.y-floors[selected])<1.2;
    gates.forEach((gate,index)=>{gate.visible=lift.moving||lift.at!==index;});
    const openness=lift.moving?Math.max(0,1-lift.age*4):Math.min(1,lift.age*3.2);
    doors.forEach((door,i)=>{door.position.x=(i?1:-1)*(.734+.65*openness);door.visible=openness<.96;});
    if(!root.visible)return;
    incident.visible=activity==='error';
    const elapsed=motion?time-started:0;
    const target=stages[activity].level;
    const nearby=player&&Math.abs(player.x-plot.x-shaft.x)<3&&Math.abs(player.z-plot.z-shaft.z)<3.7;
    for(const paint of rackLights){
      paint.emissive.setHex(activity==='error'?0xfb3451:model.test_result==='success'?0x62ec74:0x65bce4);
      paint.emissiveIntensity=activity==='error'||activity==='run_tests'?1.5+1.5*Math.cos(elapsed*4.7)**2:1.1;
    }
    for(const npc of crew){
      const {index,actor}=npc;
      const riding=index===4&&ride(npc,time,dt,motion,nearby);
      let walking=false;
      let typing=false;
      npc.paper.visible=false;
      npc.cup.visible=activity==='idle'&&index<3||activity==='write_code'&&index===1;
      npc.packet.visible=activity==='deploy_report'&&(index===4||index===0);
      if(!riding){
        let [x,z]=placements[activity][index];
        let level=target;
        if(activity==='deploy_report'&&index===4){x=2.35;z=1.25;}
        if(activity==='read_files'&&index<2){
          const p=(elapsed*.24+index*.38)%1;
          const lane=p<.12?0:p<.5?(p-.12)/.38:p<.62?1:1-(p-.62)/.38;
          const dx=1.0+index*.8-x;
          const dz=1.1-z;
          x=x+dx*lane;
          z=z+(1.1-z)*lane;
          npc.paper.visible=p>=.11&&p<.62;
          walking=p>.12&&p<.5||p>.62;
          actor.rotation.y=Math.atan2(dx,dz*facing)+(p>.62?Math.PI:0);
        }
        actor.position.set(x,floors[level],facing*z);
        typing=activity==='write_code'&&[0,2,3].includes(index);
        if(activity!=='read_files'||index>=2)actor.rotation.y=typing?yaw+Math.PI:yaw+(index%2?-.62:.24);
      }else{
        walking=courier.mode!=='ride';
        actor.rotation.y=courier.mode==='approach'?-Math.PI/2:yaw+(courier.mode==='board'?Math.PI:0);
      }
      actor.visible=selected===null||Math.abs(actor.position.y-floors[selected])<.22;
      const carrying=npc.paper.visible||npc.packet.visible||npc.cup.visible;
      const mode=typing?'typing':walking?(carrying?'carry-walk':'walk'):carrying?'carry':
        activity==='error'||activity==='run_tests'?'gesture':'idle';
      const close=player&&Math.hypot(player.x-plot.x-actor.position.x,player.z-plot.z-actor.position.z)<3.3;
      npc.bubble.near(close);
      if(actor.visible)npc.rig.update(motion?dt:0,mode,1.55,elapsed);
    }
  }

  function textures(){
    const subject=(model.subject??'').slice(0,37);
    const words={
      read_files:['📂 Несёт '+(subject||'папку'),'📂 Ищет в архиве','Сверяет файлы','Проверяет список','Едет в архив'],
      write_code:['⌨️ Кодит '+(subject||'задачу'),'☕ Смотрит код','Пишет изменения','Сверяет diff','Едет в офис'],
      run_tests:[model.test_count==null?'🧪 Запускает тесты':'🧪 Проверки: '+model.test_count,
        model.test_result==='success'?'✅ Тесты прошли':'Смотрит сборку','Проверяет стойку','Сверяет результаты','Едет на проверку'],
      deploy_report:['📦 Собирает отчёт','Готовит публикацию','Сверяет результат','Проверяет пакет','📦 Несёт отчёт'],
      error:['⚠ Разбирает ошибку','Смотрит журнал','Уточняет сбой','Обсуждает исправление','Едет на разбор'],
      idle:['☕ Пьёт кофе','Перерыв','У кулера','Обсуждают планы','Ожидает задачу'],
    }[activity];
    const accent=activity==='error'?'#f87886':activity==='run_tests'&&model.test_result==='success'?'#a2f881':'#8ad7ff';
    crew.forEach((npc,i)=>npc.bubble.show(words[i],accent));
    for(const {index,board} of dashboards)board.show(index===stages[activity].level?activity:'idle',model,index+1);
    for(const {index,display} of faces){
      const chosen=index===stages[activity].level;
      display.show(chosen?(model.title||stages[activity].label):'',chosen?model:undefined);
    }
  }
  return { plot, root, floors, set, show, collision, walkHeights, info, request, update, textures,
    get activity(){return activity;}, get floor(){return stages[activity].level;}, get level(){return lift.at;} };
}
