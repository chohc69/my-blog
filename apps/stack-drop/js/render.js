// Canvas 그리기: 게임판(격자·고정 블록·그림자·현재 조각·삭제 연출), 다음 조각 미리보기, 보관 칸.
// 색은 CSS 변수를 getComputedStyle로 읽어 캐시하고, 테마가 바뀔 때만 다시 읽는다.
// 내부 해상도는 devicePixelRatio만큼 키워 고해상도 화면에서도 선명하게 그린다.

import { COLS, ROWS, HIDDEN_ROWS, VISIBLE_ROWS, SHAPES, typeIndex } from './pieces.js';
import { ghostY, clearDuration } from './game.js';

const MIN_CELL = 14;

function readColors() {
  const style = getComputedStyle(document.documentElement);
  const get = (name) => style.getPropertyValue(name).trim();
  const blocks = [];
  for (let i = 0; i < 7; i += 1) blocks.push(get(`--block-${i}`));
  return {
    blocks,
    boardBg: get('--board-bg'),
    grid: get('--grid-line'),
    ghostAlpha: Number.parseFloat(get('--ghost-alpha')) || 0.12,
    flash: get('--flash'),
    highlight: get('--block-highlight'),
    outline: get('--color-accent'),
    previewBg: get('--preview-bg'),
  };
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

// 납작한 블록: 모서리 반경 = 셀의 18%, 위쪽 얇은 하이라이트 띠, 셀 사이 1px 간격
function drawBlock(ctx, colors, px, py, cell, color) {
  const x = px + 0.5;
  const y = py + 0.5;
  const size = cell - 1;
  const radius = cell * 0.18;
  roundRectPath(ctx, x, y, size, size, radius);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.fillStyle = colors.highlight;
  ctx.fillRect(x, y, size, Math.max(1, cell * 0.08));
  ctx.restore();
}

function drawGhostBlock(ctx, colors, px, py, cell, color) {
  const inset = 1.25;
  const x = px + inset;
  const y = py + inset;
  const size = cell - inset * 2;
  roundRectPath(ctx, x, y, size, size, cell * 0.18);
  ctx.save();
  ctx.globalAlpha = colors.ghostAlpha;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function setupCanvas(canvas, cssWidth, cssHeight) {
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  const width = Math.round(cssWidth * dpr);
  const height = Math.round(cssHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function shapeBounds(type) {
  const cells = SHAPES[type][0];
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

// 미리보기 캔버스 한 칸에 조각을 가운데 정렬해 그린다.
function drawPreview(canvas, colors, type, dimmed) {
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  if (cssWidth === 0 || cssHeight === 0) return;
  const ctx = setupCanvas(canvas, cssWidth, cssHeight);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  if (!type) return;

  const bounds = shapeBounds(type);
  const w = bounds.maxX - bounds.minX + 1;
  const h = bounds.maxY - bounds.minY + 1;
  const cell = Math.floor(Math.min(cssWidth / 4.5, cssHeight / 2.5));
  const offsetX = (cssWidth - w * cell) / 2 - bounds.minX * cell;
  const offsetY = (cssHeight - h * cell) / 2 - bounds.minY * cell;
  const color = colors.blocks[typeIndex(type) - 1];

  ctx.save();
  if (dimmed) ctx.globalAlpha = 0.35;
  SHAPES[type][0].forEach(([x, y]) => {
    drawBlock(ctx, colors, offsetX + x * cell, offsetY + y * cell, cell, color);
  });
  ctx.restore();
}

export function createRenderer({ boardCanvas, holder, nextCanvases, holdCanvas, onResize }) {
  let colors = readColors();
  let cell = 20;
  let state = null;
  let scheduled = 0;
  let previewKey = '';

  function computeCell() {
    const rect = holder.getBoundingClientRect();
    const fit = Math.floor(Math.min(rect.width / COLS, rect.height / VISIBLE_ROWS));
    return Math.max(MIN_CELL, fit || MIN_CELL);
  }

  function resize() {
    cell = computeCell();
    boardCanvas.style.width = `${cell * COLS}px`;
    boardCanvas.style.height = `${cell * VISIBLE_ROWS}px`;
    previewKey = '';
    if (onResize) onResize(cell);
    invalidate();
  }

  function drawGrid(ctx, width, height) {
    ctx.fillStyle = colors.boardBg;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let col = 1; col < COLS; col += 1) {
      const x = col * cell + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let row = 1; row < VISIBLE_ROWS; row += 1) {
      const y = row * cell + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }

  function drawStack(ctx, current) {
    const clearing = current.phase === 'clearing' ? new Set(current.clearingRows) : null;
    for (let row = HIDDEN_ROWS; row < ROWS; row += 1) {
      if (clearing && clearing.has(row) && !current.reducedMotion) continue;
      for (let col = 0; col < COLS; col += 1) {
        const value = current.board[row * COLS + col];
        if (value === 0) continue;
        drawBlock(ctx, colors, col * cell, (row - HIDDEN_ROWS) * cell, cell, colors.blocks[value - 1]);
      }
    }
  }

  // 줄 삭제 연출: 행 전체가 번쩍인 뒤 가운데에서 양쪽으로 사라진다.
  function drawClearing(ctx, current, width) {
    if (current.reducedMotion) return;
    const progress = Math.min(1, current.timers.clear / clearDuration(current));
    const visible = 1 - progress;
    const half = (width / 2) * visible;
    current.clearingRows.forEach((row) => {
      if (row < HIDDEN_ROWS) return;
      const y = (row - HIDDEN_ROWS) * cell;
      ctx.save();
      ctx.beginPath();
      ctx.rect(width / 2 - half, y, half * 2, cell);
      ctx.clip();
      for (let col = 0; col < COLS; col += 1) {
        const value = current.board[row * COLS + col];
        if (value !== 0) drawBlock(ctx, colors, col * cell, y, cell, colors.blocks[value - 1]);
      }
      ctx.globalAlpha = Math.min(1, 0.35 + visible * 0.65);
      ctx.fillStyle = colors.flash;
      ctx.fillRect(0, y, width, cell);
      ctx.restore();
    });
  }

  function drawPiece(ctx, current) {
    const { piece } = current;
    if (!piece || current.phase === 'over') return;
    const color = colors.blocks[typeIndex(piece.type) - 1];
    const cells = SHAPES[piece.type][piece.rot];

    const gy = ghostY(current);
    if (gy !== piece.y) {
      cells.forEach(([cx, cy]) => {
        const row = gy + cy;
        if (row < HIDDEN_ROWS) return;
        drawGhostBlock(ctx, colors, (piece.x + cx) * cell, (row - HIDDEN_ROWS) * cell, cell, color);
      });
    }

    cells.forEach(([cx, cy]) => {
      const row = piece.y + cy;
      if (row < HIDDEN_ROWS) return;
      const px = (piece.x + cx) * cell;
      const py = (row - HIDDEN_ROWS) * cell;
      drawBlock(ctx, colors, px, py, cell, color);
      roundRectPath(ctx, px + 1, py + 1, cell - 2, cell - 2, cell * 0.18);
      ctx.lineWidth = 1;
      ctx.strokeStyle = colors.outline;
      ctx.stroke();
    });
  }

  function drawPreviews(current) {
    const key = `${current.queue.join('')}|${current.hold}|${current.holdUsed}|${current.phase}`;
    if (key === previewKey) return;
    previewKey = key;
    const showQueue = current.phase !== 'ready';
    nextCanvases.forEach((canvas, i) => {
      drawPreview(canvas, colors, showQueue ? current.queue[i] : null, false);
    });
    if (holdCanvas) drawPreview(holdCanvas, colors, current.hold, current.holdUsed);
  }

  function draw(current = state) {
    if (!current) return;
    state = current;
    const width = cell * COLS;
    const height = cell * VISIBLE_ROWS;
    const ctx = setupCanvas(boardCanvas, width, height);
    drawGrid(ctx, width, height);
    drawStack(ctx, current);
    if (current.phase === 'clearing') drawClearing(ctx, current, width);
    drawPiece(ctx, current);
    drawPreviews(current);
  }

  // 루프가 멈춰 있을 때(시작 화면·일시정지·게임 오버) 필요한 순간에만 한 번 다시 그린다.
  function invalidate() {
    if (scheduled) return;
    scheduled = window.requestAnimationFrame(() => {
      scheduled = 0;
      draw();
    });
  }

  function refreshColors() {
    colors = readColors();
    previewKey = '';
    invalidate();
  }

  function setState(current) {
    state = current;
    previewKey = '';
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(holder);
  window.addEventListener('resize', () => resize());
  resize();

  return {
    draw,
    invalidate,
    refreshColors,
    setState,
    getCellSize: () => cell,
  };
}
