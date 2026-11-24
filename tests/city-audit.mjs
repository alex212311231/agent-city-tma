import { mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { inspectScene } from './inspect-scene.mjs';
import { verifyCommute } from './verify-commute.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    baseline: { type: 'boolean' },
    screenshots: { type: 'string' },
    'min-fps': { type: 'string' },
  },
});
const url = positionals[0] ?? 'http://127.0.0.1:8765/';
const minFps = values['min-fps'] === undefined ? null : Number(values['min-fps']);
if (minFps !== null && !(Number.isFinite(minFps) && minFps > 0)) throw new Error('--min-fps must be a positive number');

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CITY_PLAYWRIGHT || 'playwright');
const defaultChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const executablePath = process.env.CITY_CHROME || (existsSync(defaultChrome) ? defaultChrome : undefined);
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: process.platform === 'win32' ? ['--use-angle=d3d11'] : undefined,
});

const screens = values.screenshots ? resolve(values.screenshots) : null;
if (screens) mkdirSync(screens, { recursive: true });

const layouts = {
  desktop: { viewport:{ width:1280, height:800 } },
  mobile: { viewport:{ width:390, height:844 }, hasTouch:true, isMobile:true, deviceScaleFactor:2 },
};
const statuses = [];
const errors = [];
let sceneReport;

async function frameRate(page) {
  await page.waitForTimeout(400);
  return page.evaluate(() => new Promise(resolve => {
    const durations = [];
    let previous;
    let started;
    function frame(now) {
      started ??= now;
      if (previous !== undefined) durations.push(now-previous);
      previous = now;
      if (now-started < 1500) {
        requestAnimationFrame(frame);
        return;
      }
      durations.sort((a,b) => a-b);
      resolve({
        fps: Math.round(durations.length*1000/(now-started)),
        p95Ms: Number(durations[Math.floor(durations.length*.95)].toFixed(1)),
        longFrames: durations.filter(duration => duration > 33.4).length,
        canvasWidth:document.querySelector('canvas').width,
      });
    }
    requestAnimationFrame(frame);
  }));
}

async function screenshot(page, name) {
  if (screens) await page.screenshot({ path:join(screens,name+'.png'), animations:'disabled' });
}

async function auditLayout(kind, options) {
  const page = await browser.newPage(options);
  const failed = [];
  const warnings = [];
  const assets = new Set();
  const ui = [];
  const mode = kind === 'mobile' ? 'tap' : 'click';
  function record(message) { failed.push(message); }

  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  session.on('Network.loadingFailed', event => {
    if (event.corsErrorStatus || event.blockedReason) record(['blocked request', event.corsErrorStatus?.corsError ?? event.blockedReason]);
  });
  page.on('pageerror', error => record(['page',error.message]));
  page.on('console', message => {
    if (message.type() === 'error') record(['console',message.text()]);
    if (message.type() === 'warning') warnings.push(message.text());
  });
  page.on('requestfailed', request => {
    const reason = request.failure()?.errorText;
    if (reason !== 'net::ERR_ABORTED') record(['request',request.url(),reason]);
  });
  page.on('response', response => {
    if (response.status() >= 400) record(['http',response.status(),response.url()]);
    if (response.ok() && response.url().includes('/public/assets/')) assets.add(new URL(response.url()).pathname);
  });

  if (kind === 'desktop') {
    await page.route(candidate => candidate.pathname.endsWith('/city-world.mjs'), async route => {
      const response = await route.fetch();
      const source = await response.text();
      const start = 'renderer.setAnimationLoop(render);';
      if (!source.includes(start)) {
        record(['audit injection point missing', 'city-world.mjs render loop']);
        await route.fulfill({ response });
        return;
      }
      const hooks = `
        window.cityAudit={THREE,scene,actors,rooms,places,navigation,travel,walls,bounding,update,
          advance(seconds) {
            const savedRender=pipeline.render;
            pipeline.render=()=>{};
            try {
              for(let ticks=Math.ceil(seconds/.15);ticks>0;ticks--)render((last+.15)*1000);
            } finally {
              last=performance.now()/1000;
              pipeline.render=savedRender;
            }
          }};
      `;
      await route.fulfill({ response, body:source.replace(start,start+hooks) });
    });
  }

  async function action(label, selector, expected) {
    try {
      await page.locator(selector)[mode]({ timeout:4500 });
      await page.waitForFunction(expected,null,{ timeout:3500 });
    } catch (error) {
      ui.push([label,error.message.split('\n')[0]]);
    }
  }

  try {
    const response = await page.goto(url,{ waitUntil:'domcontentloaded' });
    if (!response?.ok()) throw new Error('City entry point did not return 2xx');
    await page.waitForFunction(() => !document.querySelector('#walk-mode')?.disabled,null,{ timeout:35000 });
    await screenshot(page,kind+'-overview');
    const orbit = await frameRate(page);
    if (kind === 'desktop') {
      sceneReport = await page.evaluate(inspectScene,{ baseline:Boolean(values.baseline) });
      for (const issue of sceneReport.issues) record(['scene',...issue]);
    }
    await action('collapse', '#board-toggle', () => document.querySelector('#board').hidden);
    await action('expand', '#board-toggle', () => !document.querySelector('#board').hidden);
    await action('district selection', '[data-district="hq"]', () => !document.querySelector('#district').hidden);
    await action('city overview', '#overview', () => document.querySelector('#district').hidden);
    if(!values.baseline){
      await action('residential district', '[data-district="lounge"]', () =>
        document.querySelector('#district-name').textContent==='Дома агентов');
      if(screens){
        await page.waitForTimeout(850);
        await screenshot(page,kind+'-homes');
      }
      await action('return from homes', '#overview', () => document.querySelector('#district').hidden);
    }
    await action('walk', '#walk-mode', () => !document.querySelector('#walk-hud').hidden);
    await screenshot(page,kind+'-walk');
    const walk = await frameRate(page);
    if (minFps !== null && Math.min(orbit.fps,walk.fps) < minFps) record(['frame rate below floor',orbit.fps,walk.fps,minFps]);
    await action('orbit', '#orbit-mode', () => document.querySelector('#walk-hud').hidden);
    await action('music on', '#music-toggle', () => document.querySelector('#music-toggle').ariaPressed === 'true');
    await action('music off', '#music-toggle', () => document.querySelector('#music-toggle').ariaPressed === 'false');
    await action('demo', '#demo', () => document.querySelector('#demo').ariaPressed === 'true');
    await screenshot(page,kind+'-demo');
    await action('dismiss demo', '#demo', () => document.querySelector('#demo').ariaPressed === 'false');
    await action('settings', '#settings-toggle', () => document.querySelector('#settings-dialog').open);
    if (kind==='desktop' && !values.baseline) {
      const issues=await page.evaluate(verifyCommute);
      sceneReport.commute={ ok:!issues.length, issues };
      for(const issue of issues) record(['commute',...issue]);
    }
    if (!assets.size) record(['no models or textures reached the app']);
    statuses.push({ kind, assets:assets.size, orbit, walk, warnings:[...new Set(warnings)] });
  } catch (error) {
    record(['audit',error.message]);
  } finally {
    for (const failure of [...failed,...ui.map(issue => ['control',...issue])]) errors.push([kind,...failure]);
    await page.close();
  }
}

try {
  for (const [kind, options] of Object.entries(layouts)) await auditLayout(kind,options);
} finally {
  await browser.close();
}

console.log(JSON.stringify({ url, layouts:statuses, scene:sceneReport, errors },null,2));
if (errors.length) process.exitCode=1;
