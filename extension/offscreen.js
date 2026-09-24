import {resolveYouTubeSelection,clipYouTubeTranscript} from './youtube-selection.js';
import {fetchYouTubeTranscript} from './youtube.js';
import {MAX_BYTES,mediaURL,fileExtension} from './core.js';
import {audioStore} from './audio-store.js';
import {transcribe,answer} from './providers.js';
let running=null;
async function report(runId,event,data={}) {
  const response=await chrome.runtime.sendMessage({type:'worker-event',runId,event,...data});
  if(!response?.ok)throw new Error('This operation was cancelled or replaced.');
}
async function execute(job,config,controller) {
  const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(15*60*1000)]);
  const beat=setInterval(()=>{void chrome.runtime.sendMessage({type:'worker-heartbeat',runId:job.runId}).catch(()=>{});},20000);
  try{
    if(!job.context){
      await report(job.runId,'phase',{phase:'fetching'});
      let file=await audioStore('get',job.audioId);
      if(!file){
        const response=await fetch(mediaURL(job.media.url),{credentials:'include',signal});
        if(!response.ok)throw new Error(`Audio download failed (HTTP ${response.status}). Check login and reselect the audio if its link expired.`);
        let ext;
        try{if(Number(response.headers.get('content-length'))>MAX_BYTES)throw new Error('Audio exceeds 24 MB. Select a smaller file.');ext=fileExtension(job.media.url,response.headers.get('content-type')||'');}
        catch(error){await response.body?.cancel();throw error;}
        const reader=response.body.getReader();let size=0;const chunks=[];
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw new Error('Audio exceeds 24 MB. Select a smaller file.');}chunks.push(value);}
        if(!size)throw new Error('The audio download was empty.');
        file={blob:new Blob(chunks,{type:response.headers.get('content-type')||'application/octet-stream'}),ext};
        signal.throwIfAborted();await audioStore('put',job.audioId,file);
      }
      await report(job.runId,'phase',{phase:'transcribing'});
      job.context=await transcribe(file.blob,file.ext,config,signal);
      await report(job.runId,'transcript',{text:job.context});
    }
    await report(job.runId,'phase',{phase:'answering'});
    const result=await answer(job,config,signal,structured=>report(job.runId,'structure',{structured}));
    await report(job.runId,'answer',{result});
  }catch(error){await chrome.runtime.sendMessage({type:'worker-event',runId:job.runId,event:'error',error:error.name==='TimeoutError'?'Request timed out. Retry from recovery.':error.message}).catch(()=>{});}
  finally{clearInterval(beat);if(running?.runId===job.runId)running=null;}
}
chrome.runtime.onMessage.addListener((m,s,reply)=>{
  if(m.target!=='offscreen'||s.id!==chrome.runtime.id||s.tab||(s.url&&s.url!==chrome.runtime.getURL('background.js')))return;
  if(m.type==='youtube-captions'){
    if(running){reply({ok:false,error:'The previous operation is still stopping. Try again shortly.'});return;}
    const controller=new AbortController();running={runId:m.job.runId,controller};reply({ok:true});
    void (async()=>{
      try{
        const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(45000)]);
        const selection=await resolveYouTubeSelection(m.job.media.url,{signal});
        const result=clipYouTubeTranscript(await fetchYouTubeTranscript(selection.videoId,{signal}),selection.ranges);
        signal.throwIfAborted();await report(m.job.runId,'youtube-captions',result);
      }catch(error){await chrome.runtime.sendMessage({type:'worker-event',runId:m.job.runId,event:'error',error:error.name==='TimeoutError'?'YouTube caption retrieval timed out. Press ST to try again.':error.message}).catch(()=>{});}
      finally{if(running?.runId===m.job.runId)running=null;}
    })();
  }else if(m.type==='execute'){
    if(running){reply({ok:false,error:'The previous operation is still stopping. Try again shortly.'});return;}
    const controller=new AbortController();running={runId:m.job.runId,controller};reply({ok:true});void execute(m.job,m.config,controller);
  }else if(m.type==='abort'){if(running?.runId===m.runId)running.controller.abort();reply({ok:true});}
  else if(m.type==='ping')reply({ok:true,runId:running?.runId});
  else if(m.type==='copy'){navigator.clipboard.writeText(m.text).then(()=>reply({ok:true}),()=>reply({ok:false,error:'Clipboard unavailable.'}));return true;}
});
