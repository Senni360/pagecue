import {test} from 'node:test';
import assert from 'node:assert/strict';
const local = {}, session = {}, events = {}, pageMessages = [];
function area(data) {return {setAccessLevel:async()=>{},set:async values=>Object.assign(data,values),get:async keys=>{if(typeof keys==='string')keys=[keys];return Object.fromEntries(keys.filter(k=>k in data).map(k=>[k,data[k]]));}};}
const extensionOrigin = 'chrome-extension://'+'a'.repeat(32)+'/';
const fixture = {id:7,url:'https://example.org/lesson'};
globalThis.chrome = {
  storage:{local:area(local),session:area(session)},
  offscreen:{hasDocument:async()=>true},
  runtime:{id:'a'.repeat(32),getURL:p=>extensionOrigin+p,onMessage:{addListener:fn=>events.message=fn},onInstalled:{addListener:()=>{}},onStartup:{addListener:()=>{}},sendMessage:async()=>({ok:true})},
  action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
  tabs:{query:async()=>[fixture],sendMessage:async(id,message)=>{pageMessages.push(message);return {ok:true,pageUrl:fixture.url};}},
  commands:{onCommand:{addListener:fn=>events.command=fn}},
  alarms:{create:()=>{},onAlarm:{addListener:()=>{}}},
  downloads:{download:async()=>42,onChanged:{addListener:()=>{}}},
  tabCapture:{getMediaStreamId:async()=>{throw new Error('Chrome requires activation');}}
};
let submitted, jobStatus={status:'running'};
globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/jobs/ask')){submitted=JSON.parse(options.body);return {ok:true,json:async()=>({id:'job1'})};}
  return {ok:true,json:async()=>url.endsWith('/health')?{ok:true}:jobStatus};
};
await import('../extension/background.js');
const pageSender={id:chrome.runtime.id,tab:fixture,frameId:0,url:fixture.url};
const uiSender={id:chrome.runtime.id,url:extensionOrigin+'popup.html'};
function dispatch(message,sender=uiSender){return new Promise(resolve=>events.message(message,sender,resolve));}

test('actual background routes selected text, prevents duplicates, saves results, and isolates context', async()=>{
  local.token='test';local.useTranscript=true;
  local.history=[{id:'other',kind:'transcript',pageUrl:'https://example.org/other',text:'WRONG SOURCE'}];
  assert.equal((await dispatch({type:'ask',text:'Which option?',pageUrl:fixture.url},pageSender)).ok,true);
  assert.deepEqual(submitted,{question:'Which option?',context:''});
  assert.match((await dispatch({type:'ask',text:'Duplicate?',pageUrl:fixture.url},pageSender)).error,/current/);
  jobStatus={status:'done',text:'B. Four'};
  await dispatch({type:'poll'});
  assert.equal(local.activeJob,null);assert.equal(local.history[0].text,'B. Four');
  local.history.unshift({id:'same',kind:'transcript',pageUrl:fixture.url,source:'Lesson audio',text:'RIGHT SOURCE'});
  jobStatus={status:'running'};
  await dispatch({type:'ask',text:'Next question?',pageUrl:fixture.url},pageSender);
  assert.equal(submitted.context,'RIGHT SOURCE');
  assert.ok(pageMessages.some(m=>m.text?.includes('Lesson audio')));
  jobStatus={status:'error',error:'Quota reached'};await dispatch({type:'poll'});
  assert.equal(local.activeJob,null);assert.equal(local.lastError,'Quota reached');
});
test('page scripts cannot invoke privileged clipboard, history, or job-completion handlers',async()=>{
  for(const type of ['snapshot','copy','job-submitted','media-action'])assert.equal((await dispatch({type},pageSender)).ok,false);
});
test('capture authorization failures leave no orphaned active job',async()=>{
  const result=await dispatch({type:'record-toggle'},pageSender);
  assert.match(result.error,/Alt\+Shift\+T/);assert.equal(local.activeJob,null);
});
