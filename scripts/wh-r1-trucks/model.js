// Offline authoring only. Local +Z is the cab/front; dimensions are metres.
import * as T from '../../office3d/vendor/three/three.module.js'
import { mergeGeometries } from '../../office3d/vendor/three/jsm/utils/BufferGeometryUtils.js'

export async function createTruck(tier = 'near') {
  const high = tier === 'near', far = tier === 'far', bins = {}, parts = []
  const canvas = (w,h,draw) => {const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t}
  const grime=canvas(512,512,(c,w,h)=>{
    c.fillStyle='#ffffff';c.fillRect(0,0,w,h);let seed=1403;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296)
    for(let i=0;i<4200;i++){const y=rnd()*h;c.fillStyle=`rgba(90,76,56,${.025+.065*(y/h)**3})`;c.fillRect(rnd()*w,y,1+rnd()*5,1+rnd()*2)}
    c.strokeStyle='#c8c9c7';c.lineWidth=1;for(let x=2;x<w;x+=64){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();for(let y=16;y<h;y+=48){c.fillStyle='#909b9d';c.fillRect(x+3,y,2,2)}}
  })
  const rubber=canvas(256,256,(c,w,h)=>{c.fillStyle='#343638';c.fillRect(0,0,w,h);c.strokeStyle='#202224';c.lineWidth=3;for(let y=-20;y<h+20;y+=16){c.beginPath();c.moveTo(0,y);c.lineTo(128,y+20);c.lineTo(256,y);c.stroke()}c.fillStyle='#5b5d5e';c.font='12px sans-serif';c.fillText('DL · 315 / 70',18,125)})
  const grille=canvas(256,256,(c,w,h)=>{c.fillStyle='#ffffff';c.fillRect(0,0,w,h);c.fillStyle='#50555a';for(let y=8;y<h-4;y+=8)for(let x=8;x<w-4;x+=8){c.beginPath();c.ellipse(x+(y%16?2:0),y,2.8,2,0,0,Math.PI*2);c.fill()}})
  const logo=await new T.TextureLoader().loadAsync('/office3d/assets/logo.png')
  const fleet=canvas(1024,1024,(c,w,h)=>{
    for(let i=0;i<9;i++){const y=i*h/9;c.drawImage(logo.image,12,y+7,160,100);c.fillStyle='#204e59';c.font='bold 100px Arial';c.fillText('Dr.life+',184,y+94);c.font='bold 88px Arial';c.fillText(`DL-${String(i+1).padStart(2,'0')}`,738,y+90)}
    // The supplied logo's white paper is not a truck decal background.
    const pixels=c.getImageData(0,0,w,h);for(let i=0;i<pixels.data.length;i+=4)if(pixels.data[i]>235&&pixels.data[i+1]>235&&pixels.data[i+2]>235)pixels.data[i+3]=0;c.putImageData(pixels,0,0)
  })
  logo.dispose()
  const shadow=canvas(128,128,(c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,10,w/2,h/2,w/2);g.addColorStop(0,'rgba(18,22,25,.35)');g.addColorStop(.72,'rgba(18,22,25,.22)');g.addColorStop(1,'rgba(18,22,25,0)');c.fillStyle=g;c.fillRect(0,0,w,h)})
  const materials={
    paint:new T.MeshPhysicalMaterial({color:0xffffff,map:grime,roughness:.3,metalness:.12,clearcoat:.85,clearcoatRoughness:.19}),
    metal:new T.MeshStandardMaterial({color:0xc6cbd0,roughness:.27,metalness:.86}),
    dark:new T.MeshStandardMaterial({color:0x454e54,map:grille,roughness:.67,metalness:.2}),
    rubber:new T.MeshStandardMaterial({color:0x969696,map:rubber,roughness:.94}),
    glass:new T.MeshPhysicalMaterial({color:0x354c56,roughness:.15,metalness:.3,transparent:true,opacity:.88,depthWrite:false,clearcoat:1}),
    lamp:new T.MeshStandardMaterial({vertexColors:true,roughness:.22,emissive:0xffffff,emissiveIntensity:0}),
    fleet:new T.MeshStandardMaterial({map:fleet,roughness:.55,alphaTest:.08}),
    shadow:new T.MeshBasicMaterial({map:shadow,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),
    matte:new T.MeshStandardMaterial({vertexColors:true,roughness:.72,metalness:.08})
  }
  for(const [k,m] of Object.entries(materials))m.name=k
  function add(name,g,mat,pos=[0,0,0],rot=[0,0,0],color){
    if(g.index)g=g.toNonIndexed();for(const key of Object.keys(g.attributes))if(!['position','normal','uv'].includes(key))g.deleteAttribute(key)
    if(!g.attributes.uv)g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2))
    if(mat==='dark'&&!['front-fascia','cooler-grille'].includes(name))g.attributes.uv.array.fill(0)
    if(['front-fascia','cooler-grille'].includes(name)){g.computeBoundingBox();const b=g.boundingBox,p=g.attributes.position;for(let i=0;i<p.count;i++)g.attributes.uv.setXY(i,(p.getX(i)-b.min.x)/(b.max.x-b.min.x),(p.getY(i)-b.min.y)/(b.max.y-b.min.y))}
    g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...pos),new T.Quaternion().setFromEuler(new T.Euler(...rot)),new T.Vector3(1,1,1)))
    // Low LOD has no rubber/grille maps: bake their actual dark appearance, not the white texture multiplier.
    const lowColors={paint:0xb99d89,metal:0x899397,dark:0x28343a,rubber:0x252729,glass:0x253941}
    const c=new T.Color(color??(!high?lowColors[mat]:undefined)??materials[mat].color),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b}g.setAttribute('color',new T.BufferAttribute(a,3))
    g.setAttribute('_lampmask',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(mat==='lamp'?1:0),1))
    g.computeBoundingBox();parts.push({name,material:mat,bounds:[g.boundingBox.min.toArray(),g.boundingBox.max.toArray()],triangles:g.attributes.position.count/3})
    const bucket=!high&&!['fleet','shadow'].includes(mat)?'matte':mat;(bins[bucket]??=[]).push(g)
  }
  // Rounded cuboid with explicit bevel vertices, unlike a subdivided cube's flat corners.
  function rounded(w,h,d,r=.06){
    r=Math.min(r,Math.min(w,h,d)*.4)
    const shape=new T.Shape(),x=-w/2,y=-h/2;shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);shape.lineTo(x+r,y+h);shape.quadraticCurveTo(x,y+h,x,y+h-r);shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y)
    return new T.ExtrudeGeometry(shape,{depth:Math.max(.001,d-2*r),bevelEnabled:true,bevelThickness:r,bevelSize:r*.35,bevelSegments:1,steps:1,curveSegments:2}).translate(0,0,-d/2+r)
  }
  function cabLoft(sections,steps=8){
    const vertices=[],index=[],n=4*(steps+1)
    for(const [y,w,front,back,r] of sections){for(let corner=0;corner<4;corner++)for(let i=0;i<=steps;i++){const a=corner*Math.PI/2+i*Math.PI/(2*steps);const cx=corner===0||corner===3?w/2-r:-w/2+r,cz=corner<2?front-r:back+r;vertices.push(cx+Math.cos(a)*r,y,cz+Math.sin(a)*r)}}
    for(let k=0;k<sections.length-1;k++)for(let i=0;i<n;i++){const a=k*n+i,b=k*n+(i+1)%n,c=b+n,d=a+n;index.push(a,c,b,a,d,c)}
    for(const k of [0,sections.length-1])for(let i=1;i<n-1;i++){const a=k*n;if(k===0)index.push(a,a+i,a+i+1);else index.push(a,a+i+1,a+i)}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(index);g.computeVertexNormals();return g
  }
  const frontZ=(x,y)=>8.20-Math.tan(Math.PI/30)*Math.max(0,y-2.18)-(.30-Math.sqrt(.30**2-Math.max(0,Math.abs(x)-.85)**2))-.01*(x/1.15)**2
  function frontPanel(x0,x1,y0,y1,offset=0,nx=16,ny=3){
    const p=[],uv=[],idx=[];for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const x=x0+(x1-x0)*i/nx,y=y0+(y1-y0)*j/ny-.035*(x/1.15)**2;p.push(x,y,frontZ(x,y)+offset);uv.push(i/nx,j/ny)}
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=b+nx+1,d=c-1;idx.push(a,b,c,a,c,d)}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g
  }
  function wheelArch(){
    const p=[],idx=[],n=20;for(let i=0;i<=n;i++){const a=i/n*Math.PI;for(const [x,r]of [[-.16,.53],[-.16,.60],[.16,.53],[.16,.60]])p.push(x,Math.sin(a)*r,Math.cos(a)*r)}
    for(let i=0;i<n;i++)for(const [a,b]of [[0,1],[1,3],[3,2],[2,0]]){const k=i*4;idx.push(k+a,k+b,k+b+4,k+a,k+b+4,k+a+4)}for(const k of [0,n*4])idx.push(k,k+2,k+3,k,k+3,k+1);const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();return g
  }
  const box=(n,p,s,m='paint',r=0)=>add(n,r>=.06&&high?rounded(...s,r):new T.BoxGeometry(...s),m,p)
  const rod=(n,a,b,r,m='metal',segments=6)=>{const v=new T.Vector3(...b).sub(new T.Vector3(...a));const g=new T.CylinderGeometry(r,r,v.length(),segments,1,true);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),v.clone().normalize()));add(n,g,m,new T.Vector3(...a).addScaledVector(v,.5).toArray())}
  const plate=(n,p,w,h,rot,mat='fleet')=>add(n,new T.PlaneGeometry(w,h),mat,p,rot)
  // Trailer insulated box, full-scale 13.3 m body; tractor and trailer overlap at the fifth wheel only.
  box('refrigerated-body',[0,2.55,-1.58],[2.54,2.88,13.26],'paint')
  if(!high){
    add('cab',cabLoft([[.54,2.34,8.215,5.365,.25],[2.15,2.34,8.215,5.365,.25],[3.34,2.24,8.08,5.365,.25]],1),'paint');add('front-glass',frontPanel(-.99,.99,2.20,3.08,.05,4,1),'dark')
    box('front-fascia',[0,1.55,8.23],[1.80,.66,.025],'dark')
    for(const s of [-1,1]){box('side-window',[s*1.176,2.66,7.05],[.012,.8,1.66],'glass');box('trailer-frame',[s*.58,.94,-1.60],[.13,.23,13.1],'dark')}
    box('roof-airfoil',[0,3.68,5.95],[2.20,.28,.65]);box('refrigeration-unit',[0,2.72,5.20],[1.6,1.98,.26])
    for(const s of [-1,1]){add('headlight',new T.BoxGeometry(.33,.14,.012),'lamp',[s*.91,1.1,8.244],[0,0,0],0xffefd1);add('tail-light',new T.BoxGeometry(.38,.14,.012),'lamp',[s*.91,.69,-8.244],[0,0,0],0xe94737)}
  }
  else {
    add('cab-lower',cabLoft([[.84,2.18,8.10,5.40,.28],[.96,2.30,8.17,5.37,.30],[1.90,2.30,8.17,5.37,.30],[2.20,2.26,8.15,5.40,.30]]),'paint')
    add('cab-roof',cabLoft([[3.08,2.25,8.11,5.47,.30],[3.24,2.25,8.06,5.47,.31],[3.48,2.20,7.91,5.47,.33],[3.66,2.12,7.68,5.48,.35],[3.78,1.98,7.37,5.51,.35],[3.84,1.80,7.12,5.57,.32]]),'paint')
    box('cab-back',[0,2.61,5.42],[2.29,1.6,.11],'paint',.035)
    for(const s of [-1,1]){
      box('B-pillar',[s*1.12,2.65,5.94],[.10,1.08,.13]);rod('A-pillar',[s*1.05,2.18,frontZ(1.05,2.18)],[s*1.05,3.10,frontZ(1.05,3.10)],.045,'paint',12)
      box('door-panel',[s*1.16,1.96,6.95],[.04,.46,1.82],'paint',.01)
      plate('side-window',[s*1.18,2.67,7.01],1.68,.8,[0,s*Math.PI/2,0],'glass')
      rod('mirror-arm',[s*1.10,2.85,7.83],[s*1.22,2.85,8.02],.025,'dark')
      box('main-mirror',[s*1.23,2.63,8.03],[.085,.42,.14],'dark',.018)
      box('wide-mirror',[s*1.23,2.33,8.03],[.085,.15,.14],'dark',.018)
      box('mirror-glass',[s*1.23,2.63,7.95],[.07,.35,.018],'metal')
      box('door-handle',[s*1.19,2.03,6.35],[.035,.055,.20],'dark',.01)
      box('step-recess',[s*1.01,.68,5.98],[.20,.50,.75],'dark');for(const y of [.48,.72])box('entry-step',[s*1.06,y,6.00],[.18,.065,.62],'metal')
      box('side-fairing',[s*1.10,.81,4.52],[.16,.45,1.85],'paint',.04)
      add('seat-cushion',new T.SphereGeometry(1,12,8).scale(.27,.075,.26),'dark',[s*.63,1.95,6.80])
      add('seat-back',new T.SphereGeometry(1,12,8).scale(.27,.34,.105),'dark',[s*.63,2.26,6.58],[.10,0,0])
      add('headrest',new T.SphereGeometry(1,8,6).scale(.15,.12,.08),'dark',[s*.63,2.60,6.54])
      rod('door-bottom-seam',[s*1.19,1.75,6.13],[s*1.19,1.75,7.8],.009,'dark')
    }
    // Raked windscreen is separate from the lower shell, allowing seats to read through the glass.
    for(const [a,b]of [[-1.02,-.02],[.02,1.02]])add('windscreen',frontPanel(a,b,2.20,3.09,.006),'glass')
    rod('windscreen-center',[0,2.20,frontZ(0,2.20)+.009],[0,3.09,frontZ(0,3.09)+.009],.017,'dark')
    add('sun-visor',frontPanel(-1.08,1.08,2.98,3.13,.012),'dark')
    box('dashboard',[0,2.10,7.62],[1.98,.20,.51],'dark',.075)
    add('instrument-hood',new T.SphereGeometry(1,12,6).scale(.32,.13,.24),'dark',[-.63,2.20,7.62])
    add('steering-wheel',new T.TorusGeometry(.19,.022,6,20),'dark',[-.63,2.32,7.37],[-.65,0,0]);for(const s of [-1,1])rod('wiper',[s*.87,2.25,frontZ(.87,2.25)+.016],[s*.22,2.48,frontZ(.22,2.48)+.016],.012,'dark')
    add('front-fascia',frontPanel(-.88,.88,1.29,1.94,.018),'dark')
    for(const y of [1.39,1.55,1.71,1.87])add('grille-slat',frontPanel(-.84,.84,y,y+.025,.026,16,1),'metal')
    add('front-bumper',cabLoft([[.61,2.18,8.13,7.94,.08],[.69,2.34,8.19,7.94,.10],[.91,2.34,8.19,7.94,.10],[.99,2.20,8.13,7.94,.08]]),'paint')
    add('lower-grille',frontPanel(-.58,.58,.74,.88,.025,12,1),'dark')
    for(const s of [-1,1]){
      const a=s<0?-1.12:.71,b=s<0?-.71:1.12
      add('headlight-housing',frontPanel(a,b,1.01,1.27,.02,8,2),'dark')
      add('headlight-rim',frontPanel(a+.025,b-.025,1.045,1.235,.025,8,2),'lamp',[0,0,0],[0,0,0],0xffda9f)
      add('headlight',frontPanel(a+.04,b-.04,1.065,1.215,.03,8,2),'lamp',[0,0,0],[0,0,0],0xf2faff)
      add('foglight',frontPanel(s*.94-.08,s*.94+.08,.76,.83,.03,4,1),'lamp',[0,0,0],[0,0,0],0xffefd1)
    }
    if(high){rod('steering-column',[-.63,2.08,7.35],[-.63,2.29,7.35],.035,'dark');for(const x of [-.63,.63])box('seat-base',[x,1.72,6.8],[.2,.36,.28],'dark')}
    box('roof-hatch',[0,3.75,6.95],[.73,.04,.56],'dark',.02)
    box('roof-airfoil',[0,3.86,5.90],[2.21,.21,.75],'paint',.07)
    for(const s of [-1,1])rod('roof-horn',[s*.76,3.75,6.35],[s*.76,3.75,6.87],.045,'metal')
  }
  // Five axles: two on tractor, three on trailer. Rear axles use visibly separated dual tyres.
  const axles=[7.0,3.15,-4.25,-5.55,-6.85],segments=high?32:8
  for(let ai=0;ai<axles.length;ai++){
    const z=axles[ai];if(high)rod('axle',[-1.05,.49,z],[1.05,.49,z],.065,'dark')
    for(const s of [-1,1]){
      const centers=ai===0?[s*1.05]:far?[s*.99]:[s*1.10,s*.82]
      for(const x of centers){
        const halfWidth=ai===0?.14:.25
        const profile=(high?[[-.14,.32],[-.14,.41],[-.125,.46],[-.085,.49],[.085,.49],[.125,.46],[.14,.41],[.14,.32]]:far?[[-halfWidth,.32],[-halfWidth,.49],[halfWidth,.49],[halfWidth,.32]]:[[-.14,.32],[-.10,.49],[.10,.49],[.14,.32]]).map(([y,r])=>new T.Vector2(r,y))
        add('rounded-tyre',new T.LatheGeometry(profile,segments),'rubber',[x,.49,z],[0,0,Math.PI/2])
      }
      add('recessed-rim',new T.CircleGeometry(.30,high?24:8), 'metal',[s*1.245,.49,z],[0,s*Math.PI/2,0])
      if(high){add('rim-dish',new T.CircleGeometry(.23,12),'dark',[s*1.248,.49,z],[0,s*Math.PI/2,0]);add('wheel-hub',new T.CircleGeometry(.11,12),'metal',[s*1.252,.49,z],[0,s*Math.PI/2,0]);for(let n=0;n<6;n++){const a=n*Math.PI/3;add('hub-nut',new T.BoxGeometry(.018,.035,.035),'metal',[s*1.255,.49+Math.sin(a)*.155,z+Math.cos(a)*.155],[0,0,Math.PI/2])}}
      if(high){add('mudguard',wheelArch(),'dark',[s*1.10,.49,z]);box('mudflap',[s*1.10,.39,z-.59],[.30,.55,.025],'rubber')}
    }
  }
  if(high){
    for(const s of [-1,1]){
      box('tractor-frame',[s*.50,.72,4.22],[.14,.22,4.3],'dark');box('trailer-frame',[s*.58,.94,-1.60],[.13,.23,13.1],'dark')
      box('fuel-tank',[s*.94,.58,4.60],[.48,.52,1.28],'metal',.07)
      for(const z of [4.10,5.1])box('tank-strap',[s*.95,.6,z],[.50,.54,.035],'dark')
      box('battery-box',[s*.95,.63,2.72],[.44,.42,.56],'dark',.025)
      for(const y of [.49,.72])box('side-guard',[s*1.17,y,-.62],[.06,.085,5.8],'metal')
      for(const z of [-2.75,-.6,1.75])box('guard-bracket',[s*1.10,.73,z],[.12,.40,.07],'dark')
      box('support-leg',[s*.90,.61,2.05],[.15,.83,.15],'dark');box('support-foot',[s*.90,.17,2.05],[.31,.08,.28],'metal')
      box('toolbox',[s*.93,.60,-2.4],[.46,.47,1.1],'dark',.025)
      for(const y of [1.12,3.98])box('trailer-edge',[s*1.26,y,-1.60],[.03,.04,13.3],'metal')
      box('trailer-corner',[s*1.26,2.55,-8.23],[.03,2.90,.03],'metal')
      for(let z=-7.8;z<5;z+=2.6)add('side-marker',new T.BoxGeometry(.016,.045,.12),'lamp',[s*1.267,1.19,z],[0,0,0],0xffa336)
    }
    add('fifth-wheel',new T.CylinderGeometry(.55,.55,.10,12),'dark',[0,1.04,3.30])
    add('air-tank',new T.CylinderGeometry(.15,.15,.80,12),'metal',[0,.60,2.10],[0,0,Math.PI/2])
    add('spare-tyre',new T.TorusGeometry(.34,.12,5,12),'rubber',[0,.62,-2.4],[Math.PI/2,0,0])
    box('refrigeration-unit',[0,2.70,5.21],[1.65,2.12,.29],'paint',.06)
    box('cooler-grille',[0,2.80,5.37],[1.39,1.0,.025],'dark')
    for(let y=2.36;y<3.24;y+=.11)box('cooler-louver',[0,y,5.39],[1.30,.027,.012],'metal')
    for(const x of [-.64,.64]){
      box('rear-door',[x,2.54,-8.219],[1.24,2.79,.006],'paint')
      for(const dx of [-.30,.30])rod('rear-lock-bar',[x+dx,1.24,-8.234],[x+dx,3.85,-8.234],.014,'metal')
      box('door-handle',[x,2.02,-8.243],[.28,.045,.012],'metal')
      for(const y of [1.5,2.5,3.5])box('rear-hinge',[x*1.85,y,-8.242],[.13,.075,.015],'metal')
      add('tail-light',new T.BoxGeometry(.38,.14,.018),'lamp',[x*1.45,.69,-8.24],[0,0,0],0xe94737)
      add('rear-reflector',new T.BoxGeometry(.45,.055,.012),'lamp',[x*1.35,1.20,-8.244],[0,0,0],0xffd475)
    }
    box('rear-impact-bar',[0,.41,-8.16],[2.34,.14,.14],'metal')
  }
  // Exported planes carry one atlas row at runtime, so fleet IDs never cost one call per truck.
  for(const s of [-1,1])plate('side-livery',[s*1.275,2.65,-.35],9.5,1.15,[0,s*Math.PI/2,0])
  plate('rear-fleet',[0,1.56,-8.25],1.70,.22,[0,Math.PI,0])
  plate('contact-shadow',[0,.006,0],2.55,16.5,[-Math.PI/2,0,0],'shadow')
  const group=new T.Group();group.name=`tractor-semitrailer-${tier}`
  for(const [key,geometries] of Object.entries(bins)){
    const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose())
    if(key!=='matte'&&key!=='lamp')geometry.deleteAttribute('color')
    const mesh=new T.Mesh(geometry,materials[key]);mesh.name=key;group.add(mesh)
  }
  group.userData={tier,lengthM:16.5,widthM:2.55,heightM:4,level:'UNKNOWN',axles,parts}
  return group
}
