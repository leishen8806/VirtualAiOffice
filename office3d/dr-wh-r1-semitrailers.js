import * as THREE from './vendor/three/three.module.js'
import { RoomEnvironment } from './vendor/three/jsm/environments/RoomEnvironment.js'

export const SEMITRAILER_SIZE = Object.freeze({length:16.5,width:2.55,height:4,level:'UNKNOWN'})
export function validateTruckBays(bays) {
  const ids=new Set()
  for(const b of bays){
    if(!b.id||ids.has(b.id)||!b.dockDoor||!Number.isInteger(b.fleetNumber)||b.fleetNumber<1||b.fleetNumber>9||![b.x,b.y,b.z,b.yaw].every(Number.isFinite))throw new Error('Invalid truck bay: id, dockDoor, fleetNumber 1–9 and finite x/y/z/yaw required')
    ids.add(b.id)
  }
}
export function truckLod(distance, previous, low=false) {
  if(low)return distance>(previous===2?65:75)?2:1
  if(previous===0&&distance<40)return 0
  if(distance<34)return 0
  if(previous===2&&distance>84)return 2
  return distance>96?2:1
}

// B1 intentionally has no registry caller. SITE supplies world-space bays when B2 is approved.
export async function loadWhR1Semitrailers({root,renderer,bays,quality={tier:'high'},env={night:0},assetBase=new URL('./assets/compact/wh-trucks/',import.meta.url),fetchAsset=fetch}) {
  validateTruckBays(bays)
  bays=bays.map(b=>({...b}))
  const {GLTFLoader}=await import('./vendor/three/jsm/loaders/GLTFLoader.js')
  const templates=await Promise.all(['near','mid','far'].map(async tier=>{
    const r=await fetchAsset(new URL(`semitrailer-${tier}.glb.gz`,assetBase));if(!r.ok)throw new Error(`Truck ${tier}: HTTP ${r.status}`)
    const buffer=await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    return (await new GLTFLoader().parseAsync(buffer,'')).scene
  }))
  const group=new THREE.Group();group.name='wh-r1-semitrailers';group.userData={noMerge:true,level:'UNKNOWN',bays:bays.map(b=>({...b}))}
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),reflection=pmrem.fromScene(room,.04);room.dispose();pmrem.dispose()
  const batches=[],states=bays.map(()=>-1),matrix=new THREE.Matrix4(),position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1)
  for(let lod=0;lod<templates.length;lod++){
    const list=[];templates[lod].traverse(source=>{
      if(!source.isMesh)return
      const material=source.material.clone(),mesh=new THREE.InstancedMesh(source.geometry,material,bays.length)
      mesh.count=0;mesh.visible=false
      mesh.name=`semitrailer-${lod}-${source.material.name}`;mesh.userData={noMerge:true,instanceToVehicleId:[],lod};mesh.castShadow=false;mesh.receiveShadow=true;mesh.frustumCulled=false
      if(material.isMeshStandardMaterial&&lod===0){material.envMap=reflection.texture;material.envMapIntensity=.65}
      if(material.name==='matte'||material.name==='lamp'){
        const uniform={value:0};material.userData.nightUniform=uniform
        material.onBeforeCompile=shader=>{shader.uniforms.truckNight=uniform;shader.vertexShader='attribute float _lampmask; varying float truckLamp;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntruckLamp=_lampmask;');shader.fragmentShader='uniform float truckNight; varying float truckLamp;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance=diffuseColor.rgb*truckLamp*truckNight*5.5;')}
        material.customProgramCacheKey=()=> 'truck-lamp-mask-v2'
      }
      if(source.material.name==='fleet'){
        material.polygonOffset=true;material.polygonOffsetFactor=-2;material.polygonOffsetUnits=-2
        mesh.geometry=source.geometry.clone();mesh.geometry.setAttribute('fleetRow',new THREE.InstancedBufferAttribute(new Float32Array(bays.length),1))
        material.onBeforeCompile=shader=>{shader.vertexShader='attribute float fleetRow;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv.y=(vMapUv.y+8.0-fleetRow)/9.0;\n#endif')}
        material.customProgramCacheKey=()=> 'fleet-atlas-v1'
      }
      if(material.name==='paint'){
        mesh.geometry=source.geometry.clone();mesh.geometry.setAttribute('vehicleSeed',new THREE.InstancedBufferAttribute(new Float32Array(bays.length),1))
        material.onBeforeCompile=shader=>{
          shader.vertexShader='attribute float vehicleSeed; varying vec3 truckLocal; varying float dirtSeed;\n'+shader.vertexShader
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntruckLocal=position;dirtSeed=vehicleSeed;')
          shader.fragmentShader='varying vec3 truckLocal; varying float dirtSeed;\n'+shader.fragmentShader
          shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat dust=(.5+.5*sin(truckLocal.z*24.0+dirtSeed*9.0)*sin(truckLocal.y*17.0+dirtSeed))*(1.0-smoothstep(.3,1.8,truckLocal.y));diffuseColor.rgb*=1.0-dust*.10;')
        };material.customProgramCacheKey=()=> 'vehicle-finish-v1'
      }
      list.push(mesh);group.add(mesh)
    });batches.push(list)
  }
  let lastNight=-1,lastTier,disposed=false
  function update(camera) {
    if(disposed)return
    let changed=lastTier!==quality.tier;lastTier=quality.tier
    // Low quality shares the nearest fleet LOD: mixed medium/far would double its three-call budget.
    const low=quality.tier==='low',nearest=low?Math.min(...bays.map(b=>camera.position.distanceTo(position.set(b.x,b.y+2,b.z)))):0
    const lowLod=truckLod(nearest,states.every(s=>s===2)?2:1,true)
    for(let i=0;i<bays.length;i++){const b=bays[i],d=camera.position.distanceTo(position.set(b.x,b.y+2,b.z)),lod=low?lowLod:truckLod(d,states[i]);if(lod!==states[i])changed=true;states[i]=lod}
    if(changed)for(let lod=0;lod<3;lod++){
      const selected=bays.map((b,i)=>({b,i})).filter(({i})=>states[i]===lod)
      for(const mesh of batches[lod]){
        mesh.count=selected.length;mesh.visible=!!selected.length;mesh.userData.instanceToVehicleId=selected.map(({b})=>b.id)
        selected.forEach(({b},j)=>{matrix.compose(position.set(b.x,b.y,b.z),quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,b.yaw),scale);mesh.setMatrixAt(j,matrix)
          if(mesh.geometry.attributes.fleetRow)mesh.geometry.attributes.fleetRow.setX(j,b.fleetNumber-1)
          if(mesh.geometry.attributes.vehicleSeed)mesh.geometry.attributes.vehicleSeed.setX(j,b.fleetNumber)
          // Deterministic per-vehicle finish variation; no shared global random state.
          if(mesh.material.name==='paint')mesh.setColorAt(j,new THREE.Color().setScalar(.96+((b.fleetNumber*31)%11)/275))
        });mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;for(const key of ['fleetRow','vehicleSeed'])if(mesh.geometry.attributes[key])mesh.geometry.attributes[key].needsUpdate=true
      }
    }
    const night=Math.max(0,Math.min(1,env.night||0));if(night!==lastNight){lastNight=night;for(const list of batches)for(const m of list){if(m.material.userData.nightUniform)m.material.userData.nightUniform.value=night;if(m.material.envMap)m.material.envMapIntensity=.65*(1-night)+.14*night}}
  }
  root.add(group)
  return {root:group,update,states,batches,dispose(){if(disposed)return;disposed=true;root.remove(group);const gs=new Set(),ts=new Set();for(const list of batches)for(const m of list){gs.add(m.geometry);for(const v of Object.values(m.material))if(v?.isTexture&&v!==reflection.texture)ts.add(v);m.material.dispose()}gs.forEach(g=>g.dispose());ts.forEach(t=>t.dispose());reflection.dispose()}}
}
