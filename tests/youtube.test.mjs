import test from 'node:test';
import assert from 'node:assert/strict';
import {youtubeId, fetchYouTubeTranscript} from '../extension/youtube.js';

const id = 'AbCdEf012_-';
const track = (languageCode='en', kind) => ({languageCode, kind, baseUrl:`https://www.youtube.com/api/timedtext?v=${id}&lang=${languageCode}&tlang=fr`});
function page(tracks=[track()], extra={}) { return `<script>var ytInitialPlayerResponse = ${JSON.stringify({videoDetails:{videoId:id,title:'Title with } brace'},playabilityStatus:{status:'OK'},captions:{playerCaptionsTracklistRenderer:{captionTracks:tracks,...extra}}})};</script>`; }
const captions = JSON.stringify({events:[{tStartMs:1000,dDurationMs:2000,segs:[{utf8:'Hello '},{utf8:'world'}]},{tStartMs:3602000,dDurationMs:500,segs:[{utf8:'Next line'}]}]});
function mock(html=page(), body=captions) { const calls=[]; return {calls, fetchImpl:async(url, options) => {calls.push({url, options});return new Response(calls.length === 1 ? html : body);}}; }

test('recognizes strict YouTube URL forms and rejects deceptive sources', () => {
  for (const url of [id,`https://www.youtube.com/watch?v=${id}&x=1`,`https://youtu.be/${id}`,`https://www.youtube-nocookie.com/embed/${id}`,`https://m.youtube.com/shorts/${id}`,`https://youtube.com/live/${id}`]) assert.equal(youtubeId(url),id);
  for (const url of ['bad',null,`https://youtube.com.evil.test/watch?v=${id}`,`https://youtube.com@evil.test/embed/${id}`,`https://user@youtube.com/embed/${id}`,`javascript:youtube.com/watch?v=${id}`,`https://youtube.com:999/embed/${id}`,`https://youtu.be/${id}/extra`]) assert.equal(youtubeId(url),null);
});
test('returns timestamped source text and metadata without playback or translation',async()=>{
  const m=mock();const result=await fetchYouTubeTranscript(id,m);
  assert.equal(result.text,'[00:00:01] Hello world\n[01:00:02] Next line');
  assert.deepEqual(result.segments[0],{start:1,end:3,text:'Hello world'});
  assert.equal(result.language,'en');assert.equal(result.generated,false);assert.equal(result.title,'Title with } brace');
  assert.equal(m.calls.length,2);const url=new URL(m.calls[1].url);assert.equal(url.searchParams.get('fmt'),'json3');assert.equal(url.searchParams.has('tlang'),false);
  assert.equal(m.calls[0].options.credentials,'omit');assert.equal(m.calls[0].options.redirect,'error');
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
    const m=mock(page([{...track(),baseUrl}]));await assert.rejects(fetchYouTubeTranscript(id,m),/invalid caption source/);assert.equal(m.calls.length,1);
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
