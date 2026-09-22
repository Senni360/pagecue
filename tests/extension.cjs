const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const {spawn} = require('node:child_process');
const root = path.resolve(__dirname,'..');
async function waitUntil(fn, message) {for(let i=0;i<80;i++){if(await fn())return;await new Promise(r=>setTimeout(r,150));}throw new Error(message);}
(async () => {
  const python = process.env.PAGECUE_TEST_PYTHON || 'python';
  const fake = spawn(python,[path.join(__dirname,'fake_companion.py')],{windowsHide:true});
  let context, site;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),'pagecue-browser-'));
  try {
    await new Promise((resolve,reject)=>{fake.stdout.once('data',d=>d.toString().includes('READY')?resolve():reject(Error(d.toString())));fake.stderr.once('data',d=>reject(Error(d.toString())));fake.once('error',reject);});
    site = http.createServer((req,res)=> {res.setHeader('Content-Type','text/html');res.end(fs.readFileSync(path.join(__dirname,'fixture.html')));});
    await new Promise(resolve=>site.listen(0,'127.0.0.1',resolve));
    const extension = path.join(root,'extension');
    context = await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
    let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionID = new URL(worker.url()).hostname;
    const errors=[];
    context.on('weberror',e=>errors.push(e.error().message));
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionID}/options.html`);
    await options.locator('#token').fill('pagecue-test-token');
    await options.locator('#save').click();
    await options.locator('#status').filter({hasText:'Connected'}).waitFor();
    const page=await context.newPage(); await page.goto(`http://127.0.0.1:${site.address().port}/`);
    await page.waitForFunction(()=>!!document.querySelector('#question'));
    await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('#question'));const s=getSelection();s.removeAllRanges();s.addRange(range);});
    await page.keyboard.down('a');await page.keyboard.press('q');await page.keyboard.up('a');
    await waitUntil(async()=> (await worker.evaluate(()=>chrome.storage.local.get('history'))).history?.length,'Real extension did not finish the question');
    const {history}=await worker.evaluate(()=>chrome.storage.local.get('history'));
    assert.match(history[0].text,/B\. Four/);assert.match(history[0].question,/two plus two/);assert.equal(history[0].source,'Selected question only');
    const popup=await context.newPage();await popup.goto(`chrome-extension://${extensionID}/popup.html`);
    await popup.locator('article').waitFor();assert.match(await popup.locator('article').innerText(),/B\. Four/);
    await popup.screenshot({path:path.join(__dirname,'popup.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: real Manifest V3 extension loaded, Settings paired, AQ → service worker → Python fake provider → persisted history, popup rendered; no paid calls');
  } finally {
    await context?.close();site?.close();fake.kill();
    // This test owns only the fresh temporary browser profile it created above.
    const resolved=fs.realpathSync(profile), tempRoot=fs.realpathSync(os.tmpdir());
    if(path.dirname(resolved)!==tempRoot || !path.basename(resolved).startsWith('pagecue-browser-')) throw Error('Refusing to remove an unexpected test profile path');
    fs.rmSync(resolved,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exit(1);});
