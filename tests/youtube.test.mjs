import test from 'node:test';
import assert from 'node:assert/strict';
import {youtubeId, fetchYouTubeTranscript} from '../extension/youtube.js';

const id = 'AbCdEf012_-';
const track = (languageCode='en', kind) => ({languageCode, kind, baseUrl:`https://www.youtube.com/api/timedtext?v=${id}&lang=${languageCode}&tlang=fr`});
const playerJSON = (tracks=[track()], extra={}) => JSON.stringify({videoDetails:{videoId:id,title:'Title with } brace'},playabilityStatus:{status:'OK'},captions:{playerCaptionsTracklistRenderer:{captionTracks:tracks,...extra}}});
function page(tracks, extra) { return `<script>var ytInitialPlayerResponse = ${playerJSON(tracks, extra)};</script>`; }
const captions = JSON.stringify({events:[{tStartMs:1000,dDurationMs:2000,segs:[{utf8:'Hello '},{utf8:'world'}]},{tStartMs:3602000,dDurationMs:500,segs:[{utf8:'Next line'}]}]});
const blocked = () => new Response('Sorry', {status:403});
// Routes by endpoint: `player` answers InnerTube (defaults to blocked, exercising the watch-page fallback).
function mock(html=page(), body=captions, player=blocked) { const calls=[]; return {calls, fetchImpl:async(url, options) => {calls.push({url, options});const path=new URL(url).pathname;return path==='/youtubei/v1/player'?player():path==='/watch'?new Response(html):new Response(body);}}; }
const innertube = (json=playerJSON(), body=captions) => mock('<html>unused</html>', body, () => new Response(json));

test('recognizes strict YouTube URL forms and rejects deceptive sources', () => {
  for (const url of [id,`https://www.youtube.com/watch?v=${id}&x=1`,`https://youtu.be/${id}`,`https://www.youtube-nocookie.com/embed/${id}`,`https://m.youtube.com/shorts/${id}`,`https://youtube.com/live/${id}`]) assert.equal(youtubeId(url),id);
  for (const url of ['bad',null,`https://youtube.com.evil.test/watch?v=${id}`,`https://youtube.com@evil.test/embed/${id}`,`https://user@youtube.com/embed/${id}`,`javascript:youtube.com/watch?v=${id}`,`https://youtube.com:999/embed/${id}`,`https://youtu.be/${id}/extra`]) assert.equal(youtubeId(url),null);
});
test('returns timestamped source text and metadata without playback or translation',async()=>{
  const m=mock();const result=await fetchYouTubeTranscript(id,m);
  assert.equal(result.text,'[00:00:01] Hello world\n[01:00:02] Next line');
  assert.deepEqual(result.segments[0],{start:1,end:3,text:'Hello world'});
  assert.equal(result.language,'en');assert.equal(result.generated,false);assert.equal(result.title,'Title with } brace');
  assert.equal(m.calls.length,3);const url=new URL(m.calls[2].url);assert.equal(url.searchParams.get('fmt'),'json3');assert.equal(url.searchParams.has('tlang'),false);
  assert.equal(m.calls[1].options.credentials,'omit');assert.equal(m.calls[1].options.redirect,'error');
});
test('uses original default audio language and prefers its manual captions',async()=>{
  const m=mock(page([track('en'),track('nl','asr'),track('nl')],{defaultAudioTrackIndex:1,audioTracks:[{defaultCaptionTrackIndex:0},{defaultCaptionTrackIndex:1}]}));
  const result=await fetchYouTubeTranscript(id,m);assert.equal(result.language,'nl');assert.equal(result.generated,false);
});
test('retains automatic captions when no manual equivalent exists',async()=>{
  const result=await fetchYouTubeTranscript(id,mock(page([track('nl','asr')])));assert.equal(result.generated,true);
});
test('rejects caption URLs outside exact trusted endpoint or for another video',async()=>{
  for(const baseUrl of [`https://evil.test/api/timedtext?v=${id}`,`https://www.youtube.com/redirect?v=${id}`,`http://www.youtube.com/api/timedtext?v=${id}`,`https://www.youtube.com/api/timedtext?v=OtherVid123`,`https://user@www.youtube.com/api/timedtext?v=${id}`]){
    const m=mock(page([{...track(),baseUrl}]));await assert.rejects(fetchYouTubeTranscript(id,m),/invalid caption source/);assert.equal(m.calls.length,2);
  }
});
test('rejects different video response',async()=>{
  await assert.rejects(fetchYouTubeTranscript(id,mock(page().replace(`"videoId":"${id}"`,'"videoId":"OtherVid123"'))),/different video/);
});
test('fails clearly for absent captions, blocked page, and non-json/empty captions',async()=>{
  await assert.rejects(fetchYouTubeTranscript(id,mock(page([]))),/captions are unavailable/);
  await assert.rejects(fetchYouTubeTranscript(id,mock('<html>Consent required</html>')),/did not expose public captions/);
  for(const body of ['<html>Bot check</html>', '{}', '{"events":[]}', '{"events":[{"tStartMs":-1,"segs":[{"utf8":"Bad"}]}]}']) await assert.rejects(fetchYouTubeTranscript(id,mock(page(),body)),/captions are unavailable/);
});
test('distinguishes an exposed track with empty caption response from no tracks',async()=>{
  for(const body of ['', ' \n\t']) await assert.rejects(fetchYouTubeTranscript(id,mock(page(),body)),/exposed a caption track but returned no caption data.*previous transcript.*No playback/);
  await assert.rejects(fetchYouTubeTranscript(id,mock(page([]))),/captions are unavailable/);
});
test('network errors are readable and do not echo signed URLs',async()=>{
  await assert.rejects(fetchYouTubeTranscript(id,{fetchImpl:async()=>{throw new TypeError('Failed https://www.youtube.com/api/timedtext?secret=sensitive');}}),error=>{
    assert.match(error.message,/Could not connect to YouTube captions/);assert.match(error.message,/previous transcript has been kept/);assert.doesNotMatch(error.message,/secret|sensitive|https:/);return true;
  });
});
test('does not execute JavaScript masquerading as player JSON',async()=>{
  globalThis.youtubeTestExecuted=false;
  await assert.rejects(fetchYouTubeTranscript(id,mock('<script>var ytInitialPlayerResponse = {"x":(()=>{globalThis.youtubeTestExecuted=true})()};</script>')),/did not expose public captions/);
  assert.equal(globalThis.youtubeTestExecuted,false);delete globalThis.youtubeTestExecuted;
});
test('supports window property assignment and safely parses escaped quotes',async()=>{
  const html=page().replace('var ytInitialPlayerResponse =','window["ytInitialPlayerResponse"] =').replace('Title with } brace','Title \\\" quoted } brace');
  const result=await fetchYouTubeTranscript(id,mock(html));assert.equal(result.title,'Title " quoted } brace');
});
test('rejects invalid IDs before network and propagates cancellation',async()=>{
  const m=mock();await assert.rejects(fetchYouTubeTranscript('../wrong',m),/Invalid/);assert.equal(m.calls.length,0);
  const controller=new AbortController();controller.abort();await assert.rejects(fetchYouTubeTranscript(id,{...m,signal:controller.signal}),{name:'AbortError'});assert.equal(m.calls.length,0);
});
test('HTTP failures and size limits fail without leaking response contents',async()=>{
  await assert.rejects(fetchYouTubeTranscript(id,{fetchImpl:async()=>new Response('private-body',{status:429})}),/HTTP 429/);
  await assert.rejects(fetchYouTubeTranscript(id,{fetchImpl:async()=>new Response('x',{headers:{'content-length':'9000000'}})}),/large/);
  await assert.rejects(fetchYouTubeTranscript(id,mock(page(),'x'.repeat(5_000_001))),/too large/);
});
test('uses the InnerTube iOS player first without cookies and skips the watch page',async()=>{
  const m=innertube();const result=await fetchYouTubeTranscript(id,m);
  assert.equal(result.text,'[00:00:01] Hello world\n[01:00:02] Next line');
  assert.deepEqual(m.calls.map(c=>new URL(c.url).pathname),['/youtubei/v1/player','/api/timedtext']);
  const {options}=m.calls[0];assert.equal(options.method,'POST');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
  const body=JSON.parse(options.body);assert.equal(body.videoId,id);assert.equal(body.context.client.clientName,'IOS');
});
test('InnerTube responses are validated like watch-page responses',async()=>{
  const other=playerJSON().replace(`"videoId":"${id}"`,'"videoId":"OtherVid123"');
  await assert.rejects(fetchYouTubeTranscript(id,innertube(other)),/different video/);
  await assert.rejects(fetchYouTubeTranscript(id,innertube(playerJSON([{...track(),baseUrl:`https://evil.test/api/timedtext?v=${id}`}]))),/invalid caption source/);
  await assert.rejects(fetchYouTubeTranscript(id,innertube(playerJSON([]))),/captions are unavailable/);
});
test('falls back to the watch page when InnerTube is unusable; a rejected InnerTube answer outranks fallback errors',async()=>{
  for(const player of [blocked,()=>new Response('not json'),()=>new Response(JSON.stringify({playabilityStatus:{status:'UNPLAYABLE'},videoDetails:{videoId:id}}))]){
    const result=await fetchYouTubeTranscript(id,mock(page(),captions,player));assert.match(result.text,/Hello world/);
  }
  for(const player of [blocked,()=>new Response('not json')]) await assert.rejects(fetchYouTubeTranscript(id,mock('<html>Consent required</html>',captions,player)),/did not expose public captions/);
  await assert.rejects(fetchYouTubeTranscript(id,mock('<html>Consent required</html>',captions,()=>new Response(playerJSON([])))),/captions are unavailable/);
});
test('cancellation during InnerTube does not fall back to the watch page',async()=>{
  const controller=new AbortController();const calls=[];
  const fetchImpl=async(url,options)=>{calls.push(url);if(calls.length===1){controller.abort();options.signal.throwIfAborted();}return new Response(page());};
  await assert.rejects(fetchYouTubeTranscript(id,{fetchImpl,signal:controller.signal}),{name:'AbortError'});assert.equal(calls.length,1);
});
