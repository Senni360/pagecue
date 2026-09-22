const $=id=>document.getElementById(id);let snapshot;const dirty=new Set();for(const id of ['question','stem','choices'])$(id).addEventListener('input',()=>dirty.add(id));
async function send(message){const r=await chrome.runtime.sendMessage(message);if(r?.error)throw new Error(r.error);return r;}
function button(text,fn){const b=document.createElement('button');b.textContent=text;b.onclick=()=>act(fn);return b;}
async function act(fn,submitted=false){try{const result=await fn();if(submitted&&result?.ok)dirty.clear();await load();}catch(e){$('status').textContent=e.message;}}
function text(tag,value){const el=document.createElement(tag);el.textContent=value;return el;}
function transcripts(){
  const query=$('search').value.toLowerCase();$('transcripts').replaceChildren();
  for(const t of snapshot.transcripts||[]){if(!`${t.title} ${t.source} ${t.text}`.toLowerCase().includes(query))continue;
    const card=document.createElement('article');card.append(text('strong',(t.id===snapshot.activeTranscriptId?'Active · ':'')+(t.title||t.source)),text('div',new Date(t.date).toLocaleString()),text('p',t.text.slice(0,200)));
    const use=button('Use this transcript',()=>send({type:'restore',id:t.id}));use.disabled=t.id===snapshot.activeTranscriptId;
    card.append(use,button('Copy transcript',()=>send({type:'copy',text:t.text})));
    if(t.audioId)card.append(button('Save audio',()=>send({type:'export-audio',audioId:t.audioId})));
    const details=document.createElement('details');details.append(text('summary','Full transcript'),text('pre',t.text));card.append(details);$('transcripts').append(card);
  }
}
async function load(){
  snapshot=await send({type:'snapshot'});
  $('status').textContent=snapshot.activeJob?`Working: ${snapshot.activeJob.phase.replaceAll('-',' ')}. Saved transcripts are safe.`:snapshot.lastError||'Ready. Everything runs inside Chrome.';
  const active=snapshot.transcripts?.find(t=>t.id===snapshot.activeTranscriptId);$('active').textContent=active?`QA context: ${active.title||active.source} · ${new Date(active.date).toLocaleString()}`:'No active transcript. Start with ST.';
  $('undo').disabled=!snapshot.previousTranscriptId; $('cancel').disabled=!snapshot.activeJob;$('retry').disabled=!!snapshot.activeJob||!snapshot.lastJob?.question;
  if(!dirty.has('question')&&document.activeElement!==$('question'))$('question').value=snapshot.lastJob?.question||'';
  const structured=snapshot.lastJob?.structured;if(structured){if(!dirty.has('stem')&&document.activeElement!==$('stem'))$('stem').value=structured.question||'';if(!dirty.has('choices')&&document.activeElement!==$('choices'))$('choices').value=(structured.options||[]).map(o=>`${o.label}. ${o.text}`).join('\n');}
  transcripts();$('history').replaceChildren();
  for(const a of (snapshot.history||[]).filter(x=>x.kind==='answer')){
    const card=document.createElement('article');card.append(text('div',new Date(a.date).toLocaleString()),text('p',a.text),text('div','Transcript: '+(snapshot.transcripts?.find(t=>t.id===a.transcriptId)?.title||a.source||'Legacy result')));
    card.append(button('Copy',()=>send({type:'copy',text:a.text})),button('Retry answer',()=>send({type:'retry',answerId:a.id})));
    if(a.transcriptId)card.append(button('Use its transcript',()=>send({type:'restore',id:a.transcriptId})));
    const details=document.createElement('details');details.append(text('summary','Question and source details'),text('pre',a.question||''));
    if(a.structured)details.append(text('pre',JSON.stringify(a.structured,null,2)));
    if(a.decision)details.append(text('p','Jev model scores are not verified accuracy.'),text('pre',JSON.stringify(a.decision,null,2)));
    if(a.questionImage){const image=document.createElement('img');image.src=a.questionImage;image.alt='Selected question crop';image.style.maxWidth='100%';details.append(image);}
    card.append(details);$('history').append(card);
  }
}
$('undo').onclick=()=>act(()=>send({type:'restore',id:snapshot.previousTranscriptId}));
$('search').oninput=transcripts;$('settings').onclick=()=>chrome.runtime.openOptionsPage();
for(const b of document.querySelectorAll('[data-action]'))b.onclick=()=>act(async()=>{await send({type:'popup-action',action:b.dataset.action});window.close();});
$('cancel').onclick=()=>act(()=>send({type:'cancel'}));$('retry').onclick=()=>act(()=>send({type:'retry'}));$('download').onclick=()=>act(()=>send({type:'download'}));
$('correct').onclick=()=>act(()=>send({type:'retry',question:$('question').value}),true);
$('correctJev').onclick=()=>act(()=>{
  const options=$('choices').value.split('\n').filter(x=>x.trim()).map(line=>{const m=line.match(/^\s*([^.)\s]+)[.)]\s+(.+)$/);if(!m)throw new Error('Use one labeled choice per line: A. Choice text');return {label:m[1],text:m[2]};});
  return send({type:'retry',question:$('stem').value+'\n'+$('choices').value,structured:{question:$('stem').value,options,mode:'single_choice',complete:true}});
},true);
load().catch(e=>$('status').textContent=e.message);

let refreshTimer;chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;const changed=changes.history||changes.transcripts||changes.activeTranscriptId||changes.lastError||changes.activeJob&&changes.activeJob.oldValue?.phase!==changes.activeJob.newValue?.phase;if(!changed)return;clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(document.activeElement?.matches('textarea,input'))return;load().catch(e=>$('status').textContent=e.message);},150);});
