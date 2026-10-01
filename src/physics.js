import * as CANNON from 'cannon-es';
import { DIE_SIZE } from './dice.js';

const GRAVITY = 50; // 주사위 한 변 = 1 기준. 실제 비율보다 약하게 해서 구르는 게 잘 보이게
const CEILING = 9; // 너무 높이 튀어 화면 밖으로 나가지 않게 막는 천장
const WALL_SEGMENTS = 48; // 둥근 벽을 이만큼의 평면으로 둘러쌈. 볼록한 모양이라 무한 평면을 겹쳐도 안쪽은 막히지 않음

export function createPhysics() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0), allowSleep: true });
  world.solver.iterations = 12;

  // 재질 이름은 충돌 소리 종류로도 씀
  const table = new CANNON.Material('table');
  const wall = new CANNON.Material('wall');
  const die = new CANNON.Material('die');
  world.addContactMaterial(new CANNON.ContactMaterial(die, table, { friction: 0.3, restitution: 0.35 }));
  world.addContactMaterial(new CANNON.ContactMaterial(die, wall, { friction: 0.05, restitution: 0.55 }));
  world.addContactMaterial(new CANNON.ContactMaterial(die, die, { friction: 0.12, restitution: 0.45 }));

  // 전부 무한 평면. 법선이 테이블 안쪽을 향하도록 회전
  const plane = (material, rx, ry) => {
    const body = new CANNON.Body({ type: CANNON.Body.STATIC, material, shape: new CANNON.Plane() });
    body.quaternion.setFromEuler(rx, ry, 0);
    world.addBody(body);
    return body;
  };
  plane(table, -Math.PI / 2, 0);
  plane(wall, Math.PI / 2, 0).position.y = CEILING;
  const walls = Array.from({ length: WALL_SEGMENTS }, () => plane(wall, 0, 0));

  return {
    world,

    /** 바닥 원 둘레에 보이지 않는 벽 세우기. 각 평면은 원에 접하고 법선은 중심을 향함 */
    setBounds({ cx, cz, radius }) {
      walls.forEach((body, i) => {
        const angle = (i / WALL_SEGMENTS) * Math.PI * 2;
        const nx = -Math.cos(angle);
        const nz = -Math.sin(angle);
        body.position.set(cx - nx * radius, 0, cz - nz * radius);
        body.quaternion.setFromEuler(0, Math.atan2(nx, nz), 0);
      });
    },

    addDie() {
      const half = DIE_SIZE / 2;
      const body = new CANNON.Body({
        mass: 1,
        material: die,
        shape: new CANNON.Box(new CANNON.Vec3(half, half, half)),
        linearDamping: 0.1,
        angularDamping: 0.1,
        allowSleep: true,
        sleepSpeedLimit: 0.25,
        sleepTimeLimit: 0.3,
      });
      world.addBody(body);
      return body;
    },
  };
}
