import * as CANNON from 'cannon-es';
import { DIE_SIZE } from './dice.js';

const GRAVITY = 50; // 주사위 한 변 = 1 기준. 실제 비율보다 약하게 해서 구르는 게 잘 보이게
const CEILING = 9; // 너무 높이 튀어 화면 밖으로 나가지 않게 막는 천장

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
  const walls = {
    left: plane(wall, 0, Math.PI / 2),
    right: plane(wall, 0, -Math.PI / 2),
    far: plane(wall, 0, 0),
    near: plane(wall, 0, Math.PI),
  };

  return {
    world,

    /** 화면에 보이는 범위(x, z)에 맞춰 보이지 않는 벽 옮기기 */
    setBounds({ minX, maxX, minZ, maxZ }) {
      walls.left.position.x = minX;
      walls.right.position.x = maxX;
      walls.far.position.z = minZ;
      walls.near.position.z = maxZ;
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
