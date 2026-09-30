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
  physics.js        cannon-es 월드 (중력, 천장, 벽, 바닥)
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
| 결과 라벨 | `showLabels`, `placeLabels` |
| 카메라/레이아웃 | `pointAt`, `placeCamera`, `measureField`, `layout`, `fitFloor` (바닥·테두리를 벽 범위에 맞춤), `fitShadow`, `keepDiceInField` |
| 기타 | `grainTexture` (바닥 질감), `applySound` |

주요 상수(`main.js` 상단): `MIN_DICE`/`MAX_DICE`(1~6), `SETTLE_TIMEOUT`(10초), `MAX_NUDGES`, `CAMERA_PITCH`.

## 굴리기 흐름

입력(클릭·스와이프·Space·굴리기 버튼) → `roll()` 로 초기 위치·속도 부여 → `updateRoll()` 에서 물리 스텝, 정지 감지 → `finishRoll()` 에서 `readTopFace()` 로 값 판독 → `ui.showResult()` + 주사위 위 라벨 표시.

## 명령어

```bash
npm run dev      # 개발 서버
npm run build    # dist/ 빌드
npm run preview  # 빌드 결과 미리보기
```

## 배포

`git tag vX.Y.Z && git push origin vX.Y.Z` → Actions 가 빌드 후 https://tomlim2.github.io/dice-roll/ 에 배포.
