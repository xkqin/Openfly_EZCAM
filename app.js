const CONFIG = window.SURVEY_CONFIG || {};
const API = CONFIG.apiBase || '/survey/api/';
function photoUrl(url) {
  return CONFIG.imageBase ? new URL(url.split('/').pop(),new URL(CONFIG.imageBase,location.href)).href : url;
}
const TEST = new URLSearchParams(location.search).has('test');
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k,v) { try { localStorage.setItem(k,v); } catch {} },
  remove(k) { try { localStorage.removeItem(k); } catch {} }
};
const key = TEST ? 'openfly_survey_test_pid' : 'openfly_survey_pid';
let pid=store.get(key);
if (!pid) { pid=crypto.randomUUID(); store.set(key,pid); }
const app=document.getElementById('app');
let items=[], i=0, done=0, total=15, build='', shownAt=0, busy=true, loaded=false;
const pendingKey=key+'_pending';
let pending;
try { pending=JSON.parse(store.get(pendingKey)||'null'); } catch { pending=null; }
async function api(route,options={}) {
  const r=await fetch(API+route,{ cache:'no-store',credentials:'omit',...options,signal:AbortSignal.timeout(15000) });
  const data=await r.json();
  if (!r.ok || data.error) throw new Error(data.error||'Server unavailable');
  return data;
}
async function save(v) {
  const data=await api('vote',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v) });
  if (!data.ok || !data.id) throw new Error('Save not confirmed');
  pending=null; store.remove(pendingKey);
}
function preload(k) { const it=items[k]; if(it) for(const url of [it.left,it.right]) { const img=new Image(); img.src=photoUrl(url); } }
function render() {
  loaded=false; busy=true;
  if (i>=items.length) {
    app.innerHTML=`<div class="center"><h1>谢谢！</h1><p class="sub">Thank you — your answers are saved.</p><p class="muted">已完成 ${done+i} / ${total} 对 · All answers saved</p></div>`;
    return;
  }
  const it=items[i];
  app.innerHTML=`<h1>哪张拍得更好？ <span class="muted" style="font-weight:400">Which is better?</span></h1>
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done+i}"><i style="width:${((done+i)/total)*100}%"></i></div>
    <div class="pair"><button id="L" disabled aria-label="左边这张 left photo"><img src="${photoUrl(it.left)}" alt="左边照片 · Left photo"></button>
      <button id="R" disabled aria-label="右边这张 right photo"><img src="${photoUrl(it.right)}" alt="右边照片 · Right photo"></button></div>
    <div class="row"><span>${done+i+1} / ${total}　键盘 ← → 也可以 · arrow keys work</span><span id="status" role="status" aria-live="polite">照片加载中… Loading photos…</span></div>`;
  const images=[...app.querySelectorAll('.pair img')];
  const ready=() => {
    if (images.every(img=>img.complete && img.naturalWidth>0)) {
      shownAt=performance.now(); busy=false; loaded=true;
      app.querySelectorAll('.pair button').forEach(b=>b.disabled=false);
      document.getElementById('status').textContent=TEST ? '测试模式 · Test mode' : '';
    }
  };
  images.forEach(img=>{
    img.onload=ready;
    img.onerror=()=>{ document.getElementById('status').textContent='照片未加载，请刷新重试。 Photos could not load. Please reload.'; };
  });
  document.getElementById('L').onclick=()=>pick('left');
  document.getElementById('R').onclick=()=>pick('right');
  ready(); preload(i+1);
}
async function pick(choice) {
  if (busy || !loaded || !['left','right'].includes(choice)) return;
  busy=true;
  const it=items[i];
  app.querySelectorAll('.pair button').forEach(b=>b.disabled=true);
  document.getElementById(choice==='left'?'L':'R').classList.add('picked');
  const status=document.getElementById('status');
  status.textContent='保存中… Saving…';
  // Keep the exact same vote on retries after an uncertain network response.
  pending=pending||{ pid,build,pair:it.pair,left:it.left,right:it.right,choice,ms:Math.min(86400000,Math.round(performance.now()-shownAt)),ts:new Date().toISOString(),test:TEST };
  store.set(pendingKey,JSON.stringify(pending));
  try { await save(pending); i++; render(); }
  catch {
    status.textContent='尚未确认保存，请重试。 Save not confirmed. ';
    const retry=document.createElement('button'); retry.className='retry'; retry.textContent='重试 · Retry';
    retry.onclick=()=>{ retry.disabled=true; busy=false; pick(choice); };
    status.append(retry);
  }
}
document.addEventListener('keydown',e=>{
  if (e.key==='ArrowLeft') { e.preventDefault(); pick('left'); }
  else if(e.key==='ArrowRight') { e.preventDefault(); pick('right'); }
});
document.getElementById('go').onclick=async()=>{
  const msg=document.getElementById('msg'), go=document.getElementById('go');
  go.disabled=true; msg.textContent='加载中… Loading…';
  try {
    if(pending) await save(pending);
    const j=await api('batch?pid='+encodeURIComponent(pid)+(TEST?'&test=1':''));
    items=j.items; done=j.done; total=j.total; build=j.build;
    render();
  } catch { msg.textContent='暂时连不上，请点击开始重试。 Please try Start again.'; go.disabled=false; }
};
api('health').then(j=>{
  document.getElementById('pair-n').textContent=j.pairs;
  document.getElementById('pair-n-en').textContent=j.pairs;
}).catch(()=>{});
