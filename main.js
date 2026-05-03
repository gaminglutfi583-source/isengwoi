import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AdaptiveToneMappingPass } from 'three/addons/postprocessing/AdaptiveToneMappingPass.js';

// ============================================
// 1. RENDERER & SCENES
// ============================================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const mainScene = new THREE.Scene();
const bgScene = new THREE.Scene();

// Camera (shared for background and main)
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 6);
const bgCamera = camera;

// OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2.5;
controls.maxDistance = 20;

// ============================================
// 2. RENDER TARGET (BACKGROUND)
// ============================================
const rt = new THREE.WebGLRenderTarget(
    window.innerWidth * 2,
    window.innerHeight * 2,
    {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
    }
);
rt.texture.colorSpace = THREE.SRGBColorSpace;

// ============================================
// 3. TEXTURES (PROCEDURAL FALLBACK)
// ============================================
const textureLoader = new THREE.TextureLoader();

// --- Nebula background texture ---
let nebulaTex;
try {
    nebulaTex = textureLoader.load('/textures/nebula.jpg');
} catch (e) { /* fallback below */ }
if (!nebulaTex || true) { // fallback procedural
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Draw stars
    for (let i = 0; i < 3000; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const r = Math.random() * 1.5;
        const alpha = Math.random() * 0.8 + 0.2;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    nebulaTex = new THREE.CanvasTexture(canvas);
}
nebulaTex.wrapS = THREE.RepeatWrapping;
nebulaTex.wrapT = THREE.RepeatWrapping;
nebulaTex.colorSpace = THREE.SRGBColorSpace;

// --- Accretion disk texture ---
let diskTex;
try {
    diskTex = textureLoader.load('/textures/disk_texture.jpg');
} catch (e) { /* fallback */ }
if (!diskTex || true) { // fallback procedural noise
    const canvas2 = document.createElement('canvas');
    canvas2.width = 512;
    canvas2.height = 512;
    const ctx2 = canvas2.getContext('2d');
    ctx2.fillStyle = '#000';
    ctx2.fillRect(0, 0, canvas2.width, canvas2.height);
    for (let i = 0; i < 10000; i++) {
        const x = Math.random() * canvas2.width;
        const y = Math.random() * canvas2.height;
        const bright = Math.random() * 80 + 20;
        ctx2.fillStyle = `rgb(${bright},${bright * 0.7},${bright * 0.3})`;
        ctx2.fillRect(x, y, 2, 2);
    }
    diskTex = new THREE.CanvasTexture(canvas2);
}
diskTex.wrapS = THREE.RepeatWrapping;
diskTex.wrapT = THREE.RepeatWrapping;
diskTex.colorSpace = THREE.SRGBColorSpace;

// ============================================
// 4. BACKGROUND SCENE (STARS + NEBULA SPHERE)
// ============================================
const bgSphereGeo = new THREE.SphereGeometry(50, 64, 32);
const bgSphereMat = new THREE.MeshBasicMaterial({ map: nebulaTex, side: THREE.BackSide });
bgScene.add(new THREE.Mesh(bgSphereGeo, bgSphereMat));

// Stars particles
const starsGeo = new THREE.BufferGeometry();
const starsCount = 2000;
const starsPos = new Float32Array(starsCount * 3);
for (let i = 0; i < starsCount * 3; i += 3) {
    starsPos[i] = (Math.random() - 0.5) * 200;
    starsPos[i + 1] = (Math.random() - 0.5) * 200;
    starsPos[i + 2] = (Math.random() - 0.5) * 200;
}
starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPos, 3));
const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, blending: THREE.AdditiveBlending, depthWrite: false });
bgScene.add(new THREE.Points(starsGeo, starsMat));

// ============================================
// 5. BLACK HOLE (SHADER WITH LENSING DISTORTION)
// ============================================
async function loadShader(url) {
    const res = await fetch(url);
    return res.text();
}
const bhVert = await loadShader('/shaders/blackhole.vert.glsl');
const bhFrag = await loadShader('/shaders/blackhole.frag.glsl');
const diskVert = await loadShader('/shaders/disk.vert.glsl');
const diskFrag = await loadShader('/shaders/disk.frag.glsl');

const bhUniforms = {
    uBackgroundTexture: { value: rt.texture },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uBlackHoleScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
    uBlackHoleWorldPos: { value: new THREE.Vector3(0, 0, 0) },
    uCameraWorldPos: { value: new THREE.Vector3() },
    uSchwarzschildRadius: { value: 0.05 },
    uLensStrength: { value: 1.8 },
    uAspect: { value: window.innerWidth / window.innerHeight },
    uMousePos: { value: new THREE.Vector2(0.5, 0.5) },
};

const bhGeo = new THREE.SphereGeometry(1.2, 128, 64);
const bhMat = new THREE.ShaderMaterial({
    vertexShader: bhVert,
    fragmentShader: bhFrag,
    uniforms: bhUniforms,
    depthTest: true,
    depthWrite: true,
});
const blackHole = new THREE.Mesh(bhGeo, bhMat);
blackHole.renderOrder = 1;
mainScene.add(blackHole);

// ============================================
// 6. ACCRETION DISK (SHADER)
// ============================================
const diskUniforms = {
    uTime: { value: 0 },
    uTexture: { value: diskTex },
    uInnerRadius: { value: 1.4 },
    uOuterRadius: { value: 3.5 },
    uCameraPosition: { value: new THREE.Vector3() },
    uBlackHolePosition: { value: new THREE.Vector3(0, 0, 0) },
    uDopplerStrength: { value: 1.2 },
};

const diskGeo = new THREE.RingGeometry(1.4, 3.5, 256, 2);
diskGeo.rotateX(-Math.PI / 2);
const diskMat = new THREE.ShaderMaterial({
    vertexShader: diskVert,
    fragmentShader: diskFrag,
    uniforms: diskUniforms,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
});
const disk = new THREE.Mesh(diskGeo, diskMat);
disk.renderOrder = 2;
mainScene.add(disk);

// ============================================
// 7. POST-PROCESSING
// ============================================
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(mainScene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5,   // strength
    0.5,   // radius
    0.1    // threshold
);
composer.addPass(bloomPass);

// Adaptive Tone Mapping (dynamic exposure like a camera)
const adaptivePass = new AdaptiveToneMappingPass(true, 1.0, 0.5);
adaptivePass.needsSwap = true;
composer.addPass(adaptivePass);

// ============================================
// 8. ANIMATION LOOP
// ============================================
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    const time = performance.now() * 0.001;

    // Update main uniforms
    bhUniforms.uTime.value = time;
    diskUniforms.uTime.value = time;
    camera.getWorldPosition(bhUniforms.uCameraWorldPos);
    diskUniforms.uCameraPosition.value.copy(camera.position);

    // --- Compute screen-space black hole data ---
    const bhWorld = new THREE.Vector3(0, 0, 0);
    const bhScreen = bhWorld.clone().project(camera);
    const screenX = (bhScreen.x + 1) / 2;
    const screenY = (1 - bhScreen.y) / 2; // flip Y for WebGL
    bhUniforms.uBlackHoleScreenPos.value.set(screenX, screenY);
    bhUniforms.uBlackHoleWorldPos.value.set(0, 0, 0);

    // Horizon radius in screen UV
    const horizonWorld = 0.85;
    const offsetPoint = new THREE.Vector3(horizonWorld, 0, 0);
    const offsetScreen = offsetPoint.clone().project(camera);
    const offsetX = (offsetScreen.x + 1) / 2;
    const screenRadius = Math.abs(offsetX - screenX);
    bhUniforms.uSchwarzschildRadius.value = screenRadius;

    // Mouse position for subtle distortion increase near center
    // (optional – uncomment if you want hover effect)
    // const mouse = new THREE.Vector2(window.mouseX, window.mouseY); // setup in mousemove listener
    // bhUniforms.uMousePos.value.copy(mouse);

    // --- Camera shake when close to event horizon ---
    const distToBH = camera.position.length();
    if (distToBH < 4.0) {
        const intensity = 0.015 * (1.0 - distToBH / 4.0);
        camera.position.x += Math.sin(time * 50) * intensity;
        camera.position.y += Math.cos(time * 47) * intensity;
    }

    // --- Render background to texture ---
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(bgScene, bgCamera);
    renderer.setRenderTarget(null);

    // --- Render main scene with post-processing ---
    composer.render();
}

window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bhUniforms.uResolution.value.set(w, h);
    bhUniforms.uAspect.value = w / h;
    rt.setSize(w * 2, h * 2);
});

animate();