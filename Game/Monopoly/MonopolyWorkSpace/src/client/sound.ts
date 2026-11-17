/**
 * Sound, synthesised rather than loaded.
 *
 * There are no audio files: each cue is a couple of oscillators with an envelope, which keeps the repo free of binary media,
 * keeps the download small, and means a cue can be tuned by editing a number. Nothing plays until the player's first
 * interaction, as browsers require, and the menu can mute it or turn it down.
 */

export type Cue = "dice" | "coin" | "buy" | "build" | "card" | "jail" | "auction" | "win" | "lose" | "error"
  | "cash-out" | "monopoly" | "auction-out" | "turn-start" | "build-l4";

let context: AudioContext | null = null;
let enabled = true;
let volume = 0.22;

/** Creates the audio context lazily, on the first interaction. */
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

/** One enveloped tone. */
function tone(frequency: number, duration: number, type: OscillatorType, gain: number, delay = 0): void {
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  // A short attack and a decay long enough to sound like a struck object, not a beep.
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * volume), start + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** A filtered noise burst, for a shuffle or a dice landing. */
function noise(duration: number, gain: number, centre = 1800, delay = 0): void {
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 2;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = centre;
  filter.Q.value = 0.9;
  const amp = ctx.createGain();
  amp.gain.value = gain * volume;
  source.connect(filter);
  filter.connect(amp);
  amp.connect(ctx.destination);
  source.start(start);
}

const CUES: Record<Cue, () => void> = {
  // Two wooden knocks, the second softer: dice on a table.
  dice: () => { noise(0.07, 0.5, 1400); noise(0.09, 0.34, 900, 0.11); },
  // A small bright pair, like a coin landing.
  coin: () => { tone(1180, 0.08, "triangle", 0.5); tone(1580, 0.10, "triangle", 0.34, 0.05); },
  buy: () => { tone(520, 0.10, "sine", 0.5); tone(780, 0.14, "sine", 0.4, 0.07); },
  build: () => { tone(240, 0.07, "square", 0.32); tone(360, 0.09, "square", 0.24, 0.05); },
  card: () => { noise(0.16, 0.28, 2600); tone(660, 0.12, "sine", 0.22, 0.06); },
  // A low descending pair: the bars coming down.
  jail: () => { tone(300, 0.16, "sawtooth", 0.28); tone(180, 0.26, "sawtooth", 0.3, 0.12); },
  auction: () => { tone(880, 0.06, "square", 0.28); tone(1180, 0.07, "square", 0.24, 0.05); },
  // Rising thirds, the only cue allowed to be a little triumphant.
  win: () => { [523, 659, 784, 1047].forEach((frequency, index) => tone(frequency, 0.28, "triangle", 0.34, index * 0.10)); },
  lose: () => { [392, 330, 262].forEach((frequency, index) => tone(frequency, 0.26, "sine", 0.26, index * 0.13)); },
  error: () => { tone(196, 0.14, "square", 0.26); },
  // 付钱：硬币那一对音倒过来、更低，听得出是"出去"。
  "cash-out": () => { tone(980, 0.07, "triangle", 0.4); tone(700, 0.11, "triangle", 0.3, 0.05); },
  // 集齐一组：三个上行的短音，比 win 收敛。
  monopoly: () => { [587, 740, 880].forEach((frequency, index) => tone(frequency, 0.16, "triangle", 0.3, index * 0.07)); },
  // 流拍或退出：一声闷下去的落槌。
  "auction-out": () => { tone(440, 0.08, "square", 0.22); tone(294, 0.16, "sine", 0.24, 0.06); },
  // 轮到你：很轻的一声提示。
  "turn-start": () => { tone(660, 0.09, "sine", 0.22); tone(990, 0.12, "sine", 0.16, 0.06); },
  // 第四栋 / 酒店：建造声再叠一个高音。
  "build-l4": () => { tone(240, 0.07, "square", 0.3); tone(360, 0.09, "square", 0.22, 0.05); tone(720, 0.16, "triangle", 0.26, 0.1); }
};

/** 同一个 cue 300ms 内只响一次：连续几笔付款不会叠成噪音。 */
const DEDUPE_MS = 300;
const lastPlayed = new Map<Cue, number>();

/** Plays a cue, if sound is on. Never throws: audio is never worth breaking a game over. */
export function play(cue: Cue): void {
  if (!enabled) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - (lastPlayed.get(cue) ?? -Infinity) < DEDUPE_MS) return;
  lastPlayed.set(cue, now);
  try { CUES[cue](); } catch { /* an audio failure must never reach the game */ }
}

/**
 * 首次交互时预先创建 AudioContext。创建本身要一百多毫秒（实测是开局后第一个长任务），放到开始页的那次点击里做，
 * 就不会落在第一次掷骰的动画期间。仍然遵守"首次交互后才解锁"：只在 pointerdown 里调用。
 */
export function primeAudioOnFirstInteraction(): void {
  if (typeof window === "undefined") return;
  const prime = (): void => {
    window.removeEventListener("pointerdown", prime, true);
    if (enabled) { try { audio(); } catch { /* 无声也能玩 */ } }
  };
  window.addEventListener("pointerdown", prime, true);
}

/** The menu's mute switch. */
export function setSoundEnabled(next: boolean): void { enabled = next; }
/** The menu's volume slider, 0–1. */
export function setSoundVolume(next: number): void { volume = Math.max(0, Math.min(1, next)); }
export function soundEnabled(): boolean { return enabled; }
