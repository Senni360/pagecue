import {defaults} from './providers.js';
const $=id=>document.getElementById(id);
const choices={answer_provider:['openai','openrouter','opencode','jev'],audio_provider:['openai','openrouter'],extraction_provider:['openai','openrouter','opencode'],opencode_format:['responses','chat'],jev_gateway:['typesafe','opencode']};
const labels={answer_provider:'Answer provider',audio_provider:'Transcription provider',extraction_provider:'Jev question extraction provider',jev_gateway:'Jev gateway',jev_model:'Direct Jev model',jev_opencode_model:'Jev model through OpenCode'};
for(const [key,value] of Object.entries(defaults)){
  const label=document.createElement('label');label.htmlFor=key;label.textContent=labels[key]||key.replaceAll('_',' ');
  const input=document.createElement(choices[key]?'select':'input');input.id=key;if(choices[key])for(const name of choices[key]){const option=document.createElement('option');option.value=name;option.textContent=name;input.append(option);}else input.type='text';input.value=value;$('fields').append(label,input);
}
for(const name of ['openai','openrouter','opencode','jev']){
  const key=name+'_key',label=document.createElement('label');label.htmlFor=key;label.textContent=name+' API key';const state=document.createElement('span');state.id=key+'_state';label.append(state);
  const input=document.createElement('input');input.type='password';input.id=key;input.autocomplete='off';input.placeholder='Blank keeps the saved key';
  const remove=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.id='clear_'+key;remove.append(checkbox,document.createTextNode(' Remove saved '+name+' key'));$('fields').append(label,input,remove);
}
async function send(m){const r=await chrome.runtime.sendMessage(m);if(r.error)throw new Error(r.error);return r;}
async function load(){const c=await send({type:'provider-config'});for(const key of Object.keys(defaults))$(key).value=c[key];for(const name of ['openai','openrouter','opencode','jev'])$(name+'_key_state').textContent=c[name+'_key']?' · saved':' · missing';$('autoCopy').checked=!!(await chrome.storage.local.get('autoCopy')).autoCopy;}
$('form').onsubmit=async e=>{e.preventDefault();try{const config={autoCopy:$('autoCopy').checked};for(const key of Object.keys(defaults))config[key]=$(key).value;for(const name of ['openai','openrouter','opencode','jev']){config[name+'_key']=$(name+'_key').value;config['clear_'+name+'_key']=$('clear_'+name+'_key').checked;}await send({type:'save-provider-config',config});for(const name of ['openai','openrouter','opencode','jev']){$(name+'_key').value='';$('clear_'+name+'_key').checked=false;}await load();$('status').textContent='Saved locally. No API request was made.';}catch(e){$('status').textContent=e.message;}};
$('shortcuts').onclick=()=>chrome.tabs.create({url:'chrome://extensions/shortcuts'});load().catch(e=>$('status').textContent=e.message);
