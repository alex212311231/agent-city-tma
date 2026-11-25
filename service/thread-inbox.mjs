import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const result = (status, info) => ({ status, info });
function execute(exe, args, timeout = 18000) {
  return new Promise(resolve => {
    const p = spawn(exe, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let timedOut = false;
    const take = chunk => { output = (output + chunk).slice(-5000); };
    p.stdout.on('data',take);
    p.stderr.on('data',take);
    const timer = setTimeout(() => { timedOut = true; p.kill(); },timeout);
    p.once('error', () => { clearTimeout(timer); resolve({code:-1,output:''}); });
    p.once('close', code => { clearTimeout(timer); resolve({code,output,timedOut}); });
  });
}

export function createInbox(runtime, run = execute) {
  const db = new DatabaseSync(join(runtime, 'thread-inbox.sqlite'));
  db.exec("CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, hash TEXT NOT NULL, state TEXT NOT NULL, at INTEGER NOT NULL)");
  const read = db.prepare('SELECT hash,state FROM deliveries WHERE id=?');
  const put = db.prepare('INSERT INTO deliveries VALUES(?,?,?,?)');
  const set = db.prepare('UPDATE deliveries SET state=? WHERE id=?');
  const del = db.prepare('DELETE FROM deliveries WHERE id=?');
  const label = 'Эта беседа Codex';
  return async input => {
    const { requestId, task } = input ?? {};
    if (!uuid.test(requestId ?? '') || typeof task !== 'string' || !task.trim() || task.length > 12000 || task.includes('\0')) {
      return result(400,{error:'Пришлите текст задания.'});
    }
    let thread, exe;
    try {
      [thread,exe] = (await Promise.all(['owner-thread.txt','codex-path.txt'].map(name => readFile(join(runtime,name),'utf8')))).map(v => v.trim());
      if (!uuid.test(thread)) throw new Error('thread');
    } catch { return result(503,{error:'Привязка беседы Codex не настроена.'}); }
    const hash = createHash('sha256').update(thread).update('\0').update(task).digest('hex');
    const known = read.get(requestId);
    if (known) {
      if (known.hash !== hash) return result(409,{error:'Конфликт идентификатора сообщения.'});
      if (known.state === 'pending') return result(409,{error:'Доставка проверяется. Перед повторной отправкой проверьте очередь этой беседы.'});
      return result(200,{label,duplicate:true,queued:true,wakeConfirmed:known.state==='accepted'});
    }
    put.run(requestId,hash,'pending',Date.now());
    // Wake up the packaged daemon after a Windows restart, without creating a second turn.
    const daemon = await run(exe,['app-server','daemon','version'],6000);
    if (daemon.code !== 0) await run(exe,['app-server','daemon','start'],25000);
    const queued = await run(exe,['queue','--thread',thread,'--resume','--message='+task]);
    if (queued.code === 0) {
      const wake = !/warning|could not resume/i.test(queued.output);
      set.run(wake ? 'accepted' : 'queued',requestId);
      return result(202,{label,queued:true,wakeConfirmed:wake});
    }
    if (queued.timedOut) return result(503,{error:'Codex не подтвердил приём вовремя. Проверьте очередь беседы перед повтором.'});
    del.run(requestId);
    return result(503,{error:'Codex не принял сообщение. Проверьте доступность рабочего профиля.'});
  };
}

