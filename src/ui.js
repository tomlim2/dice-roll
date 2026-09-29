import { COLORS, PIPS, pipRadius } from './dice.js';

const $ = (selector) => document.querySelector(selector);

const els = {
  result: $('#result'),
  caption: $('#result-caption'),
  total: $('#result-total'),
  faces: $('#result-faces'),
  hint: $('#hint'),
  dock: $('#dock'),
  count: $('#dice-count'),
  minus: $('#dice-minus'),
  plus: $('#dice-plus'),
  roll: $('#roll'),
  sound: $('#sound'),
};

export function bindControls({ onRoll, onCountChange, onSoundToggle }) {
  // 마우스로 누른 버튼이 포커스를 가져가면 스페이스바가 그 버튼을 누르게 되니 포커스 안 주기
  for (const button of [els.minus, els.plus, els.roll, els.sound]) {
    button.addEventListener('mousedown', (event) => event.preventDefault());
  }
  els.roll.addEventListener('click', onRoll);
  els.minus.addEventListener('click', () => onCountChange(-1));
  els.plus.addEventListener('click', () => onCountChange(1));
  els.sound.addEventListener('click', onSoundToggle);
}

/** 화면에서 HUD 에 가려지지 않는 세로 구간 (px) */
export function freeArea() {
  return {
    top: els.result.getBoundingClientRect().bottom + 8,
    bottom: els.dock.getBoundingClientRect().top - 12,
  };
}

export function setCount(count, min, max) {
  els.count.value = count;
  els.minus.disabled = count <= min;
  els.plus.disabled = count >= max;
}

export function setSound(on) {
  els.sound.classList.toggle('is-muted', !on);
  els.sound.setAttribute('aria-pressed', String(on));
}

export function showRolling() {
  els.hint.classList.add('is-hidden');
  els.result.classList.remove('is-empty');
  els.result.classList.add('is-rolling');
  els.caption.textContent = '굴리는 중…';
}

export function showResult(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  els.result.classList.remove('is-empty', 'is-rolling');
  els.caption.textContent = values.length > 1 ? '합계' : '결과';
  els.total.textContent = total;
  els.faces.innerHTML = values.length > 1 ? values.map(faceIcon).join('') : '';
  replay(els.total, 'pop');
}

export function clearResult() {
  els.result.classList.add('is-empty');
  els.result.classList.remove('is-rolling');
}

/** 결과 칩: 3D 주사위와 같은 눈 배치의 작은 SVG */
function faceIcon(value, index) {
  const r = pipRadius(value) * 100;
  const fill = value === 1 ? COLORS.pipOne : COLORS.pip;
  const pips = PIPS[value]
    .map(([x, y]) => `<circle cx="${x * 100}" cy="${y * 100}" r="${r}" fill="${fill}"/>`)
    .join('');
  return (
    `<svg class="face" style="--i:${index}" viewBox="0 0 100 100" role="img" aria-label="${value}">` +
    `<rect x="3" y="3" width="94" height="94" rx="22" fill="${COLORS.body}"/>${pips}</svg>`
  );
}

function replay(element, className) {
  element.classList.remove(className);
  void element.offsetWidth; // 리플로우를 한 번 일으켜 애니메이션 재시작
  element.classList.add(className);
}
