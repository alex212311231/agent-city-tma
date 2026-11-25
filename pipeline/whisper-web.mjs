// Local Whisper CPU inference using Chrome's WebAssembly runtime.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const [wav, model, destination] = process.argv.slice(2);
const modulePath = createRequire(import.meta.url).resolve('@remotion/whisper-web/main');
const prefix = '/' + randomUUID() + '/';
const files = new Map([['main.js',[modulePath,'text/javascript']], ['audio',[wav,'audio/wav']], ['model',[model,'application/octet-stream']]]);
const server = createServer(async (req,res) => {
  if (!req.url.startsWith(prefix)) {res.writeHead(404).end();return;}
  res.setHeader('cross-origin-opener-policy','same-origin');
  res.setHeader('cross-origin-embedder-policy','require-corp');
  const name = req.url.slice(prefix.length);
  if (!name) {res.writeHead(200,{'content-type':'text/html'}).end('<!doctype html><meta charset=utf-8>');return;}
  const entry = files.get(name);
  if (!entry) {res.writeHead(404).end();return;}
  try { res.writeHead(200,{'content-type':entry[1]}).end(await readFile(entry[0])); }
  catch {res.destroy();}
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser = await chromium.launch(process.env.CONTENT_CHROME ? {executablePath:process.env.CONTENT_CHROME} : {channel:'chrome'});
  const page = await browser.newPage();
  page.on('pageerror', error => console.error(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port+prefix);
  const data = await page.evaluate(async () => {
    const {default:createModule} = await import('./main.js');
    const bytes = async name => (await fetch(name)).arrayBuffer();
    const pcm = new OfflineAudioContext(1,1,16000);
    const [wave,weights] = await Promise.all([bytes('audio').then(data => pcm.decodeAudioData(data)),bytes('model')]);
    let done;
    const completion = new Promise(resolve => {done=resolve;});
    const handle = line => {
      if (line.startsWith('remotion_final:')) done(JSON.parse(line.slice('remotion_final:'.length)));
    };
    const engine = await createModule({print:handle,printErr:handle});
    engine.FS_createDataFile('/','tiny.bin',new Uint8Array(weights),true,true);
    engine.full_default('tiny.bin',wave.getChannelData(0),'tiny','ru',4,false);
    return completion;
  });
  if (!data.transcription?.length) throw Error('Whisper returned an empty transcript');
  await writeFile(destination,JSON.stringify(data),'utf8');
} finally { await browser?.close();server.close(); }

