# PROTOTYP - Wegwerfcode. Baut index.html mit inline-Daten (file:// erlaubt kein fetch).
import json,os
HERE=os.path.dirname(os.path.abspath(__file__))
data=json.load(open(os.path.join(HERE,'slots.json')))
HTML=r'''<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Album-Kurator — UI-Prototyp</title><style>
*{box-sizing:border-box}
body{margin:0;background:#16181c;color:#e8e8ea;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding-bottom:76px}
header{padding:18px 22px 10px}
h1{font-size:15px;margin:0;font-weight:600;letter-spacing:.02em}
.sub{color:#8b8f98;font-size:12.5px;margin-top:3px}
.warn{background:#3a2f16;color:#e8d5a0;border-left:3px solid #b08a2e;padding:8px 12px;margin:12px 22px;font-size:12.5px;border-radius:3px}
main{padding:8px 22px 20px}
img{display:block;background:#24272d}
.slotimg{width:100%;aspect-ratio:1;object-fit:cover;border-radius:3px}
/* ---------- A: Kontaktbogen ---------- */
#va .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:7px}
#va .cell{position:relative;cursor:pointer;border:2px solid transparent;border-radius:5px;overflow:hidden}
#va .cell.open{border-color:#5b8dd6}
#va .cell.done{border-color:#4a9e6a}
#va .cell.empty .slotimg{opacity:.12}
#va .tag{position:absolute;left:4px;top:4px;background:#000b;font-size:10px;padding:1px 5px;border-radius:3px;color:#cfd3da}
#va .alts{grid-column:1/-1;background:#1d2026;border-radius:5px;padding:11px;display:flex;gap:7px;overflow-x:auto}
#va .alts img{width:96px;height:96px;object-fit:cover;border-radius:3px;cursor:pointer;flex:0 0 auto;border:2px solid transparent}
#va .alts img:hover{border-color:#5b8dd6}
/* ---------- B: Monatsstreifen ---------- */
#vb .row{display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid #24272d}
#vb .mo{width:66px;flex:0 0 auto;color:#8b8f98;font-size:12px;font-variant-numeric:tabular-nums}
#vb .strip{display:flex;gap:5px;overflow-x:auto;padding-bottom:2px}
#vb .strip img{height:76px;width:76px;object-fit:cover;border-radius:3px;cursor:pointer;flex:0 0 auto;opacity:.34;border:2px solid transparent}
#vb .strip img.pick{opacity:1;border-color:#4a9e6a;height:100px;width:100px}
/* ---------- C: Fokus ---------- */
#vc{display:flex;flex-direction:column;align-items:center;gap:14px}
#vc .big{max-height:56vh;max-width:100%;object-fit:contain;border-radius:4px}
#vc .meta{color:#8b8f98;font-size:12.5px;font-variant-numeric:tabular-nums}
#vc .strip{display:flex;gap:7px;flex-wrap:wrap;justify-content:center;max-width:900px}
#vc .strip figure{margin:0;text-align:center}
#vc .strip img{width:92px;height:92px;object-fit:cover;border-radius:3px;cursor:pointer;border:2px solid transparent}
#vc .strip img:hover{border-color:#5b8dd6}
#vc .k{color:#6d727b;font-size:10.5px;margin-top:2px}
#vc .hint{color:#6d727b;font-size:12px}
/* ---------- Leiste ---------- */
#bar{position:fixed;left:0;right:0;bottom:0;background:#101216;border-top:1px solid #282c33;
 display:flex;gap:9px;align-items:center;padding:11px 22px;flex-wrap:wrap}
#bar button{background:#22262d;color:#c9ced6;border:1px solid #333842;padding:6px 13px;
 border-radius:4px;cursor:pointer;font-size:12.5px;font-family:inherit}
#bar button.on{background:#3a6fb5;border-color:#4a82cc;color:#fff}
#state{margin-left:auto;color:#8b8f98;font-size:12px;font-variant-numeric:tabular-nums}
</style></head><body>
<header><h1>Album-Kurator — UI-Prototyp</h1>
<div class="sub" id="hdr"></div></header>
<div class="warn"><strong>Wegwerf-Prototyp.</strong> Echte Daten, echter Algorithmus aus Ticket 04 — aber nichts wird gespeichert und nichts nach Immich geschrieben. Ein Reload setzt alles zurück. Die Gesichtsgrößen-Prüfung (Schritt 9) fehlt, weil dem API-Key <code>face.read</code> fehlt.</div>
<main><div id="va"></div><div id="vb"></div><div id="vc"></div></main>
<div id="bar">
 <button data-v="a">A — Kontaktbogen</button>
 <button data-v="b">B — Monatsstreifen</button>
 <button data-v="c">C — Fokus</button>
 <span id="state"></span></div>
<script>
const DATA=__DATA__;
const S=DATA.slots.map((s,i)=>({i,...s,cur:s.proposal.id,done:false,empty:false}));
const T=id=>'thumbs/'+id+'.webp';
const dt=s=>s.slice(0,10)+' '+s.slice(11,16);
let variant=new URLSearchParams(location.search).get('v')||'a', open_=null, focus_=0;
const el=id=>document.getElementById(id);
function altsOf(s){return s.alts.filter(a=>a.id!==s.cur).concat(s.cur!==s.proposal.id?[s.proposal]:[]);}
function swap(i,id){S[i].cur=id;S[i].empty=false;render();}

function renderA(){
 let h='<div class="grid">';
 S.forEach(s=>{
  h+=`<div class="cell ${open_===s.i?'open':''} ${s.done?'done':''} ${s.empty?'empty':''}" onclick="tog(${s.i})">
   <img class="slotimg" src="${T(s.cur)}" loading="lazy"><span class="tag">${s.month}</span></div>`;
  if(open_===s.i){
   h+='<div class="alts">'+altsOf(s).map(a=>
     `<img src="${T(a.id)}" title="${dt(a.t)}" onclick="event.stopPropagation();swap(${s.i},'${a.id}')">`).join('')
     +`<img src="${T(s.cur)}" style="opacity:.3" title="leer lassen" onclick="event.stopPropagation();mark(${s.i})">`+'</div>';}});
 el('va').innerHTML=h+'</div>';}

function renderB(){
 const months=[...new Set(S.map(s=>s.month))];
 el('vb').innerHTML=months.map(mo=>{
  const ss=S.filter(s=>s.month===mo);
  const pool=[];ss.forEach(s=>{pool.push({id:s.cur,pick:true,slot:s.i});
   altsOf(s).slice(0,6).forEach(a=>pool.push({id:a.id,pick:false,slot:s.i}));});
  return `<div class="row"><div class="mo">${mo}</div><div class="strip">`+
   pool.map(p=>`<img class="${p.pick?'pick':''}" src="${T(p.id)}" loading="lazy"
    onclick="swap(${p.slot},'${p.id}')">`).join('')+'</div></div>';}).join('');}

function renderC(){
 const s=S[focus_];const a=altsOf(s).slice(0,8);
 el('vc').innerHTML=`<img class="big" src="${T(s.cur)}">
  <div class="meta">Slot ${focus_+1} / ${S.length} &nbsp;·&nbsp; ${s.month} &nbsp;·&nbsp; Cluster: ${s.clusterSize} Bilder${s.done?' &nbsp;·&nbsp; ✓ bestätigt':''}${s.empty?' &nbsp;·&nbsp; leer gelassen':''}</div>
  <div class="strip">`+a.map((x,k)=>`<figure><img src="${T(x.id)}" onclick="swap(${focus_},'${x.id}')"><div class="k">${k+1}</div></figure>`).join('')+
  `</div><div class="hint">← → blättern &nbsp;·&nbsp; 1–8 tauschen &nbsp;·&nbsp; Leertaste bestätigen &nbsp;·&nbsp; X leer lassen</div>`;}

function render(){
 ['a','b','c'].forEach(v=>el('v'+v).style.display=variant===v?'':'none');
 document.querySelectorAll('#bar button').forEach(b=>b.classList.toggle('on',b.dataset.v===variant));
 if(variant==='a')renderA(); else if(variant==='b')renderB(); else renderC();
 const done=S.filter(s=>s.done).length, sw=S.filter(s=>s.cur!==s.proposal.id).length, em=S.filter(s=>s.empty).length;
 el('state').textContent=`${done}/${S.length} bestätigt · ${sw} getauscht · ${em} leer`;
 el('hdr').textContent=`${DATA.stats.candidates} Kandidaten → ${DATA.stats.clusters} Cluster → ${S.length} Slots · ${DATA.stats.thumbs} Thumbnails geladen`;}

window.tog=i=>{open_=open_===i?null:i;render();};
window.swap=swap;
window.mark=i=>{S[i].empty=!S[i].empty;render();};
document.querySelectorAll('#bar button').forEach(b=>b.onclick=()=>{variant=b.dataset.v;
 history.replaceState(0,'','?v='+variant);render();});
document.addEventListener('keydown',e=>{
 if(variant!=='c')return;const s=S[focus_];
 if(e.key==='ArrowRight'){focus_=Math.min(S.length-1,focus_+1);render();}
 else if(e.key==='ArrowLeft'){focus_=Math.max(0,focus_-1);render();}
 else if(e.key===' '){e.preventDefault();s.done=true;focus_=Math.min(S.length-1,focus_+1);render();}
 else if(e.key.toLowerCase()==='x'){s.empty=!s.empty;render();}
 else if(/^[1-8]$/.test(e.key)){const a=altsOf(s)[+e.key-1];if(a)swap(focus_,a.id);}});
render();
</script></body></html>'''
open(os.path.join(HERE,'index.html'),'w').write(HTML.replace('__DATA__',json.dumps(data)))
print("index.html geschrieben")
