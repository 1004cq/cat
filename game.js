import * as THREE from "three";

const canvas = document.getElementById("game");
const hint = document.getElementById("hint");
const scoreEl = document.getElementById("score");
const loading = document.getElementById("loading");

const STEP = 1 / 60;
const MAX_STEPS = 5;
let acc = 0;
let last = performance.now();
let paused = document.hidden;

const home = { x: 0, z: 0 };
const cat = {
  x: 0, z: 0, vx: 0, vz: 0,
  face: 1, faceDraw: 1,
  phase: 0, state: "idle",
};
const ball = {
  x: 0, y: 0.16, z: 0,
  vx: 0, vy: 0, vz: 0,
  held: true, dragging: false,
  r: 0.16, spin: 0, sleep: true,
};
const PHYS = {
  gravity: 18,
  bounce: 0.55,
  air: 0.995,
  groundFric: 0.86,
  sleepV: 0.35,
};
let score = 0;
const throwSamples = [];
const fieldW = 8;
const fieldD = 12;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
  alpha: false,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c56a);
scene.fog = new THREE.Fog(0x87c56a, 10, 22);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
camera.position.set(0, 7.2, 8.4);
camera.lookAt(0, 0, 0.4);

scene.add(new THREE.HemisphereLight(0xe8fff0, 0x3d5c28, 1.15));
const sun = new THREE.DirectionalLight(0xfff4d2, 1.35);
sun.position.set(-4, 10, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -8;
sun.shadow.camera.right = 8;
sun.shadow.camera.top = 8;
sun.shadow.camera.bottom = -8;
scene.add(sun);

const loader = new THREE.TextureLoader();
const grassTex = loader.load("grass.jpg", () => loading.classList.add("hide"));
grassTex.colorSpace = THREE.SRGBColorSpace;
grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
grassTex.repeat.set(2.2, 3.2);
grassTex.anisotropy = 4;

const catTex = loader.load("cat.jpg");
catTex.colorSpace = THREE.SRGBColorSpace;

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(16, 22),
  new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.92, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.16, 24, 16),
  new THREE.MeshStandardMaterial({ color: 0xff5d8f, roughness: 0.35, metalness: 0.05 })
);
ballMesh.castShadow = true;
scene.add(ballMesh);

const catSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: catTex }));
catSprite.scale.set(1.6, 1.6, 1);
catSprite.center.set(0.5, 0.12);
scene.add(catSprite);

const homeMark = new THREE.Mesh(
  new THREE.CircleGeometry(0.55, 24),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 })
);
homeMark.rotation.x = -Math.PI / 2;
homeMark.position.y = 0.01;
scene.add(homeMark);

function resize() {
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, r.width);
  const h = Math.max(1, r.height);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

function resetLayout() {
  home.x = 0;
  home.z = 3.6;
  homeMark.position.set(home.x, 0.01, home.z);
  cat.x = -0.7;
  cat.z = home.z;
  ball.x = 0.45;
  ball.y = 0.16;
  ball.z = home.z;
  ball.vx = ball.vy = ball.vz = 0;
  ball.held = true;
  ball.dragging = false;
  ball.sleep = true;
  cat.state = "idle";
  cat.vx = cat.vz = 0;
}
resetLayout();
resize();

const ray = new THREE.Raycaster();
const hitPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
const ndc = new THREE.Vector2();

function pointerToField(e) {
  const r = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  ndc.x = ((t.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((t.clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(ndc, camera);
  ray.ray.intersectPlane(hitPlane, hit);
  return { x: hit.x, z: hit.z };
}

function dist2(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

canvas.addEventListener("pointerdown", (e) => {
  const p = pointerToField(e);
  if (dist2(p.x, p.z, ball.x, ball.z) < 0.55 && (ball.held || cat.state === "idle")) {
    ball.dragging = true;
    ball.held = false;
    ball.sleep = false;
    cat.state = "idle";
    throwSamples.length = 0;
    throwSamples.push({ x: p.x, z: p.z, t: performance.now() });
    canvas.setPointerCapture(e.pointerId);
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (!ball.dragging) return;
  const p = pointerToField(e);
  ball.x = THREE.MathUtils.clamp(p.x, -fieldW / 2, fieldW / 2);
  ball.z = THREE.MathUtils.clamp(p.z, -fieldD / 2, fieldD / 2);
  ball.y = 0.22;
  const now = performance.now();
  throwSamples.push({ x: p.x, z: p.z, t: now });
  while (throwSamples.length > 8 || (throwSamples[0] && now - throwSamples[0].t > 80)) {
    throwSamples.shift();
  }
});
canvas.addEventListener("pointerup", () => {
  if (!ball.dragging) return;
  ball.dragging = false;
  const n = throwSamples.length;
  if (n >= 2) {
    const a = throwSamples[0];
    const b = throwSamples[n - 1];
    const dt = Math.max(0.016, (b.t - a.t) / 1000);
    ball.vx = ((b.x - a.x) / dt) * 0.45;
    ball.vz = ((b.z - a.z) / dt) * 0.45;
    ball.vy = 2.4 + Math.min(4, Math.hypot(ball.vx, ball.vz) * 0.12);
  }
  const speed = Math.hypot(ball.vx, ball.vz);
  if (speed > 9) {
    ball.vx *= 9 / speed;
    ball.vz *= 9 / speed;
  }
  ball.sleep = false;
  cat.state = "chase";
  hint.textContent = "小球飞出去了！";
});

document.addEventListener("visibilitychange", () => {
  paused = document.hidden;
  last = performance.now();
});

function step(dt) {
  cat.phase += dt * (cat.state === "idle" ? 3 : 12);

  if (!ball.held && !ball.dragging && !ball.sleep) {
    ball.vy -= PHYS.gravity * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z += ball.vz * dt;
    ball.vx *= PHYS.air;
    ball.vz *= PHYS.air;
    ball.spin += ball.vx * dt * 4;

    const limX = fieldW / 2 - 0.2;
    const limZ = fieldD / 2 - 0.2;
    if (ball.x < -limX) { ball.x = -limX; ball.vx *= -PHYS.bounce; }
    if (ball.x > limX) { ball.x = limX; ball.vx *= -PHYS.bounce; }
    if (ball.z < -limZ) { ball.z = -limZ; ball.vz *= -PHYS.bounce; }
    if (ball.z > limZ) { ball.z = limZ; ball.vz *= -PHYS.bounce; }

    if (ball.y <= 0.16) {
      ball.y = 0.16;
      ball.vy *= -PHYS.bounce;
      ball.vx *= PHYS.groundFric;
      ball.vz *= PHYS.groundFric;
      if (Math.abs(ball.vy) < 0.8) ball.vy = 0;
      if (Math.hypot(ball.vx, ball.vy, ball.vz) < PHYS.sleepV) {
        ball.vx = ball.vy = ball.vz = 0;
        ball.sleep = true;
      }
    }
  }

  const tx = cat.state === "return" ? home.x : ball.x;
  const tz = cat.state === "return" ? home.z : ball.z;
  if (cat.state === "chase" || cat.state === "return") {
    const dx = tx - cat.x;
    const dz = tz - cat.z;
    const d = Math.hypot(dx, dz) || 1;
    const maxSpd = cat.state === "chase" ? 3.6 : 2.8;
    cat.vx += (dx / d) * 14 * dt;
    cat.vz += (dz / d) * 14 * dt;
    const spd = Math.hypot(cat.vx, cat.vz);
    if (spd > maxSpd) {
      cat.vx *= maxSpd / spd;
      cat.vz *= maxSpd / spd;
    }
    cat.x += cat.vx * dt;
    cat.z += cat.vz * dt;
    cat.face = cat.vx >= 0 ? 1 : -1;
    if (d < 0.42) {
      if (cat.state === "chase") {
        cat.state = "grab";
        ball.held = true;
        ball.sleep = true;
        ball.vx = ball.vy = ball.vz = 0;
        hint.textContent = "叼住了，往回跑～";
        setTimeout(() => { if (cat.state === "grab") cat.state = "return"; }, 280);
      } else if (cat.state === "return") {
        cat.state = "idle";
        cat.vx = cat.vz = 0;
        score += 1;
        scoreEl.textContent = score;
        ball.x = home.x + 0.45;
        ball.y = 0.16;
        ball.z = home.z;
        hint.textContent = "又送回来啦，再丢一次！";
      }
    }
  } else {
    cat.vx *= 0.86;
    cat.x += Math.sin(cat.phase * 0.4) * 0.002;
  }

  cat.faceDraw += (cat.face - cat.faceDraw) * Math.min(1, dt * 10);

  if (ball.held && cat.state !== "idle") {
    ball.x = cat.x + cat.face * 0.35;
    ball.z = cat.z;
    ball.y = 0.28;
  }
}

function syncRender() {
  const t = performance.now() * 0.001;
  grassTex.offset.x = Math.sin(t * 0.15) * 0.01;
  ballMesh.position.set(ball.x, ball.y, ball.z);
  ballMesh.rotation.z = -ball.spin;
  const bob = Math.sin(cat.phase) * (cat.state === "idle" ? 0.012 : 0.03);
  catSprite.position.set(cat.x, 0.05 + bob, cat.z);
  catSprite.scale.x = 1.6 * (cat.faceDraw >= 0 ? 1 : -1);
}

function loop(now) {
  requestAnimationFrame(loop);
  if (paused) return;
  let frame = Math.min(0.05, (now - last) / 1000);
  last = now;
  acc += frame;
  let n = 0;
  while (acc >= STEP && n < MAX_STEPS) {
    step(STEP);
    acc -= STEP;
    n++;
  }
  if (n === MAX_STEPS) acc = 0;
  syncRender();
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
