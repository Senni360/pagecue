import {isYouTubeWrapper} from './youtube-selection.js';
import {youtubeId} from './youtube.js';
import {mediaURL} from './core.js';
import {cropScreenshot,validRegion} from './guided.js';
import {defaults,validateConfig} from './providers.js';
import {audioStore} from './audio-store.js';
let creating,queue=Promise.resolve();
const ready=(async()=>{
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  const d=await chrome.storage.local.get(['schemaVersion','history','transcripts']);
  if(d.schemaVersion!==3){const transcripts=d.transcripts||(d.history||[]).filter(x=>x.kind==='transcript');await chrome.storage.local.set({schemaVersion:3,transcripts,activeTranscriptId:transcripts[0]?.id||null,activeJob:null});}
})();
function serial(fn){const result=queue.then(()=>ready).then(fn);queue=result.catch(()=>{});return result;}
async function page(tabId,message,frameId){let timer;try{return await Promise.race([chrome.tabs.sendMessage(tabId,message,frameId===undefined?{}:{frameId}),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),3000);})]);}catch{return null;}finally{clearTimeout(timer);}}
async function offscreen(){if(await chrome.offscreen.hasDocument())return;if(!creating)creating=chrome.offscreen.createDocument({url:'offscreen.html',reasons:['BLOBS','CLIPBOARD'],justification:'Download selected audio blobs and process user requests while the popup is closed.'}).finally(()=>creating=null);await creating;}
async function active(){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab||!/^https?:/.test(tab.url||''))throw new Error('Open a normal web page first.');return tab;}
async function getJob(){return (await chrome.storage.local.get('activeJob')).activeJob;}
async function setJob(job){await chrome.storage.local.set({activeJob:job,lastError:''});}
async function config(){const saved=(await chrome.storage.local.get('providerConfig')).providerConfig||{};return {...defaults,...saved,openrouter_model:saved.openrouter_model||defaults.openrouter_model};}
async function status(job,text,error=false){await chrome.action.setBadgeText({text:error?'!':text.startsWith('Ready')?'OK':job?'...':''});await chrome.action.setBadgeBackgroundColor({color:error?'#bd4545':'#4c5bd4'});if(job?.tabId!=null)await page(job.tabId,{type:'status',text,error,kind:job.phase==='fetching'||job.phase==='transcribing'?'transcript':'answer'});}
async function fail(job,error){if((await getJob())?.runId!==job.runId)return;await chrome.storage.local.set({activeJob:null,lastJob:job,lastError:error});await status(job,error,true);}
async function cancel(){const job=await getJob();if(!job)return;await chrome.storage.local.set({activeJob:null,lastJob:job,lastError:'Cancelled. Your saved transcripts are unchanged.'});if(await chrome.offscreen.hasDocument())await chrome.runtime.sendMessage({target:'offscreen',type:'abort',runId:job.runId});await page(job.tabId,{type:'guided-cancelled',runId:job.runId});await status(null,'');}
async function begin(tab,reuse=false){
  if(await getJob())throw new Error('An operation is active. Escape cancels it; your saved transcript is safe.');
  validateConfig(await config(),false);
  const d=await chrome.storage.local.get(['transcripts','activeTranscriptId']);const transcript=d.transcripts?.find(x=>x.id===d.activeTranscriptId);
  if(reuse&&!transcript)throw new Error('Select audio with ST first, or restore a transcript from recovery.');
  const job={guided:true,runId:crypto.randomUUID(),audioId:crypto.randomUUID(),kind:reuse?'answer':'transcript',phase:reuse?'select-question':'select-media',tabId:tab.id,pageUrl:tab.url,title:tab.title||tab.url,started:Date.now(),context:reuse?transcript.text:'',transcriptId:reuse?transcript.id:null,source:reuse?transcript.source:''};
  await setJob(job);
  if(!await page(tab.id,{type:reuse?'guided-question':'guided-pick-media',runId:job.runId,source:job.source,reuse},reuse?0:undefined))await fail(job,'Refresh the page after reloading PageCue.');
}
async function match(m,s,phase){const job=await getJob();if(!job||job.runId!==m.runId||s.tab&&!s.url?.startsWith(chrome.runtime.getURL(''))&&job.tabId!==s.tab.id||phase&&job.phase!==phase)throw new Error('This selection is no longer active.');return job;}
async function dispatch(job){
  validateConfig(await config(),!job.context);
  await offscreen();job={...job,phase:job.context?'answering':'fetching',heartbeat:Date.now()};await setJob(job);
  const result=await chrome.runtime.sendMessage({target:'offscreen',type:'execute',job,config:await config()});
  if(!result?.ok)await fail(job,result?.error||'The browser worker is unavailable. Retry from recovery.');
}
async function prepare(job){
  if(job.context){await dispatch(job);return;}
  if(!job.retry){const valid=await page(job.tabId,{type:'validate-media',...job.media},job.mediaFrameId);if(!valid?.ok)throw new Error('The selected audio changed. Press ST and select it again.');}
  const url=mediaURL(job.media.url);const origin=new URL(url).origin+'/*';
  if(!await chrome.permissions.contains({origins:[origin]})){
    await setJob({...job,phase:'awaiting-media-access',mediaOrigin:origin});
    const permissionWindow=await chrome.windows.create({url:chrome.runtime.getURL('access.html')+'?run='+encodeURIComponent(job.runId),type:'popup',width:460,height:370});await setJob({...await getJob(),permissionWindowId:permissionWindow.id});return;
  }
  await dispatch(job);
}
async function question(m,s){
  let job=await match(m,s,'select-question');if((s.frameId||0)!==0)throw new Error('Select the question in the main page.');
  validRegion(m.rect,m.viewport);if(typeof m.text!=='string'||m.text.length>40000)throw new Error('Select a smaller question.');
  job={...job,phase:'capturing-question'};await setJob(job);
  try{
    const [tab]=await chrome.tabs.query({active:true,windowId:s.tab.windowId});if(tab?.id!==job.tabId)throw new Error('Return to the selected page and reselect the question.');
    if(!(await page(job.tabId,{type:'guided-validate',runId:job.runId},0))?.ok)throw new Error('The page moved. Select the question again with QA or ST.');
    let image='';await page(job.tabId,{type:'guided-hide'});
    try{image=await cropScreenshot(await chrome.tabs.captureVisibleTab(s.tab.windowId,{format:'png'}),m.rect,m.viewport);}
    catch{if(!m.text.trim()||m.hasVisual)throw new Error('Use Alt+Shift+Q or Alt+Shift+T to authorize a screenshot, then select again.');}
    finally{await page(job.tabId,{type:'guided-show'});}
    const [after]=await chrome.tabs.query({active:true,windowId:s.tab.windowId});
    if(after?.id!==job.tabId||!(await page(job.tabId,{type:'guided-validate',runId:job.runId},0))?.ok)throw new Error('The page moved during capture. Reselect the question.');
    job={...job,question:m.text.trim()||'Read the selected question and its choices from the image.',questionImage:image,questionRect:m.rect};await setJob(job);await prepare(job);
  }catch(e){await fail(job,e.message);}
}
async function workerEvent(m){
  let job=await getJob();if(!job||job.runId!==m.runId)return {ok:false};
  if(m.event==='youtube-captions'){
    if(job.phase!=='fetching-captions'||(job.videoId && m.videoId!==job.videoId)||!m.text?.trim())return {ok:false};
    if(!(await page(job.tabId,{type:'validate-media',...job.media},job.mediaFrameId))?.ok){await fail(job,'The selected YouTube video changed. Press ST to select it again.');return {ok:false};}
    const {transcripts=[]}=await chrome.storage.local.get('transcripts');
    const source=`YouTube captions - ${m.language || 'unknown language'}${m.generated?' - automatic':''}`;
    const transcript={id:job.runId,kind:'transcript',date:new Date().toISOString(),text:m.text,source,title:m.title||job.title,pageUrl:job.pageUrl,mediaUrl:job.media.url,audioId:null,videoId:m.videoId,language:m.language,generated:m.generated,segments:m.segments,ranges:m.ranges||[]};
    job={...job,context:m.text,transcriptId:transcript.id,kind:'answer',newTranscript:true,source,videoId:m.videoId,phase:'select-question'};
    await chrome.storage.local.set({transcripts:[transcript,...transcripts.filter(t=>t.id!==transcript.id)],activeJob:job});
    if(!await page(job.tabId,{type:'guided-question',runId:job.runId,source,reuse:true},0))await fail(job,'Captions saved. Refresh the page and restore them from recovery to use QA.');
  }
  else if(m.event==='phase'){job={...job,phase:m.phase,heartbeat:Date.now()};await setJob(job);await status(job,m.phase==='fetching'?'Downloading selected audio':m.phase==='transcribing'?'Transcribing selected audio':'Answering from the selected transcript');}
  else if(m.event==='structure'){await setJob({...job,structured:m.structured});}
  else if(m.event==='transcript'){
    const {transcripts=[]}=await chrome.storage.local.get('transcripts');const id=job.runId;
    const transcript={id,kind:'transcript',date:new Date().toISOString(),text:m.text,source:job.source,title:job.title,pageUrl:job.pageUrl,mediaUrl:job.media.url,audioId:job.audioId};
    job={...job,context:m.text,transcriptId:id,kind:'answer',newTranscript:true};
    await chrome.storage.local.set({transcripts:[transcript,...transcripts.filter(t=>t.id!==id)],activeJob:job});
  }else if(m.event==='answer'){
    const {history=[],autoCopy=false}=await chrome.storage.local.get(['history','autoCopy']);
    const item={id:job.runId,date:new Date().toISOString(),kind:'answer',text:m.result.text,question:job.question,questionImage:job.questionImage,source:job.source,pageUrl:job.pageUrl,transcriptId:job.transcriptId,structured:m.result.structured||job.structured||null,decision:m.result.decision||null,jevRequest:m.result.jevRequest||null};
    const {activeTranscriptId}=await chrome.storage.local.get('activeTranscriptId');
    await chrome.storage.local.set({history:[item,...history.filter(x=>x.id!==item.id)],activeJob:null,lastJob:{...job,newTranscript:false},lastError:'',...(job.newTranscript?{activeTranscriptId:job.transcriptId,previousTranscriptId:activeTranscriptId}: {})});
    if(autoCopy)await chrome.runtime.sendMessage({target:'offscreen',type:'copy',text:item.text});
    await page(job.tabId,{type:'guided-cancelled',runId:job.runId});await status(job,'Ready · RA reveals the answer');
  }else if(m.event==='error')await fail(job,m.error);
  return {ok:true};
}
async function retry(m){
  if(await getJob())throw new Error('Cancel the active operation before retrying.');
  const d=await chrome.storage.local.get(['lastJob','history','transcripts']);let old=d.lastJob;
  if(m.answerId){const item=d.history?.find(x=>x.id===m.answerId);if(!item)throw new Error('Answer not found.');const t=d.transcripts?.find(x=>x.id===item.transcriptId);if(!t)throw new Error('The source transcript is unavailable.');old={...item,context:t.text,title:t.title,source:t.source,transcriptId:t.id};}
  if(!old?.question)throw new Error('Select a question using QA or ST first.');
  let job={...old,retry:true,runId:crypto.randomUUID(),started:Date.now(),heartbeat:Date.now()};
  if(typeof m.question==='string'){if(!m.question.trim()||m.question.length>40000)throw new Error('Enter a question (maximum 40,000 characters).');job.question=m.question;job.questionImage='';job.structured=null;}
  if(m.structured)job.structured=m.structured;
  const tab=await active().catch(()=>null);job.tabId=tab?.id;job.pageUrl=tab?.url||old.pageUrl;
  await setJob(job);try{await prepare(job);}catch(e){await fail(job,e.message);}
}
async function reveal(tab){const {history=[]}=await chrome.storage.local.get('history');const item=history.find(x=>x.kind==='answer');if(!item)throw new Error('No answer saved yet.');await page(tab.id,{type:'reveal-answer',text:item.text,source:item.source},0);}
async function checkWorker(){const job=await getJob();if(!job)return;if(job.phase==='capturing-question'&&Date.now()-job.started>60000){await fail(job,'Question capture was interrupted. Reselect with QA or ST.');return;}if(!['fetching-captions','fetching','transcribing','answering'].includes(job.phase))return;let ping;if(await chrome.offscreen.hasDocument())ping=await chrome.runtime.sendMessage({target:'offscreen',type:'ping'}).catch(()=>null);if(ping?.runId!==job.runId)await fail(job,'Processing was interrupted. Your transcripts are safe. Retry from recovery.');}
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='worker-watch')void serial(checkWorker);});
chrome.runtime.onInstalled.addListener(()=>{void serial(async()=>{await chrome.alarms.create('worker-watch',{periodInMinutes:1});});});
chrome.runtime.onStartup.addListener(()=>{void serial(async()=>{const job=await getJob();if(job)await fail(job,'Chrome closed during this operation. Retry or reselect from recovery.');await chrome.alarms.create('worker-watch',{periodInMinutes:1});});});
chrome.windows.onRemoved.addListener(windowId=>{void serial(async()=>{const job=await getJob();if(job?.phase==='awaiting-media-access'&&job.permissionWindowId===windowId)await cancel();});});
chrome.tabs.onRemoved.addListener(tabId=>{void serial(async()=>{const job=await getJob();if(job?.tabId===tabId&&['select-media','select-question','awaiting-media-access','capturing-question','fetching-captions'].includes(job.phase))await cancel();});});
chrome.commands.onCommand.addListener(command=>{void serial(async()=>{const tab=await active();if(command==='guided')await begin(tab);if(command==='ask')await begin(tab,true);if(command==='reveal')await reveal(tab);}).catch(async e=>{await chrome.storage.local.set({lastError:e.message});const tab=await active().catch(()=>null);await status(tab?{tabId:tab.id}:null,e.message,true);});});
chrome.runtime.onMessage.addListener((m,s,reply)=>{
  if(m.target==='offscreen')return;
  serial(async()=>{
    const trusted=s.id===chrome.runtime.id&&s.url?.startsWith(chrome.runtime.getURL(''));
    if(!trusted&&(!s.tab||!['guided-start','qa-start','guided-media','guided-question-ready','guided-cancel','media-selected','reveal'].includes(m.type)))throw new Error('Unsupported request.');
    if(m.type.startsWith('worker-')&&s.url!==chrome.runtime.getURL('offscreen.html'))throw new Error('Unsupported worker.');
    switch(m.type){
      case 'guided-start':await begin(s.tab);break;
      case 'qa-start':await begin(s.tab,true);break;
      case 'reveal':await reveal(s.tab);break;
      case 'guided-media':{
        const job=await match(m,s,'select-media');mediaURL(m.media.url);
        const media={id:m.media.id,url:m.media.url,label:String(m.media.label).slice(0,180),pageUrl:m.media.pageUrl};
        const valid=await page(job.tabId,{type:'validate-media',...media},s.frameId||0);
        if(!valid?.ok)throw new Error('The audio selection changed. Select it again.');
        const videoId=youtubeId(media.url);
        const captions=!!videoId||isYouTubeWrapper(media.url);
        const next={...job,media,source:captions?'YouTube captions':media.label,mediaFrameId:s.frameId||0,phase:captions?'fetching-captions':'select-question',...(captions?{videoId,audioId:null}:{})};
        await setJob(next);await page(job.tabId,{type:'guided-end-picker',runId:job.runId});
        if(captions){
          try{
            await offscreen();await status(next,'Retrieving YouTube captions - no playback');
            const result=await chrome.runtime.sendMessage({target:'offscreen',type:'youtube-captions',job:next});
            if(!result?.ok)await fail(next,result?.error||'Caption worker unavailable. Press ST to try again.');
          }catch(e){await fail(next,e.message);}
        }else await page(job.tabId,{type:'guided-question',runId:job.runId,source:media.label},0);
        break;
      }
      case 'guided-question-ready':await question(m,s);break;
      case 'guided-cancel':{const job=await getJob();if(job){await match({...m,runId:m.runId||job.runId},s);await cancel();}break;}
      case 'guided-resume':{const job=await match(m,s,'awaiting-media-access');try{await prepare(job);}catch(e){await fail(job,e.message);}break;}
      case 'media-selected':await chrome.storage.session.set({['media-'+s.tab.id]:{...m.media,frameId:s.frameId||0}});break;
      case 'worker-event':return await workerEvent(m);
      case 'worker-heartbeat':{const job=await getJob();if(job?.runId===m.runId)await chrome.storage.local.set({activeJob:{...job,heartbeat:Date.now()}});break;}
      case 'snapshot':await checkWorker();return {...await chrome.storage.local.get(['activeJob','lastJob','lastError','history','transcripts','activeTranscriptId','previousTranscriptId'])};
      case 'provider-config':{const c=await config();return Object.fromEntries(Object.entries(c).map(([k,v])=>[k,k.endsWith('_key')?!!v:v]));}
      case 'save-provider-config':{if(await getJob())throw new Error('Cancel or finish the current operation first.');const c=await config();for(const key of Object.keys(defaults))if(typeof m.config[key]==='string')c[key]=m.config[key].trim();for(const name of ['openai','openrouter','opencode','jev']){const key=name+'_key';if(m.config[key]?.trim())c[key]=m.config[key].trim();if(m.config['clear_'+key])delete c[key];}await chrome.storage.local.set({providerConfig:c,autoCopy:!!m.config.autoCopy});break;}
      case 'popup-action':{const tab=await active();if(m.action==='guided')await begin(tab);else if(m.action==='ask')await begin(tab,true);else if(m.action==='reveal')await reveal(tab);else if(m.action==='select-media'){if(await getJob())throw new Error('Cancel the active operation before choosing different media.');await page(tab.id,{type:'select-media'});}break;}
      case 'cancel':await cancel();break;
      case 'retry':await retry(m);break;
      case 'restore':{await cancel();const d=await chrome.storage.local.get(['transcripts','activeTranscriptId']);if(!d.transcripts?.some(t=>t.id===m.id))throw new Error('Transcript not found.');await chrome.storage.local.set({activeTranscriptId:m.id,previousTranscriptId:d.activeTranscriptId,lastError:''});break;}
      case 'download':{const tab=await active();const media=(await chrome.storage.session.get('media-'+tab.id))['media-'+tab.id];if(!media)throw new Error('Choose media first.');if(!(await page(tab.id,{type:'validate-media',...media},media.frameId))?.ok)throw new Error('Reselect the audio on the current page.');const downloadId=await chrome.downloads.download({url:mediaURL(media.url),saveAs:false});const {downloadJobs={}}=await chrome.storage.session.get('downloadJobs');downloadJobs[downloadId]={tabId:tab.id,frameId:media.frameId};await chrome.storage.session.set({downloadJobs});await page(tab.id,{type:'status',kind:'transcript',text:'Downloading selected media'});break;}
      case 'export-audio':{const file=await audioStore('get',m.audioId);if(!file)throw new Error('No cached audio for this transcript.');const bytes=new Uint8Array(await file.blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));await chrome.downloads.download({url:'data:application/octet-stream;base64,'+btoa(binary),filename:'PageCue/audio-'+Date.now()+'.'+file.ext});break;}
      case 'copy':await offscreen();return await chrome.runtime.sendMessage({target:'offscreen',type:'copy',text:m.text});
      default:throw new Error('Unknown action.');
    }return {ok:true};
  }).then(reply,async e=>{if(s.tab)await status({tabId:s.tab.id},e.message,true);reply({ok:false,error:e.message});});return true;
});

chrome.downloads.onChanged.addListener(delta=>{if(!['complete','interrupted'].includes(delta.state?.current))return;void serial(async()=>{const {downloadJobs={}}=await chrome.storage.session.get('downloadJobs');const job=downloadJobs[delta.id];if(!job)return;await page(job.tabId,{type:'status',kind:'transcript',text:delta.state.current==='complete'?'Ready · download complete':'Download interrupted',error:delta.state.current!=='complete'},job.frameId);delete downloadJobs[delta.id];await chrome.storage.session.set({downloadJobs});});});
