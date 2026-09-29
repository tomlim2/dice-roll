// 충돌 효과음. 샘플 파일 없이 WebAudio 로 합성 (노이즈 한 번 + 짧은 톤)

const VOICES = {
  // 주사위끼리: 밝고 짧은 플라스틱 '딱'
  die: { filter: 'bandpass', freq: 3600, spread: 1400, q: 3, decay: 0.04, level: 0.55, tone: 2400, toneLevel: 0.12 },
  // 펠트 테이블: 낮고 부드러운 '툭'
  table: { filter: 'lowpass', freq: 800, spread: 250, q: 0.7, decay: 0.07, level: 0.8, tone: 130, toneLevel: 0.35 },
  // 보이지 않는 벽: 나무 테두리 같은 '똑'
  wall: { filter: 'bandpass', freq: 1300, spread: 300, q: 2, decay: 0.06, level: 0.55, tone: 380, toneLevel: 0.2 },
};

let ctx = null;
let master = null;
let noise = null;
let enabled = true;

/** 브라우저 정책상 사용자 입력 안에서 한 번 불러줘야 소리가 남 */
export function unlockAudio() {
  if (!ctx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function setSoundEnabled(on) {
  enabled = on;
}

/** kind: 'die' | 'table' | 'wall', impact: 충돌 법선 방향 상대 속도 */
export function playHit(kind, impact) {
  if (!enabled || ctx?.state !== 'running') return;
  const voice = VOICES[kind] ?? VOICES.wall;
  const strength = Math.min(1, Math.max(0, (impact - 1) / 10)) ** 1.3;
  if (strength < 0.01) return;

  const start = ctx.currentTime;
  const end = start + voice.decay;

  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = voice.filter;
  filter.frequency.value = voice.freq + (Math.random() - 0.5) * voice.spread;
  filter.Q.value = voice.q;
  const noiseGain = ctx.createGain();
  envelope(noiseGain.gain, start, end, voice.level * strength);
  source.connect(filter).connect(noiseGain).connect(master);
  source.start(start, Math.random() * 0.2);
  source.stop(end + 0.01);

  const osc = ctx.createOscillator();
  osc.frequency.value = voice.tone * (0.9 + Math.random() * 0.2);
  const toneGain = ctx.createGain();
  envelope(toneGain.gain, start, end, voice.toneLevel * strength);
  osc.connect(toneGain).connect(master);
  osc.start(start);
  osc.stop(end + 0.01);
}

function envelope(param, start, end, peak) {
  param.setValueAtTime(0.0001, start);
  param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.002);
  param.exponentialRampToValueAtTime(0.0001, end);
}
