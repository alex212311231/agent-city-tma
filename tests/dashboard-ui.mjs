import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CITY_PLAYWRIGHT || 'playwright');
const root = new URL('../',import.meta.url);
const base = 'https://example.test/office/';
const api = 'https://status.example.test';
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN || undefined});
const errors = [];
const cards = [
  {id:'radar',title:'Радар',status:'ready',items:[{label:'События',value:'3'}]},
  {id:'mail',title:'Почта',status:'unconfigured',items:[]},
  {id:'moex',title:'MOEX',status:'ready',items:[{label:'SBER',value:'295,74',detail:'+0,3%'}]},
];
const fixture = {cards,lead:{name:'ChatGPT Lead',status:'WORKING',task:'Проверяет ролик'},agents:[
  {id:'media',name:'Продакшн',status:'WORKING',task:'Собирает титры',file:'output.mp4',api:'FFmpeg',tokens:0,resources:{seconds:42},events:[{at:'2026-01-01T09:00:00Z',text:'Сборка началась'}]},
]};
try {
  for (const mobile of [false,true]) {
    const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},hasTouch:mobile,isMobile:mobile});
    const page=await ctx.newPage();
    const loaded=[];
    page.on('pageerror',err=>errors.push(err.message));
    page.on('console',msg=>{if(msg.type()==='error') errors.push(msg.text());});
    await page.addInitScript(()=>{window.Telegram={WebApp:{initData:'test-signature',ready(){},expand(){}}};});
    await page.route(base+'**',async route=>{
      const name=new URL(route.request().url()).pathname.split('/').pop() || 'index.html';
      loaded.push(name);
      const body=name==='config.js'?'window.OFFICE_CONFIG={tunnel:"https://status.example.test"}':await readFile(fileURLToPath(new URL(name,root)));
      await route.fulfill({contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript',body});
    });
    let hits=0;const refreshes=[];
    await page.route(api+'/api/dashboard**',async route=>{
      assert.equal(route.request().headers().authorization,'tma test-signature');
      hits++;refreshes.push(new URL(route.request().url()).searchParams.get('refresh'));await route.fulfill({json:fixture});
    });
    await page.goto(base);
    await page.waitForSelector('#connection[data-state=online]');
    assert.equal(await page.locator('#card h2').innerText(),'Радар');
    if(mobile){
      const cdp=await ctx.newCDPSession(page);
      const box=await page.locator('#card').boundingBox();
      const x=box.x+box.width*.22,y=box.y+65;
      for(const [type,dx] of [['touchStart',0],['touchMove',45],['touchMove',100],['touchEnd',100]]){
        await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:x+dx,y}]});
      }
    }else{await page.locator('#pin').click();}
    await page.waitForFunction(()=>document.querySelector('#card h2').textContent==='Почта');
    assert.ok(await page.locator('#saved').isVisible());
    await page.locator('#skip').click();
    assert.match(await page.locator('#card').innerText(),/SBER/);
    await page.getByRole('button',{name:'Открепить Радар'}).click();
    assert.ok(await page.locator('#saved').isHidden());
    await page.locator('#team-tab').click();
    assert.match(await page.locator('#lead').innerText(),/Проверяет ролик/);
    for (const text of ['output.mp4','FFmpeg','Сборка началась','Токены 0']) assert.match(await page.locator('#agents').innerText(),new RegExp(text));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('#data-tab').click();
    assert.equal(new Set(loaded).size,4);
    assert.ok(hits>=2);assert.ok(refreshes.includes('radar'));
    if(process.env.DASHBOARD_SHOTS) await page.screenshot({path:process.env.DASHBOARD_SHOTS+'/'+(mobile?'mobile':'desktop')+'.png'});
    await ctx.close();
    console.log((mobile?'Mobile touch':'Desktop buttons')+' — tabs, pin, refresh, skip, logs, telemetry, width passed');
  }
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
