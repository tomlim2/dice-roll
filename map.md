# Project Map

3D 주사위 굴리기 웹앱. Three.js(렌더링) + cannon-es(물리) + Vite(빌드). 프레임워크 없음.

## 구조

```
index.html          마크업 (canvas#scene, HUD: 상단바 / 결과 / 힌트 / 하단 dock)
vite.config.js      base './' (하위 경로 배포용)
public/favicon.svg
src/
  main.js           진입점. 씬·카메라·조명·테이블, 굴리기 흐름, 입력, 레이아웃
  dice.js           주사위 메시/텍스처 생성, 윗면 판독, 정지 자세 계산
  physics.js        cannon-es 월드 (중력, 천장, 둥근 벽 = 원에 접하는 평면 48장, 바닥)
  sound.js          WebAudio 충돌음 (unlockAudio / setSoundEnabled / playHit)
  ui.js             DOM 컨트롤 바인딩, 결과 표시 (bindControls, showResult ...)
  style.css         HUD 스타일
.github/workflows/deploy.yml   v* 태그 푸시 → GitHub Pages 배포
```

## 모듈 관계

```
main.js ─┬─ dice.js      (DIE_SIZE, createDieMesh, readTopFace, restingQuaternion)
         ├─ physics.js   (createPhysics)  ── dice.js (DIE_SIZE)
         ├─ sound.js     (playHit, setSoundEnabled, unlockAudio)
         └─ ui.js        ── dice.js (COLORS, PIPS, pipRadius)
```

## main.js 주요 함수

| 영역 | 함수 |
|---|---|
| 주사위 관리 | `addDie`, `removeDie`, `setDiceCount`, `arrangeDice`, `placeBody` |
| 굴리기 | `roll`, `updateRoll`, `finishRoll`, `onCollide` |
| 바닥 원 | `field` = `{ cx, cz, radius }`. `circleIn` (보이는 범위 → 원), `insideField` (점 하나를 원 안으로), `fitInsideField` (시작 배치를 모양 그대로 원 안으로) |
| 카메라/레이아웃 | `pointAt`, `placeCamera`, `measureField`, `layout`, `fitFloor` (둥근 바닥·테두리를 벽 범위에 맞춤), `fitShadow`, `keepDiceInField` |
| 기타 | `grainTexture` (바닥 질감), `applySound` |

주요 상수(`main.js` 상단): `MIN_DICE`/`MAX_DICE`(1~6), `SETTLE_TIMEOUT`(10초), `MAX_NUDGES`, `CAMERA_PITCH`.

## 굴리기 흐름

입력(클릭·스와이프·Space·굴리기 버튼) → `roll()` 로 초기 위치·속도 부여 → `updateRoll()` 에서 물리 스텝, 정지 감지 → `finishRoll()` 에서 `readTopFace()` 로 값 판독 → `ui.showResult()` 로 상단에 합계 표시.

## 렌더링 메모

### 그림자 light leak (바닥에 닿는 밑동의 흰 줄)

- **증상**: 테두리 안쪽 벽이나 주사위가 바닥에 닿는 밑동을 따라, 물체와 그림자 사이에 가는 흰 줄이 생김 (검정 → 흰 줄 → 회색 그림자).
- **원인**: three.js 는 FrontSide 재질의 그림자를 기본으로 **뒷면**(빛을 등진 면)으로 그림자 맵에 그림. 그 면은 바닥에 거의 붙어 있어서 바닥과의 깊이 차이가 아주 작은데, 그림자 얼룩(acne)을 막으려고 넣은 `sun.shadow.bias`(-0.0004)·`normalBias`(0.02) 보정이 그 차이보다 커서 밑동 바로 옆 바닥이 그림자 밖으로 판정됨.
- **해결**: 그림자를 드리우는 재질에 `shadowSide: THREE.FrontSide`. 빛을 받는 면(윗면·바깥 벽)으로 그림자 맵을 그려서 밑동과의 깊이 차이가 충분히 커짐. 테두리(`main.js` 의 rim 재질)와 주사위(`dice.js`)에 적용되어 있음.
- **주의**: 그림자를 드리우는 물체를 새로 추가하면 같은 설정을 줄 것. bias 를 줄여서 틈을 좁히는 방법은 대신 그림자 얼룩이 생길 수 있어서 쓰지 않음.

## 명령어

```bash
npm run dev      # 개발 서버
npm run build    # dist/ 빌드
npm run preview  # 빌드 결과 미리보기
```

## 배포

`git tag vX.Y.Z && git push origin vX.Y.Z` → Actions 가 빌드 후 https://tomlim2.github.io/dice-roll/ 에 배포.
