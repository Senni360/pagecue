const $=id=>document.getElementById(id);
const runId=new URLSearchParams(location.search).get('run');
let ready=false;
async function send(message){const r=await chrome.runtime.sendMessage(message);if(r?.error)throw new Error(r.error);return r;}
function message(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function splitSelection(raw){
  const lines=raw.split('\n');const first=lines.findIndex(line=>/^\s*(?:[A-Z]|\d{1,2})[.)]\s+\S/.test(line));
  if(first<0)return {question:raw,options:''};
  return {question:lines.slice(0,first).join('\n').trim(),options:lines.slice(first).join('\n').trim()};
}
function payload(){
  const options={};let label;
  for(const line of $('choices').value.split('\n')){
    if(!line.trim())continue;
    const match=line.match(/^\s*([A-Z]|\d{1,2})[.)]\s+(.+)$/);
    if(match){label=match[1];if(label in options)throw new Error(`Duplicate answer label ${label}.`);options[label]=match[2].trim();}
    else if(label)options[label]+='\n'+line.trim();
    else throw new Error('Start each choice with its original label, for example A. Exact choice text');
  }
  if(!$('question').value.trim())throw new Error('Enter the exact question.');
  if(Object.keys(options).length<2)throw new Error('Include at least two original labeled choices.');
  return {question:$('question').value.trim(),context:$('evidence').value,context_only:true,
    structured:{question:$('question').value.trim(),options,notes:$('notes').value.trim()}};
}
async function preview(){
  const p=payload();const result=await send({type:'jev-preview',payload:p});
  $('preview').textContent=JSON.stringify(result.request,null,2);return p;
}
send({type:'jev-review-data',runId}).then(job=>{
  const split=splitSelection(job.question||'');
  $('question').value=split.question==='Answer the question and answer choices in the selected screenshot.'?'':split.question;
  $('choices').value=split.options;$('evidence').value=job.context||'';$('source').textContent=job.source||'Selected question';
  if(job.questionImage){$('capture').src=job.questionImage;$('capture').hidden=false;}
  $('raw').textContent=job.question||'';ready=true;
  message('Review one question, every choice, and the transcript. Nothing has been sent to Jev yet.');
}).catch(error=>message(error.message,true));
$('showPreview').onclick=async()=>{try{await preview();message('Exact Jev request prepared locally. No provider call made.');}catch(error){message(error.message,true);}};
$('evaluate').onclick=async()=>{
  if(!ready)return;
  $('evaluate').disabled=true;
  try{
    if(!$('reviewed').checked)throw new Error('Check that the question, choices, and source have been reviewed.');
    const p=await preview();
    await send({type:'jev-submit',runId,payload:p});
    message('Sent to Jev. The result will appear on the source page and in PageCue history.');
    $('showPreview').disabled=true;
  }catch(error){message(error.message,true);$('evaluate').disabled=false;}
};
$('cancel').onclick=async()=>{try{await send({type:'guided-cancel',runId});window.close();}catch(error){message(error.message,true);}};
for(const field of ['question','choices','evidence','notes'])$(field).addEventListener('input',()=>{$('reviewed').checked=false;$('preview').textContent='Inputs changed. Refresh the request preview before sending.';});
