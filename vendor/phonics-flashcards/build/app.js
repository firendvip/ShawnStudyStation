/* ===== data prep ===== */
const CARDS={}; UNITS.forEach(u=>u.cards.forEach(c=>{c.level=u.level;CARDS[c.id]=c;}));
const WORDMAP={};
UNITS.forEach(u=>{ u.dictWords=[]; u.cards.forEach(c=>c.words.forEach((w,i)=>{
  const wid=c.id+'#'+i; const it={wid,w:w.w,cn:w.cn}; WORDMAP[wid]=it; u.dictWords.push(it);
})); });
const READUNITS=[];
for(let L=1;L<=5;L++){ for(let u=1;u<=7;u++){ const i=(L-1)*8+(u-1);
  READUNITS.push({key:'L'+L+'-U'+u+',U'+(u+1),label:'L'+L+'-U'+u+',U'+(u+1),cards:UNITS[i].cards.concat(UNITS[i+1].cards)}); } }
const cardReview=new Set(), readReview=new Set(), dictReview=new Set();
function flashReview(){ return mode==='read'?readReview:cardReview; }
function inReview(id){ return flashReview().has(id); }
/* 媒体映射（构建时按相对路径注入；video/ video_trim/ 文件夹随 HTML 一起分发）。
   CARD_VIDEO: cardId -> 原始 MP4；CARD_VIDEO_TRIM: cardId -> 去停顿 MP4；
   翻面=后台播放该 MP4 的声音(不显画面)；点视频按钮=把同一视频调到前台。
   WORDAUDIO : 单词 -> 真人发音（听写用，内嵌） */
const CARD_VIDEO = (typeof window!=='undefined' && window.CARD_VIDEO) ? window.CARD_VIDEO : {};
const CARD_VIDEO_TRIM = (typeof window!=='undefined' && window.CARD_VIDEO_TRIM) ? window.CARD_VIDEO_TRIM : {};
const WORDAUDIO = (typeof window!=='undefined' && window.WORD_AUDIO) ? window.WORD_AUDIO : {};

/* 离屏宿主：视频元素放这里后台出声、不显画面；点按钮时再移进弹窗显示 */
const mediaHost=document.createElement('div'); mediaHost.className='mediahost';
document.addEventListener('DOMContentLoaded',()=>document.body.appendChild(mediaHost));
if(document.body)document.body.appendChild(mediaHost);
const videoCache={};
function chosenVideoUrl(cid){ return (useTrimVideo&&CARD_VIDEO_TRIM[cid])?CARD_VIDEO_TRIM[cid]:CARD_VIDEO[cid]; }
function getVideoEl(cid){ const url=chosenVideoUrl(cid); if(!url)return null;
 let v=videoCache[cid];
 if(!v||v.dataset.url!==url){ if(v&&v.parentNode)v.parentNode.removeChild(v);
   v=document.createElement('video'); v.preload='auto'; v.playsInline=true; v.src=url; v.dataset.url=url; v.dataset.cid=cid;
   mediaHost.appendChild(v); videoCache[cid]=v; }
 return v; }
function preloadCard(cid){ if(videoCache[cid])return; getVideoEl(cid); }

/* ===== state ===== */
let mode='card', sub=null, unitIdx=0;
let showCN=false, showAllWords=false, dictRandom=true, pauseMs=5000, playRate=1, useTrimVideo=true;
let theme='classic';
const revealedWords=new Set();
const SPEEDS=[0.25,0.5,0.75,1,1.5,2,3,4];
const THEMES=['boy-young','boy-old','girl-young','girl-old','classic'];

/* ===== persistence (localStorage：关掉再打开仍在) ===== */
const STORE_KEY='xshzp.v1';
function persist(){ try{ localStorage.setItem(STORE_KEY, JSON.stringify({
  v:1, cardReview:[...cardReview], readReview:[...readReview], dictReview:[...dictReview],
  mode, unitIdx, showCN, dictRandom, pauseMs, playRate, useTrimVideo, theme })); }catch(e){} }
function loadState(){ let raw; try{ raw=localStorage.getItem(STORE_KEY); }catch(e){ return; }
 if(!raw)return; let d; try{ d=JSON.parse(raw); }catch(e){ return; } if(!d||typeof d!=='object')return;
 /* Review 按现有数据校验，过滤已不存在的 id（防数据变更后脏键） */
 (d.cardReview||[]).forEach(id=>{ if(CARDS[id])cardReview.add(id); });
 (d.readReview||[]).forEach(id=>{ if(CARDS[id])readReview.add(id); });
 (d.dictReview||[]).forEach(id=>{ if(WORDMAP[id])dictReview.add(id); });
 if(d.mode==='card'||d.mode==='read'||d.mode==='dict')mode=d.mode;
 if(typeof d.showCN==='boolean')showCN=d.showCN;
 if(typeof d.dictRandom==='boolean')dictRandom=d.dictRandom;
 if([4000,5000,6000,8000].indexOf(d.pauseMs)>=0)pauseMs=d.pauseMs;
 if(SPEEDS.indexOf(d.playRate)>=0)playRate=d.playRate;
 if(typeof d.useTrimVideo==='boolean')useTrimVideo=d.useTrimVideo;
 if(THEMES.indexOf(d.theme)>=0)theme=d.theme;
 if(Number.isInteger(d.unitIdx)&&d.unitIdx>=0)unitIdx=d.unitIdx; }
loadState();

/* ===== speech ===== */
let VOICE=null;
function pickVoice(){const vs=speechSynthesis.getVoices()||[];
 VOICE=vs.find(v=>/en[-_]US/i.test(v.lang)&&/(female|samantha|zira|google us english|aria|jenny)/i.test(v.name))
   ||vs.find(v=>/en[-_]US/i.test(v.lang))||vs.find(v=>/^en[-_]/i.test(v.lang))||vs[0]||null;}
function utter(t,r){const u=new SpeechSynthesisUtterance(t);if(VOICE)u.voice=VOICE;u.lang='en-US';
 u.rate=Math.max(0.1,Math.min(2,(r||0.85)*playRate));return u;}
if('speechSynthesis'in window){ pickVoice(); speechSynthesis.onvoiceschanged=pickVoice;
 setInterval(()=>{ try{ if(speechSynthesis.speaking&&speechSynthesis.paused)speechSynthesis.resume(); }catch(e){} },4000); }

/* ===== 统一音频序列器（一次只放一个；真人音频+TTS 混合序列；暂停/继续） =====
   item：{audio:url, alt:回退TTS文本, rate} 或 {tts:文本, rate} */
const Cur={token:0,audio:null,video:null};
function closeVideo(){ const m=document.getElementById('vmodal'); if(!m)return;
 const v=m.querySelector('video'); if(v){ try{v.pause();}catch(e){} v.controls=false; v.classList.remove('vfront'); mediaHost.appendChild(v); }
 m.remove(); }
function stopVideo(){ if(Cur.video){ try{Cur.video.pause();}catch(e){} Cur.video=null; } closeVideo(); }
function stopPlayback(){ Cur.token++; if(Cur.audio){try{Cur.audio.pause();}catch(e){}Cur.audio=null;}
 try{speechSynthesis.cancel();}catch(e){} stopVideo(); }
function speakOne(text,rate,my,next){ if(!('speechSynthesis'in window)||!text){ next(); return; }
 const u=utter(text,rate); u.onend=()=>{ if(my===Cur.token)next(); }; u.onerror=()=>{ if(my===Cur.token)next(); };
 try{speechSynthesis.speak(u);}catch(e){ if(my===Cur.token)next(); } }
function playItems(items,done){ Cur.token++; const my=Cur.token;
 if(Cur.audio){try{Cur.audio.pause();}catch(e){}Cur.audio=null;} try{speechSynthesis.cancel();}catch(e){} stopVideo();
 const q=items.slice();
 (function step(){ if(my!==Cur.token)return;
   if(!q.length){ if(done)done(my); return; }
   const it=q.shift();
   if(it&&it.audio){ const a=new Audio(it.audio); a.playbackRate=playRate; Cur.audio=a;
     const fb=()=>{ if(my!==Cur.token)return; Cur.audio=null; if(it.alt)speakOne(it.alt,it.rate,my,step); else step(); };
     a.onended=()=>{ if(my===Cur.token){ Cur.audio=null; step(); } };
     a.onerror=fb; a.play().catch(fb); }
   else if(it&&it.tts){ speakOne(it.tts,it.rate,my,step); }
   else step(); })();
 return my; }
function wordItems(w,times){ const out=[]; for(let i=0;i<(times||1);i++){
   out.push(WORDAUDIO[w] ? {audio:WORDAUDIO[w],alt:w,rate:0.85} : {tts:w,rate:0.85}); } return out; }
function sayWord(w){ playItems(wordItems(w,1)); }
/* 翻面：后台播放该卡 MP4 的声音（不显画面），仅一次。用预加载缓存做到秒播放。 */
function playCard(rec){ stopPlayback();
 const v=getVideoEl(rec.id);
 if(!v){ if(rec.cue)playItems([{tts:rec.cue,rate:0.85}]); return; }
 Cur.token++; Cur.video=v; if(v.parentNode!==mediaHost)mediaHost.appendChild(v); v.controls=false; v.classList.remove('vfront');
 try{v.currentTime=0;}catch(e){} v.playbackRate=playRate;
 v.play().catch(()=>{}); }
/* ===== 视频按钮：把（正在后台播的）该卡视频调到前台弹窗显示；互斥、翻卡自动关 ===== */
function openVideo(rec){
 let v=Cur.video;
 if(!v || v.dataset.cid!==rec.id){ stopPlayback(); v=getVideoEl(rec.id); if(!v)return;
   Cur.token++; Cur.video=v; try{v.currentTime=0;}catch(e){} v.playbackRate=playRate; }
 const m=document.createElement('div'); m.id='vmodal'; m.className='vmodal';
 const box=document.createElement('div'); box.className='vbox';
 const close=document.createElement('button'); close.className='vclose'; close.type='button'; close.setAttribute('aria-label','关闭'); close.textContent='×';
 close.addEventListener('click',stopPlayback); box.appendChild(close);
 v.controls=true; v.classList.add('vfront'); box.appendChild(v);
 m.appendChild(box); m.addEventListener('click',e=>{ if(e.target===m)stopPlayback(); });
 document.addEventListener('keydown',function esc(e){ if(e.key==='Escape'){stopPlayback();document.removeEventListener('keydown',esc);} });
 document.body.appendChild(m); if(v.paused)v.play().catch(()=>{}); }
function pauseToggle(btn){
 if(Cur.video){ if(Cur.video.paused){Cur.video.play();setPI(btn,false);}else{Cur.video.pause();setPI(btn,true);} }
 else if(Cur.audio){ if(Cur.audio.paused){Cur.audio.play();setPI(btn,false);}else{Cur.audio.pause();setPI(btn,true);} }
 else if('speechSynthesis'in window){ if(speechSynthesis.paused){speechSynthesis.resume();setPI(btn,false);}
   else if(speechSynthesis.speaking){speechSynthesis.pause();setPI(btn,true);} } }

/* ===== flashcards (闪卡 / 见词能读) ===== */
/* 三角形重心(centroid)落在 viewBox 中心(8,8)，flex 居中后正好压在圆心 */
const PLAY='<svg viewBox="0 0 16 16" width="26" height="26" fill="currentColor"><path d="M5.5 3 L13 8 L5.5 13 Z"/></svg>';
/* 卡片左上角 暂停/播放 小图标（居中） */
const IC_PAUSE='<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor"><rect x="4.4" y="3.2" width="2.9" height="9.6" rx="1"/><rect x="8.7" y="3.2" width="2.9" height="9.6" rx="1"/></svg>';
const IC_PLAY='<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor"><path d="M5.5 3.2 L13 8 L5.5 12.8 Z"/></svg>';
function setPI(btn,paused){ if(btn)btn.innerHTML=paused?IC_PLAY:IC_PAUSE; }
function setCorner(corner,id){ if(inReview(id)){corner.textContent='\u2212';corner.classList.add('on');}else{corner.textContent='+';corner.classList.remove('on');} }
/* 例词：每行一个英文单词；显示中文时同一行英文+中文 */
function wordLines(rec){ return rec.words.map(w=>'<div class="exline">'+w.w+(showCN&&w.cn?' <span class="cn">'+w.cn+'</span>':'')+'</div>').join(''); }
function fitEl(container,el){ if(!el)return; el.style.fontSize='';
 let fs=parseFloat(getComputedStyle(el).fontSize)||18, g=0;
 while((container.scrollHeight>container.clientHeight+1||container.scrollWidth>container.clientWidth+1) && fs>11 && g++<40){ fs-=1; el.style.fontSize=fs+'px'; } }
function cardEl(rec,kind){
 const el=document.createElement('div'); el.className='card lv'+(rec.level||1); el.tabIndex=0; el.setAttribute('role','button');
 const isRead=(mode==='read');
 const gcls=isRead?' rd':(rec.g.length>3?' sm':'');
 const frontExtra=isRead?'<div class="exfront">'+wordLines(rec)+'</div>':'';
 el.innerHTML='<div class="inner"><div class="face front"><div class="g'+gcls+'">'+rec.g+'</div>'+frontExtra+'</div>'+
  '<div class="face back"><button class="corner left pausebtn" type="button" tabindex="-1">'+IC_PAUSE+'</button>'+
  '<button class="corner" type="button" tabindex="-1"></button>'+
  '<div class="ipa">'+rec.ipa+'</div><div class="ex">'+wordLines(rec)+'</div></div></div>';
 const corner=el.querySelector('.corner:not(.left)');
 if(kind==='normal'){ setCorner(corner,rec.id);
  corner.addEventListener('click',e=>{e.stopPropagation(); const s=flashReview();
   if(s.has(rec.id))s.delete(rec.id); else s.add(rec.id); setCorner(corner,rec.id); persist();});
 } else { corner.textContent='\u2212';
  corner.addEventListener('click',e=>{e.stopPropagation(); flashReview().delete(rec.id); persist(); renderCurrent();}); }
 const pb=el.querySelector('.pausebtn');
 /* 暂停/播放：有当前媒体则暂停-继续；若已停止(如看完视频返回)则重新播放本卡，避免按钮失效 */
 pb.addEventListener('click',e=>{e.stopPropagation();
   const mine=Cur.video&&Cur.video.dataset&&Cur.video.dataset.cid===rec.id;
   if(mine||Cur.audio||('speechSynthesis'in window&&speechSynthesis.speaking)){ pauseToggle(pb); }
   else { playCard(rec); setPI(pb,false); } });
 function flip(){ stopPlayback(); el.classList.toggle('flipped'); if(el.classList.contains('flipped')){setPI(pb,false);playCard(rec);}}
 el.addEventListener('click',flip);
 el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();flip();}});
 return el;
}
function renderCardGrid(host,cards,kind){
 const grid=document.createElement('div'); grid.className='grid';
 if(!cards.length){ grid.innerHTML='<div class="empty">还没有加入卡片。翻开卡片后点右上角的 + 即可加入。</div>'; host.appendChild(grid); return; }
 cards.forEach(c=>{ preloadCard(c.id);
   const wrap=document.createElement('div'); wrap.className='cardwrap';
   wrap.appendChild(cardEl(c,kind));
   const pi=document.createElement('button'); pi.className='playicon'; pi.type='button'; pi.title='看视频'; pi.innerHTML=PLAY;
   if(!CARD_VIDEO[c.id]) pi.disabled=true;
   pi.addEventListener('click',()=>openVideo(c)); wrap.appendChild(pi);
   grid.appendChild(wrap); });
 host.appendChild(grid);
 requestAnimationFrame(()=>grid.querySelectorAll('.card').forEach(c=>{
   const back=c.querySelector('.back'); if(back)fitEl(back,back.querySelector('.ex'));
   const front=c.querySelector('.front'); if(front)fitEl(front,front.querySelector('.exfront'));
 }));
}

/* ===== dictation (听音能写) ===== */
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function dictWordsRaw(){ return (sub==='dr') ? [...dictReview].map(w=>WORDMAP[w]) : UNITS[unitIdx].dictWords; }
const dict={playing:false,idx:0,words:[],timer:null,order:null,orderKey:null};
function ensureOrder(){ const key=mode+'|'+sub+'|'+unitIdx+'|'+(dictRandom?'r':'s');
 if(dict.orderKey!==key){ let arr=dictWordsRaw().slice(); if(dictRandom)shuffle(arr); dict.order=arr; dict.orderKey=key; } return dict.order; }
function stopDict(){ dict.playing=false; dict.idx=0; if(dict.timer)clearTimeout(dict.timer); stopPlayback();
 document.querySelectorAll('.wcard.active').forEach(e=>e.classList.remove('active'));
 const b=document.getElementById('playBtn'); if(b)b.textContent='▶ 播放'; }
function dictHighlight(i){ document.querySelectorAll('.wcard.active').forEach(e=>e.classList.remove('active'));
 const el=document.querySelector('.wcard[data-i="'+i+'"]'); if(el){el.classList.add('active');el.scrollIntoView({block:'nearest',behavior:'smooth'});}
 const p=document.getElementById('dprog'); if(p)p.textContent=(i+1)+' / '+dict.words.length; }
function dictStep(){ if(!dict.playing)return;
 if(dict.idx>=dict.words.length){ stopDict(); return; }
 dictHighlight(dict.idx); const w=dict.words[dict.idx].w;
 playItems(wordItems(w,2),(my)=>{ if(!dict.playing||my!==Cur.token)return;
   dict.timer=setTimeout(()=>{ if(!dict.playing)return; dict.idx++; dictStep(); },pauseMs); }); }
function dictToggle(){ const b=document.getElementById('playBtn');
 if(dict.playing){ dict.playing=false; if(dict.timer)clearTimeout(dict.timer); stopPlayback(); b.textContent='▶ 继续';
  document.querySelectorAll('.wcard.active').forEach(e=>e.classList.remove('active')); }
 else { if(!dict.words.length)return; if(dict.idx>=dict.words.length)dict.idx=0; dict.playing=true; b.textContent='⏸ 暂停'; dictStep(); } }
function dictNext(){ if(!dict.words.length)return; if(dict.timer)clearTimeout(dict.timer); stopPlayback();
 if(dict.playing)dict.idx++;
 if(dict.idx>=dict.words.length){ stopDict(); return; }
 dict.playing=true; const b=document.getElementById('playBtn'); if(b)b.textContent='⏸ 暂停'; dictStep(); }
const EYE='<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
function setWCorner(corner,wid){ if(dictReview.has(wid)){corner.textContent='\u2212';corner.classList.add('on');}else{corner.textContent='+';corner.classList.remove('on');} }
function wcard(it,i){
 const el=document.createElement('div'); el.className='wcard'; el.dataset.i=i;
 const vis=revealedWords.has(it.wid);
 el.innerHTML='<button class="corner" type="button" tabindex="-1"></button>'+
   (vis ? '<div class="wmain">'+it.w+'</div>'+(showCN&&it.cn?'<div class="wcn">'+it.cn+'</div>':'')
        : '<button class="eye" type="button" title="显示">'+EYE+'</button>');
 const corner=el.querySelector('.corner');
 if(sub==='dr'){ corner.textContent='\u2212';
   corner.addEventListener('click',e=>{e.stopPropagation(); dictReview.delete(it.wid); dict.order=(dict.order||[]).filter(x=>x.wid!==it.wid); persist(); renderCurrent();}); }
 else { setWCorner(corner,it.wid);
   corner.addEventListener('click',e=>{e.stopPropagation(); if(dictReview.has(it.wid))dictReview.delete(it.wid);else dictReview.add(it.wid); setWCorner(corner,it.wid); persist();}); }
 /* 眼睛图标=显示单词并发音；点已显示的单词=隐藏并发音；点其他区域=只发音。都设为当前并高亮。 */
 function pick(reveal){ if(reveal===true)revealedWords.add(it.wid); else if(reveal===false)revealedWords.delete(it.wid);
   if(reveal!==undefined)renderCurrent();   /* renderCurrent 会重渲染并把 idx 归零，故之后再设当前 */
   dict.idx=i; dictHighlight(i); sayWord(it.w); }
 const eye=el.querySelector('.eye');
 if(eye) eye.addEventListener('click',e=>{ e.stopPropagation(); pick(true); });
 const wmain=el.querySelector('.wmain');
 if(wmain) wmain.addEventListener('click',e=>{ e.stopPropagation(); pick(false); });
 el.addEventListener('click',e=>{ if(e.target.closest('.corner')||e.target.closest('.eye')||e.target.closest('.wmain'))return;
   pick(undefined); });
 return el;
}
function renderDict(host,words){
 const bar=document.createElement('div'); bar.className='dbar';
 const opts=[4000,5000,6000,8000].map(v=>'<option value="'+v+'"'+(v===pauseMs?' selected':'')+'>'+(v/1000)+' 秒</option>').join('');
 bar.innerHTML='<button id="playBtn" class="play" type="button">▶ 播放</button>'+
  '<button id="stopBtn" class="dbtn" type="button">■ 停止</button>'+
  '<button id="nextWordBtn" class="dbtn" type="button">下一个 ›</button>'+
  '<span id="dprog" class="dprog">0 / '+words.length+'</span><span class="dspacer"></span>'+
  '<button id="wordTog" class="dbtn'+(showAllWords?' on':'')+'" type="button">'+(showAllWords?'隐藏单词':'显示单词')+'</button>'+
  '<button id="randTog" class="dbtn'+(dictRandom?' on':'')+'" type="button">'+(dictRandom?'随机':'顺序')+'</button>'+
  '<label class="psel">停顿 <select id="pauseSel">'+opts+'</select></label>';
 host.appendChild(bar);
 document.getElementById('playBtn').addEventListener('click',dictToggle);
 document.getElementById('stopBtn').addEventListener('click',stopDict);
 document.getElementById('nextWordBtn').addEventListener('click',dictNext);
 document.getElementById('pauseSel').addEventListener('change',e=>{pauseMs=parseInt(e.target.value); persist();});
 document.getElementById('wordTog').addEventListener('click',()=>{ showAllWords=!showAllWords;
   if(showAllWords)words.forEach(it=>revealedWords.add(it.wid)); else words.forEach(it=>revealedWords.delete(it.wid)); renderCurrent(); });
 document.getElementById('randTog').addEventListener('click',()=>{ dictRandom=!dictRandom; persist(); renderCurrent(); });
 const grid=document.createElement('div'); grid.className='wgrid';
 if(!words.length) grid.innerHTML='<div class="empty">听音-Review 还是空的。在某个单元里点词卡右上角的 + 加入。</div>';
 else words.forEach((it,i)=>grid.appendChild(wcard(it,i)));
 host.appendChild(grid);
}

/* ===== render / nav ===== */
const content=document.getElementById('content');
function renderCurrent(){
 stopDict(); stopPlayback(); content.innerHTML='';
 if(mode==='dict'){ const words=ensureOrder(); dict.words=words; dict.idx=0; renderDict(content,words); }
 else { const list=(mode==='read')?READUNITS:UNITS;
   if(sub==='cr'||sub==='rr'){ renderCardGrid(content,[...flashReview()].map(id=>CARDS[id]),'review'); }
   else { renderCardGrid(content,list[unitIdx].cards,'normal'); } }
 updateBars();
}
function updateBars(){
 document.querySelectorAll('.seg button').forEach(b=>b.classList.toggle('on',b.dataset.m===mode));
 document.querySelectorAll('#revBtns .rbtn').forEach(b=>{ b.style.display=(b.dataset.mode===mode)?'inline-flex':'none'; b.classList.toggle('active', sub!==null&&sub===b.dataset.v); });
 document.getElementById('cnTog').classList.toggle('on',showCN);
 const tt=document.getElementById('trimTog'); if(tt)tt.classList.toggle('on',useTrimVideo);
}
function show(){ stopPlayback(); revealedWords.clear(); showAllWords=false; renderCurrent(); if(window.scrollY>0)window.scrollTo(0,0); }

/* ===== chrome ===== */
const sel=document.getElementById('unitSel');
function rebuildSelect(){ const list=(mode==='read')?READUNITS:UNITS; sel.innerHTML='';
 list.forEach((u,i)=>{const o=document.createElement('option');o.value=i;o.textContent=(mode==='card')?u.label:u.key;o.title=u.label||u.key;sel.appendChild(o);});
 if(unitIdx>=list.length)unitIdx=0; sel.value=unitIdx; }
rebuildSelect();
sel.addEventListener('change',()=>{ unitIdx=parseInt(sel.value); sub=null; persist(); show(); });
document.querySelectorAll('.seg button').forEach(b=>b.addEventListener('click',()=>{ mode=b.dataset.m; sub=null; unitIdx=0; persist(); rebuildSelect(); show(); }));
document.querySelectorAll('#revBtns .rbtn').forEach(b=>b.addEventListener('click',function(){ sub=(sub===this.dataset.v)?null:this.dataset.v; show(); }));
document.getElementById('cnTog').addEventListener('click',()=>{ showCN=!showCN; persist(); renderCurrent(); });
const speedSel=document.getElementById('speedSel');
if(speedSel){ speedSel.value=String(playRate);
 speedSel.addEventListener('change',e=>{ playRate=parseFloat(e.target.value); if(Cur.video)Cur.video.playbackRate=playRate; if(Cur.audio)Cur.audio.playbackRate=playRate; persist(); }); }
const trimTog=document.getElementById('trimTog');
if(trimTog){ trimTog.classList.toggle('on',useTrimVideo);
 trimTog.addEventListener('click',()=>{ useTrimVideo=!useTrimVideo; trimTog.classList.toggle('on',useTrimVideo); persist(); }); }
/* 设置弹窗 */
const setBtn=document.getElementById('setBtn'), setModal=document.getElementById('setModal');
function openSet(){ if(setModal)setModal.hidden=false; }
function closeSet(){ if(setModal)setModal.hidden=true; }
if(setBtn)setBtn.addEventListener('click',openSet);
if(setModal){ setModal.addEventListener('click',e=>{ if(e.target===setModal||e.target.closest('.setclose'))closeSet(); }); }
/* 主题 */
function applyTheme(){ document.documentElement.dataset.theme=theme;
 document.querySelectorAll('#themePick button').forEach(b=>b.classList.toggle('on',b.dataset.theme===theme)); }
document.querySelectorAll('#themePick button').forEach(b=>b.addEventListener('click',()=>{ theme=b.dataset.theme; applyTheme(); persist(); }));
applyTheme();
function stepUnit(d){ const list=(mode==='read')?READUNITS:UNITS; sub=null; unitIdx=Math.max(0,Math.min(list.length-1,unitIdx+d)); sel.value=unitIdx; persist(); show(); }
document.getElementById('prevBtn').addEventListener('click',()=>stepUnit(-1));
document.getElementById('nextBtn').addEventListener('click',()=>stepUnit(1));
renderCurrent();
