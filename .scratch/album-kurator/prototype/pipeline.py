# PROTOTYP - Wegwerfcode. Fuehrt die Pipeline aus Ticket 04 aus und erzeugt slots.json + thumbs/
import json,urllib.request,datetime as dt,io,os,collections,statistics,time,shutil
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image
HERE=os.path.dirname(os.path.abspath(__file__))
CACHE=os.path.join(HERE,'.cache'); THUMBS=os.path.join(HERE,'thumbs')
os.makedirs(CACHE,exist_ok=True); os.makedirs(THUMBS,exist_ok=True)
env={}
for l in open('/Users/paul/Develop/immich/.env'):
    if '=' in l and not l.startswith('#'): k,v=l.strip().split('=',1); env[k]=v
B=env['IMMICH_URL'].rstrip('/'); B=B[:-4] if B.endswith('/api') else B
KEY=env['IMMICH_API_KEY']; PID="dbe94f2e-672a-4f4e-8df1-911391d0e2c9"
BIRTH=dt.date(2023,8,29); HAMMING=16; SLOTS_PER_YEAR=25; N_ALTS=8

def post(p,b):
    r=urllib.request.Request(B+p,data=json.dumps(b).encode(),
      headers={'x-api-key':KEY,'Content-Type':'application/json'},method='POST')
    return json.loads(urllib.request.urlopen(r,timeout=90).read())

print("1) Kandidaten holen ...",flush=True)
items=[];page=1
while True:
    d=post('/api/search/metadata',{"personIds":[PID],
      "takenAfter":BIRTH.isoformat()+"T00:00:00.000Z",
      "takenBefore":"2026-08-29T00:00:00.000Z","withExif":True,"size":1000,"page":page})['assets']
    items+=[a for a in d['items'] if a.get('type')=='IMAGE']
    if not d.get('nextPage'): break
    page=int(d['nextPage'])
def ts(a):
    s=a.get('localDateTime') or a['fileCreatedAt']
    return dt.datetime.fromisoformat(s.replace('Z','+00:00')).replace(tzinfo=None)
items.sort(key=ts); print(f"   {len(items)} Kandidaten",flush=True)

print("2) Thumbnails + Hashes ...",flush=True)
def work(a):
    fp=os.path.join(CACHE,a['id']+'.webp')
    try:
        if os.path.exists(fp): raw=open(fp,'rb').read()
        else:
            r=urllib.request.Request(f"{B}/api/assets/{a['id']}/thumbnail?size=thumbnail",headers={'x-api-key':KEY})
            raw=urllib.request.urlopen(r,timeout=45).read(); open(fp,'wb').write(raw)
        im=Image.open(io.BytesIO(raw)).convert('L')
        g=np.asarray(im.resize((9,8)),dtype=np.int16)
        dh=np.packbits((g[:,1:]>g[:,:-1]).flatten())
        f=np.asarray(im.resize((64,64)),dtype=np.float64)
        lap=(-4*f[1:-1,1:-1]+f[:-2,1:-1]+f[2:,1:-1]+f[1:-1,:-2]+f[1:-1,2:])
        return a['id'],dh,float(lap.var())
    except Exception: return a['id'],None,None
t0=time.time()
with ThreadPoolExecutor(max_workers=16) as ex: res=list(ex.map(work,items))
H={i:h for i,h,_ in res if h is not None}; L={i:l for i,_,l in res if l is not None}
items=[a for a in items if a['id'] in H]
print(f"   {len(items)} gehasht in {time.time()-t0:.0f}s",flush=True)

print("3) Clustern (Tagesfenster, Hamming<=16) ...",flush=True)
POP=np.unpackbits(np.arange(256,dtype=np.uint8)[:,None],axis=1).sum(1)
def ham(a,b): return int(POP[np.bitwise_xor(a,b)].sum())
byday=collections.defaultdict(list)
for a in items: byday[ts(a).date()].append(a)
clusters=[]
for day,group in byday.items():
    group.sort(key=ts); parent=list(range(len(group)))
    def find(x):
        while parent[x]!=x: parent[x]=parent[parent[x]]; x=parent[x]
        return x
    for i in range(len(group)):
        for j in range(i+1,len(group)):
            if find(i)!=find(j) and ham(H[group[i]['id']],H[group[j]['id']])<=HAMMING:
                parent[find(j)]=find(i)
    buckets=collections.defaultdict(list)
    for i,a in enumerate(group): buckets[find(i)].append(a)
    for members in buckets.values():
        members.sort(key=ts); clusters.append({'day':day,'members':members})
print(f"   {len(clusters)} Cluster aus {len(items)} Kandidaten",flush=True)

print("4) Veto + 5) Repraesentant ...",flush=True)
for c in clusters:
    m=c['members']
    if len(m)>1:
        med=statistics.median(L[a['id']] for a in m)
        keep=[a for a in m if L[a['id']]>=0.6*med]
        c['kept']=keep if keep else m
    else: c['kept']=m
    c['rep']=c['kept'][-1]

print("6)+7) Quote und Slot-Vergabe ...",flush=True)
def largest_remainder(w,total):
    s=sum(w); raw=[x/s*total for x in w]; base=[int(x) for x in raw]
    order=sorted(range(len(raw)),key=lambda i:raw[i]-base[i],reverse=True)
    for i in order[:total-sum(base)]: base[i]+=1
    return base
slots=[]
for yi in range(3):
    ystart=dt.date(BIRTH.year+yi,BIRTH.month,BIRTH.day)
    yend=dt.date(BIRTH.year+yi+1,BIRTH.month,BIRTH.day)
    yc=[c for c in clusters if ystart<=c['day']<yend]
    months=sorted({c['day'].strftime('%Y-%m') for c in yc})
    quota=dict(zip(months,largest_remainder([1]*len(months),SLOTS_PER_YEAR)))
    for mo in months:
        mc=sorted([c for c in yc if c['day'].strftime('%Y-%m')==mo],key=lambda c:-len(c['members']))
        n=quota[mo]; days_avail=len({c['day'] for c in mc}); chosen=[]
        for mindist in (5,2,0):
            for c in mc:
                if len(chosen)>=n: break
                if days_avail>n and any(c['day']==x['day'] for x in chosen): continue
                if mindist and any(abs((c['day']-x['day']).days)<mindist for x in chosen): continue
                if c in chosen: continue
                chosen.append(c)
            if len(chosen)>=n: break
        for c in chosen:
            sibs=[a for a in c['kept'] if a['id']!=c['rep']['id']][::-1]
            sameday=[a for cc in mc if cc['day']==c['day'] and cc is not c for a in cc['kept']]
            samemonth=[a for cc in mc if cc is not c and cc['day']!=c['day'] for a in cc['kept']]
            alts=[];seen={c['rep']['id']}
            for pool in (sibs,sameday,samemonth):
                for a in pool:
                    if len(alts)>=N_ALTS: break
                    if a['id'] in seen: continue
                    seen.add(a['id']); alts.append(a)
            slots.append({'year':yi+1,'month':mo,'day':c['day'].isoformat(),
                'clusterSize':len(c['members']),'kept':len(c['kept']),
                'proposal':c['rep'],'alts':alts})
slots.sort(key=lambda s:ts(s['proposal']))
print(f"   {len(slots)} Slots",flush=True)

print("8) Thumbnails fuer die Anzeige kopieren ...",flush=True)
need=set()
for s in slots:
    need.add(s['proposal']['id']); need.update(a['id'] for a in s['alts'])
for i in need:
    src=os.path.join(CACHE,i+'.webp')
    if os.path.exists(src): shutil.copyfile(src,os.path.join(THUMBS,i+'.webp'))
def slim(a): return {'id':a['id'],'t':ts(a).isoformat(),'lap':round(L[a['id']],0)}
out=[{'year':s['year'],'month':s['month'],'day':s['day'],'clusterSize':s['clusterSize'],
      'kept':s['kept'],'proposal':slim(s['proposal']),'alts':[slim(a) for a in s['alts']]} for s in slots]
json.dump({'slots':out,'stats':{'candidates':len(items),'clusters':len(clusters),
   'thumbs':len(need)}},open(os.path.join(HERE,'slots.json'),'w'),indent=1)
print(f"FERTIG: {len(slots)} Slots, {len(need)} Thumbnails")
