/* Isolated headless browser QA against our own fixture; never uses the user's browser profile. */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1200,height:950}});
  page.on('pageerror', error => console.error('PAGE ERROR', error.message));
  await page.setContent(fs.readFileSync(path.join(__dirname,'fixture.html'),'utf8'));
  await page.evaluate(() => {
    window.sent = []; window.listener = null;
    window.chrome = {runtime:{sendMessage:async m => {window.sent.push(m);return {ok:true};},onMessage:{addListener:fn => window.listener = fn}}};
  });
  await page.addScriptTag({path:path.join(__dirname,'../extension/content.js')});
  // Pressing AQ in an input must not trigger any request.
  await page.locator('#typing').focus(); await page.keyboard.down('a'); await page.keyboard.press('q'); await page.keyboard.up('a');
  assert.equal(await page.evaluate(() => sent.length),0);
  await page.locator('h1').click();
  await page.evaluate(() => {const range=document.createRange();range.selectNodeContents(document.querySelector('#question'));const s=getSelection();s.removeAllRanges();s.addRange(range);});
  await page.keyboard.down('a'); await page.keyboard.press('q'); await page.keyboard.up('a');
  let sent = await page.evaluate(() => window.sent);
  assert.equal(sent.length,1); assert.equal(sent[0].type,'ask'); assert.match(sent[0].text,/B\. Four/); assert.doesNotMatch(sent[0].text,/Typing should/);
  // Held/repeated keys must not create duplicate jobs.
  await page.keyboard.down('a'); await page.keyboard.down('q'); await page.keyboard.down('q'); await page.keyboard.up('q'); await page.keyboard.up('a');
  assert.equal(await page.evaluate(() => sent.filter(x=>x.type==='ask').length),2);
  await page.evaluate(() => {getSelection().removeAllRanges();listener({type:'select-media'}, {}, ()=>{});});
  const audioBox = await page.locator('#audio').boundingBox();
  await page.mouse.move(audioBox.x + audioBox.width / 2, audioBox.y + audioBox.height / 2);
  await page.mouse.click(audioBox.x + audioBox.width / 2, audioBox.y + audioBox.height / 2);
  sent = await page.evaluate(() => window.sent);
  await page.screenshot({path:path.join(__dirname,'picker-debug.png'),fullPage:true});
  assert.equal(sent.at(-1).type,'media-selected'); assert.equal(sent.at(-1).media.label,'Practice audio');
  await page.keyboard.down('s'); await page.keyboard.press('t'); await page.keyboard.up('s');
  assert.equal((await page.evaluate(() => sent)).at(-1).type,'record-toggle');
  // Source changes must invalidate a previously chosen file.
  const valid = await page.evaluate(async () => {
    const selected=sent.find(x=>x.type==='media-selected').media;
    document.querySelector('#audio').src='changed.wav';
    return new Promise(resolve=>listener({type:'validate-media',...selected}, {}, resolve));
  });
  assert.equal(valid.ok,false);
  await page.evaluate(() => listener({type:'status',kind:'transcript',text:'Recording tab audio · ST to stop'}, {}, ()=>{}));
  await page.screenshot({path:path.join(__dirname,'page-highlights.png'),fullPage:true});
  await browser.close(); console.log('PASS: selected text, no typing triggers, key repeat, media picking, recording shortcut, stale media validation, screenshot');
})().catch(e => {console.error(e);process.exit(1);});
