import { registerHooks } from 'node:module'
import * as THREE from '../../vendor/three/three.module.js'

// 与浏览器 import-map 指向同一 Three；不装依赖，直接调用宿主真实 placeFurniture。
const hooks=registerHooks({resolve(specifier,context,next){return specifier==='three'?{url:new URL('../../vendor/three/three.module.js',import.meta.url).href,shortCircuit:true}:next(specifier,context)}})
const {placeFurniture}=await import('../../assets3d.js')
hooks.deregister()

export function marketFurnitureFixture() {
  const names=['desk','chairDesk','computerScreen','computerKeyboard','computerMouse'],furn={}
  for(const name of names){const material=new THREE.MeshStandardMaterial();material.name=name==='desk'?'wood':'metalDark';const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);mesh.position.y=.5;const group=new THREE.Group();group.add(mesh);furn[name]=group}
  return {A:{furn},placeFurniture,dispose(){for(const group of Object.values(furn))group.traverse(m=>{if(m.isMesh){m.geometry.dispose();m.material.dispose()}})}}
}
