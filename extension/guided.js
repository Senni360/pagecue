export function validRegion(rect, viewport) {
  if (!rect || !viewport || ![rect.x,rect.y,rect.width,rect.height,viewport.width,viewport.height].every(Number.isFinite)) throw new Error('Invalid question selection. Drag a new rectangle.');
  if (rect.width < 12 || rect.height < 12 || rect.x < 0 || rect.y < 0 || rect.x+rect.width > viewport.width+1 || rect.y+rect.height > viewport.height+1) throw new Error('Keep the question rectangle inside the visible page.');
  return rect;
}
export async function cropScreenshot(dataURL, rect, viewport) {
  validRegion(rect, viewport);
  const bitmap = await createImageBitmap(await (await fetch(dataURL)).blob());
  try {
    const sx=bitmap.width/viewport.width, sy=bitmap.height/viewport.height;
    const w=Math.round(rect.width*sx), h=Math.round(rect.height*sy);
    const scale=Math.min(1,1800/Math.max(w,h));
    const canvas=new OffscreenCanvas(Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale)));
    canvas.getContext('2d').drawImage(bitmap,rect.x*sx,rect.y*sy,w,h,0,0,canvas.width,canvas.height);
    const bytes=new Uint8Array(await (await canvas.convertToBlob({type:'image/jpeg',quality:.9})).arrayBuffer());
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return 'data:image/jpeg;base64,'+btoa(binary);
  } finally {bitmap.close();}
}

