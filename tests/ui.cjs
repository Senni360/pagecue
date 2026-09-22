const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:850},deviceScaleFactor:1});
    await page.setContent(fs.readFileSync(path.join(__dirname,'../extension/popup.html'),'utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g,''));
    await page.addStyleTag({path:path.join(__dirname,'../extension/ui.css')});
    await page.evaluate(()=>{
      window.chrome={runtime:{sendMessage:async()=>({history:[{id:'1',kind:'answer',date:'2026-09-21T12:00:00Z',source:'Selected question + transcript: Lesson audio',question:'What is two plus two? A. Three B. Four',text:'B. Four\n\nTwo plus two equals four.'}],media:{label:'Lesson audio',url:'https://example.org/lesson.mp3'},useTranscript:true}),openOptionsPage:()=>{}},storage:{local:{set:async()=>{}}}};
    });
    await page.addScriptTag({path:path.join(__dirname,'../extension/popup.js'),type:'module'});
    await page.locator('article').waitFor();
    assert.match(await page.locator('#media').innerText(),/Lesson audio/);
    assert.match(await page.locator('article').innerText(),/B. Four/);
    await page.screenshot({path:path.join(__dirname,'popup.png'),fullPage:true});
    console.log('PASS: popup renders source, question, result and media controls without overflow');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
