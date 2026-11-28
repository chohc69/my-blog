// 진입점: 모듈 조립, 상태 전이(시작 → 진행 → 일시정지 → 게임 오버), 이벤트 연결.

import {
  createGame, startGame, update, applyAction, setSoftDrop, takeEvents,
  MIN_START_LEVEL, MAX_START_LEVEL,
} from './game.js';
import { SHAPE_NAMES } from './pieces.js';
import { createInput } from './input.js';
import { createLoop } from './loop.js';
import { createRenderer } from './render.js';
import { createHud, formatNumber } from './hud.js';
import { createAnnouncer } from './announce.js';
import { initTheme } from './theme.js';
import {
  loadBest, saveBest, loadRecords, saveRecords, addRecord, loadSettings, saveSettings,
} from './storage.js';

const root = document.documentElement;
const isEmbed = new URLSearchParams(location.search).get('embed') === '1';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const $ = (id) => document.getElementById(id);
const holder = $('board-holder');
const boardCanvas = $('board-canvas');
const pad = $('pad');
const startLevelSelect = $('start-level');
const startButton = $('start-button');
const resumeButton = $('resume-button');
const retryButton = $('retry-button');
const pauseButton = $('pause-button');
const behindOverlay = [boardCanvas, pad, $('hold-canvas').parentElement, $('next-0').parentElement];

const settings = loadSettings();
let best = loadBest();
let savedBest = best;
let records = loadRecords();
let state = createGame({ startLevel: settings.startLevel, reducedMotion: reducedMotion.matches });
let resumePhase = 'playing';
let bestAtStart = best;

const hud = createHud();
const announcer = createAnnouncer($('live-polite'), $('live-assertive'));
const input = createInput({ das: settings.das, arr: settings.arr });
const renderer = createRenderer({
  boardCanvas,
  holder,
  nextCanvases: [$('next-0'), $('next-1'), $('next-2')],
  holdCanvas: $('hold-canvas'),
});
const loop = createLoop(step);

// ---------------------------------------------------------------------------
// 표시 갱신
// ---------------------------------------------------------------------------

function isLive(phase = state.phase) {
  return phase === 'playing' || phase === 'clearing' || phase === 'paused';
}

function syncHud() {
  if (state.score > best) best = state.score;
  hud.setStats({ score: state.score, best, level: state.level, lines: state.lines });
}

function syncPreviewLabels() {
  const next = state.phase === 'ready'
    ? '다음: 시작 전'
    : `다음: ${state.queue.map((type) => SHAPE_NAMES[type]).join(', ')}`;
  const hold = `보관: ${state.hold ? SHAPE_NAMES[state.hold] : '비어 있음'}`;
  hud.setPreviewLabels(next, hold);
}

function setOverlay(kind) {
  hud.showOverlay(kind);
  behindOverlay.forEach((element) => {
    element.inert = kind !== null;
  });
  root.toggleAttribute('data-playing', isLive());
  hud.setPauseState(state.phase);
}

function focusBoard() {
  holder.focus({ preventScroll: true });
}

function persistBest() {
  if (best > savedBest) {
    savedBest = best;
    saveBest(best);
  }
}

// ---------------------------------------------------------------------------
// 게임 이벤트 처리
// ---------------------------------------------------------------------------

function handleEvents() {
  takeEvents(state).forEach((event) => {
    switch (event.type) {
      case 'lock':
        syncHud();
        persistBest();
        break;
      case 'clear': {
        const combo = event.combo > 0 ? `, 연속 ${event.combo + 1}번째` : '';
        announcer.polite(`${event.count}줄 삭제${combo}, +${formatNumber(event.points)}점.`);
        break;
      }
      case 'levelup':
        announcer.polite(`레벨 ${event.level}`);
        break;
      case 'spawn':
      case 'hold':
        syncPreviewLabels();
        break;
      case 'over':
        endGame();
        break;
      default:
        break;
    }
  });
}

// ---------------------------------------------------------------------------
// 루프: 입력 반복기 → 이동·회전·하드 드롭 → 중력 → 고정 지연 → 삭제 연출 → 렌더
// ---------------------------------------------------------------------------

function step(dt) {
  input.update(dt);
  const actions = input.drain();
  // 삭제 연출 중에는 이동 입력을 버리되 DAS 타이머는 계속 진행한다.
  if (state.phase === 'playing') {
    for (let i = 0; i < actions.length; i += 1) {
      const proceed = applyAction(state, actions[i]);
      if (state.phase !== 'playing') break;
      if (!proceed) {
        // 하드 드롭 뒤의 입력은 다음 조각에 다음 프레임부터 적용한다.
        input.requeue(actions.slice(i + 1));
        break;
      }
    }
  }
  setSoftDrop(state, input.isHeld('down'));
  update(state, dt);
  handleEvents();
  if (state.phase === 'over') return;
  syncHud();
  renderer.draw(state);
}

// ---------------------------------------------------------------------------
// 상태 전이
// ---------------------------------------------------------------------------

function selectedStartLevel() {
  const value = Number.parseInt(startLevelSelect.value, 10);
  if (!Number.isInteger(value)) return MIN_START_LEVEL;
  return Math.min(MAX_START_LEVEL, Math.max(MIN_START_LEVEL, value));
}

function newGame() {
  loop.stop();
  input.releaseAll();
  const startLevel = selectedStartLevel();
  if (startLevel !== settings.startLevel) {
    settings.startLevel = startLevel;
    saveSettings(settings);
  }
  state = createGame({ startLevel, reducedMotion: reducedMotion.matches });
  bestAtStart = best;
  renderer.setState(state);
  startGame(state);
  handleEvents();
  if (state.phase === 'over') return;
  renderRecords();
  setOverlay(null);
  syncHud();
  focusBoard();
  loop.start();
}

function pause() {
  if (state.phase !== 'playing' && state.phase !== 'clearing') return;
  resumePhase = state.phase;
  state.phase = 'paused';
  loop.stop();
  input.releaseAll();
  setSoftDrop(state, false);
  setOverlay('pause');
  renderer.invalidate();
  resumeButton.focus({ preventScroll: true });
  announcer.polite('일시정지');
}

function resume() {
  if (state.phase !== 'paused') return;
  state.phase = resumePhase;
  input.releaseAll();
  setOverlay(null);
  focusBoard();
  loop.start();
  announcer.polite('계속');
}

function endGame() {
  loop.stop();
  input.releaseAll();
  syncHud();
  const isNewBest = state.score > bestAtStart;
  persistBest();

  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const record = {
    score: state.score,
    lines: state.lines,
    level: state.level,
    startLevel: state.startLevel,
    date: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
  };
  const result = addRecord(records, record);
  records = result.records;
  saveRecords(records);
  renderRecords(result.index);

  hud.setGameOver({
    score: state.score,
    lines: state.lines,
    level: state.level,
    isNewRecord: result.index >= 0,
    isNewBest,
  });
  setOverlay('over');
  renderer.draw(state);
  retryButton.focus({ preventScroll: true });
  announcer.assertive(
    `게임 오버. 점수 ${formatNumber(state.score)}, ${formatNumber(state.lines)}줄, 레벨 ${state.level}.`,
  );
}

function renderRecords(highlightIndex = -1) {
  hud.renderRecords(records, highlightIndex);
}

function togglePause() {
  if (state.phase === 'paused') resume();
  else pause();
}

// ---------------------------------------------------------------------------
// 이벤트 연결
// ---------------------------------------------------------------------------

function onCommand(name) {
  if (name === 'pause') {
    togglePause();
    return true;
  }
  if (name === 'enter') {
    // 임베드에서는 시작 버튼을 눌러야만 시작한다(블로그 페이지의 키 입력을 방해하지 않기 위함).
    if (state.phase === 'ready' && !isEmbed) {
      newGame();
      return true;
    }
    if (state.phase === 'over') {
      newGame();
      return true;
    }
  }
  return false;
}

function bindEvents() {
  input.attachKeyboard({ isActive: () => isLive(), onCommand });
  input.attachButtons(Array.from(pad.querySelectorAll('[data-action]')));
  input.attachGestures(boardCanvas, () => renderer.getCellSize());

  startButton.addEventListener('click', newGame);
  retryButton.addEventListener('click', newGame);
  resumeButton.addEventListener('click', resume);
  pauseButton.addEventListener('click', togglePause);
  startLevelSelect.addEventListener('change', () => {
    settings.startLevel = selectedStartLevel();
    saveSettings(settings);
  });

  // 탭 숨김·창 포커스 잃음 → 자동 일시정지(자동 재개는 하지 않음)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  window.addEventListener('blur', () => {
    input.releaseAll();
    pause();
  });

  reducedMotion.addEventListener('change', (event) => {
    state.reducedMotion = event.matches;
  });

  // 게임판 영역의 길게 누름 메뉴 차단
  holder.addEventListener('contextmenu', (event) => {
    if (isLive()) event.preventDefault();
  });
}

function init() {
  initTheme($('theme-toggle'), () => renderer.refreshColors());
  startLevelSelect.value = String(settings.startLevel);
  if (isEmbed) $('start-hint').hidden = true;
  bindEvents();
  renderRecords();
  syncHud();
  syncPreviewLabels();
  setOverlay('start');
  renderer.setState(state);
  renderer.invalidate();
  if (!isEmbed) startButton.focus({ preventScroll: true });
}

init();
