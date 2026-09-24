import test from 'node:test';
import assert from 'node:assert/strict';
const state={schemaVersion:3,history:[],transcripts:[{id:'old',text:'Old source',title:'Old',source:'old audio'}],activeTranscriptId:'old',providerConfig:{answer_provider:'openai',audio_provider:'openai',openai_key:'fake'}};
let handler;const messages=[];const listeners=()=>({addListener(){}});
globalThis.indexedDB={open(){const r={result:{}};queueMicrotask(()=>r.onsuccess());return r;}};
globalThis.chrome={windows:{onRemoved:listeners()},storage:{local:{async setAccessLevel(){},async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(state[k])]))},async set(values){Object.assign(state,structuredClone(values))}},session:{async get(){return {}},async set(){}}},runtime:{id:'test-extension',getURL:path=>'chrome-extension://test-extension/'+path,onMessage:{addListener(fn){handler=fn}},onInstalled:listeners(),onStartup:listeners(),async sendMessage(m){messages.push(m);return {ok:true}}},tabs:{async query(){return [{id:7,url:'https://fixture.test/',windowId:1,title:'Fixture'}]},async sendMessage(){return {ok:true}},onRemoved:listeners()},offscreen:{async hasDocument(){return true}},action:{async setBadgeText(){},async setBadgeBackgroundColor(){}},alarms:{onAlarm:listeners()},commands:{onCommand:listeners()},downloads:{onChanged:listeners()}};
await import('../extension/background.js');
const sender={id:'test-extension',url:chrome.runtime.getURL('popup.html')};
const worker={id:'test-extension',url:chrome.runtime.getURL('offscreen.html')};
const page={id:'test-extension',url:'https://fixture.test/',tab:{id:7,url:'https://fixture.test/',windowId:1},frameId:0};
function send(m,s=sender){return new Promise(resolve=>handler(m,s,resolve));}
await test('QA pins explicitly active transcript rather than latest history',async()=>{assert.deepEqual(await send({type:'qa-start'},page),{ok:true});assert.equal(state.activeJob.context,'Old source');assert.equal(state.activeJob.transcriptId,'old');});
await test('Accidental ST preserves in-progress QA and previous transcript',async()=>{const run=state.activeJob.runId;const r=await send({type:'guided-start'},page);assert.equal(r.ok,false);assert.equal(state.activeJob.runId,run);assert.equal(state.activeTranscriptId,'old');});
await test('Cancel clears active operation but retains selected transcript',async()=>{assert.deepEqual(await send({type:'cancel'}),{ok:true});assert.equal(state.activeJob,null);assert.equal(state.activeTranscriptId,'old');});
await test('Late worker answer after cancellation is ignored',async()=>{const r=await send({type:'worker-event',runId:state.lastJob.runId,event:'answer',result:{text:'stale answer'}},worker);assert.equal(r.ok,false);assert.equal(state.history.length,0);});
await test('Content script cannot read snapshots or credentials',async()=>{assert.equal((await send({type:'snapshot'},page)).ok,false);assert.equal((await send({type:'provider-config'},page)).ok,false);});
await test('Provider configuration exposes presence, never key',async()=>{const c=await send({type:'provider-config'});assert.equal(c.openai_key,true);assert.ok(!JSON.stringify(c).includes('fake'));});
await test('New transcription is recoverable before answer succeeds without replacing active source',async()=>{state.activeJob={runId:'new',audioId:'audio-new',media:{url:'https://fixture.test/audio.wav'},source:'new audio',title:'New',tabId:7};await send({type:'worker-event',runId:'new',event:'transcript',text:'New source'},worker);assert.equal(state.activeTranscriptId,'old');assert.equal(state.transcripts[0].text,'New source');await send({type:'worker-event',runId:'new',event:'error',error:'HTTP 429'},worker);assert.equal(state.activeTranscriptId,'old');assert.equal(state.lastJob.context,'New source');});
await test('Retry failed answer reuses transcription, then switches active source on success',async()=>{state.lastJob.question='What?';assert.equal((await send({type:'retry'})).ok,true);assert.equal(state.activeJob.phase,'answering');const runId=state.activeJob.runId;assert.equal(state.activeJob.context,'New source');await send({type:'worker-event',runId,event:'answer',result:{text:'New answer'}},worker);assert.equal(state.activeTranscriptId,'new');assert.equal(state.previousTranscriptId,'old');assert.equal(state.history[0].transcriptId,'new');});

await test('YouTube captions are saved before question and do not need transcription credentials',async()=>{
  state.providerConfig.audio_provider='openrouter';delete state.providerConfig.openrouter_key;
  assert.equal((await send({type:'guided-start'},page)).ok,true);
  const runId=state.activeJob.runId;
  assert.equal((await send({type:'guided-media',runId,media:{id:'yt',url:'https://www.youtube.com/watch?v=abcdefghijk',label:'YouTube',pageUrl:page.url}},page)).ok,true);
  assert.equal(state.activeJob.phase,'fetching-captions');
  assert.equal(messages.at(-1).type,'youtube-captions');
  const activeBefore=state.activeTranscriptId;
  await send({type:'worker-event',runId,event:'youtube-captions',videoId:'abcdefghijk',language:'en',generated:true,title:'Clip',text:'[00:00] Caption source',segments:[{start:0,duration:2,text:'Caption source'}]},worker);
  assert.equal(state.activeJob.phase,'select-question');assert.equal(state.transcripts[0].videoId,'abcdefghijk');assert.equal(state.transcripts[0].audioId,null);
  assert.equal(state.activeTranscriptId,activeBefore);
  await send({type:'cancel'});
  assert.equal(state.transcripts[0].text,'[00:00] Caption source');
});
await test('Cancelled YouTube request ignores late captions and failures preserve active transcript',async()=>{
  await send({type:'guided-start'},page);let runId=state.activeJob.runId;
  const media={id:'yt',url:'https://www.youtube.com/watch?v=abcdefghijk',label:'YouTube',pageUrl:page.url};
  await send({type:'guided-media',runId,media},page);await send({type:'cancel'});
  const count=state.transcripts.length,active=state.activeTranscriptId;
  assert.equal((await send({type:'worker-event',runId,event:'youtube-captions',videoId:'abcdefghijk',text:'late'},worker)).ok,false);
  assert.equal(state.transcripts.length,count);
  await send({type:'guided-start'},page);runId=state.activeJob.runId;await send({type:'guided-media',runId,media},page);
  await send({type:'worker-event',runId,event:'error',error:'No accessible captions'},worker);
  assert.equal(state.activeJob,null);assert.equal(state.activeTranscriptId,active);assert.equal(state.transcripts.length,count);
});
