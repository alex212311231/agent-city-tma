import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';

export async function limitsText() {
  const fallback = 'Codex пока не вернул остаток лимитов. Попробуй ещё раз чуть позже.';
  try {
    const runtime = process.env.OPENCLAW_STATE_DIR ? dirname(process.env.OPENCLAW_STATE_DIR) : new URL('../runtime/',import.meta.url);
    const path = typeof runtime === 'string' ? join(runtime,'codex-path.txt') : new URL('codex-path.txt',runtime);
    const exe = (await readFile(path,'utf8')).trim();
    const limit = await new Promise((resolve,reject) => {
      const proc = spawn(exe,['app-server','--listen','stdio://'],{windowsHide:true,stdio:['pipe','pipe','ignore']});
      const lines=createInterface({input:proc.stdout});
      const timer=setTimeout(()=>finish(null),10000);
      let ended=false;
      function finish(v) {
        if(ended)return;
        ended=true;clearTimeout(timer);lines.close();proc.stdin.end();proc.kill();resolve(v);
      }
      proc.on('error',()=>finish(null));proc.on('exit',()=>finish(null));proc.stdin.on('error',()=>finish(null));
      const send = v=>proc.stdin.write(JSON.stringify(v)+'\n');
      lines.on('line',line=>{
        let msg; try {msg=JSON.parse(line)}catch{return}
        if(msg.error && msg.id!=null)return finish(null);
        if(msg.id===1){
          send({method:'initialized'});
          send({id:2,method:'account/rateLimits/read',params:{}});
        } else if(msg.id===2)finish(msg.result?.rateLimitsByLimitId?.codex ?? msg.result?.rateLimits);
      });
      send({id:1,method:'initialize',params:{clientInfo:{name:'ai_hub_limits',version:'1.0'},capabilities:{}}});
    });
    if(!limit)return fallback;
    const rows=[];
    for(const w of [limit.primary,limit.secondary]){
      if(!Number.isFinite(w?.usedPercent))continue;
      const period = w.windowDurationMins===300?'5 часов':w.windowDurationMins===10080?'Неделя':w.windowDurationMins+' мин';
      const reset = w.resetsAt ? ' · до '+new Date(w.resetsAt*1000).toLocaleString('ru-RU',{timeZone:'Asia/Yekaterinburg',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
      rows.push(period+' · осталось '+Math.max(0,100-w.usedPercent)+'%'+reset);
    }
    return rows.length ? ['Лимиты Codex · Екатеринбург',...rows].join('\n') : fallback;
  } catch {return fallback;}
}
