import * as THREE from './vendor/three/three.module.js'
import { buildHeartBanyan } from './office-heart-banyan.js'

const scene = new THREE.Scene(), root = new THREE.Group()
scene.background = new THREE.Color('#f4f1ea'); scene.add(root)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2
document.body.prepend(renderer.domElement)
scene.add(new THREE.HemisphereLight('#e9efef', '#867860', 1.2))
const sun = new THREE.DirectionalLight('#fff1dc', 2.4); sun.position.set(-3, 7, 6); scene.add(sun)
const camera = new THREE.PerspectiveCamera(38, 1, .1, 80)
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: '#e8decd', roughness: .9 }))
ground.rotation.x = -Math.PI / 2; ground.position.y = -.01; scene.add(ground)
let tree, low = false, view = 'concept', disposed = false
const poses = { concept: [[5.7, 6.6, 9], [0, 1.8, 0]], foyer: [[0, 1.65, 8.6], [0, 2.05, 0]], side: [[6.5, 3.1, 5.5], [0, 1.9, 0]] }
function draw() {
  if (disposed || document.hidden) return
  renderer.render(scene, camera)
  const s = tree.summary(), bounds = new THREE.Box3().setFromObject(tree.root), size = bounds.getSize(new THREE.Vector3())
  document.querySelector('#metrics').textContent = `${low ? '低档' : '高档'} · 树资产 ${s.calls} calls / ${s.triangles} 三角形 · 实测 ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m · ${s.leafClusters} 个小叶簇`
}
function setView(name) { view = name; camera.position.set(...poses[name][0]); camera.lookAt(...poses[name][1]); draw() }
function build() { tree?.dispose(); tree = buildHeartBanyan({ THREE, root, low }); setView(view) }
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); draw() }
const clicks = event => { const button = event.target.closest('button'); if (button?.dataset.view) setView(button.dataset.view); if (button?.id === 'tier') { low = !low; button.textContent = low ? '切换高档' : '切换低档'; build() } }
const visible = () => { if (!document.hidden) draw() }
const dispose = () => { if (disposed) return; disposed = true; removeEventListener('resize', resize); document.removeEventListener('click', clicks); document.removeEventListener('visibilitychange', visible); tree.dispose(); ground.geometry.dispose(); ground.material.dispose(); renderer.dispose() }
build(); resize(); addEventListener('resize', resize); document.addEventListener('click', clicks); document.addEventListener('visibilitychange', visible)
addEventListener('pagehide', event => { if (!event.persisted) dispose() })
window.__banyanPreview = { summary: () => tree.summary(), renderer, tree: () => tree.root }
