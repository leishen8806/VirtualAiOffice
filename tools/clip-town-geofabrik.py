import sys,json,os
sys.path.insert(0,r'E:/VirtualAIOffice/tmp/osmium-py312')
import osmium
PBF=r'E:/VirtualAIOffice/osm-raw/cambodia-261108.osm.pbf'
OUT=r'E:/VirtualAIOffice/osm-raw'
BOX=(11.520,104.900,11.590,104.985)
blocks={
 'pp-core':(11.545,104.905,11.585,104.950),
 'pp-riverfront':(11.545,104.950,11.590,104.985),
 'pp-warehouse':(11.520,104.950,11.545,104.985),
 'pp-peripheral':BOX,
}
def inside(pts,b):
 s,w,n,e=b
 return any(s<=lat<=n and w<=lon<=e for lon,lat in pts)
class H(osmium.SimpleHandler):
 def __init__(self,b): super().__init__(); self.b=b; self.out=[]
 def way(self,w):
  tags=dict(w.tags)
  if not any(k in tags for k in ('building','natural','water','waterway','leisure','landuse')): return
  pts=[]
  try:
   pts=[(round(n.lon,7),round(n.lat,7)) for n in w.nodes]
  except Exception: return
  if len(pts)<2 or not inside(pts,self.b): return
  if 'building' in tags: kind='building'
  elif tags.get('natural')=='water' or tags.get('water') in ('river','riverbank') or tags.get('waterway') in ('river','stream','riverbank'): kind='water'
  elif tags.get('leisure')=='park' or tags.get('landuse') in ('grass','recreation_ground','village_green'): kind='green'
  else: return
  self.out.append({'id':f'way/{w.id}','kind':kind,'tags':{k:tags[k] for k in ('building','building:levels','height','name','natural','water','waterway','leisure','landuse') if k in tags},'geometry':pts})
for name,b in blocks.items():
 h=H(b); h.apply_file(PBF,locations=True); data={'source':'Geofabrik Cambodia OSM PBF 261108','bbox':b,'elements':h.out,'stats':{}}
 for k in ('building','water','green'):
  els=[e for e in h.out if e['kind']==k]; data['stats'][k]={'count':len(els),'vertices':sum(len(e['geometry']) for e in els)}
 data['stats']['buildingLevelsOrHeight']=sum(1 for e in h.out if e['kind']=='building' and ('building:levels' in e['tags'] or 'height' in e['tags']))
 with open(os.path.join(OUT,name+'.json'),'w',encoding='utf8') as f: json.dump(data,f,ensure_ascii=False)
 print(name,data['stats'])
