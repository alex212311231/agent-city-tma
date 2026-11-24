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
  sprite.position.set(lateral,offset,0);sprite.scale.set(5.65,1.37,1);
  parent.add(sprite);
  let signature;
  return { show(text,accent='#87e8ff') {
    const key=text+accent;
    if(signature===key)return;
    signature=key;
    sprite.visible=Boolean(text);
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

export function buildOffice(THREE,plot,displays){
  const unit=new THREE.BoxGeometry();
  const ball=new THREE.SphereGeometry(.192,8,6);
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
  const crew=[];
  const facing=plot.facing;
  const front=shaft.z+facing*shaft.d/2;
  const silver=color('silver');
  const glass=new THREE.MeshStandardMaterial({color:0xa8e4f7,transparent:true,opacity:.29,roughness:.39,depthWrite:false,side:THREE.DoubleSide});
  const amber=new THREE.MeshBasicMaterial({color:0xffdc92,toneMapped:false});
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

  const halfW=10,halfD=9;
  function deck(specs,y){
    const west=shaft.x-shaft.w/2,east=shaft.x+shaft.w/2;
    const north=shaft.z-shaft.d/2,south=shaft.z+shaft.d/2;
    const join=(x1,x2,z1,z2)=>specs.push(['floor',(x1+x2)/2,y,(z1+z2)/2,x2-x1-.008,.16,z2-z1-.008]);
    join(-halfW,west,-halfD,halfD);join(east,halfW,-halfD,halfD);
    join(west,east,-halfD,north);join(west,east,south,halfD);
  }

  function monitor(parent,x,y,z,w,h,index){
    const display=displays.monitor(THREE);
    block(parent,'ink',x,y,z,w+.18,h+.16,.19);
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),display.material);
    mesh.position.set(x,y,z+facing*.103);
    mesh.rotation.y=facing===1?0:Math.PI;
    parent.add(mesh);
    faces.push({index,display});
  }

  for(const [index,level] of floors.entries()){
    const floor=group(root,0,level,0);
    const parts=[];
    floorGroups.push(floor);
    deck(parts,-.093);
    const carpet=index===0?0x526a82:0x526f7c;
    parts.push([carpet,3.45,.025,.65*facing,10.1,.022,9.75],
      [0x718c9b,3.45,.043,.65*facing+4.59,10.01,.010,.13],
      [0x718c9b,3.45,.043,.65*facing-4.59,10.01,.010,.13]);
    for(const side of [-1,1]){
      parts.push(['pale',side*9.81,.54,0,.122,1.08,17.56],
        ['pale',0,.54,side*8.83,19.38,1.08,.128]);
    }
    if(index===0){
      // The entry wall has a clear central doorway on floor one.
      parts.splice(parts.findIndex(part=>part[0]==='pale'&&part[1]===0&&part[3]===facing*8.83),1);
    }
    const ceiling=group(floor);
    const upper=[];
    // The ceiling leaves the shaft open to the next deck and is hidden in the cutaway.
    deck(upper,4.44);
    for(const x of [-4.5,3.4,7])upper.push(['cream',x,4.32,-.1,1.8,.11,15.4]);
    bulk(ceiling,upper);
    ceilings.push(ceiling);
    if(index===0){
      parts.push(['wood',4.3,.63,-4.45*facing,5.25,1.23,1.12],
        ['pale',4.3,1.28,-4.45*facing,5.34,.13,1.25],
        ['blue',6.87,.48,5.7*facing,3.5,.85,1.42],
        ['blue',6.87,1.0,6.27*facing,3.5,.92,.31],
        ['wood',6.03,.39,3.5*facing,2.35,.69,1.23],
        ['pale',6.03,.79,3.5*facing,2.4,.13,1.33],
        ['silver',-2.2,.81,-5.1*facing,1.1,1.59,.72],
        ['lime',-1.1,.27,5.75*facing,.86,.52,.86],
        ['lime',-1.1,.77,5.75*facing,.52,.91,.55],
        ['wine',5.68,.94,3.45*facing,.27,.24,.20]);
      monitor(floor,5.2,1.98,-4.45*facing,.93,.51,index);
      solid.push(worldBox(4.3,level+.63,-4.45*facing,5.25,1.25,1.15));
    } else {
      for(const [x,z] of [[2.35,-2.0],[5.35,-2.0],[4.8,3.8],[-2.4,4.3]]){
        parts.push(['wood',x,1.12,z*facing,2.25,.12,1.33],
          ['ink',x-1.0,.58,z*facing,.12,1.06,1.1],['ink',x+1.0,.58,z*facing,.12,1.06,1.1],
          ['blue',x,.58,(z+1.08)*facing,.64,.64,.73],['pale',x,1.19,(z+.28)*facing,.63,.03,.24]);
        solid.push(worldBox(x,level+.63,z*facing,2.25,1.20,1.31));
      }
      monitor(floor,2.35,1.87,-2.33*facing,1.78,.98,index);
      for(const x of [6.3,8.3]){
        parts.push(['ink',x,1.49,-6.22*facing,1.31,2.92,1.2]);
        for(let s=0;s<6;s++)parts.push(['silver',x,.48+s*.36,-5.575*facing,1.13,.073,.05]);
        solid.push(worldBox(x,level+1.49,-6.22*facing,1.31,2.92,1.2));
      }
      for(const x of [-3.7,-.8]){
        parts.push(['wood',x,1.47,-6.18*facing,2.12,2.92,.82]);
        for(let shelf=0;shelf<4;shelf++){
          parts.push(['pale',x,.43+shelf*.66,-5.70*facing,2.05,.078,.078]);
          for(let b=0;b<5;b++)parts.push([['cream','wine','lime'][b%3],x-.75+b*.37,.62+shelf*.66,-5.65*facing,.23,.32,.25]);
        }
        solid.push(worldBox(x,level+1.47,-6.18*facing,2.12,2.92,.82));
      }
      parts.push(['silver',-6.4,.96,5.9*facing,2.35,1.82,.69],
        ['cream',-6.4,1.88,5.9*facing,2.50,.10,.81],['wine',-6.72,2.14,5.9*facing,.55,.41,.48]);
    }
    bulk(floor,parts);
  }

  const incident=group(floorGroups[1],6.90,2.57,-4.07*facing);
  const incidentGlass=new THREE.MeshBasicMaterial({color:0xf76373,opacity:.34,transparent:true,depthWrite:false});
  block(incident,incidentGlass,0,0,0,2.9,1.29,.030);
  const incidentTitle=bubble(THREE,incident,.10);
  incidentTitle.show('⚠ Разбор ошибки','#ff9299');
  incident.visible=false;
  const signalPaint=new THREE.MeshBasicMaterial({color:0x42bba4,toneMapped:false});
  for(let level=1;level<3;level++){
    const at=floorGroups[level];
    for(const x of [6.3,8.3])for(let i=0;i<5;i++)block(at,signalPaint,x+.39,.48+i*.36,-5.529*facing,.12,.065,.027);
    block(at,signalPaint,8.28,3.13,-6.22*facing,.47,.26,.47);
  }

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
    const body=group(actor);
    const coat=[0x47648d,0x5a927d,0xa56f50,0x8e6890,0xb89060][index];
    block(body,coat,0,1.11,0,.47,.64,.31);
    const head=new THREE.Mesh(ball,color([0xe3af87,0xd89b6e,0xb27955,0xedba97,0xc58961][index]));
    head.position.y=1.62;
    body.add(head);
    const legs=[], arms=[];
    for(const side of [-1,1]){
      const leg=group(body,side*.128,.73,0);
      block(leg,'ink',0,-.325,0,.173,.65,.18); legs.push(leg);
      const arm=group(body,side*.29,1.35,0);
      block(arm,coat,0,-.237,0,.128,.48,.16); arms.push(arm);
    }
    const paper=block(arms[1],new THREE.MeshBasicMaterial({color:0x8be8ff,toneMapped:false}),0,-.49,.14,.39,.16,.33);
    const cup=block(arms[0],'cream',0,-.48,.16,.123,.169,.12);
    const packet=block(arms[1],new THREE.MeshBasicMaterial({color:0xffcf77,toneMapped:false}),0,-.51,.15,.37,.29,.33);
    paper.visible=cup.visible=packet.visible=false;
    const labelOffsets=[[-.60,3.02],[1.15,2.48],[.77,3.48],[-1.14,2.45],[.0,3.18]];
    return {index,actor,body,arms,legs,paper,cup,packet,
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
    floorGroups.forEach((floor,index)=>{floor.visible=selected===null||selected===index;ceilings[index].visible=selected===null;});
  }

  const placements={
    idle:[[7.6,4.8],[5.6,4.9],[7.0,6.82],[-2.3,-3.8],[3.2,-3.6]],
    read_files:[[-3.7,-4.85],[-.7,-4.8],[3.2,1.1],[5.9,1.6],[-2.5,.4]],
    write_code:[[2.35,-.89],[3.80,-.90],[5.35,-.86],[-2.4,3.14],[.48,1.84]],
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
    signalPaint.color.setHex(activity==='error'?0xfd5868:activity==='run_tests'&&model.test_result==='success'?0x93ff83:0x6ce5ea);
    if(activity==='error'||activity==='run_tests')signalPaint.color.multiplyScalar(.68+.32*Math.cos(elapsed*4.7)**2);
    for(const npc of crew){
      const {index,actor}=npc;
      const riding=index===4&&ride(npc,time,dt,motion,nearby);
      let walking=false;
      npc.paper.visible=false;
      npc.cup.visible=activity==='idle'||activity==='write_code'&&index===1;
      npc.packet.visible=activity==='deploy_report'&&(index===4||index===0);
      if(!riding){
        let [x,z]=placements[activity][index];
        let level=target;
        if(activity==='deploy_report'&&index===4){x=2.35;z=1.25;}
        if(activity==='read_files'&&index<2){
          const p=(elapsed*.24+index*.38)%1;
          const lane=p<.12?0:p<.5?(p-.12)/.38:p<.62?1:1-(p-.62)/.38;
          x=x+(1.0+index*.8-x)*lane;
          z=z+(1.1-z)*lane;
          npc.paper.visible=p>=.11&&p<.62;
          walking=p>.12&&p<.5||p>.62;
        }
        actor.position.set(x,floors[level],facing*z);
        actor.rotation.y=index%2?facing*-.62:facing*.24;
      }else walking=courier.mode!=='ride';
      const wave=Math.sin(elapsed*(walking?10.7:4.2)+index*.67);
      const gesture=(activity==='write_code'&&index<2)||activity==='error'||activity==='run_tests';
      npc.legs[0].rotation.x=walking?wave*.45:0;
      npc.legs[1].rotation.x=walking?-wave*.45:0;
      npc.arms[0].rotation.x=npc.cup.visible?-.92:walking?wave*.35:gesture?-.62+wave*.16:-.04;
      npc.arms[1].rotation.x=npc.paper.visible||npc.packet.visible?-1.02:activity==='write_code'&&index===1?-1.36-wave*.17:gesture?-.87-wave*.24:.04;
      npc.body.position.y=walking?Math.abs(wave)*.061:0;
      actor.visible=selected===null||Math.abs(actor.position.y-floors[selected])<.22;
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
    for(const {index,display} of faces){
      const chosen=index===stages[activity].level;
      display.show(chosen?(model.title||stages[activity].label):'',chosen?model:undefined);
    }
  }
  return { plot, root, floors, set, show, collision, walkHeights, info, request, update, textures,
    get activity(){return activity;}, get floor(){return stages[activity].level;}, get level(){return lift.at;} };
}
