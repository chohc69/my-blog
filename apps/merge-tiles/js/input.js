// 키보드(방향키·WASD·단축키)와 스와이프(Pointer Events)를 방향 문자열로 바꿔 콜백을 부른다.

const KEY_DIRECTIONS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'up',
  KeyS: 'down',
};

const SWIPE_MIN_DISTANCE = 30;
const SWIPE_AXIS_RATIO = 1.5;

function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
}

function isDialogOpen() {
  return Boolean(document.querySelector('dialog[open]'));
}

function handleKeydown(event, handlers) {
  if (event.defaultPrevented || isDialogOpen() || isTypingTarget(event.target)) return;

  // Ctrl+Z(또는 Cmd+Z)는 되돌리기. 그 밖의 수정 키 조합은 브라우저에 맡긴다.
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === 'KeyZ') {
    event.preventDefault();
    handlers.onUndo();
    return;
  }
  if (event.ctrlKey || event.altKey || event.metaKey) return;

  const direction = KEY_DIRECTIONS[event.code];
  if (direction) {
    event.preventDefault();
    handlers.onMove(direction);
    return;
  }

  if (event.repeat) return;
  if (event.code === 'KeyN') handlers.onNewGame();
  else if (event.code === 'KeyU') handlers.onUndo();
  else if (event.code === 'KeyB') handlers.onReadBoard();
}

function swipeDirection(dx, dy) {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (Math.max(absX, absY) < SWIPE_MIN_DISTANCE) return null;
  if (absX >= absY * SWIPE_AXIS_RATIO) return dx > 0 ? 'right' : 'left';
  if (absY >= absX * SWIPE_AXIS_RATIO) return dy > 0 ? 'down' : 'up';
  return null;
}

function bindSwipe(board, onMove) {
  let start = null;

  board.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    start = { id: event.pointerId, x: event.clientX, y: event.clientY };
    try {
      board.setPointerCapture(event.pointerId);
    } catch {
      // 캡처를 지원하지 않아도 pointerup으로 처리 가능
    }
  });

  board.addEventListener('pointerup', (event) => {
    if (!start || event.pointerId !== start.id) return;
    const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y);
    start = null;
    if (direction) onMove(direction);
  });

  board.addEventListener('pointercancel', () => {
    start = null;
  });

  // 길게 눌러 뜨는 메뉴 방지
  board.addEventListener('contextmenu', (event) => {
    if (event.pointerType !== 'mouse') event.preventDefault();
  });
}

export function initInput(board, handlers) {
  document.addEventListener('keydown', (event) => handleKeydown(event, handlers));
  bindSwipe(board, handlers.onMove);
}
