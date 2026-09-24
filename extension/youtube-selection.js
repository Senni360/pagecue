import {youtubeId} from './youtube.js';
const LIMIT = 1_000_000;
const INVALID = 'The embedded player has an unsupported or ambiguous YouTube configuration. No transcript was saved.';
export function isYouTubeWrapper(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'cdn.eindexamensite.nl' && !url.username && !url.password && !url.port && /^\/qv\/[^/]+\/index\.html$/.test(url.pathname) && !/%(?:2f|5c|2e)/i.test(url.pathname); } catch { return false; }
}
function validRanges(ranges) {
  if (!Array.isArray(ranges) || !ranges.length) throw new Error(INVALID);
  const sorted = ranges.map(r => {
    if (typeof r?.start !== 'number' || !Number.isFinite(r.start) || r.start < 0 || typeof r?.end !== 'number' || !Number.isFinite(r.end) || r.end <= r.start) throw new Error(INVALID);
    return {start:r.start, end:r.end};
  }).sort((a,b)=>a.start-b.start);
  for (let i=1;i<sorted.length;i++) if (sorted[i].start < sorted[i-1].end) throw new Error(INVALID);
  return sorted;
}
async function readMetadata(response) {
  if (!response.ok) throw new Error(`Embedded YouTube metadata request failed (HTTP ${response.status}).`);
  if (Number(response.headers.get('content-length')) > LIMIT) { await response.body?.cancel(); throw new Error('Embedded player metadata is too large.'); }
  if (!response.body?.getReader) { const text = await response.text(); if (new TextEncoder().encode(text).length > LIMIT) throw new Error('Embedded player metadata is too large.'); return text; }
  const reader=response.body.getReader(), decoder=new TextDecoder(); let bytes=0,text='';
  try { while (true) { const {done,value}=await reader.read(); if(done)break; bytes+=value.byteLength; if(bytes>LIMIT){await reader.cancel();throw new Error('Embedded player metadata is too large.');} text+=decoder.decode(value,{stream:true}); } return text+decoder.decode(); } finally { reader.releaseLock(); }
}
function parseProject(source) {
  // Only decode the JSON string at the known assignment. Never execute page script.
  const match = /^\s*window\["core"\]\.data\s*=\s*\{\s*project\s*:\s*("(?:[^"\\]|\\.)*")\s*,\s*api\s*:/s.exec(source);
  if (!match) throw new Error(INVALID);
  try { const project=JSON.parse(JSON.parse(match[1])); if(!project || typeof project!=='object' || !Array.isArray(project.scenes))throw new Error(); return project; } catch { throw new Error(INVALID); }
}
export async function resolveYouTubeSelection(value, {signal, fetchImpl=fetch}={}) {
  signal?.throwIfAborted();
  const direct=youtubeId(value); if(direct)return {videoId:direct,ranges:[]};
  if(!isYouTubeWrapper(value))throw new Error(INVALID);
  const url=new URL('scripts/core/data.js',value);url.search='';url.hash='';
  const controller=new AbortController(), abort=()=>controller.abort(signal.reason);
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error('Embedded player metadata request timed out.')),15000);
  try {
    const source=await readMetadata(await fetchImpl(url.href,{signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-store'}));controller.signal.throwIfAborted();
    const project=parseProject(source),stack=[...project.scenes], selections=[];let visited=0;
    while(stack.length){const node=stack.pop();if(!node || typeof node!=='object')continue;if(++visited>20000)throw new Error(INVALID);
      if(node.config?.type==='youtube'){
        const ref=/^@yt\{(\d+)\}$/.exec(node.config.source||'');const videoId=ref&&youtubeId(project.resources?.youtube?.[Number(ref[1])]);
        if(!videoId || !Array.isArray(node.config.segments))throw new Error(INVALID);
        const ranges=validRanges(node.config.segments.map(s=>({start:s?.from,end:s?.to})));selections.push({videoId,ranges});
      }
      for(const child of Object.values(node))if(child&&typeof child==='object')stack.push(child);
    }
    if(!selections.length || new Set(selections.map(s=>JSON.stringify(s))).size!==1)throw new Error(INVALID);
    return selections[0];
  } finally { clearTimeout(timer);signal?.removeEventListener('abort',abort); }
}
export function clipYouTubeTranscript(result,ranges) {
  if(Array.isArray(ranges)&&!ranges.length)return result;
  const intervals=validRanges(ranges);
  const segments=result.segments.filter(s=>intervals.some(r=>s.start<r.end&&s.end>r.start));
  if(!segments.length)throw new Error('No spoken captions overlap the selected video excerpt. Your previous transcript has been kept.');
  const stamp=n=>{n=Math.floor(n);return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(x=>String(x).padStart(2,'0')).join(':');};
  return {...result,ranges:intervals,segments,text:segments.map(s=>`[${stamp(s.start)}] ${s.text}`).join('\n')};
}
