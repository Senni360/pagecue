const ID = /^[A-Za-z0-9_-]{11}$/;
const NO_CAPTIONS = 'YouTube captions are unavailable for this video. Your previous transcript has been kept. No playback or recording was started.';

export function youtubeId(value) {
  if (typeof value !== 'string') return null;
  if (ID.test(value)) return value;
  let url; try { url = new URL(value); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
  let id;
  if (url.hostname === 'youtu.be') id = /^\/([\w-]+)\/?$/.exec(url.pathname)?.[1];
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:embed|shorts|live)\/([\w-]+)\/?$/.exec(url.pathname)?.[1];
  }
  return ID.test(id || '') ? id : null;
}

// Extract a JSON object without executing any script supplied by a web page.
function playerResponse(html) {
  const marker = /(?:\bytInitialPlayerResponse\s*=|["']ytInitialPlayerResponse["']\s*\]\s*=|["']ytInitialPlayerResponse["']\s*:)\s*\{/g;
  for (const match of html.matchAll(marker)) {
    const start = match.index + match[0].lastIndexOf('{');
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < html.length; i++) {
      const c = html[i];
      if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
      else if (c === '"') quoted = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try { const data = JSON.parse(html.slice(start, i + 1)); if (data && typeof data === 'object') return data; } catch {}
        break;
      }
    }
  }
  return null;
}

async function readLimited(response, maxBytes) {
  if (!response.ok) throw new Error(`YouTube caption access failed (HTTP ${response.status}). Try again later or choose another source.`);
  if (Number(response.headers?.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('YouTube returned an unexpectedly large caption response.'); }
  const reader = response.body?.getReader();
  if (!reader) { const text = await response.text(); if (new TextEncoder().encode(text).length > maxBytes) throw new Error('YouTube caption response is too large.'); return text; }
  const decoder = new TextDecoder(); let count = 0, text = '';
  try {
    while (true) { const {value, done} = await reader.read(); if (done) break; count += value.byteLength; if (count > maxBytes) { await reader.cancel(); throw new Error('YouTube caption response is too large.'); } text += decoder.decode(value, {stream:true}); }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

function chooseTrack(renderer) {
  const tracks = renderer?.captionTracks;
  if (!Array.isArray(tracks) || !tracks.length) throw new Error(NO_CAPTIONS);
  const audio = renderer.audioTracks?.[renderer.defaultAudioTrackIndex ?? 0];
  const preferred = tracks[audio?.defaultCaptionTrackIndex] || tracks[audio?.captionTrackIndices?.[0]] || tracks.find(t => t?.isDefault) || tracks[0];
  // Prefer human captions in the default audio language; never request translation.
  return tracks.find(t => t?.languageCode === preferred?.languageCode && t.kind !== 'asr') || preferred;
}

function timedTextURL(track, videoId) {
  let url; try { url = new URL(track?.baseUrl); } catch { throw new Error(NO_CAPTIONS); }
  if (url.origin !== 'https://www.youtube.com' || url.username || url.password || url.pathname !== '/api/timedtext' || url.searchParams.get('v') !== videoId) throw new Error('YouTube returned an invalid caption source.');
  url.searchParams.delete('tlang');
  url.searchParams.set('fmt', 'json3');
  return url.href;
}

function parseCaptions(text) {
  if (!text.trim()) throw new Error('YouTube exposed a caption track but returned no caption data; access may be blocked. Your previous transcript has been kept. No playback or recording was started.');
  let data; try { data = JSON.parse(text); } catch { throw new Error(NO_CAPTIONS); }
  if (!Array.isArray(data?.events)) throw new Error(NO_CAPTIONS);
  const segments = [];
  for (const event of data.events) {
    if (!Array.isArray(event?.segs)) continue;
    const words = event.segs.map(s => typeof s?.utf8 === 'string' ? s.utf8 : '').join('').replace(/\s+/g, ' ').trim();
    const startMs = event.tStartMs, durationMs = event.dDurationMs ?? 0;
    if (!words || typeof startMs !== 'number' || !Number.isFinite(startMs) || startMs < 0 || typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) continue;
    segments.push({start:startMs / 1000, end:(startMs + durationMs) / 1000, text:words});
  }
  if (!segments.length) throw new Error(NO_CAPTIONS);
  return segments.sort((a,b) => a.start - b.start);
}

function timestamp(seconds) { const n = Math.floor(seconds); return `${String(Math.floor(n/3600)).padStart(2,'0')}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; }

export async function fetchYouTubeTranscript(videoId, {signal, fetchImpl = fetch} = {}) {
  if (typeof videoId !== 'string' || !ID.test(videoId)) throw new Error('Invalid YouTube video ID.');
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, {once:true});
  const timer = setTimeout(() => controller.abort(new Error('YouTube caption retrieval timed out. Try again.')), 25000);
  const options = {signal:controller.signal, credentials:'omit', redirect:'error', cache:'no-store'};
  try {
    controller.signal.throwIfAborted();
    const html = await readLimited(await fetchImpl(`https://www.youtube.com/watch?v=${videoId}`, options), 8_000_000);
    const player = playerResponse(html);
    if (!player) throw new Error('YouTube did not expose public captions. It may require sign-in or be blocking access. Your previous transcript has been kept.');
    if (player.videoDetails?.videoId !== videoId) throw new Error('YouTube returned a different video. No transcript was saved.');
    if (player.playabilityStatus?.status && player.playabilityStatus.status !== 'OK') throw new Error(NO_CAPTIONS);
    const track = chooseTrack(player.captions?.playerCaptionsTracklistRenderer);
    const segments = parseCaptions(await readLimited(await fetchImpl(timedTextURL(track, videoId), options), 5_000_000));
    return {videoId, text:segments.map(s => `[${timestamp(s.start)}] ${s.text}`).join('\n'), segments, language:typeof track.languageCode === 'string' ? track.languageCode : '', generated:track.kind === 'asr', title:typeof player.videoDetails.title === 'string' ? player.videoDetails.title : 'YouTube video'};
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof TypeError) throw new Error('Could not connect to YouTube captions. Check your connection or try again later; YouTube may be blocking access. Your previous transcript has been kept. No playback or recording was started.');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
