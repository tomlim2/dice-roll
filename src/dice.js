import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const DIE_SIZE = 1;

// BoxGeometry 의 면(재질) 순서: +X, -X, +Y, -Y, +Z, -Z
// 마주보는 면의 합은 7, 1·2·3 은 공유하는 꼭짓점을 반시계로 도는 (서양식 표준) 배치
const FACE_VALUES = [1, 6, 2, 5, 3, 4];
const FACE_NORMALS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

// 눈 위치 (면 기준 0~1, y 는 아래로). 3D 텍스처와 UI 아이콘이 같이 씀
const A = 0.26;
const B = 0.5;
const C = 0.74;
export const PIPS = {
  1: [[B, B]],
  2: [[C, A], [A, C]],
  3: [[C, A], [B, B], [A, C]],
  4: [[A, A], [C, A], [A, C], [C, C]],
  5: [[A, A], [C, A], [B, B], [A, C], [C, C]],
  6: [[A, A], [C, A], [A, B], [C, B], [A, C], [C, C]],
};

// 한국 주사위처럼 1은 큰 눈
export const pipRadius = (value) => (value === 1 ? 0.14 : 0.08);

export const COLORS = {
  body: '#161616',
  pip: '#f5f5f5',
};

const COLOR_RES = 512;
const NORMAL_RES = 256;

function faceColorTexture(value, anisotropy) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = COLOR_RES;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.body;
  ctx.fillRect(0, 0, COLOR_RES, COLOR_RES);

  const r = pipRadius(value) * COLOR_RES;
  for (const [u, v] of PIPS[value]) {
    const x = u * COLOR_RES;
    const y = v * COLOR_RES;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.pip;
    ctx.fill();
    // 가장자리를 살짝 어둡게 — 파인 홈처럼 보이게
    const rim = ctx.createRadialGradient(x, y, r * 0.55, x, y, r);
    rim.addColorStop(0, 'rgba(0, 0, 0, 0)');
    rim.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
    ctx.fillStyle = rim;
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

// 눈을 구형으로 파낸 홈으로 표현하는 노멀맵
function faceNormalTexture(value, anisotropy) {
  const size = NORMAL_RES;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;

  const r = pipRadius(value) * size;
  const sphere = r * 1.3; // 홈을 파낸 구의 반지름 (클수록 얕은 홈)
  const centers = PIPS[value].map(([u, v]) => [u * size, v * size]);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let nx = 0;
      let ny = 0;
      let nz = 1;
      for (const [cx, cy] of centers) {
        const dx = px + 0.5 - cx;
        const dy = py + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          // 홈 안쪽 면은 눈 중심을 향해 기울어짐. 캔버스 y 는 아래, 텍스처 v 는 위라서 y 부호가 반대
          nx = -dx / sphere;
          ny = dy / sphere;
          nz = Math.sqrt(sphere * sphere - d2) / sphere;
          break;
        }
      }
      const i = (py * size + px) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nz * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = anisotropy;
  return texture;
}

let shared = null;

function sharedAssets({ envMap, anisotropy }) {
  if (shared) return shared;
  const geometry = new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 4, DIE_SIZE * 0.1);
  const materials = FACE_VALUES.map((value) => {
    const normalMap = faceNormalTexture(value, anisotropy);
    return new THREE.MeshPhysicalMaterial({
      map: faceColorTexture(value, anisotropy),
      normalMap,
      clearcoatNormalMap: normalMap,
      roughness: 0.38,
      clearcoat: 0.8,
      clearcoatRoughness: 0.14,
      envMap,
      envMapIntensity: 0.9,
    });
  });
  shared = { geometry, materials };
  return shared;
}

/** 주사위 메시. 지오메트리/재질은 모든 주사위가 공유 */
export function createDieMesh(options) {
  const { geometry, materials } = sharedAssets(options);
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const _q = new THREE.Quaternion();
const _n = new THREE.Vector3();

/**
 * 윗면 숫자 읽기.
 * alignment 는 그 면이 얼마나 정확히 위를 보는지 (1 = 완전히 평평하게 놓임)
 */
export function readTopFace({ x, y, z, w }) {
  _q.set(x, y, z, w);
  let value = 0;
  let alignment = -Infinity;
  FACE_NORMALS.forEach((normal, i) => {
    const up = _n.copy(normal).applyQuaternion(_q).y;
    if (up > alignment) {
      alignment = up;
      value = FACE_VALUES[i];
    }
  });
  return { value, alignment };
}

const UP = new THREE.Vector3(0, 1, 0);

/** 특정 면(기본은 아무 면)이 위로 오게 바닥에 놓인 자세 */
export function restingQuaternion(value = 1 + Math.floor(Math.random() * 6), yaw = Math.random() * Math.PI * 2) {
  const faceUp = new THREE.Quaternion().setFromUnitVectors(FACE_NORMALS[FACE_VALUES.indexOf(value)], UP);
  return new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(faceUp);
}
