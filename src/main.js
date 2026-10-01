import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DIE_SIZE, createDieMesh, readTopFace, restingQuaternion } from './dice.js';
import { createPhysics } from './physics.js';
import { playHit, setSoundEnabled, unlockAudio } from './sound.js';
import * as ui from './ui.js';
import './style.css';

const MIN_DICE = 1;
const MAX_DICE = 6;
const TABLE_COLOR = 0xededed;
const BACKDROP_COLOR = 0x0b0b0b; // 바닥 바깥 배경. style.css 의 --bg 와 같게
const RIM_COLOR = 0xf4f4f4;
const RIM_WIDTH = 0.22;
const RIM_HEIGHT = 0.45;
const CAMERA_PITCH = THREE.MathUtils.degToRad(64); // 테이블을 내려다보는 각도
const MIN_FIELD = 7; // HUD 에 안 가려진 화면의 짧은 변에 최소 이만큼(주사위 칸 수)은 보이게
const WALL_INSET = 0.15;
const SETTLE_TIMEOUT = 10_000; // ms. 이 안에 안 멈추면 그 자세 그대로 판정
const MAX_NUDGES = 4;

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = THREE.MathUtils.clamp;

const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 저장 못 해도 동작엔 지장 없음
    }
  },
};

// ── 렌더러 / 씬 ─────────────────────────────────────────

const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(BACKDROP_COLOR);
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);

// 주사위 표면 반사용 환경맵. 테이블은 직접광만 받게 scene.environment 에는 안 넣음
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
// 방 바닥은 검은 판으로 가림. 안 가리면 아래를 비추는 옆면·아래 모서리가 밝은 바닥을 비춰서 허옇게 뜸
const shade = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: 0x000000 }));
shade.rotation.x = -Math.PI / 2;
shade.position.y = -0.2;
room.add(shade);
const envMap = pmrem.fromScene(room, 0.04).texture;
room.dispose();
pmrem.dispose();
const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 4;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// 둥근 바닥. layout() 에서 물리 벽 범위(field)에 딱 맞춰 크기를 바꿈
const floorTexture = grainTexture();
// 바닥·테두리는 스펙큘러 0: 반사광 없이 확산광만
const table = new THREE.Mesh(
  new THREE.CircleGeometry(1, 128),
  new THREE.MeshPhysicalMaterial({ color: TABLE_COLOR, map: floorTexture, roughness: 1, specularIntensity: 0 }),
);
table.rotation.x = -Math.PI / 2;
table.receiveShadow = true;
scene.add(table);

// 바닥 둘레 테두리. 반지름이 바뀌면 모양을 새로 만듦
const rim = new THREE.Mesh(
  new THREE.BufferGeometry(),
  new THREE.MeshPhysicalMaterial({
    color: RIM_COLOR,
    roughness: 1,
    specularIntensity: 0,
    // 그림자는 빛을 받는 면(윗면·바깥 벽)으로 계산. 기본값(뒷면)이면 안쪽 벽 밑동으로 빛이 새서 흰 줄이 생김
    shadowSide: THREE.FrontSide,
  }),
);
rim.castShadow = rim.receiveShadow = true;
scene.add(rim);

function fitFloor() {
  const { cx, cz, radius } = field;
  // 바닥은 테두리 밑까지 깔아서 경계에 틈이 안 보이게
  const floorRadius = radius + RIM_WIDTH / 2;
  table.scale.set(floorRadius, floorRadius, 1);
  table.position.set(cx, 0, cz);
  floorTexture.repeat.setScalar(floorRadius * 0.6);
  rim.geometry.dispose();
  rim.geometry = rimGeometry(radius);
  rim.position.set(cx, 0, cz);
}

/** 단면(바깥 벽 → 윗면 → 안쪽 벽)을 한 바퀴 돌린 고리. 모서리 점을 두 번씩 넣어 각을 살림 */
function rimGeometry(radius) {
  const inner = radius;
  const outer = radius + RIM_WIDTH;
  const profile = [
    [outer, 0],
    [outer, RIM_HEIGHT],
    [outer, RIM_HEIGHT],
    [inner, RIM_HEIGHT],
    [inner, RIM_HEIGHT],
    [inner, 0],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(profile, 128);
}

// 바닥 질감용 잔잔한 노이즈
function grainTexture() {
  const size = 256;
  const tile = document.createElement('canvas');
  tile.width = tile.height = size;
  const ctx = tile.getContext('2d');
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = 244 + Math.random() * 11;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(tile);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

// ── 주사위 ─────────────────────────────────────────────

const physics = createPhysics();
const dice = []; // { mesh, body }

let state = 'idle'; // idle → rolling → settled
let rollStartedAt = 0;
let quietSince = 0; // 모든 주사위가 거의 멈춰 있기 시작한 시각
let nudges = 0;

function addDie() {
  const mesh = createDieMesh({ envMap, anisotropy });
  scene.add(mesh);
  const body = physics.addDie();
  body.addEventListener('collide', onCollide);
  dice.push({ mesh, body });
}

function removeDie() {
  const die = dice.pop();
  scene.remove(die.mesh);
  physics.world.removeBody(die.body);
}

const lastHit = new WeakMap();

function onCollide({ body: other, target, contact }) {
  const kind = other.material?.name ?? 'wall';
  // 주사위끼리 부딪히면 양쪽 다 이벤트가 오니까 한쪽만 소리 내기
  if (kind === 'die' && other.id < target.id) return;
  const impact = Math.abs(contact.getImpactVelocityAlongNormal());
  const now = performance.now();
  if (impact < 1 || now - (lastHit.get(target) ?? 0) < 35) return;
  lastHit.set(target, now);
  playHit(kind, impact);
}

/** 순간이동. 보간도 끊어서 이전 자리에서 새 자리로 번쩍 끌려가 보이지 않게 */
function placeBody(body, x, y, z, q) {
  body.position.set(x, y, z);
  body.quaternion.set(q.x, q.y, q.z, q.w);
  body.velocity.setZero();
  body.angularVelocity.setZero();
  body.previousPosition.copy(body.position);
  body.interpolatedPosition.copy(body.position);
  body.previousQuaternion.copy(body.quaternion);
  body.interpolatedQuaternion.copy(body.quaternion);
}

/** 굴리기 전 대기 상태: 테이블 가운데에 가지런히 */
function arrangeDice(keepRotation = false) {
  const { cx, cz } = field;
  const cols = dice.length <= 3 ? dice.length : Math.ceil(dice.length / 2);
  const rows = Math.ceil(dice.length / cols);
  const gap = DIE_SIZE * 1.8;
  dice.forEach(({ body }, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, dice.length - row * cols);
    const col = i - row * cols;
    const x = cx + (col - (inRow - 1) / 2) * gap;
    const z = cz + (row - (rows - 1) / 2) * gap;
    placeBody(body, x, DIE_SIZE / 2, z, keepRotation ? body.quaternion : restingQuaternion());
    body.sleep();
  });
}

/**
 * 주사위 던지기. origin / direction 은 테이블 위 (x, z) 좌표.
 * 안 주면 화면 아래쪽 가장자리에서 위쪽으로 던짐.
 */
function roll({ origin, direction, power = 1 } = {}) {
  unlockAudio();
  const { cx, cz, radius } = field;
  const perRow = 3;
  const rows = Math.ceil(dice.length / perRow);
  const spacing = DIE_SIZE * 1.8;

  const dir = direction ? direction.clone().normalize() : new THREE.Vector2(rand(-0.35, 0.35), -1).normalize();
  let start = origin;
  if (!start) {
    // 던지는 방향 반대쪽 가장자리에서 출발
    const reach = Math.max(0, radius - 1.2 - (rows - 1) * spacing);
    start = new THREE.Vector2(cx - dir.x * reach, cz - dir.y * reach);
  }
  const side = new THREE.Vector2(-dir.y, dir.x);
  const speed = rand(7.5, 10) * power;

  // 한 줄에 셋씩, 던지는 방향과 수직으로 늘어놓고 줄마다 뒤로·위로 물려서 겹치지 않게
  const spots = dice.map((_, i) => {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, dice.length - row * perRow);
    const across = (i - row * perRow - (inRow - 1) / 2) * spacing + rand(-0.2, 0.2);
    const back = row * spacing + rand(-0.2, 0.2);
    return start.clone().addScaledVector(side, across).addScaledVector(dir, -back);
  });
  fitInsideField(spots, DIE_SIZE * 0.9);

  dice.forEach(({ body }, i) => {
    const row = Math.floor(i / perRow);
    placeBody(body, spots[i].x, 2 + row * spacing + rand(0, 0.5), spots[i].y, new THREE.Quaternion().random());

    const v = speed * rand(0.85, 1.15);
    body.velocity.set(dir.x * v + rand(-1, 1), rand(2, 4), dir.y * v + rand(-1, 1));
    body.angularVelocity.set(rand(-20, 20), rand(-20, 20), rand(-20, 20));
    body.wakeUp();
  });

  state = 'rolling';
  rollStartedAt = quietSince = performance.now();
  nudges = 0;
  ui.showRolling();
}

function updateRoll(now) {
  if (state !== 'rolling') return;
  // 엔진의 sleep 만 기다리면 안 됨: 다른 주사위에 기댄 주사위는 접촉 때문에 계속 미세하게 떨려서 잠들지 않음
  const moving = dice.some(
    ({ body }) => body.velocity.lengthSquared() > 0.09 || body.angularVelocity.lengthSquared() > 0.25,
  );
  if (moving) quietSince = now;
  const timedOut = now - rollStartedAt > SETTLE_TIMEOUT;
  if (!timedOut && now - quietSince < 300) return;

  if (!timedOut && nudges < MAX_NUDGES) {
    // 벽이나 다른 주사위에 기대 비스듬히 섰거나, 다른 주사위 위에 올라탄 건 톡 쳐서 다시 굴림
    const stuck = dice.filter(
      ({ body }) => readTopFace(body.quaternion).alignment < 0.97 || body.position.y > DIE_SIZE * 0.75,
    );
    if (stuck.length) {
      nudges++;
      for (const { body } of stuck) {
        body.wakeUp();
        body.velocity.set(rand(-1.5, 1.5), rand(4, 6), rand(-1.5, 1.5));
        body.angularVelocity.set(rand(-10, 10), rand(-10, 10), rand(-10, 10));
      }
      return;
    }
  }
  finishRoll();
}

const projected = new THREE.Vector3();

function finishRoll() {
  state = 'settled';
  // 결과 칩은 화면 왼쪽 → 오른쪽 순서로
  const values = dice
    .map(({ mesh, body }) => ({
      value: readTopFace(body.quaternion).value,
      x: projected.copy(mesh.position).project(camera).x,
    }))
    .sort((a, b) => a.x - b.x)
    .map(({ value }) => value);
  ui.showResult(values);
}

function setDiceCount(count) {
  count = clamp(count, MIN_DICE, MAX_DICE);
  ui.setCount(count, MIN_DICE, MAX_DICE);
  if (count === dice.length) return;
  while (dice.length < count) addDie();
  while (dice.length > count) removeDie();
  state = 'idle';
  arrangeDice();
  ui.clearResult();
  store.set('dice.count', count);
}

// ── 카메라 / 화면 맞춤 ─────────────────────────────────

let field = { cx: 0, cz: 0, radius: 3 }; // 바닥 원. 물리 벽·바닥·테두리가 모두 이걸 따름
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();

/** 화면 좌표(NDC)에서 쏜 광선이 높이 height 평면과 만나는 점 */
function pointAt(x, y, height = 0) {
  raycaster.setFromCamera(ndc.set(x, y), camera);
  plane.constant = -height;
  return raycaster.ray.intersectPlane(plane, new THREE.Vector3());
}

function placeCamera(distance) {
  camera.position.set(0, Math.sin(CAMERA_PITCH) * distance, Math.cos(CAMERA_PITCH) * distance);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
}

/**
 * HUD 에 안 가려진 화면 영역 안에 들어오는 테이블 범위.
 * 원근 때문에 바닥 높이와 주사위 윗면 높이에서 둘 다 재서 더 좁은 쪽을 씀.
 */
function measureField() {
  const h = window.innerHeight;
  let { top, bottom } = ui.freeArea();
  // HUD 를 빼고 남는 공간이 너무 좁으면 (가로로 눕힌 폰 등) 그냥 화면 전체를 씀
  if (bottom - top < h * 0.3) {
    top = 0;
    bottom = h;
  }
  const topY = 1 - (2 * top) / h;
  const bottomY = 1 - (2 * bottom) / h;
  const near = [];
  const far = [];
  for (const height of [0, DIE_SIZE]) {
    near.push(pointAt(-1, bottomY, height), pointAt(1, bottomY, height));
    far.push(pointAt(-1, topY, height), pointAt(1, topY, height));
  }
  if ([...near, ...far].some((p) => !p)) return null;
  const halfWidth = Math.min(...near.map((p) => Math.abs(p.x))) - WALL_INSET;
  return {
    minX: -halfWidth,
    maxX: halfWidth,
    minZ: Math.max(...far.map((p) => p.z)) + WALL_INSET,
    maxZ: Math.min(...near.map((p) => p.z)) - WALL_INSET,
  };
}

/** 보이는 범위 안에 테두리까지 들어가는 가장 큰 원 */
function circleIn({ minX, maxX, minZ, maxZ }) {
  return {
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    radius: Math.min(maxX - minX, maxZ - minZ) / 2 - RIM_WIDTH,
  };
}

/** (x, z) 가 바닥 원 가장자리에서 margin 안쪽에 들도록 중심 쪽으로 당김 */
function insideField(x, z, margin) {
  const { cx, cz, radius } = field;
  const limit = Math.max(radius - margin, 0);
  const distance = Math.hypot(x - cx, z - cz);
  if (distance <= limit) return [x, z];
  const k = limit / distance;
  return [cx + (x - cx) * k, cz + (z - cz) * k];
}

/**
 * 점들을 모양 그대로 원 중심 쪽으로 옮겨서 전부 바닥 원 가장자리에서 margin 안쪽에 들게.
 * 하나씩 따로 당기면 서로 겹쳐서 튕겨 나가니 통째로 옮김
 */
function fitInsideField(points, margin) {
  const center = new THREE.Vector2(field.cx, field.cz);
  const limit = field.radius - margin;
  const centroid = points.reduce((sum, p) => sum.add(p), new THREE.Vector2()).divideScalar(points.length);
  const pull = center.clone().sub(centroid); // 1 만큼 옮기면 무게중심이 원 중심에 옴
  const fits = (t) => points.every((p) => p.clone().addScaledVector(pull, t).distanceTo(center) <= limit);
  // 다 들어가는 가장 적은 이동량을 이분 탐색. 원 중심에 둬도 안 들어가는 아주 좁은 화면이면 그냥 중심에
  let lo = 0;
  let hi = fits(0) ? 0 : 1;
  if (hi && fits(hi)) {
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
  }
  for (const p of points) p.addScaledVector(pull, hi);
}

function layout() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (!width || !height) return; // 숨겨진 창처럼 크기가 0일 땐 다음 resize 때 다시
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  // 보이는 범위가 카메라 거리에 거의 비례하니 몇 번 비율 보정해서 짧은 변 = MIN_FIELD 로
  let distance = 20;
  for (let i = 0; i < 3; i++) {
    placeCamera(distance);
    const f = measureField();
    if (!f) break;
    const shortSide = Math.min(f.maxX - f.minX, f.maxZ - f.minZ);
    distance = clamp(distance * (MIN_FIELD / Math.max(shortSide, 0.1)), 8, 80);
  }
  placeCamera(distance);
  const visible = measureField();
  if (visible) field = circleIn(visible);

  physics.setBounds(field);
  fitFloor();
  fitShadow();
  keepDiceInField();
}

function fitShadow() {
  const { cx, cz, radius } = field;
  const reach = radius + 2;
  sun.target.position.set(cx, 0, cz);
  sun.position.set(cx - 6, 16, cz - 3);
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -reach;
  cam.right = cam.top = reach;
  cam.near = 1;
  cam.far = 40;
  cam.updateProjectionMatrix();
}

/** 창 크기가 바뀌어 벽이 좁아지면 밖에 남은 주사위를 안으로 */
function keepDiceInField() {
  if (state === 'idle') {
    arrangeDice(true);
    return;
  }
  const margin = DIE_SIZE * 0.6;
  for (const { body } of dice) {
    const [x, z] = insideField(body.position.x, body.position.z, margin);
    if (x === body.position.x && z === body.position.z) continue;
    placeBody(body, x, body.position.y, z, body.quaternion);
    body.wakeUp();
  }
}

// ── 입력 ───────────────────────────────────────────────

let press = null;

canvas.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary) return;
  press = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointerup', (event) => {
  if (!press || event.pointerId !== press.id) return;
  const dx = event.clientX - press.x;
  const dy = event.clientY - press.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 12) {
    roll();
  } else {
    // 스와이프: 누른 자리에서, 민 방향으로, 빨리 밀수록 세게
    const start = pointAt((press.x / window.innerWidth) * 2 - 1, 1 - (press.y / window.innerHeight) * 2);
    const speed = distance / Math.max(performance.now() - press.time, 16); // px/ms
    roll({
      origin: new THREE.Vector2(start.x, start.z),
      direction: new THREE.Vector2(dx, dy),
      power: clamp(speed / 1.8, 0.5, 1.6),
    });
  }
  press = null;
});

canvas.addEventListener('pointercancel', () => {
  press = null;
});

window.addEventListener('keydown', (event) => {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target instanceof HTMLButtonElement) return; // 키보드로 포커스한 버튼은 기본 동작대로
  if (event.code === 'Space' || event.code === 'Enter') {
    event.preventDefault();
    roll();
  } else if (event.key === '+' || event.key === '=') {
    setDiceCount(dice.length + 1);
  } else if (event.key === '-') {
    setDiceCount(dice.length - 1);
  } else if (/^[1-6]$/.test(event.key)) {
    setDiceCount(Number(event.key));
  }
});

let soundOn = store.get('dice.sound', true);

function applySound() {
  setSoundEnabled(soundOn);
  ui.setSound(soundOn);
}

ui.bindControls({
  onRoll: () => roll(),
  onCountChange: (delta) => setDiceCount(dice.length + delta),
  onSoundToggle: () => {
    soundOn = !soundOn;
    store.set('dice.sound', soundOn);
    applySound();
    if (soundOn) unlockAudio();
  },
});

window.addEventListener('resize', layout);

// ── 시작 ───────────────────────────────────────────────

applySound();
fitFloor();
physics.setBounds(field); // 크기 0인 창에서 시작해 layout 이 건너뛰어져도 벽은 제자리에
layout();
setDiceCount(Number(store.get('dice.count', 2)) || 2);

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = clamp((now - last) / 1000, 0, 0.1);
  last = now;
  physics.world.step(1 / 120, dt, 12);
  for (const { mesh, body } of dice) {
    mesh.position.copy(body.interpolatedPosition);
    mesh.quaternion.copy(body.interpolatedQuaternion);
  }
  updateRoll(now);
  renderer.render(scene, camera);
});
