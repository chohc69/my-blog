// 순수 게임 로직 (DOM 없음). 상태는 제자리에서 갱신하며, 모든 변경은 이 모듈의 함수로만 한다.
// 화면에 알릴 일(줄 삭제, 레벨 업, 게임 오버 등)은 state.events에 쌓고 main.js가 꺼내 쓴다.

import {
  COLS, ROWS, HIDDEN_ROWS, SHAPES, pieceSize, rotationCount, typeIndex, kickCandidates,
} from './pieces.js';
import { createBag } from './randomizer.js';

export const QUEUE_SIZE = 3;
export const LOCK_DELAY = 500;
export const LOCK_RESET_LIMIT = 15;
export const CLEAR_DURATION = 250;
export const CLEAR_DURATION_REDUCED = 120;
export const LINES_PER_LEVEL = 10;
export const MIN_START_LEVEL = 1;
export const MAX_START_LEVEL = 10;

const LINE_SCORE = [0, 100, 300, 600, 1000];
const COMBO_BONUS = 50;
const SOFT_DROP_POINTS = 1;
const HARD_DROP_POINTS = 2;

// ---------------------------------------------------------------------------
// 속도
// ---------------------------------------------------------------------------

export function gravityMs(level) {
  return Math.max(50, Math.round(1000 * 0.82 ** (level - 1)));
}

export function softDropMs(level) {
  const gravity = gravityMs(level);
  return Math.min(gravity, Math.max(gravity / 20, 25));
}

export function levelFor(startLevel, lines) {
  return startLevel + Math.floor(lines / LINES_PER_LEVEL);
}

// 삭제 점수: 줄 수별 기본 점수 × 레벨 + 연속 보너스 (combo는 0부터, 0이면 보너스 없음)
export function clearScore(count, level, combo) {
  const base = LINE_SCORE[count] * level;
  const bonus = combo > 0 ? COMBO_BONUS * combo * level : 0;
  return base + bonus;
}

// ---------------------------------------------------------------------------
// 상태
// ---------------------------------------------------------------------------

function clampStartLevel(level) {
  const value = Number.isInteger(level) ? level : MIN_START_LEVEL;
  return Math.min(MAX_START_LEVEL, Math.max(MIN_START_LEVEL, value));
}

export function createGame({ startLevel = 1, rng = Math.random, reducedMotion = false } = {}) {
  const level = clampStartLevel(startLevel);
  const bag = createBag(rng);
  const queue = [];
  while (queue.length < QUEUE_SIZE) queue.push(bag.next());

  return {
    phase: 'ready',
    board: new Uint8Array(COLS * ROWS),
    piece: null,
    queue,
    bag,
    hold: null,
    holdUsed: false,
    score: 0,
    lines: 0,
    level,
    startLevel: level,
    combo: -1,
    softDropping: false,
    reducedMotion,
    timers: {
      gravity: 0,
      lock: 0,
      lockResets: 0,
      lowestY: 0,
      grounded: false,
      clear: 0,
    },
    clearingRows: [],
    lastClear: null,
    events: [],
  };
}

export function startGame(state) {
  if (state.phase !== 'ready') return false;
  state.phase = 'playing';
  spawnNext(state);
  return true;
}

export function takeEvents(state) {
  const events = state.events;
  state.events = [];
  return events;
}

// ---------------------------------------------------------------------------
// 충돌
// ---------------------------------------------------------------------------

export function collides(board, type, rot, x, y) {
  const cells = SHAPES[type][rot];
  for (let i = 0; i < cells.length; i += 1) {
    const bx = x + cells[i][0];
    const by = y + cells[i][1];
    if (bx < 0 || bx >= COLS || by >= ROWS) return true;
    if (by >= 0 && board[by * COLS + bx] !== 0) return true;
  }
  return false;
}

function pieceCollides(state, dx, dy, rot = state.piece.rot) {
  const { piece } = state;
  return collides(state.board, piece.type, rot, piece.x + dx, piece.y + dy);
}

export function isGrounded(state) {
  return Boolean(state.piece) && pieceCollides(state, 0, 1);
}

export function ghostY(state) {
  const { piece } = state;
  if (!piece) return 0;
  let y = piece.y;
  while (!collides(state.board, piece.type, piece.rot, piece.x, y + 1)) y += 1;
  return y;
}

// ---------------------------------------------------------------------------
// 생성
// ---------------------------------------------------------------------------

function takeFromQueue(state) {
  const type = state.queue.shift();
  state.queue.push(state.bag.next());
  return type;
}

function resetPieceTimers(state) {
  const { timers } = state;
  timers.gravity = 0;
  timers.lock = 0;
  timers.lockResets = 0;
  timers.lowestY = state.piece ? state.piece.y : 0;
  timers.grounded = false;
}

// 조각을 생성 위치에 놓는다. 막혀 있으면 게임 오버.
function spawnPiece(state, type) {
  const size = pieceSize(type);
  const piece = { type, rot: 0, x: Math.floor((COLS - size) / 2), y: 0 };
  state.piece = piece;

  if (collides(state.board, type, 0, piece.x, piece.y)) {
    gameOver(state, 'blocked');
    return false;
  }
  // 바로 아래가 비어 있으면 1칸 내려 보이는 영역 첫 줄에 나타나게 한다.
  if (!collides(state.board, type, 0, piece.x, piece.y + 1)) piece.y += 1;

  resetPieceTimers(state);
  state.events.push({ type: 'spawn' });
  return true;
}

function spawnNext(state) {
  state.holdUsed = false;
  return spawnPiece(state, takeFromQueue(state));
}

function gameOver(state, reason) {
  state.phase = 'over';
  state.softDropping = false;
  state.events.push({ type: 'over', reason });
}

// ---------------------------------------------------------------------------
// 이동 · 회전 · 고정 지연
// ---------------------------------------------------------------------------

// 더 낮은 행에 도달하면 고정 지연 초기화 횟수를 0으로 돌린다.
function noteDescent(state) {
  const { piece, timers } = state;
  if (piece.y > timers.lowestY) {
    timers.lowestY = piece.y;
    timers.lockResets = 0;
  }
}

function afterManipulation(state, wasGrounded) {
  const { timers } = state;
  noteDescent(state);
  if (wasGrounded && timers.lockResets < LOCK_RESET_LIMIT) {
    timers.lock = 0;
    timers.lockResets += 1;
  }
}

function canAct(state) {
  return state.phase === 'playing' && Boolean(state.piece);
}

export function move(state, dx) {
  if (!canAct(state) || pieceCollides(state, dx, 0)) return false;
  const wasGrounded = isGrounded(state);
  state.piece.x += dx;
  afterManipulation(state, wasGrounded);
  return true;
}

// dir: 1 = 시계, -1 = 반시계. 후보를 순서대로 시험해 처음 맞는 위치를 채택한다.
export function rotate(state, dir) {
  if (!canAct(state)) return false;
  const { piece } = state;
  const count = rotationCount(piece.type);
  if (count === 1) return false;

  const nextRot = (piece.rot + dir + count) % count;
  const candidates = kickCandidates(piece.type, dir);
  for (let i = 0; i < candidates.length; i += 1) {
    const [dx, dy] = candidates[i];
    if (!pieceCollides(state, dx, dy, nextRot)) {
      const wasGrounded = isGrounded(state);
      piece.rot = nextRot;
      piece.x += dx;
      piece.y += dy;
      afterManipulation(state, wasGrounded);
      return true;
    }
  }
  return false;
}

export function hardDrop(state) {
  if (!canAct(state)) return 0;
  const target = ghostY(state);
  const distance = target - state.piece.y;
  state.piece.y = target;
  state.score += distance * HARD_DROP_POINTS;
  lockPiece(state);
  return distance;
}

// 보관: 조각당 1회. 비어 있으면 다음 조각을 꺼내고, 있으면 맞바꾼다.
export function holdPiece(state) {
  if (!canAct(state) || state.holdUsed) return false;
  const current = state.piece.type;
  const swapped = state.hold;
  state.hold = current;
  state.holdUsed = true;
  spawnPiece(state, swapped === null ? takeFromQueue(state) : swapped);
  state.events.push({ type: 'hold' });
  return true;
}

export function setSoftDrop(state, active) {
  const value = Boolean(active) && state.phase === 'playing';
  if (value && !state.softDropping) {
    // 누르는 순간 바로 1칸 내려가도록 누적값을 간격 이상으로 맞춘다.
    state.timers.gravity = Math.max(state.timers.gravity, softDropMs(state.level));
  } else if (!value && state.softDropping) {
    state.timers.gravity = Math.min(state.timers.gravity, gravityMs(state.level));
  }
  state.softDropping = value;
}

// ---------------------------------------------------------------------------
// 고정 · 줄 삭제
// ---------------------------------------------------------------------------

export function findFullRows(board) {
  const rows = [];
  for (let row = 0; row < ROWS; row += 1) {
    let full = true;
    for (let col = 0; col < COLS; col += 1) {
      if (board[row * COLS + col] === 0) {
        full = false;
        break;
      }
    }
    if (full) rows.push(row);
  }
  return rows;
}

// 지정한 행을 지우고 위의 행을 아래로 압축한다.
export function removeRows(board, rows) {
  if (rows.length === 0) return;
  const remove = new Set(rows);
  let write = ROWS - 1;
  for (let read = ROWS - 1; read >= 0; read -= 1) {
    if (remove.has(read)) continue;
    if (write !== read) board.copyWithin(write * COLS, read * COLS, read * COLS + COLS);
    write -= 1;
  }
  for (let row = write; row >= 0; row -= 1) board.fill(0, row * COLS, row * COLS + COLS);
}

export function lockPiece(state) {
  const { piece, board } = state;
  const value = typeIndex(piece.type);
  const cells = SHAPES[piece.type][piece.rot];
  let allHidden = true;
  let outside = false;

  for (let i = 0; i < cells.length; i += 1) {
    const bx = piece.x + cells[i][0];
    const by = piece.y + cells[i][1];
    if (by < 0) {
      outside = true;
      continue;
    }
    board[by * COLS + bx] = value;
    if (by >= HIDDEN_ROWS) allHidden = false;
  }

  state.piece = null;
  state.softDropping = false;
  state.events.push({ type: 'lock' });

  if (allHidden || outside) {
    gameOver(state, 'overflow');
    return;
  }

  const rows = findFullRows(board);
  if (rows.length === 0) {
    state.combo = -1;
    spawnNext(state);
    return;
  }

  state.combo += 1;
  const before = state.level;
  const points = clearScore(rows.length, before, state.combo);
  state.score += points;
  state.lines += rows.length;
  state.level = levelFor(state.startLevel, state.lines);

  state.phase = 'clearing';
  state.clearingRows = rows;
  state.timers.clear = 0;
  state.lastClear = { count: rows.length, points, combo: state.combo };
  state.events.push({ type: 'clear', count: rows.length, points, combo: state.combo });
  if (state.level > before) state.events.push({ type: 'levelup', level: state.level });
}

export function clearDuration(state) {
  return state.reducedMotion ? CLEAR_DURATION_REDUCED : CLEAR_DURATION;
}

function finishClearing(state) {
  removeRows(state.board, state.clearingRows);
  state.clearingRows = [];
  state.timers.clear = 0;
  state.phase = 'playing';
  spawnNext(state);
}

// ---------------------------------------------------------------------------
// 프레임 갱신: 중력 → 고정 지연 → 삭제 연출
// ---------------------------------------------------------------------------

function applyGravity(state, dt) {
  const { timers } = state;
  const interval = state.softDropping ? softDropMs(state.level) : gravityMs(state.level);
  timers.gravity += dt;
  while (timers.gravity >= interval) {
    if (isGrounded(state)) {
      timers.gravity = 0;
      break;
    }
    timers.gravity -= interval;
    state.piece.y += 1;
    if (state.softDropping) state.score += SOFT_DROP_POINTS;
    noteDescent(state);
  }
}

function applyLockDelay(state, dt) {
  const { timers } = state;
  if (!isGrounded(state)) {
    timers.grounded = false;
    timers.lock = 0;
    return;
  }
  // 초기화 횟수를 다 쓴 뒤 다시 접지하면 즉시 고정
  if (!timers.grounded && timers.lockResets >= LOCK_RESET_LIMIT) {
    lockPiece(state);
    return;
  }
  timers.grounded = true;
  timers.lock += dt;
  if (timers.lock >= LOCK_DELAY) lockPiece(state);
}

export function update(state, dt) {
  if (state.phase === 'clearing') {
    state.timers.clear += dt;
    if (state.timers.clear >= clearDuration(state)) finishClearing(state);
    return;
  }
  if (!canAct(state)) return;
  applyGravity(state, dt);
  applyLockDelay(state, dt);
}

// 입력 동작 하나 적용. 하드 드롭 뒤에는 같은 프레임의 나머지 동작을 버린다(false 반환).
export function applyAction(state, action) {
  if (!canAct(state)) return false;
  switch (action.type) {
    case 'move':
      move(state, action.dx);
      return true;
    case 'rotate':
      rotate(state, action.dir);
      return true;
    case 'hardDrop':
      hardDrop(state);
      return false;
    case 'hold':
      holdPiece(state);
      return true;
    default:
      return true;
  }
}
