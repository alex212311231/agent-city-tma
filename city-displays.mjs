function screen(THREE,w,h) {
  const element = document.createElement('canvas');
  element.width = w;
  element.height = h;
  const ctx = element.getContext('2d',{alpha:false});
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({map:texture,toneMapped:false,fog:false});
  return { ctx, texture, material };
}

const schemes = {
  hq: {a:'#052c52', b:'#401190', accent:'#fcc862', white:'#fff3bd'},
  moex: {a:'#0b1243', b:'#0b5faf', accent:'#5ae4ff', white:'#dcf9ff'},
  grants: {a:'#4d064b', b:'#f21778', accent:'#ffbbd0', white:'#fff2f9'},
  dev: {a:'#032c36', b:'#006966', accent:'#72ffe0', white:'#d8fff8'},
};
const font = '"Segoe UI",system-ui,sans-serif';
const mono = 'Consolas,monospace';
const format = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});

export function billboard(THREE,id) {
  const {ctx,texture,material} = screen(THREE,960,540);
  const {a,b,accent,white} = schemes[id];
  const background = document.createElement('canvas');
  background.width=960;
  background.height=540;
  const art=background.getContext('2d');
  const gradient=art.createLinearGradient(0,500,935,0);
  gradient.addColorStop(0,a);
  gradient.addColorStop(1,b);
  art.fillStyle=gradient;
  art.fillRect(0,0,960,540);
  art.fillStyle='#ffffff11';
  for (let x=-395;x<1300;x+=90) {
    art.beginPath();
    art.moveTo(x,540);
    art.lineTo(x+378,0);
    art.lineTo(x+406,0);
    art.lineTo(x+28,540);
    art.fill();
  }
  art.fillStyle='#00000026';
  for (let y=0;y<540;y+=5) art.fillRect(0,y,960,1);
  art.strokeStyle=accent;
  art.lineWidth=4;
  art.strokeRect(13,13,934,514);
  let last=-Infinity;
  let prior;

  function animate(time,state,reduced) {
    if (state===prior && (reduced || time-last<.115)) return;
    prior=state;
    last=time;
    ctx.drawImage(background,0,0);
    const market=state.market;
    const quotes=market?.quotes??[];
    const ticker=quotes.length ? quotes.map(q=>q.symbol+' '+format.format(q.price)+' ₽').join('   /   ') :
      'AI HUB   /   WINTER IN MANHATTAN';
    ctx.fillStyle=accent;
    ctx.font='700 30px '+font;
    ctx.fillText({hq:'42ND ST  /  BROADWAY',moex:'MARKET DATA  /  MOEX',grants:'GRANT RADAR  /  LIVE',dev:'AI HUB  /  LIVE OPERATIONS'}[id],41,67);
    ctx.fillStyle=white;
    if (id==='hq') {
      ctx.font='900 130px '+font;
      ctx.fillText('TIMES',35,188);
      ctx.fillText('SQUARE',31,315);
      ctx.fillStyle=accent;
      ctx.font='750 42px '+font;
      ctx.fillText('С НОВЫМ ГОДОМ, НЬЮ-ЙОРК!',43,408,862);
      for (let i=0;i<30;i++) {
        const x=(i*37+40)%305+620;
        const y=81+(i*77)%282;
        const radius=2+(i%5);
        ctx.globalAlpha=.55+.45*Math.sin(i*3.1+time*1.8)**2;
        ctx.beginPath();
        ctx.arc(x,y,radius,0,Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha=1;
    } else if (id==='moex') {
      ctx.font='900 92px '+font;
      ctx.fillText('MOEX',34,174);
      ctx.fillStyle=accent;
      ctx.font='500 24px '+mono;
      ctx.fillText(market?.source==='iss' ? 'ISS / ДАННЫЕ С ЗАДЕРЖКОЙ' :
        market ? 'ЗАКРЫТИЕ / '+(quotes[0]?.stamp??'').slice(0,10) : 'ОЖИДАЕМ КОТИРОВКИ',44,218);
      ctx.fillStyle=white;
      ctx.font='700 36px '+mono;
      quotes.slice(0,3).forEach((quote,index)=>{
        const y=289+index*58;
        ctx.fillText(quote.symbol,45,y);
        ctx.fillText(format.format(quote.price)+' ₽',230,y);
      });
      ctx.strokeStyle=accent;
      ctx.lineWidth=6;
      ctx.beginPath();
      for (let i=0;i<=31;i++) {
        const x=480+i*14;
        const y=355-i*4.8+Math.sin(i*.72+time*.7)*23+Math.sin(i*3.4)*10;
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.stroke();
      ctx.fillStyle='#ffffff8c';
      ctx.font='500 19px '+mono;
      ctx.fillText('ГРАФИКА ТАБЛО',691,430);
    } else if (id==='grants') {
      ctx.font='900 101px '+font;
      ctx.fillText('RADAR',34,179);
      ctx.strokeStyle=accent;
      ctx.lineWidth=3;
      for(let i=1;i<5;i++){
        ctx.beginPath();
        ctx.arc(765,254,i*35,0,Math.PI*2);
        ctx.stroke();
      }
      const phase=(time*.87)% (Math.PI*2);
      ctx.fillStyle='#ffbacb42';
      ctx.beginPath();
      ctx.moveTo(765,254);
      ctx.arc(765,254,139,phase-.62,phase);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle=white;
      ctx.font='700 40px '+font;
      ctx.fillText(state.jobs?.grants?.detail || 'Ожидает обновления',44,269,535);
      ctx.font='500 25px '+mono;
      const updated=state.jobs?.grants?.updatedAt;
      ctx.fillText(updated ? new Date(updated).toLocaleString('ru-RU') : 'ГРАНТЫ · AI HUB',45,330,530);
    } else {
      ctx.font='900 96px '+font;
      ctx.fillText('LIVE OPS',34,177);
      const roles=Object.entries(state.agents??{});
      const active=roles.filter(([,role])=>role.action!=='idle').length;
      ctx.fillStyle=accent;
      ctx.font='700 40px '+mono;
      ctx.fillText('В РАБОТЕ   '+active+' / '+roles.length,43,244);
      roles.slice(0,5).forEach(([role,activity],index)=>{
        const x=43+index*177;
        ctx.fillStyle=activity.action==='idle'?'#546c7a':accent;
        ctx.fillRect(x,304,135,17);
        ctx.font='700 22px '+mono;
        ctx.fillText(role.toUpperCase(),x,366,140);
      });
    }
    ctx.fillStyle='#041128';
    ctx.fillRect(15,458,929,66);
    ctx.save();
    ctx.beginPath();
    ctx.rect(26,460,906,62);
    ctx.clip();
    ctx.fillStyle=accent;
    ctx.font='700 29px '+mono;
    const line=ticker+'     +++     ';
    const step=ctx.measureText(line).width;
    const scroll=reduced?0:(time*86)%step;
    for(let x=31-scroll;x<949;x+=step)ctx.fillText(line,x,504);
    ctx.restore();
    texture.needsUpdate=true;
  }
  animate(0,{},false);
  return { material,animate };
}

export function monitor(THREE) {
  const {ctx,texture,material}=screen(THREE,950,530);
  const tokens=/(\/\/.*|#.*|'[^']*'|"[^"]*"|\b(?:export|import|const|let|class|function|return|async|await|def|for|from|try|new|assert)\b|\b\d+(?:\.\d+)?\b)/gu;
  let previous;
  function show(title='',entry={}) {
    const code=entry?.code_snippet??'';
    const log=entry?.current_log??'';
    const signature=[title,code,log].join('\u001e');
    if(previous===signature)return;
    previous=signature;
    ctx.fillStyle='#101c2a';
    ctx.fillRect(0,0,950,530);
    ctx.fillStyle='#1b3447';
    ctx.fillRect(0,0,950,66);
    ctx.fillStyle='#9efbe1';
    ctx.font='700 30px '+mono;
    ctx.fillText(title||'AI HUB',29,44,892);
    const rows=[...code.split('\n').filter(Boolean).slice(0,log?7:11),
      ...log.split('\n').filter(Boolean).slice(-4)].slice(0,11);
    if(!rows.length)rows.push('Ожидает код или результаты проверки');
    for(const [i,line] of rows.entries()){
      ctx.font='25px '+mono;
      ctx.fillStyle='#7094a7';
      ctx.fillText(String(i+1),25,105+i*36);
      let x=83;
      for(const [n,part] of line.split(tokens).entries()){
        ctx.fillStyle=n%2?(part.startsWith('//')?'#82ad9a':/^['"]/.test(part)?'#ffd39d':'#98bbff'):'#e6edf7';
        ctx.fillText(part,x,105+i*36);
        x+=ctx.measureText(part).width;
      }
    }
    texture.needsUpdate=true;
  }
  show();
  return { material,show };
}
