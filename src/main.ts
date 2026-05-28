import "./style.css";
import {
  LEVELS,
  formatRecognizedAnswer,
  generateQuestion,
  generateUniqueQuestion,
  generateWeightedQuestion,
  parseSpokenNumber,
  type LevelId,
  type Question
} from "./math";
import {
  createDefaultProgress,
  finishArcadeRun,
  finishChallengeRun,
  getBestAccuracy,
  isDifficultyUnlocked,
  loadProgress,
  recordMissedQuestion,
  saveProgress,
  type AppProgress
} from "./progress";
import { shouldAutoRestartAfterUnclearAnswer, shouldAutoRestartSpeech, speechErrorMessage } from "./speech";
import { DIFFICULTIES, getDifficulty, type DifficultyId } from "./difficulty";
import { formatAnswerReview } from "./result";

type GameMode = "challenge" | "arcade";
type Screen = "home" | "mic" | "countdown" | "game" | "result";
type SpeechCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionEventLike {
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: {
        transcript: string;
        confidence: number;
      };
    };
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface RunState {
  mode: GameMode;
  levelId: LevelId | "mixed";
  question: Question | null;
  index: number;
  total: number;
  correct: number;
  misses: string[];
  startedAt: number;
  endsAt: number | null;
  questionEndsAt: number | null;
  difficultyId: DifficultyId;
  feedbackLocked: boolean;
  seenQuestionKeys: Set<string>;
}

interface AppState {
  screen: Screen;
  progress: AppProgress;
  selectedMode: GameMode;
  selectedLevel: LevelId;
  selectedDifficulty: DifficultyId;
  countdown: number;
  run: RunState | null;
  voiceStatus: string;
  voiceTranscript: string;
  feedback: "ok" | "bad" | null;
  speechSupported: boolean;
}

const challengeTotal = 20;
const arcadeDurationMs = 60_000;
const feedbackDelayMs = 1_300;
const app = document.querySelector<HTMLDivElement>("#app");
const SpeechRecognitionImpl = getSpeechRecognition();

let recognition: SpeechRecognitionLike | null = null;
let timerId = 0;
let countdownId = 0;
let speechRetryId = 0;
let acceptingSpeechResult = false;

const state: AppState = {
  screen: "home",
  progress: loadProgressSafe(),
  selectedMode: "challenge",
  selectedLevel: "singleAdd",
  selectedDifficulty: "easy",
  countdown: 3,
  run: null,
  voiceStatus: SpeechRecognitionImpl ? "准备开始" : "当前浏览器不支持语音识别",
  voiceTranscript: "",
  feedback: null,
  speechSupported: Boolean(SpeechRecognitionImpl)
};

syncViewportSize();
bindViewportResize();
render();
registerServiceWorker();

function render(): void {
  if (!app) return;

  app.innerHTML = `
    <main class="app">
      ${renderScreen()}
      <aside class="rotate">
        <div>
          <strong>请横屏</strong>
          <span>这个速算训练按 iPhone 横屏设计。</span>
        </div>
      </aside>
    </main>
  `;

  bindEvents();
}

function syncViewportSize(): void {
  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--app-width", `${width}px`);
  document.documentElement.style.setProperty("--app-height", `${height}px`);
}

function bindViewportResize(): void {
  let resizeId = 0;
  const refresh = () => {
    window.clearTimeout(resizeId);
    syncViewportSize();
    resizeId = window.setTimeout(() => {
      syncViewportSize();
      render();
    }, 160);
  };

  window.addEventListener("resize", refresh);
  window.addEventListener("orientationchange", refresh);
  window.visualViewport?.addEventListener("resize", refresh);
}

function renderScreen(): string {
  if (state.screen === "mic") return renderMicPrep();
  if (state.screen === "countdown") return renderCountdown();
  if (state.screen === "game") return renderGame();
  if (state.screen === "result") return renderResult();
  return renderHome();
}

function renderMicPrep(): string {
  return `
    <section class="screen game">
      <div class="countdown mic-prep">准备麦克风</div>
    </section>
  `;
}

function renderHome(): string {
  const selectedLevelIndex = LEVELS.findIndex((level) => level.id === state.selectedLevel);
  const canStart =
    state.selectedMode === "arcade" ||
    (selectedLevelIndex <= state.progress.unlockedLevelIndex &&
      isDifficultyUnlocked(state.progress, state.selectedLevel, state.selectedDifficulty));
  const selectedDifficulty = getDifficulty(state.selectedDifficulty);
  const selectedLevel = LEVELS.find((level) => level.id === state.selectedLevel) ?? LEVELS[0];

  return `
    <section class="screen home">
      <div class="brand">
        <div>
          <span class="challenge-kicker">MENTAL MATH TRIAL</span>
          <h1>速算挑战</h1>
          <p>${state.selectedMode === "challenge" ? `${selectedLevel.name} · ${selectedDifficulty.name} · ${selectedDifficulty.timeLimitSeconds}s/题` : `混合街机 · 60s 冲分`}</p>
        </div>
        <div class="primary-row">
          <button class="primary start-challenge" data-action="start" ${canStart ? "" : "disabled"}>开始挑战</button>
          <button class="ghost" data-action="reset">重置记录</button>
        </div>
      </div>
      <div class="home-actions">
        <div class="mode-switch">
          <button class="${state.selectedMode === "challenge" ? "selected" : ""}" data-mode="challenge">闯关</button>
          <button class="${state.selectedMode === "arcade" ? "selected" : ""}" data-mode="arcade">街机</button>
        </div>
        <div class="difficulty-row">
          ${DIFFICULTIES.map((difficulty) => renderDifficultyButton(difficulty.id, difficulty.name, difficulty.timeLimitSeconds)).join("")}
          <em>${selectedDifficulty.timeLimitSeconds}s/题</em>
        </div>
        <div class="level-grid">
          ${LEVELS.map((level, index) => renderLevelCard(level.id, level.name, index)).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderDifficultyButton(id: DifficultyId, name: string, seconds: number): string {
  const locked = state.selectedMode === "challenge" && !isDifficultyUnlocked(state.progress, state.selectedLevel, id);
  return `
    <button class="difficulty-button ${state.selectedDifficulty === id ? "selected" : ""} ${locked ? "locked" : ""}" data-difficulty="${id}" ${locked ? "disabled" : ""}>
      <strong>${name}</strong><small>${seconds}s</small>
    </button>
  `;
}

function renderLevelCard(levelId: LevelId, name: string, index: number): string {
  const locked = index > state.progress.unlockedLevelIndex;
  const selected = state.selectedLevel === levelId;
  const best = Math.round(getBestAccuracy(state.progress, levelId, state.selectedDifficulty) * 100);

  return `
    <button class="level-card ${selected ? "selected" : ""} ${locked ? "locked" : ""}" data-level="${levelId}" ${locked ? "disabled" : ""}>
      <strong>${index + 1}. ${name}</strong>
          <span>${locked ? "未解锁" : `最佳 ${best}%`}</span>
    </button>
  `;
}

function renderCountdown(): string {
  return `
    <section class="screen game">
      <div class="countdown">${state.countdown}</div>
    </section>
  `;
}

function renderGame(): string {
  const run = state.run;
  if (!run || !run.question) return "";

  const remaining = run.endsAt ? Math.max(0, Math.ceil((run.endsAt - Date.now()) / 1000)) : null;
  const questionRemaining = run.questionEndsAt ? Math.max(0, Math.ceil((run.questionEndsAt - Date.now()) / 1000)) : null;
  const modeLabel = run.mode === "challenge" ? getLevelName(run.levelId as LevelId) : "街机";
  const timeLabel =
    run.mode === "challenge" ? `${questionRemaining ?? 0}s · ${run.correct}/${run.total}` : `${remaining}s · ${run.correct} 对`;
  const progressLabel = run.mode === "challenge" ? `${run.index}/${run.total}` : `${remaining ?? 0}s`;
  const progressPercent =
    run.mode === "challenge"
      ? Math.min(100, Math.max(0, (run.index / run.total) * 100))
      : Math.min(100, Math.max(0, ((arcadeDurationMs - Math.max(0, (run.endsAt ?? Date.now()) - Date.now())) / arcadeDurationMs) * 100));

  return `
    <section class="screen game">
      <div class="hud">
        <span class="hud-title">${modeLabel}</span>
        <div class="progress-ring" aria-label="进度 ${progressLabel}" style="--progress: ${progressPercent}%">
          <span class="progress-label">${progressLabel}</span>
        </div>
        <span class="hud-score">${timeLabel}</span>
      </div>
      <div class="problem-wrap">
        <div class="problem">${run.question.expression}</div>
      </div>
      <div class="voice-panel">
        <div class="voice-status">${state.voiceStatus}${state.voiceTranscript ? `：${state.voiceTranscript}` : ""}</div>
        <div class="feedback-slot">${state.feedback ? feedbackIcon(state.feedback) : ""}</div>
        <button class="icon-button" data-action="retry-voice" aria-label="重试语音" title="重试语音">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"></path>
            <path d="M5 10v1a7 7 0 0 0 14 0v-1"></path>
            <path d="M12 18v3"></path>
            <path d="M8 21h8"></path>
            <path d="M19 4v4h-4"></path>
            <path d="M15 8a4 4 0 0 1 4-4"></path>
          </svg>
        </button>
        <button class="icon-button" data-action="quit" aria-label="退出" title="退出">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 18 9 12l6-6"></path>
            <path d="M9 12h12"></path>
            <path d="M3 4v16"></path>
          </svg>
        </button>
      </div>
    </section>
  `;
}

function feedbackIcon(feedback: "ok" | "bad"): string {
  if (feedback === "ok") {
    return `
      <span class="feedback ok" aria-label="正确" title="正确">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 6 9 17l-5-5"></path>
        </svg>
      </span>
    `;
  }

  return `
    <span class="feedback bad" aria-label="错误" title="错误">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 6 6 18"></path>
        <path d="m6 6 12 12"></path>
      </svg>
    </span>
  `;
}

function renderResult(): string {
  const run = state.run;
  if (!run) return "";

  const accuracy = run.total === 0 ? 0 : Math.round((run.correct / run.total) * 100);
  const isPerfectChallenge = run.mode === "challenge" && run.correct === run.total;
  const unlockText = isPerfectChallenge ? challengeUnlockText(run.difficultyId) : "";

  return `
    <section class="screen results">
      <div class="result-summary">
        <div class="accuracy-hero">
          <span>正确率</span>
          <h2>${accuracy}%</h2>
          ${unlockText ? `<strong>${unlockText}</strong>` : ""}
        </div>
        <div class="primary-row">
          <button class="primary" data-action="home">主页</button>
          <button class="ghost" data-action="start">再来一次</button>
        </div>
      </div>
      <div class="result-list">
        <div class="result-card answer-card">
          <strong>${run.misses.length}</strong>
          <span>答案对照</span>
          <div class="misses">
            ${run.misses.length === 0 ? `<span class="miss-pill clean">没有错题</span>` : run.misses.map((miss, index) => `<span class="miss-pill" style="--delay: ${1250 + index * 90}ms">${miss}</span>`).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function bindEvents(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedMode = button.dataset.mode as GameMode;
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-level]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedLevel = button.dataset.level as LevelId;
      state.selectedMode = "challenge";
      if (!isDifficultyUnlocked(state.progress, state.selectedLevel, state.selectedDifficulty)) {
        state.selectedDifficulty = "easy";
      }
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-difficulty]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDifficulty = button.dataset.difficulty as DifficultyId;
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action ?? ""));
  });
}

function handleAction(action: string): void {
  if (action === "start") void startRun();
  if (action === "retry-voice") startListening();
  if (action === "quit" || action === "home") goHome();
  if (action === "reset") resetProgress();
}

async function startRun(): Promise<void> {
  stopAllTimers();
  stopListening();
  requestFullscreenBestEffort();
  state.screen = "mic";
  state.voiceStatus = "准备麦克风";
  render();

  const hasMicPermission = await prepareMicrophone();
  if (!hasMicPermission) {
    state.screen = "home";
    state.voiceStatus = "麦克风权限被拒绝";
    render();
    return;
  }

  const mode = state.selectedMode;
  state.run = {
    mode,
    levelId: mode === "challenge" ? state.selectedLevel : "mixed",
    question: null,
    index: 0,
    total: mode === "challenge" ? challengeTotal : 0,
    correct: 0,
    misses: [],
    startedAt: Date.now(),
    endsAt: mode === "arcade" ? Date.now() + arcadeDurationMs : null,
    questionEndsAt: null,
    difficultyId: state.selectedDifficulty,
    feedbackLocked: false,
    seenQuestionKeys: new Set()
  };
  state.countdown = 3;
  state.screen = "countdown";
  render();

  countdownId = window.setInterval(() => {
    state.countdown -= 1;
    if (state.countdown <= 0) {
      window.clearInterval(countdownId);
      beginQuestions();
      return;
    }
    render();
  }, 1000);
}

async function prepareMicrophone(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

function beginQuestions(): void {
  state.screen = "game";
  nextQuestion();
  timerId = window.setInterval(tickGameTimer, 120);
}

function tickGameTimer(): void {
  const run = state.run;
  if (!run || state.screen !== "game") return;
  if (run.feedbackLocked) return;

  if (run.mode === "arcade" && run.endsAt && Date.now() >= run.endsAt) {
    finishRun();
    return;
  }

  if (run.mode === "challenge" && run.questionEndsAt && Date.now() >= run.questionEndsAt) {
    handleQuestionTimeout();
    return;
  }

  render();
}

function nextQuestion(): void {
  const run = state.run;
  if (!run) return;

  if (run.mode === "challenge" && run.index >= challengeTotal) {
    finishRun();
    return;
  }

  if (run.mode === "arcade" && run.endsAt && Date.now() >= run.endsAt) {
    finishRun();
    return;
  }

  run.index += 1;
  run.total = run.mode === "challenge" ? challengeTotal : run.index;
  run.question =
    run.mode === "challenge"
      ? generateWeightedQuestion(run.levelId as LevelId, state.progress.missedWeights, run.seenQuestionKeys)
      : generateUniqueArcadeQuestion(run.seenQuestionKeys);
  run.seenQuestionKeys.add(run.question.expressionKey);
  run.questionEndsAt = run.mode === "challenge" ? Date.now() + getDifficulty(run.difficultyId).timeLimitSeconds * 1000 : null;
  run.feedbackLocked = false;
  state.feedback = null;
  state.voiceTranscript = "";
  state.voiceStatus = "请说答案";
  render();
  startListening();
}

function handleTranscript(transcript: string): void {
  acceptingSpeechResult = false;
  const run = state.run;
  const question = run?.question;
  if (!run || !question) return;
  if (run.feedbackLocked) return;

  const answer = parseSpokenNumber(transcript);
  state.voiceTranscript = formatRecognizedAnswer(transcript);

  if (answer === null) {
    state.voiceStatus = "没有听清答案，继续听";
    render();
    if (shouldAutoRestartAfterUnclearAnswer()) scheduleSpeechRestart();
    return;
  }

  if (answer === question.answer) {
    run.correct += 1;
    state.feedback = "ok";
    state.voiceStatus = `听到 ${answer}`;
  } else {
    state.feedback = "bad";
    state.voiceStatus = `听到 ${answer}，答案 ${question.answer}`;
    run.misses.push(formatAnswerReview(question.expression, answer, question.answer));
    if (run.mode === "challenge") {
      state.progress = recordMissedQuestion(state.progress, run.levelId as LevelId, question.expressionKey);
      saveProgress(state.progress);
    }
  }

  run.feedbackLocked = true;
  run.questionEndsAt = null;
  render();
  window.setTimeout(nextQuestion, feedbackDelayMs);
}

function generateUniqueArcadeQuestion(seenQuestionKeys: ReadonlySet<string>): Question {
  const startIndex = Math.floor(Math.random() * LEVELS.length);

  for (let offset = 0; offset < LEVELS.length; offset += 1) {
    const level = LEVELS[(startIndex + offset) % LEVELS.length];
    const question = generateUniqueQuestion(level.id, seenQuestionKeys);
    if (!seenQuestionKeys.has(question.expressionKey)) return question;
  }

  return generateQuestion(randomLevel());
}

function handleQuestionTimeout(): void {
  const run = state.run;
  const question = run?.question;
  if (!run || !question || run.feedbackLocked) return;

  stopListening();
  run.feedbackLocked = true;
  run.questionEndsAt = null;
  state.feedback = "bad";
  state.voiceTranscript = "";
  state.voiceStatus = `超时，答案 ${question.answer}`;
  run.misses.push(formatAnswerReview(question.expression, null, question.answer));

  if (run.mode === "challenge") {
    state.progress = recordMissedQuestion(state.progress, run.levelId as LevelId, question.expressionKey);
    saveProgress(state.progress);
  }

  render();
  window.setTimeout(nextQuestion, feedbackDelayMs);
}

function finishRun(): void {
  const run = state.run;
  if (!run) return;

  stopAllTimers();
  stopListening();

  if (run.mode === "challenge") {
    state.progress = finishChallengeRun(state.progress, run.levelId as LevelId, run.difficultyId, run.correct, run.total, run.misses);
  } else {
    state.progress = finishArcadeRun(state.progress, run.correct, run.total);
  }

  saveProgress(state.progress);
  state.screen = "result";
  state.feedback = null;
  state.voiceStatus = "完成";
  render();
}

function challengeUnlockText(difficultyId: DifficultyId): string {
  if (difficultyId === "easy") return "恭喜你，已解锁中等";
  if (difficultyId === "medium") return "恭喜你，已解锁难";
  return "恭喜你，已解锁下一关";
}

function startListening(): void {
  window.clearTimeout(speechRetryId);
  stopListening();
  acceptingSpeechResult = true;

  if (!SpeechRecognitionImpl) {
    acceptingSpeechResult = false;
    state.voiceStatus = "当前浏览器不支持语音识别";
    render();
    return;
  }

  try {
    recognition = new SpeechRecognitionImpl();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 5;
    recognition.onresult = (event) => {
      const transcript = collectTranscript(event);
      stopListening();
      handleTranscript(transcript);
    };
    recognition.onerror = (event) => {
      acceptingSpeechResult = false;
      state.voiceStatus = speechErrorMessage(event.error);
      render();
      if (shouldAutoRestartSpeech(event.error)) scheduleSpeechRestart();
    };
    recognition.onend = () => {
      recognition = null;
      if (acceptingSpeechResult) {
        state.voiceStatus = "继续听";
        render();
        scheduleSpeechRestart();
      }
    };
    recognition.start();
    state.voiceStatus = "正在听";
    render();
  } catch {
    acceptingSpeechResult = false;
    state.voiceStatus = "语音启动失败，继续重试";
    render();
    scheduleSpeechRestart();
  }
}

function stopListening(): void {
  acceptingSpeechResult = false;
  if (!recognition) return;
  const current = recognition;
  recognition = null;
  current.onresult = null;
  current.onerror = null;
  current.onend = null;
  try {
    current.abort();
  } catch {
    // Some mobile implementations throw if abort is called while idle.
  }
}

function stopAllTimers(): void {
  window.clearInterval(timerId);
  window.clearInterval(countdownId);
  window.clearTimeout(speechRetryId);
}

function goHome(): void {
  stopAllTimers();
  stopListening();
  state.screen = "home";
  state.run = null;
  state.feedback = null;
  render();
}

function resetProgress(): void {
  state.progress = createDefaultProgress();
  saveProgress(state.progress);
  state.selectedLevel = "singleAdd";
  state.selectedMode = "challenge";
  render();
}

function collectTranscript(event: SpeechRecognitionEventLike): string {
  const alternatives: string[] = [];
  for (let i = 0; i < event.results.length; i += 1) {
    for (let j = 0; j < event.results[i].length; j += 1) {
      alternatives.push(event.results[i][j].transcript);
    }
  }
  return alternatives.join(" ");
}

function randomLevel(): LevelId {
  return LEVELS[Math.floor(Math.random() * LEVELS.length)].id;
}

function getLevelName(levelId: LevelId): string {
  return LEVELS.find((level) => level.id === levelId)?.name ?? "速算";
}

function getSpeechRecognition(): SpeechCtor | null {
  const win = window as Window & {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

function requestFullscreenBestEffort(): void {
  const element = document.documentElement;
  if (document.fullscreenElement || !element.requestFullscreen) return;
  element.requestFullscreen().catch(() => undefined);
}

function scheduleSpeechRestart(): void {
  if (state.screen !== "game" || !state.run?.question) return;
  window.clearTimeout(speechRetryId);
  speechRetryId = window.setTimeout(() => startListening(), 450);
}

function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;

  if (!import.meta.env.PROD) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

function loadProgressSafe(): AppProgress {
  try {
    return loadProgress();
  } catch {
    return createDefaultProgress();
  }
}
