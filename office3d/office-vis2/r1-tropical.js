// R1-only planting. The approved envelopes are retained; no shared asset or random sequence is mutated.
export const INDOOR_SPECIES = Object.freeze(['龟背竹', '琴叶榕', '发财树', '花叶绿萝', '散尾葵', '虎尾兰'])
export const PLAZA_SPECIES = Object.freeze(['鸡蛋花', '三角梅', '旅人蕉', '扇棕'])
const heights = [[.8,1.3],[1.6,2.2],[1.4,1.8],[.65,.95],[1.6,2],[.5,.9]]
const fract = x => x - Math.floor(x)
export const plantSeed = id => [...id].reduce((n,c) => (Math.imul(n,31)+c.charCodeAt(0))>>>0, 17)
export function tropicalRow(row, index) {
  const species = row.role === 'passage' ? (index % 2 ? 4 : 1) : index % 6
  const seed = plantSeed(row.id), scale = .85 + .3 * fract(seed * .6180339), range = heights[species]
  return { ...row, species: INDOOR_SPECIES[species], speciesIndex: species, seed, scale, yaw: fract(seed * .41421356) * Math.PI * 2,
    height: Math.min(range[1], Math.max(range[0], (range[0]+range[1])/2*scale)) }
}

// A single alpha-tested leaf batch, independent of the opaque pots/stems batch.
export function tropicalLeafBatch(THREE) {
  const values = {position:[],normal:[],uv:[],color:[]}
  return {
    vertices: () => values.position.length/3,
    add(geometry, tint) {
      const g=geometry.index?geometry.toNonIndexed():geometry.clone(), color=new THREE.Color(tint)
      for(const k of ['position','normal','uv']) values[k].push(...g.attributes[k].array)
      for(let i=0;i<g.attributes.position.count;i++) values.color.push(...color.toArray())
      g.dispose();geometry.dispose()
    },
    build(root,name) {
      const g=new THREE.BufferGeometry();for(const k of Object.keys(values))g.setAttribute(k,new THREE.Float32BufferAttribute(values[k],k==='uv'?2:3))
      g.computeBoundingBox();g.computeBoundingSphere()
      const texture=typeof document==='undefined'?new THREE.Texture():new THREE.TextureLoader().load(new URL('../assets/textures/office-v2/leaf-atlas-v2.png',import.meta.url).href)
      texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4
      const material=new THREE.MeshStandardMaterial({map:texture,alphaTest:.45,side:THREE.DoubleSide,vertexColors:true,roughness:.78})
      const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.castShadow=false;mesh.receiveShadow=true;root.add(mesh)
      return {mesh,dispose(){mesh.removeFromParent();g.dispose();material.dispose();texture.dispose()}}
    },
  }
}

export function appendTropicalPlant({THREE,batch,leaves,row,low=false,plaza=false}) {
  const parts=[],leafParts=[],seed=row.seed??plantSeed(row.id),rng=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296};let random=seed
  const species=plaza?row.speciesIndex:INDOOR_SPECIES.indexOf(row.species),height=row.height,radius=row.r
  const potHeight=plaza?0:row.species==='花叶绿萝'?.55:height>1.3?.42:.22
  const add=(g,c,pos=[0,0,0])=>{g.translate(...pos);parts.push({g,c})}
  const stem=(a,b,r=.018,color='#75654E')=>{
    const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av),g=new THREE.CylinderGeometry(r*.65,r,d.length(),5)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));add(g,color,av.add(bv).multiplyScalar(.5).toArray())
  }
  // Folded lance leaves give palms and snake plants an actual silhouette, not a crown sphere.
  const blade=(base,tip,width,color,edge=false)=>{
    const a=new THREE.Vector3(...base),b=new THREE.Vector3(...tip),d=b.clone().sub(a),side=new THREE.Vector3(-d.z,0,d.x).normalize().multiplyScalar(width),m=a.clone().lerp(b,.55)
    if(side.lengthSq()<1e-8)side.set(width,0,0)
    const pts=[...a.toArray(),...m.clone().add(side).toArray(),...b.toArray(),...m.clone().add(new THREE.Vector3(0,.035,0)).toArray(),...m.clone().sub(side).toArray()]
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));g.setIndex([0,1,3,1,2,3,0,3,4,3,2,4]);g.computeVertexNormals();add(g,color)
    if(edge){stem(a.toArray(),m.clone().add(side).toArray(),.008,'#D3BE58');stem(m.clone().add(side).toArray(),b.toArray(),.006,'#D3BE58')}
  }
  const leaf=(tile,x,y,z,w,h,yaw,lean)=>{
    const g=new THREE.PlaneGeometry(w,h,2,3),p=g.attributes.position,uv=g.attributes.uv,rects=[[0,535],[535,925],[925,1455],[1455,1774]],rect=rects[tile]
    for(let i=0;i<p.count;i++){p.setZ(i,.08*Math.sin(uv.getY(i)*Math.PI));uv.setXY(i,(rect[0]+uv.getX(i)*(rect[1]-rect[0]))/1774,.12+uv.getY(i)*.72)}
    g.computeVertexNormals();g.rotateX(lean);g.rotateY(yaw);g.translate(x,y,z);leafParts.push({g,c:new THREE.Color().setHSL(.22+rng()*.06,.18,.78+rng()*.12)})
  }
  const flower=(x,y,z,color)=>{for(let j=0;j<5;j++){const a=j*Math.PI*2/5,g=new THREE.CircleGeometry(.065,5);g.rotateX(-Math.PI/2);add(g,color,[x+Math.cos(a)*.045,y,z+Math.sin(a)*.045])}const c=new THREE.CircleGeometry(.027,6);c.rotateX(-Math.PI/2);add(c,'#E9C74C',[x,y+.004,z])}
  if(!plaza){add(new THREE.CylinderGeometry(.24,.19,potHeight,12),'#D2C5AF',[0,potHeight/2,0]);add(new THREE.CylinderGeometry(.215,.215,.015,12),'#514A35',[0,potHeight,0])}
  const green=['#466B3A','#527842','#356448'][seed%3]
  if(!plaza&&species<4){
    if(species===1)stem([0,potHeight,0],[.04,height*.85,0],.04)
    if(species===2)for(let k=0;k<3;k++)for(let j=0;j<6;j++){const a=j*.65+k*2.094,b=a+.65;stem([Math.cos(a)*.035,potHeight+j*.12,Math.sin(a)*.035],[Math.cos(b)*.035,potHeight+(j+1)*.12,Math.sin(b)*.035],.021)}
    const count=low?7:12
    for(let j=0;j<count;j++){
      const a=j*2.399+rng()*.4,rr=species===1?.18:species===2?.22:.3,x=Math.cos(a)*rr,z=Math.sin(a)*rr
      const y=species===3?potHeight+.18-j/count*.40:species===1?height*(.48+.4*j/count):species===2?height*(.64+.22*j/count):potHeight+.22+.6*j/count
      stem([0,species===0?potHeight:species===3?potHeight+.1:y-.12,0],[x,y,z],.009,green)
      leaf(species,x,y,z,species===2?.55:.42,species===1?.55:.42,a,species===3?.25:-.35)
    }
  } else if(!plaza&&species===5){
    for(let j=0;j<(low?7:11);j++){const a=j*2.399,r=.04+rng()*.12;blade([Math.cos(a)*r,potHeight,Math.sin(a)*r],[Math.cos(a)*(.16+rng()*.15),potHeight+.4+rng()*.35,Math.sin(a)*.25],.055,green,true)}
  } else if((!plaza&&species===4)||(plaza&&species===3)){
    if(plaza)stem([0,potHeight,0],[.06,height*.7,0],.07)
    else for(let k=0;k<5;k++){const a=k*2.399;stem([Math.cos(a)*.07,potHeight,Math.sin(a)*.07],[Math.cos(a)*.18,height*(.52+k*.045),Math.sin(a)*.18],.018,'#799153')}
    for(let j=0;j<(low?5:8);j++){
      const a=j*2.399,base=plaza?[0,height*.68,0]:[Math.cos(a)*.18,height*(.52+j%5*.045),Math.sin(a)*.18],end=[Math.cos(a)*.7,height*(.65+rng()*.22),Math.sin(a)*.7];stem(base,end,.008,green)
      for(let k=1;k<=7;k++){const t=k/8,x=base[0]+(end[0]-base[0])*t,z=base[2]+(end[2]-base[2])*t,y=base[1]+(end[1]-base[1])*t;for(const s of [-1,1])blade([x,y,z],[x+Math.cos(a+s*1.1)*.28*(1-t*.5),y-.12,z+Math.sin(a+s*1.1)*.28*(1-t*.5)],plaza?.085:.024,green)}
    }
  } else if(plaza&&species===2){
    for(let j=0;j<(low?6:9);j++){const a=(j%2?1:-1)*.3+Math.PI*(j%2),h=height*(.65+rng()*.35);stem([0,0,0],[Math.cos(a)*.18,h*.6,Math.sin(a)*.18],.025,green);blade([0,h*.5,0],[Math.cos(a)*.9,h,Math.sin(a)*.9],.24,green)}
  } else {
    stem([0,0,0],[0,height*.65,0],.065)
    for(let j=0;j<(low?6:10);j++){const a=j*2.399,x=Math.cos(a)*.5,z=Math.sin(a)*.5,y=height*(.6+rng()*.3);stem([0,height*.4,0],[x,y,z],.025);for(let k=0;k<3;k++)blade([x,y,z],[x+Math.cos(a+k)*.28,y+.12,z+Math.sin(a+k)*.28],.09,green);flower(x,y+.16,z,species===0?'#F7F0DA':j%2?'#D04B82':'#E7914C')}
  }
  // Fit every actual vertex into its certified horizontal disk, and keep the varied height.
  const all=[...parts,...leafParts],box=new THREE.Box3();let radial=0
  for(const {g} of all){g.computeBoundingBox();box.union(g.boundingBox);const p=g.attributes.position;for(let i=0;i<p.count;i++)radial=Math.max(radial,Math.hypot(p.getX(i),p.getZ(i)))}
  const yaw=row.yaw??rng()*Math.PI*2,scale=(row.scale??(.85+.3*rng()))/1.15,ys=height/(box.max.y-box.min.y),rs=radius*scale/radial,bounds=new THREE.Box3()
  const startVertex=batch.triangles()*3,leafStart=leaves.vertices()
  for(const {g,c} of all){g.translate(0,-box.min.y,0);g.scale(rs,ys,rs);g.rotateY(yaw);g.translate(row.x,0,row.z);g.computeBoundingBox();bounds.union(g.boundingBox);if(leafParts.some(p=>p.g===g))leaves.add(g,c);else batch.add(g,c)}
  return {bounds,startVertex,vertexCount:batch.triangles()*3-startVertex,leafStart,leafCount:leaves.vertices()-leafStart,potHeight:potHeight*ys,renderHeight:bounds.max.y}
}
