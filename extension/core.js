export const MAX_BYTES = 24_000_000;
export function mediaURL(value) {
  let u; try { u = new URL(value); } catch { throw new Error('Select a player with a downloadable audio URL.'); }
  if (!['http:', 'https:'].includes(u.protocol) || /\.(m3u8|mpd)(?:$|[?#])/i.test(u.href)) throw new Error('This selection is not a direct downloadable file. Choose its download link or another player.');
  return u.href;
}
export function fileExtension(url, mime='') {
  const ext=new URL(url).pathname.split('.').pop().toLowerCase();
  if (['mp3','mp4','mpeg','mpga','m4a','wav','webm','ogg','flac'].includes(ext)) return ext;
  const types={'audio/mpeg':'mp3','audio/mp4':'m4a','video/mp4':'mp4','audio/wav':'wav','audio/x-wav':'wav','audio/webm':'webm','video/webm':'webm','audio/ogg':'ogg','audio/flac':'flac'};
  if(types[mime.split(';')[0]])return types[mime.split(';')[0]];
  throw new Error('The download is not a supported audio file. Check the selected source.');
}
