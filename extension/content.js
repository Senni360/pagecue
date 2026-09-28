(() => {
  if (globalThis.__pagecue) return;
  globalThis.__pagecue = true;
  let root, shadow, notice, layers, picker = null, hovered = null, question = null, media = null;
  let questionText = "", questionRange = null, currentURL = location.href;
  let cropKeyboard = null;
  // Minimal HUD by default; the optional "hints" setting restores full instructions.
  let hints = false;
  try {
    chrome.storage?.sync?.get('hudHints').then(v => {hints = !!v?.hudHints;}, () => {});
    chrome.storage?.onChanged?.addListener((changes, area) => {if (area === 'sync' && changes.hudHints) hints = !!changes.hudHints.newValue;});
  } catch {}
  const mediaSelector = 'video,audio,a[href]';
  const isMedia = el => {
    if(el?.matches('video,audio'))return true;
    if(!el?.matches('a[href]'))return false;
    if(el.hasAttribute('download'))return true;
    try{return /\.(mp3|mp4|mpeg|mpga|m4a|wav|webm|ogg|flac)$/i.test(new URL(el.href).pathname);}catch{return false;}
  };
  function isVisible(element) {
    if (!element?.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    // Opacity is not inherited: a child can report opacity 1 inside an invisible
    // ancestor. Such text must not silently become part of the question.
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const css = getComputedStyle(ancestor);
      if (css.display === 'none' || css.opacity === '0' || css.contentVisibility === 'hidden') return false;
    }
    return [...element.getClientRects()].some(rect => rect.width && rect.height);
  }
  const pickerCandidates = () => [...document.querySelectorAll(mediaSelector + ',iframe')].filter(el => (el instanceof HTMLIFrameElement || isMedia(el)) && isVisible(el));
  function youtubeSource(el) {
    try {
      const u = new URL(el instanceof HTMLIFrameElement ? el.src : location.href);
      if (!['https:','http:'].includes(u.protocol) || !['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(u.hostname)) return '';
      const id = u.pathname === '/watch' ? u.searchParams.get('v') : u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})(?:\/|$)/)?.[1];
      return /^[\w-]{11}$/.test(id || '') ? 'https://www.youtube.com/watch?v=' + id : '';
    } catch { return ''; }
  }
  function youtubeWrapper(el) {
    if(!(el instanceof HTMLIFrameElement))return false;
    try {const u=new URL(el.src);return u.origin==='https://cdn.eindexamensite.nl'&&!u.username&&!u.password&&/^\/qv\/.+\/index\.html$/.test(u.pathname);}catch{return false;}
  }
  const pickerLabel = el => youtubeSource(el) || youtubeWrapper(el) ? 'Enter retrieves YouTube captions - no playback' : el instanceof HTMLIFrameElement ? 'Enter to choose audio inside this frame' : 'Enter selects this audio';
  function hudName(el) {
    if (youtubeSource(el)) return 'YouTube';
    if (youtubeWrapper(el)) return 'YouTube · school';
    if (el instanceof HTMLIFrameElement) return 'iframe';
    const tag = el.tagName.toLowerCase(), name = (el.getAttribute('aria-label') || el.title || (tag === 'a' ? el.textContent : '') || '').trim().slice(0, 32);
    return name ? `${tag} ${name}` : tag;
  }
  const hudKey = el => youtubeSource(el) || youtubeWrapper(el) ? '↵ captions' : el instanceof HTMLIFrameElement ? '↵ enter frame' : '↵';
  function hoverMark(el) {
    if (hints) return mark('hover', el, pickerLabel(el), '#2583e9');
    const all = pickerCandidates(), i = all.indexOf(el);
    mark('hover', el, hudName(el), '#2583e9', [i >= 0 ? `${i + 1}/${all.length}` : '', hudKey(el)].filter(Boolean).join(' · '), true);
  }

  const mediaURL = el => youtubeSource(el) || el?.currentSrc || el?.src || el?.querySelector("source[src]")?.src || el?.href || "";
  let guidedRun = null, cropSurface = null, cropStart = null, cropRect = null, cropViewport = null, cropScroll = null, answerURL = null;
  const keys = new Set();
  let latched = false;
  const marks = new Map();
  function mount() {
    if (root?.isConnected) return;
    root = document.createElement("div");
    root.id = "pagecue-overlay";
    root.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;outline:none";
    root.tabIndex = -1;
    shadow = root.attachShadow({mode: "closed"});
    const style = document.createElement("style");
    // DevTools-inspector look: hairline outline, tinted fill, small white tooltip beside the element.
    style.textContent = `:host{all:initial}*{box-sizing:border-box}.box{position:fixed;border:1px solid var(--color);background:color-mix(in srgb,var(--color) 22%,transparent);pointer-events:none}.box.ghost{border-style:dashed;background:none;opacity:.55}.tag{position:absolute;left:-1px;top:calc(100% + 6px);background:#fff;color:#333;padding:3px 7px;font:11px/1.4 system-ui,sans-serif;border-radius:3px;box-shadow:0 1px 4px #0005;max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tag.above{top:auto;bottom:calc(100% + 6px)}.tag.inside{top:4px;left:4px}.tag b{color:var(--color);font-weight:600}.tag i{font-style:normal;color:#888;margin-left:6px;white-space:pre}.notice{position:fixed;right:12px;bottom:12px;max-width:320px;padding:4px 9px;background:#202124ee;color:#e8eaed;border-radius:3px;box-shadow:0 1px 4px #0006;font:11px/1.45 system-ui,sans-serif;white-space:pre-wrap}.notice.err{background:#3c1f1fee;color:#ffb4ab}.notice:empty{display:none}`;
    layers = document.createElement("div");
    notice = document.createElement("div"); notice.className = "notice"; notice.setAttribute("role", "status");
    shadow.append(style, layers, notice); document.documentElement.append(root);
  }
  let timer;
  function say(text, persist = false, error = false) {
    mount(); clearTimeout(timer); notice.textContent = hints ? `PageCue · ${text}` : text; notice.classList.toggle('err', error);
    if (!persist) timer = setTimeout(() => {notice.textContent = "";}, hints ? 6500 : 3500);
  }
  function mark(key, target, label, color, meta = '', dims = false) {mount(); marks.set(key, {target, label, color, meta, dims}); draw();}
  function tagFor(item, r) {
    const tag = document.createElement("span"); tag.className = "tag";
    const name = document.createElement("b"); name.textContent = item.label; tag.append(name);
    const meta = [item.dims ? `${Math.round(r.width)} × ${Math.round(r.height)}` : '', item.meta].filter(Boolean).join(' · ');
    if (meta) {const extra = document.createElement("i"); extra.textContent = meta; tag.append(extra);}
    return tag;
  }
  // Keep the tooltip on screen: below the element, else above, else inside its top-left corner.
  function placeTag(tag, r) {
    tag.classList.remove('above', 'inside'); tag.style.left = '';
    if (r.bottom + 30 > innerHeight) tag.classList.add(r.top > 30 ? 'above' : 'inside');
    const t = tag.getBoundingClientRect();
    if (t.left < 4) tag.style.left = `${4 - r.left}px`;
    else if (t.right > innerWidth - 4) tag.style.left = `${innerWidth - 4 - t.width - r.left}px`;
  }
  function draw() {
    if (!layers) return;
    if (picker === "media" && root) root.style.visibility = document.hasFocus() && !(document.activeElement instanceof HTMLIFrameElement) ? "visible" : "hidden";
    layers.replaceChildren();
    for (const [key, item] of marks) {
      if (key.startsWith("candidate-") && marks.get("hover")?.target === item.target) continue;
      if (item.target instanceof Element && !item.target.isConnected) {marks.delete(key); continue;}
      const rawRects = item.target instanceof Range ? [...item.target.getClientRects()] : [item.target.getBoundingClientRect()];
      const rects = rawRects.filter((r, i) => !rawRects.some((other, j) => j !== i && other.left <= r.left && other.top <= r.top && other.right >= r.right && other.bottom >= r.bottom && (other.width * other.height > r.width * r.height || j < i && other.width === r.width && other.height === r.height)));
      rects.slice(0, 150).forEach((r, i) => {
        if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) return;
        const box = document.createElement("div"); box.className = key.startsWith("candidate-") && !hints ? "box ghost" : "box";
        box.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;--color:${item.color}`;
        // Native media controls can swallow clicks. In picker mode, intercept on
        // the visible highlight so choosing a player does not press Play/Seek.
        if (picker === "media" && (key === "hover" || key.startsWith("candidate-"))) {
          box.style.pointerEvents = "auto";
          box.addEventListener("pointerenter", () => {hovered = item.target;});
        }
        const tag = i === 0 && item.label && box.className === "box" ? tagFor(item, r) : null;
        if (tag) box.append(tag);
        layers.append(box);
        if (tag) placeTag(tag, r);
      });
    }
  }
  function checkURL() {
    if (currentURL === location.href) return;
    answerURL = null;
    if (guidedRun) void send({type:'guided-cancel',runId:guidedRun});
    clearCrop(); guidedRun = null;
    currentURL = location.href; question = media = questionRange = null; questionText = ""; marks.clear(); picker = null; draw();
  }
  async function send(message) {
    try {
      const result = await chrome.runtime.sendMessage(message);
      if (result?.error) say(result.error, true);
      return result;
    } catch {say("Extension reloaded. Refresh this page.", true);}
  }
  function begin(mode) {
    restoreAnswerURL();
    checkURL(); picker = mode; hovered = null;
    mount();
    // All frames receive the picker message. Only the currently focused frame
    // should move focus, otherwise a background iframe steals the keyboard.
    if(document.hasFocus() && !(document.activeElement instanceof HTMLIFrameElement))root.focus({preventScroll:true});
    clearCandidates();
    if (mode === "media") {
      pickerCandidates().forEach((el, i) => marks.set(`candidate-${i}`, {target:el, label:hints ? pickerLabel(el) : '', color:"#2583e9"}));
      mount(); draw();
      hovered=pickerCandidates()[0]||null;
      if(hovered)hoverMark(hovered);
    }
    say(hints ? "Arrows or Tab choose audio; Enter selects. You can also click a player or download link. Escape cancels." : "Audio · ↑↓ · ↵ · Esc", true);
  }
  function clearCandidates() {for (const key of marks.keys()) if (key.startsWith("candidate-")) marks.delete(key);}
  function chooseMedia(element, forGuided = false) {
    if(element instanceof HTMLIFrameElement && !youtubeSource(element) && !youtubeWrapper(element)){picker='media';hovered=element;mark('hover',element,hints?'Selecting audio inside this frame · Escape cancels':'iframe','#2583e9',hints?'':'inside  Esc');element.contentWindow?.focus();return;}
    if (element.mediaKeys) {begin('media');say("Protected media is unsupported. Choose another player with arrows, then Enter.", true); return;}
    media = element;
    const id = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2,"0")).join("");
    const label = element.getAttribute("aria-label") || element.title || (element.tagName === "A" ? element.textContent : "") || element.closest("figure")?.querySelector("figcaption")?.innerText || `${element.tagName.toLowerCase()} player`;
    const url = mediaURL(element);
    if (!url) {
      media = null; begin("media");
      say("This player has not exposed an audio file yet. Escape to close selection, press Play briefly, then pause and try ST again.", true);
      return;
    }
    media.dataset.pagecueId = id;
    const selected = {id,label:label.slice(0,180),url,pageUrl:location.href};
    mark("media", media, hints ? (forGuided ? 'Selected audio · next: select question' : 'Selected media') : hudName(media), "#2583e9", hints ? '' : '✓');
    void send({type: "media-selected", media:selected});
    if (forGuided) void send({type:'guided-media',runId:guidedRun,media:selected}).then(result=>{if(result?.error)begin('media');});
    else say("Media selected. Open PageCue to download the file, or use ST to transcribe and answer.");
  }
  function clearCrop() {cropSurface?.remove(); cropSurface=null;cropStart=null;cropKeyboard=null;}
  function inRect(a,b) {return a.right>b.x && a.left<b.x+b.width && a.bottom>b.y && a.top<b.y+b.height;}
  function regionText(rect) {
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const parts=[];let node;let length=0;
    while ((node=walker.nextNode())) {
      const parent=node.parentElement;
      if(!parent || parent.closest('script,style,noscript,textarea,input,select,#pagecue-overlay') || !node.textContent.trim())continue;
      if(!isVisible(parent))continue;
      const range=document.createRange();range.selectNodeContents(node);
      if(![...range.getClientRects()].some(r=>inRect(r,rect)))continue;
      // Include only words whose centers are inside the crop, not entire text nodes.
      const words=node.textContent.matchAll(/\S+/g);
      const chosen=[];
      for(const word of words) {
        range.setStart(node,word.index);range.setEnd(node,word.index+word[0].length);
        if([...range.getClientRects()].some(r=>r.left+r.width/2>=rect.x && r.left+r.width/2<=rect.x+rect.width && r.top+r.height/2>=rect.y && r.top+r.height/2<=rect.y+rect.height))chosen.push(word[0]);
      }
      if(chosen.length){const line=chosen.join(' ');parts.push(line);length+=line.length;if(length>40000)break;}
    }
    const hasVisual=[...document.querySelectorAll('img,canvas,svg,iframe,video')].some(el=>isVisible(el)&&inRect(el.getBoundingClientRect(),rect));
    return {text:parts.join('\n'),hasVisual};
  }
  function questionCrop(runId,source,reuse=false) {
    if(document.activeElement instanceof HTMLIFrameElement)document.activeElement.blur();window.focus();
    mount();root.style.visibility="visible";root.focus({preventScroll:true});clearCrop();cropRect=null;guidedRun=runId;picker=null;marks.clear();draw();questionRange=question=null;
    restoreAnswerURL();
    cropSurface=document.createElement('div');
    cropSurface.style.cssText=`position:fixed;inset:0;pointer-events:auto;cursor:crosshair;touch-action:none${hints?';background:#0c122033':''}`;
    const box=document.createElement('div');box.className='box';box.style.setProperty('--color','#9258e8');box.style.background='#9258e814';
    cropSurface.append(box);shadow.append(cropSurface);
    // Keep instructions above the dimmer without allowing them to steal the drag.
    shadow.append(notice);
    say(hints ? `${reuse ? "Using transcript" : "Audio selected"}: ${source}\nArrows move the box; Shift+arrows resize; Enter submits. Or drag around the question AND choices. Escape cancels.` : "Question + choices · drag or arrows · ⇧ resize · ↵ · Esc",true);
    const position=e=>({x:Math.max(0,Math.min(innerWidth,e.clientX)),y:Math.max(0,Math.min(innerHeight,e.clientY))});
    cropSurface.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;e.preventDefault();cropStart=position(e);cropSurface.setPointerCapture(e.pointerId);
      cropScroll={x:scrollX,y:scrollY};cropViewport={width:innerWidth,height:innerHeight};
    });
    cropSurface.addEventListener('pointermove',e=>{
      if(!cropStart)return;const p=position(e);
      cropRect={x:Math.min(cropStart.x,p.x),y:Math.min(cropStart.y,p.y),width:Math.abs(p.x-cropStart.x),height:Math.abs(p.y-cropStart.y)};
      paint();
    });
    cropSurface.addEventListener('wheel',e=>e.preventDefault(),{passive:false});
    async function submitCrop() {
      if(!cropRect || cropRect.width<12 || cropRect.height<12){say('Make a larger rectangle around the question and choices.');return;}
      const selection=regionText(cropRect), rect={...cropRect}; clearCrop();
      const anchor={getBoundingClientRect:()=>({left:rect.x+cropScroll.x-scrollX,top:rect.y+cropScroll.y-scrollY,width:rect.width,height:rect.height,bottom:rect.y+cropScroll.y-scrollY+rect.height,right:rect.x+cropScroll.x-scrollX+rect.width})};
      question=anchor;questionText=selection.text;mark('question',anchor,'Selected question','#9258e8');
      await send({type:'guided-question-ready',runId:guidedRun,rect,viewport:cropViewport,...selection});
    }
    cropSurface.addEventListener('pointerup',e=>{if(!cropStart)return;e.preventDefault();const q=position(e);cropRect={x:Math.min(cropStart.x,q.x),y:Math.min(cropStart.y,q.y),width:Math.abs(q.x-cropStart.x),height:Math.abs(q.y-cropStart.y)};void submitCrop();});
    cropViewport={width:innerWidth,height:innerHeight};cropScroll={x:scrollX,y:scrollY};
    cropRect={x:Math.round(innerWidth*.2),y:Math.round(innerHeight*.2),width:Math.round(innerWidth*.6),height:Math.round(innerHeight*.5)};
    function paint(){
      Object.assign(box.style,{left:cropRect.x+'px',top:cropRect.y+'px',width:cropRect.width+'px',height:cropRect.height+'px'});
      const r={left:cropRect.x,top:cropRect.y,width:cropRect.width,height:cropRect.height,bottom:cropRect.y+cropRect.height};
      const tag=tagFor({label:'question',meta:'',dims:true},r);box.replaceChildren(tag);placeTag(tag,r);
    }
    paint();
    cropKeyboard=e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter'].includes(e.key))return false;
      e.preventDefault();e.stopImmediatePropagation();
      if(e.key==='Enter'){void submitCrop();return true;}
      const dx=e.key==='ArrowLeft'?-10:e.key==='ArrowRight'?10:0,dy=e.key==='ArrowUp'?-10:e.key==='ArrowDown'?10:0;
      if(e.shiftKey){cropRect.width=Math.max(12,Math.min(innerWidth-cropRect.x,cropRect.width+dx));cropRect.height=Math.max(12,Math.min(innerHeight-cropRect.y,cropRect.height+dy));}
      else{cropRect.x=Math.max(0,Math.min(innerWidth-cropRect.width,cropRect.x+dx));cropRect.y=Math.max(0,Math.min(innerHeight-cropRect.height,cropRect.y+dy));}paint();return true;
    };
  }

  function restoreAnswerURL() {
    if (!answerURL) return;
    const {original, displayed} = answerURL;
    answerURL = null;
    if (location.href === displayed) {
      history.replaceState(history.state, '', original);
      currentURL = location.href;
    }
  }
  function toggleAnswerURL(message) {
    if (answerURL) {restoreAnswerURL();return;}
    const answer = String(message.text || '').trim().replace(/\s+/g, ' ');
    if (!answer) return;
    const original = location.href;
    const url = new URL(original);
    url.pathname = url.pathname.replace(/\/$/, '') + '/' + encodeURIComponent(answer);
    history.replaceState(history.state, '', url.href);
    answerURL = {original, displayed: location.href};
    currentURL = location.href;
    if (notice) notice.textContent = '';
  }
  document.addEventListener("mousemove", event => {
    if (!picker) return;
    let target = event.target;
    if (!(target instanceof Element) || target === root) return;
    if (picker === "media") {const candidate=target.closest(mediaSelector);target=isMedia(candidate)?candidate:[...target.querySelectorAll(mediaSelector)].find(isMedia);}
    else {
      target = target.closest("fieldset,[role=group],p,li,article,section,div") || target;
      if (event.shiftKey) target = target.parentElement;
      if ([document.body, document.documentElement].includes(target)) target = null;
    }
    hovered = target;
    if (target && picker === "media") hoverMark(target);
    else if (target) mark("hover", target, "Click to select question + choices", "#9258e8");
    else {marks.delete("hover"); draw();}
  }, true);
  document.addEventListener("click", event => {
    if (!picker || !hovered) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const mode = picker; picker = null; marks.delete("hover"); clearCandidates();
    if (mode === "media") chooseMedia(hovered,!!guidedRun);
    hovered = null; draw();
  }, true);
  document.addEventListener("keydown", event => {
    checkURL();
    if(event.key==='Escape'){
      if(guidedRun)void send({type:'guided-cancel',runId:guidedRun});
      guidedRun=null;clearCrop();picker=null;hovered=null;keys.clear();latched=false;marks.clear();draw();restoreAnswerURL();if(notice)notice.textContent='';return;
    }
    const typing=event.composedPath().some(el=>el instanceof Element&&(el.matches('input,textarea,select,[role=textbox]')||el.isContentEditable));
    if(typing||event.ctrlKey||event.altKey||event.metaKey||event.isComposing)return;
    if(cropKeyboard?.(event))return;
    if(picker==='media'&&['ArrowUp','ArrowDown','Tab','Enter'].includes(event.key)){
      event.preventDefault();event.stopImmediatePropagation();
      const candidates=pickerCandidates();
      if(!candidates.length){say('No visible player or download link in this frame.');return;}
      if(event.key==='Enter'){const target=hovered||candidates[0];picker=null;clearCandidates();marks.delete('hover');chooseMedia(target,!!guidedRun);draw();return;}
      const step=event.key==='ArrowUp'||event.shiftKey?-1:1;
      hovered=candidates[(candidates.indexOf(hovered)+step+candidates.length)%candidates.length];hovered.scrollIntoView({block:'nearest'});hoverMark(hovered);return;
    }
    if(event.repeat)return;
    keys.add(event.key.toLowerCase());if(latched)return;
    if(keys.has('q')&&keys.has('a')){latched=true;event.preventDefault();void send({type:'qa-start'});}
    else if(keys.has('s')&&keys.has('t')){latched=true;event.preventDefault();void send({type:'guided-start'});}
    else if(keys.has('r')&&keys.has('a')){latched=true;event.preventDefault();void send({type:'reveal'});}
  },true);
  document.addEventListener("keyup", event => {keys.delete(event.key.toLowerCase()); if (!keys.size) latched = false;}, true);
  window.addEventListener("blur", () => {keys.clear(); latched = false;});
  window.addEventListener("focus", () => {if(picker === "media") draw();});
  window.addEventListener("blur", () => {if(picker === "media") setTimeout(draw, 0);});
  let redraw;
  const queueDraw = () => {cancelAnimationFrame(redraw); redraw = requestAnimationFrame(draw);};
  window.addEventListener("scroll", queueDraw, true); window.addEventListener("resize", queueDraw);
  setInterval(() => {checkURL(); if (marks.size && document.visibilityState === "visible") queueDraw();}, 500);
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    checkURL();
    
    if (message.type === "select-media") {guidedRun=null;begin("media"); respond({ok:true});}
    if(message.type==='guided-pick-media'){marks.clear();clearCrop();guidedRun=message.runId;begin('media');respond({ok:true});}
    if(message.type==='guided-end-picker'){picker=null;hovered=null;clearCandidates();marks.delete('hover');if(root)root.style.visibility='visible';if(notice)notice.textContent='';draw();respond({ok:true});}
    if(message.type==='guided-question'){questionCrop(message.runId,message.source,message.reuse);respond({ok:true});}
    if(message.type==='guided-validate')respond({ok:guidedRun===message.runId && cropViewport?.width===innerWidth && cropViewport?.height===innerHeight && cropScroll?.x===scrollX && cropScroll?.y===scrollY});
    if(message.type==='guided-hide'){
      mount();root.style.visibility='hidden';
      // Background/occluded tabs can suspend animation frames indefinitely.
      // Hiding is synchronous; the fallback prevents capture from getting stuck.
      let answered=false;
      const finish=()=>{if(answered)return;answered=true;clearTimeout(fallback);respond({ok:true});};
      const fallback=setTimeout(finish,150);
      requestAnimationFrame(()=>requestAnimationFrame(finish));return true;
    }
    if(message.type==='guided-show'){if(root)root.style.visibility='visible';respond({ok:true});}
    if(message.type==='guided-cancelled'){guidedRun=null;picker=null;clearCrop();clearCandidates();marks.clear();draw();if(notice)notice.textContent='';respond({ok:true});}
    if(message.type==='reveal-answer'){toggleAnswerURL(message);respond({ok:true});}
    if (message.type === "validate-media") respond({ok: !!media?.isConnected && !media.mediaKeys && media.dataset.pagecueId === message.id && message.pageUrl === location.href && mediaURL(media) === message.url});
    if (message.type === "status") {
      if (message.url && message.url !== location.href) return;
      const target = message.kind === "answer" ? questionRange || question : media;
      if (target) mark(message.kind === "answer" ? "question" : "media", target, message.text, message.error ? "#bd4545" : message.kind === "answer" ? "#9258e8" : "#2583e9");
      if(window === window.top)say(message.text, !!message.error, !!message.error); if(message.text.startsWith("Ready")){marks.clear();draw();} respond({ok:true});
    }
  });
})();
