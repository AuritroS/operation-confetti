/**
 * Render the actual bundled app without opening a listening socket. Playwright
 * fulfills same-origin requests from a local build, useful in the sandbox.
 * Includes real keyboard/touch gestures, pause, replay and projected framing.
 */
import { build } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';

const OUT = resolve('node_modules/.cache/swing-review');
await build({
  logLevel: 'warn',
  define: { 'import.meta.env.DEV': 'true' },
  build: { outDir: OUT, emptyOutDir: true },
});
mkdirSync('tools/shots', { recursive: true });
const browser = await chromium.launch({ args: [
  '--single-process', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  // The sandbox cannot allocate macOS IOSurfaces for the compositor. WebGL
  // still runs through SwiftShader with software compositing enabled.
  '--disable-gpu-compositing',
] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const errors = [];
const requests = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
context.on('request', (r) => requests.push(r.url()));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp',
  // The Kenney street set shares one external colormap; without this it is
  // served as octet-stream and every road tile renders untextured.
  '.png': 'image/png', '.json': 'application/json' };
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === '/api/health') {
    return route.fulfill({ json: { ok: true, db: false, detail: 'offline browser check' } });
  }
  const file = resolve(OUT, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(OUT + '/') || !existsSync(file)) return route.fulfill({ status: 404, body: 'Missing local review file' });
  return route.fulfill({ body: readFileSync(file), contentType: mime[extname(file)] ?? 'application/octet-stream' });
});
const state = () => page.evaluate(() => window.__skylineReview.snapshot);
const framing = () => page.evaluate(() => window.__skylineReview.framing());
const visible = (p, margin = .95) => p && Math.abs(p[0]) < margin && Math.abs(p[1]) < margin && p[2] < 1;
const press = (direction) => page.keyboard.press({left:'ArrowLeft',right:'ArrowRight',up:'ArrowUp',down:'ArrowDown'}[direction]);
const advanceTo = async (time) => {
  for(let i=0;i<3000&&(await state()).elapsed<time;i++) await page.clock.runFor(100);
};
try {
  await page.clock.install(); await page.goto('https://swing-review.local/');
  await page.waitForFunction(() => !!window.__skylineReview);
  await page.clock.runFor(100);
  const cdp = await context.newCDPSession(page);
  const swipe = async (direction) => {
    const rect = await page.locator('#surface').boundingBox();
    const x=rect.x+rect.width/2, y=rect.y+rect.height*.55;
    const [dx,dy]={left:[-85,0],right:[85,0],up:[0,-85],down:[0,85]}[direction];
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=3;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/3,y:y+dy*i/3}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  assert.equal((await state()).started,false);
  await page.touchscreen.tap(195,450); await page.clock.runFor(100);
  assert.equal((await state()).started,false,'tap is inert');
  await page.screenshot({path:'tools/shots/level2-swipes-ready.png'});
  await swipe('up'); assert.equal((await state()).started,true);
  await swipe('left'); assert.equal((await state()).lane,-1);
  await page.clock.runFor(800);
  await swipe('right'); await page.clock.runFor(120); const midway=await state();
  await swipe('right'); const redirected=await state();
  assert.equal(redirected.lane,1);
  assert.ok(Math.abs(redirected.p.x-midway.p.x)<30*(redirected.elapsed-midway.elapsed)+.05,'double swipe redirects without snapping');
  await swipe('down'); assert.equal((await state()).requestedMode,'run');
  await page.clock.runFor(1800); assert.equal((await state()).phase,'run'); assert.equal((await state()).lane,1);
  await swipe('left'); assert.equal((await state()).mode,'run');
  await swipe('up'); assert.equal((await state()).requestedMode,'swing'); assert.equal((await state()).lane,0);

  await page.keyboard.press('KeyP'); const paused=await state(); await page.clock.runFor(500); assert.deepEqual(await state(),paused);
  await swipe('right'); assert.equal(await page.evaluate(()=>window.__skylineReview.paused),false);

  for(const [width,height] of [[375,667],[390,844],[430,932],[280,653],[768,1024],[1280,800]]) {
    await page.setViewportSize({width,height}); await page.keyboard.press('KeyR'); await page.clock.runFor(50);
    for(const direction of ['left','down','right','right','up','left']) {
      await swipe(direction);
      for(let i=0;i<13;i++) {
        await page.clock.runFor(100); const f=await framing();
        assert.ok(visible(f.player),`${width}x${height} ${direction} player ${f.player}`);
      }
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    console.log(`PASS four swipes, ground/air framing: ${width}x${height}`);
  }
  await page.setViewportSize({width:390,height:844}); await page.keyboard.press('KeyR');
  // Read from the page, never mirrored here: a local copy drifted from the
  // course the moment the route was rebuilt.
  const actions=(await page.evaluate(()=>window.__skylineReview.swipes)).map(s=>[s.time,s.direction]);
  let action=0,maxDraws=0,maxTriangles=0; const captured=new Set(),seen=new Map();
  await swipe('up');action++;
  for(let i=0;i<1600&&!(await state()).complete;i++) {
    const s=await state();
    while(action<actions.length&&s.elapsed>=actions[action][0]) await swipe(actions[action++][1]);
    const f=await framing();maxDraws=Math.max(maxDraws,f.draws);maxTriangles=Math.max(maxTriangles,f.triangles);
    assert.ok(visible(f.player),`route player at ${s.elapsed}: ${f.player}`);
    for(const e of f.entities) if(visible(e.point)&&!seen.has(e.id)) seen.set(e.id,s.elapsed);
    for(const [name,time] of [['swing',6],['descent',10.8],['run',12.6],['launch',16.7],['left-run',28]]) {
      if(s.elapsed>=time&&!captured.has(name)) {await page.screenshot({path:`tools/shots/level2-swipes-${name}.png`});captured.add(name);}
    }
    await page.clock.runFor(50);
  }
  assert.equal((await state()).complete,true);
  assert.equal(await page.locator('#hud-score').textContent(),'600');
  assert.equal((await page.evaluate(()=>window.__skylineReview.events)).filter(e=>e.t==='incident').length,0);
  // 15,000 was the ceiling while the level was untextured primitives. The
  // agreed budget for the real street is 60,000 triangles and 60 draws, set
  // before the asset work started so this stays pass/fail rather than a
  // judgement at review time.
  assert.ok(maxDraws<=60&&maxTriangles<=60000,`${maxDraws} draws / ${maxTriangles} triangles`);
  // Read from the page, never mirrored: a local copy of the entity times
  // drifted the moment the route was rebuilt.
  for(const {id,time} of await page.evaluate(()=>window.__skylineReview.hazards)) {
    assert.ok(seen.has(id),`${id} is visible`);
    assert.ok(time-seen.get(id)>=2,`${id} warning ${(time-seen.get(id)).toFixed(2)}s`);
  }
  console.log('PASS real-touch 600-point course, two-second warnings, workload:',{maxDraws,maxTriangles});

  await page.locator('#btn-replay').click();assert.equal((await state()).started,false);
  await swipe('down');await advanceTo(13);await swipe('up');
  assert.equal((await state()).pendingLaunch,true);
  assert.equal(await page.locator('#skyline-action').textContent(),'Swing selected');
  await page.screenshot({path:'tools/shots/level2-swipes-clearance.png'});
  await page.clock.runFor(700);assert.equal((await state()).p.y,1.25);
  await page.clock.runFor(1800);assert.equal((await state()).pendingLaunch,false);assert.ok((await state()).p.y>4);

  await page.keyboard.press('KeyR');await press('up');await advanceTo(7.1);
  assert.equal((await page.evaluate(()=>window.__skylineReview.events)).filter(e=>e.t==='incident').length,1);
  const z=(await state()).p.z;await swipe('right');await page.clock.runFor(200);assert.ok((await state()).p.z>z);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  const blurred=await state();await page.clock.runFor(500);assert.deepEqual(await state(),blurred);
  await page.goto('https://swing-review.local/?level=1&clean&layers=none');await page.clock.runFor(600);
  assert.equal(await page.locator('body').getAttribute('data-level'),null);
  assert.equal(await page.locator('#btn-replay').count(),0);
  assert.match(await page.locator('#debug').textContent(),/stage\s+1\/3/);
  assert.deepEqual(errors,[]);
  console.log('PASS persistent modes, mid-swipe redirection, queued launch, damage, pause/replay and level 1.');
} catch(e) {
  console.error('Browser errors:',errors);console.error('State:',await state().catch(()=>null));
  await page.screenshot({path:'tools/shots/level2-swipes-failure.png'}).catch(()=>{});throw e;
} finally {await browser.close();}
