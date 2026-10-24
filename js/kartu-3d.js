import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const host = document.querySelector('#scene');
const status = document.querySelector('#status');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#000000');

const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 100);
camera.position.set(0, 0, 13);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
host.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 2.0));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
keyLight.position.set(-3, 5, 8);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xffffff, 2.0);
rimLight.position.set(5, 1, -4);
scene.add(rimLight);

// Anchor and a flexible curve approximate the original lanyard/rope.
const anchor = new THREE.Vector3(0, 3.15, 0);
const ropePoints = Array.from({ length: 16 }, () => anchor.clone());
const ropeCurve = new THREE.CatmullRomCurve3(ropePoints);
const ropeGeometry = new THREE.TubeGeometry(ropeCurve, 48, 0.025, 8, false);
const ropeMaterial = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8, metalness: 0.05 });
const rope = new THREE.Mesh(ropeGeometry, ropeMaterial);
scene.add(rope);

let card = null;
let cardBaseY = -0.2;
let cardX = 0.35;
let cardY = -0.25;
let cardZ = 0;
let velocityX = 0;
let velocityY = 0;
let isDragging = false;
let dragOffset = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const hitPoint = new THREE.Vector3();

const loader = new GLTFLoader();
loader.load(
  './assets/kartu.glb',
  (gltf) => {
    card = gltf.scene;
    card.scale.setScalar(2.25);
    card.position.set(cardX, cardY, cardZ);
    card.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      if (obj.material) {
        obj.material.needsUpdate = true;
        if ('metalness' in obj.material) obj.material.metalness = Math.max(obj.material.metalness ?? 0, 0.35);
        if ('roughness' in obj.material) obj.material.roughness = Math.min(obj.material.roughness ?? 0.5, 0.45);
      }
    });
    scene.add(card);
    status.textContent = '';
  },
  undefined,
  (error) => {
    console.error('Gagal memuat assets/kartu.glb:', error);
    status.textContent = 'Model gagal dimuat. Jalankan halaman melalui Live Server dan pastikan folder assets tersedia.';
  }
);

function setPointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!card) return;
  setPointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(card, true);
  if (!hits.length) return;
  isDragging = true;
  renderer.domElement.setPointerCapture(event.pointerId);
  dragPlane.constant = -card.position.z;
  raycaster.ray.intersectPlane(dragPlane, hitPoint);
  dragOffset.copy(card.position).sub(hitPoint);
  velocityX = velocityY = 0;
  renderer.domElement.style.cursor = 'grabbing';
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (!card) return;
  setPointer(event);
  if (isDragging) {
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
      const target = hitPoint.add(dragOffset);
      const oldX = cardX, oldY = cardY;
      cardX = THREE.MathUtils.clamp(target.x, -4.0, 4.0);
      cardY = THREE.MathUtils.clamp(target.y, -3.4, 2.8);
      velocityX = (cardX - oldX) * 0.65;
      velocityY = (cardY - oldY) * 0.65;
    }
  } else {
    raycaster.setFromCamera(pointer, camera);
    renderer.domElement.style.cursor = card && raycaster.intersectObject(card, true).length ? 'grab' : 'default';
  }
});

function stopDrag() {
  isDragging = false;
  renderer.domElement.style.cursor = 'grab';
}
renderer.domElement.addEventListener('pointerup', stopDrag);
renderer.domElement.addEventListener('pointercancel', stopDrag);
renderer.domElement.addEventListener('lostpointercapture', stopDrag);

function resize() {
  const width = host.clientWidth || window.innerWidth;
  const height = host.clientHeight || window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);

  if (card) {
    if (!isDragging) {
      // Gentle spring motion when released, approximating the source physics.
      const spring = 5.5;
      velocityX += (-cardX * spring - velocityX * 2.5) * dt;
      velocityY += ((cardBaseY - cardY) * spring - velocityY * 2.5) * dt;
      cardX += velocityX * dt;
      cardY += velocityY * dt;
    }
    card.position.set(cardX, cardY, cardZ);
    card.rotation.z = THREE.MathUtils.damp(card.rotation.z, -velocityX * 0.08, 3, dt);
    card.rotation.x = THREE.MathUtils.damp(card.rotation.x, velocityY * 0.04, 3, dt);

    // Rebuild the rope curve between the top anchor and the card's top edge.
    const end = new THREE.Vector3(cardX - 0.35, cardY + 2.25, cardZ);
    const dx = end.x - anchor.x;
    const dy = end.y - anchor.y;
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const sag = Math.sin(Math.PI * t) * (0.25 + Math.min(Math.abs(dx) * 0.15, 0.5));
      pts.push(new THREE.Vector3(anchor.x + dx * t, anchor.y + dy * t - sag, anchor.z));
    }
    rope.geometry.dispose();
    rope.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.025, 8, false);
  }
  renderer.render(scene, camera);
}
animate();
