const $=id=>document.getElementById(id);
const runId=new URLSearchParams(location.search).get('run');
let origin;
chrome.storage.local.get('activeJob').then(({activeJob})=>{
  if(!activeJob?.guided || activeJob.runId!==runId || activeJob.phase!=='awaiting-media-access')throw new Error('This selection is no longer active. Close this window.');
  $('allow').focus();origin=activeJob.mediaOrigin;$('source').textContent=`${activeJob.media.label} — ${new URL(activeJob.media.url).origin}`;
}).catch(e=>{$('status').textContent=e.message;$('allow').disabled=true;});
$('allow').onclick=async()=>{
  $('allow').disabled=true;
  try {
    if(!origin)throw new Error('No audio host selected.');
    const allowed=await chrome.permissions.request({origins:[origin]});
    if(!allowed)throw new Error('Access was not granted. You can retry or cancel.');
    const response=await chrome.runtime.sendMessage({type:'guided-resume',runId});
    if(response?.error)throw new Error(response.error);
    window.close();
  }catch(e){$('status').textContent=e.message;$('allow').disabled=false;}
};
$('cancel').onclick=async()=>{await chrome.runtime.sendMessage({type:'guided-cancel',runId});window.close();};

document.addEventListener('keydown',e=>{if(e.key==='Escape')$('cancel').click();});
