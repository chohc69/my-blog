// 진입점: 모듈을 조립하고 게임 흐름(입력 → 로직 → 렌더 → 저장)을 연결한다.

import { addRecord, createGame, medalFor, medalTitle, move, toDateString } from './game.js';
import { createRenderer, formatNumber } from './render.js';
import { initInput } from './input.js';
import { initTheme } from './theme.js';
import { createAnnouncer } from './announce.js';
import {
  loadBest,
  loadGame,
  loadRecords,
  saveBest,
  saveGame,
  saveRecords,
} from './storage.js';

const $ = (id) => document.getElementById(id);

const elements = {
  board: $('board'),
  tileLayer: $('tile-layer'),
  scoreCard: $('score-card'),
  scoreValue: $('score-value'),
  bestValue: $('best-value'),
  newGameButton: $('new-game'),
  undoButton: $('undo'),
  undoCount: $('undo-count'),
  medalList: $('medal-list'),
  recordList: $('record-list'),
  recordsEmpty: $('records-empty'),
  overlay: $('overlay'),
  overlayScore: $('overlay-score'),
  overlayTile: $('overlay-tile'),
  overlayMedal: $('overlay-medal'),
  overlayUndo: $('overlay-undo'),
  retryButton: $('retry'),
  toast: $('toast'),
  hint: $('board-hint'),
  readBoardButton: $('read-board'),
  dialog: $('confirm-dialog'),
};

const renderer = createRenderer(elements);
const announcer = createAnnouncer($('live-polite'), $('live-assertive'));

const app = {
  state: null,
  snapshot: null, // 되돌리기용 직전 상태 (1개만 보관)
  lastRecord: null, // 게임 오버 때 추가한 기록 (되돌리면 취소)
  best: 0,
  records: [],
  highlightIndex: -1,
  medalLevel: 0, // 이번 게임에서 토스트를 띄운 최고 메달 단계
};

function medalLevel(maxTile) {
  const medal = medalFor(maxTile);
  return medal ? medal.level : 0;
}

function canUndo() {
  return app.state.undoLeft > 0 && app.snapshot !== null;
}

function persist() {
  saveGame({ state: app.state, snapshot: app.snapshot, lastRecord: app.lastRecord });
}

function refreshPanel() {
  renderer.updateScore(app.state.score, app.best);
  renderer.updateUndo(app.state.undoLeft, canUndo());
  renderer.updateMedals(app.state.maxTile);
}

function refreshRecords() {
  renderer.renderRecords(app.records, app.highlightIndex);
}

function updateBest() {
  if (app.state.score <= app.best) return;
  app.best = app.state.score;
  saveBest(app.best);
}

function recordCurrentGame() {
  if (app.state.score <= 0) return null;
  const record = { score: app.state.score, maxTile: app.state.maxTile, date: toDateString() };
  const { records, index } = addRecord(app.records, record);
  app.records = records;
  app.highlightIndex = index;
  saveRecords(app.records);
  refreshRecords();
  return record;
}

function removeRecord(record) {
  const index = app.records.findIndex((item) => item.score === record.score
    && item.maxTile === record.maxTile
    && item.date === record.date);
  if (index !== -1) {
    app.records = app.records.filter((_, i) => i !== index);
    saveRecords(app.records);
  }
  app.highlightIndex = -1;
  refreshRecords();
}

function focusBoard() {
  elements.board.focus({ preventScroll: true });
}

function showGameOver() {
  const { score, maxTile } = app.state;
  renderer.showOverlay(app.state);
  announcer.assertive(`게임 오버. 최종 점수 ${formatNumber(score)}, 최고 타일 ${formatNumber(maxTile)}.`);
  window.setTimeout(() => elements.retryButton.focus(), 0);
}

function handleGameOver() {
  app.lastRecord = recordCurrentGame();
  showGameOver();
}

function checkMedal() {
  const level = medalLevel(app.state.maxTile);
  if (level <= app.medalLevel) return '';
  app.medalLevel = level;
  const text = `${medalTitle(medalFor(app.state.maxTile))} 메달 달성`;
  renderer.showToast(`${text}!`);
  return text;
}

function handleMove(direction) {
  hideHint();
  if (app.state.over) return;

  const result = move(app.state, direction);
  if (!result.moved) return;

  app.snapshot = structuredClone(app.state);
  app.state = result.state;

  renderer.animateMove(result);
  renderer.floatGain(result.gained);
  updateBest();
  refreshPanel();

  const medalText = checkMedal();
  if (result.gained > 0 || medalText) {
    const parts = [`점수 ${formatNumber(app.state.score)} (+${formatNumber(result.gained)})`];
    if (medalText) parts.push(medalText);
    announcer.polite(parts.join('. '));
  }

  if (app.state.over) handleGameOver();
  persist();
}

function handleUndo() {
  if (!canUndo()) return;
  const wasOver = app.state.over;
  if (wasOver && app.lastRecord) removeRecord(app.lastRecord);

  app.state = { ...app.snapshot, undoLeft: app.state.undoLeft - 1 };
  app.snapshot = null;
  app.lastRecord = null;

  renderer.hideOverlay();
  renderer.sync(app.state);
  refreshPanel();
  persist();
  announcer.now(`한 수 되돌렸습니다. 점수 ${formatNumber(app.state.score)}. 남은 되돌리기 ${app.state.undoLeft}회.`);
  focusBoard();
}

function startNewGame(recordCurrent) {
  // 방금 끝난 판의 기록은 강조를 유지해 새 게임 화면에서도 보이게 한다.
  if (recordCurrent) recordCurrentGame();

  app.state = createGame();
  app.snapshot = null;
  app.lastRecord = null;
  app.medalLevel = medalLevel(app.state.maxTile);

  renderer.hideOverlay();
  renderer.sync(app.state);
  refreshPanel();
  persist();
  announcer.now('새 게임을 시작합니다.');
  focusBoard();
}

function confirmNewGame() {
  const { dialog } = elements;
  const returnFocus = document.activeElement;

  const onClose = () => {
    dialog.removeEventListener('close', onClose);
    if (dialog.returnValue === 'confirm') {
      startNewGame(true);
    } else if (returnFocus instanceof HTMLElement) {
      returnFocus.focus({ preventScroll: true });
    }
  };

  dialog.returnValue = '';
  dialog.addEventListener('close', onClose);
  dialog.showModal();
}

function requestNewGame() {
  if (elements.dialog.open) return;
  if (app.state.score > 0 && !app.state.over) confirmNewGame();
  else startNewGame(false);
}

function readBoard() {
  const { cells, size } = app.state;
  const rows = [];
  for (let row = 0; row < size; row += 1) {
    const values = cells.slice(row * size, row * size + size).map((tile) => (tile ? String(tile.value) : '빈칸'));
    rows.push(`${row + 1}행: ${values.join(', ')}`);
  }
  announcer.now(`${rows.join('. ')}. 점수 ${formatNumber(app.state.score)}.`);
}

function hideHint() {
  elements.hint.hidden = true;
}

function initHint() {
  if (!('embed' in document.documentElement.dataset)) return;
  elements.hint.hidden = false;
  document.addEventListener('pointerdown', hideHint, { once: true });
  elements.board.addEventListener('focus', hideHint, { once: true });
}

function restoreOrCreate() {
  const saved = loadGame();
  if (saved) {
    app.state = saved.state;
    app.snapshot = saved.snapshot;
    app.lastRecord = saved.lastRecord;
  } else {
    app.state = createGame();
  }
  app.medalLevel = medalLevel(app.state.maxTile);
}

function bindButtons() {
  elements.newGameButton.addEventListener('click', requestNewGame);
  elements.undoButton.addEventListener('click', handleUndo);
  elements.overlayUndo.addEventListener('click', handleUndo);
  elements.retryButton.addEventListener('click', () => startNewGame(false));
  elements.readBoardButton.addEventListener('click', readBoard);
}

function init() {
  initTheme($('theme-toggle'));

  app.best = loadBest();
  app.records = loadRecords();
  restoreOrCreate();
  updateBest();

  renderer.sync(app.state);
  refreshPanel();
  refreshRecords();
  if (app.state.over) renderer.showOverlay(app.state);
  persist();

  bindButtons();
  initHint();
  initInput(elements.board, {
    onMove: handleMove,
    onUndo: handleUndo,
    onNewGame: requestNewGame,
    onReadBoard: readBoard,
  });
}

init();
