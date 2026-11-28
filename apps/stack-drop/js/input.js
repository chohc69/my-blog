// 키보드 · 화면 버튼 · 게임판 제스처를 하나의 가상 버튼 계층으로 모은다.
// - 누르고 있는 가상 키: left, right, down (여러 입력원이 동시에 누를 수 있어 Set으로 추적)
// - 한 번 누르는 가상 키: cw, ccw, drop, hold
// 좌우 반복은 브라우저 키 반복(event.repeat)을 쓰지 않고 게임 루프의 dt로 DAS/ARR를 직접 계산한다.

const HELD = new Set(['left', 'right', 'down']);
const TAPS = {
  cw: { type: 'rotate', dir: 1 },
  ccw: { type: 'rotate', dir: -1 },
  drop: { type: 'hardDrop' },
  hold: { type: 'hold' },
};

// event.code 기준 → 한/영 IME 상태와 무관
const KEYMAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'drop',
  ArrowUp: 'cw',
  KeyX: 'cw',
  KeyW: 'cw',
  KeyZ: 'ccw',
  KeyC: 'hold',
  ShiftLeft: 'hold',
  ShiftRight: 'hold',
  KeyP: 'pause',
  Escape: 'pause',
};

const MAX_SHIFTS_PER_UPDATE = 10;
const BUTTON_SLIP_MARGIN = 8;
const TAP_SLOP = 10;
const TAP_MAX_MS = 300;
const FLING_SPEED = 1.2; // px/ms
const FLING_WINDOW = 80; // ms

function isTextField(target) {
  if (!(target instanceof Element)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function isActivatable(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('button, a, select, input, textarea, summary'));
}

export function createInput({ das = 160, arr = 40 } = {}) {
  const holders = { left: new Set(), right: new Set(), down: new Set() };
  const shift = { dir: 0, timer: 0, charged: false, acc: 0 };
  let queue = [];

  function pushMove(dx) {
    queue.push({ type: 'move', dx });
  }

  function startShift(dir, immediate) {
    shift.dir = dir;
    shift.timer = 0;
    shift.charged = false;
    shift.acc = 0;
    if (immediate) pushMove(dir);
  }

  function onHeldDown(key) {
    if (key === 'left') startShift(-1, true);
    else if (key === 'right') startShift(1, true);
  }

  function onHeldUp(key) {
    const dir = key === 'left' ? -1 : key === 'right' ? 1 : 0;
    if (dir === 0 || shift.dir !== dir) return;
    // 나중에 누른 방향을 떼면, 아직 눌린 반대 방향이 DAS를 처음부터 다시 시작한다.
    const other = dir === -1 ? 'right' : 'left';
    if (holders[other].size > 0) startShift(-dir, false);
    else shift.dir = 0;
  }

  function press(key, source) {
    if (HELD.has(key)) {
      const set = holders[key];
      if (set.has(source)) return;
      const wasUp = set.size === 0;
      set.add(source);
      if (wasUp) onHeldDown(key);
    } else if (TAPS[key]) {
      queue.push({ ...TAPS[key] });
    }
  }

  function release(key, source) {
    if (!HELD.has(key)) return;
    const set = holders[key];
    if (!set.delete(source)) return;
    if (set.size === 0) onHeldUp(key);
  }

  // 한 칸만 즉시 움직이는 입력(제스처·키보드로 누른 화면 버튼)
  function pulse(key) {
    if (key === 'left') pushMove(-1);
    else if (key === 'right') pushMove(1);
    else if (TAPS[key]) queue.push({ ...TAPS[key] });
  }

  function update(dt) {
    if (shift.dir === 0) return;
    shift.timer += dt;
    if (!shift.charged) {
      if (shift.timer < das) return;
      shift.charged = true;
      shift.acc = shift.timer - das;
      pushMove(shift.dir);
    } else {
      shift.acc += dt;
    }
    if (arr <= 0) {
      for (let i = 0; i < MAX_SHIFTS_PER_UPDATE; i += 1) pushMove(shift.dir);
      shift.acc = 0;
      return;
    }
    let count = 0;
    while (shift.acc >= arr && count < MAX_SHIFTS_PER_UPDATE) {
      shift.acc -= arr;
      pushMove(shift.dir);
      count += 1;
    }
  }

  function drain() {
    const actions = queue;
    queue = [];
    return actions;
  }

  function requeue(actions) {
    queue = actions.concat(queue);
  }

  function isHeld(key) {
    return HELD.has(key) && holders[key].size > 0;
  }

  // 창 포커스를 잃거나 게임이 끝나면 눌린 상태를 모두 해제한다.
  function releaseAll() {
    holders.left.clear();
    holders.right.clear();
    holders.down.clear();
    shift.dir = 0;
    queue = [];
    document.querySelectorAll('.pad-button.is-pressed')
      .forEach((element) => element.classList.remove('is-pressed'));
  }

  // -------------------------------------------------------------------------
  // 키보드
  // -------------------------------------------------------------------------

  // isActive(): 게임 진행 중(또는 일시정지 중)인지. 그때만 키를 가로챈다.
  // onCommand(name): 'pause' | 'enter' → 처리했으면 true
  function attachKeyboard({ isActive, onCommand }) {
    window.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (isTextField(event.target)) return;

      if (event.code === 'Enter' || event.code === 'NumpadEnter') {
        if (event.repeat || isActivatable(event.target)) return;
        if (onCommand('enter')) event.preventDefault();
        return;
      }

      const key = KEYMAP[event.code];
      if (!key || !isActive()) return;
      event.preventDefault();
      if (event.repeat) return;
      if (key === 'pause') {
        onCommand('pause');
        return;
      }
      press(key, `key:${event.code}`);
    });

    window.addEventListener('keyup', (event) => {
      const key = KEYMAP[event.code];
      if (!key) return;
      release(key, `key:${event.code}`);
      if (isActive() && !isTextField(event.target)) event.preventDefault();
    });
  }

  // -------------------------------------------------------------------------
  // 화면 버튼 (Pointer Events, 멀티 터치)
  // -------------------------------------------------------------------------

  function attachButtons(buttons) {
    const active = new Map(); // pointerId → { element, key }

    function end(pointerId) {
      const entry = active.get(pointerId);
      if (!entry) return;
      active.delete(pointerId);
      entry.element.classList.remove('is-pressed');
      release(entry.key, `pointer:${pointerId}`);
    }

    buttons.forEach((element) => {
      const key = element.dataset.action;

      element.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        try {
          element.setPointerCapture(event.pointerId);
        } catch {
          // 캡처할 수 없어도 pointerup으로 해제된다
        }
        active.set(event.pointerId, { element, key });
        element.classList.add('is-pressed');
        press(key, `pointer:${event.pointerId}`);
      });

      // 캡처 중에는 pointerleave가 오지 않으므로, 손가락이 버튼 밖으로 미끄러지면 직접 해제한다.
      element.addEventListener('pointermove', (event) => {
        if (!active.has(event.pointerId)) return;
        const rect = element.getBoundingClientRect();
        const m = BUTTON_SLIP_MARGIN;
        if (event.clientX < rect.left - m || event.clientX > rect.right + m
          || event.clientY < rect.top - m || event.clientY > rect.bottom + m) {
          end(event.pointerId);
        }
      });

      element.addEventListener('pointerup', (event) => end(event.pointerId));
      element.addEventListener('pointercancel', (event) => end(event.pointerId));
      element.addEventListener('lostpointercapture', (event) => end(event.pointerId));
      element.addEventListener('contextmenu', (event) => event.preventDefault());

      // 키보드로 버튼을 누른 경우(detail === 0)에만 한 번 동작
      element.addEventListener('click', (event) => {
        if (event.detail === 0) pulse(key);
      });
    });
  }

  // -------------------------------------------------------------------------
  // 게임판 제스처 (터치·펜): 탭 = 시계 회전, 좌우 끌기 = 칸 단위 이동,
  // 아래로 끌기 = 소프트 드롭, 빠르게 아래로 튕기기 = 하드 드롭
  // -------------------------------------------------------------------------

  function attachGestures(surface, getCellSize) {
    let gesture = null;

    function finish(event, cancelled) {
      if (!gesture || event.pointerId !== gesture.id) return;
      const g = gesture;
      gesture = null;
      if (g.soft) release('down', 'gesture');
      if (cancelled) return;

      const now = event.timeStamp;
      const cell = Math.max(1, getCellSize());
      const oldest = g.samples.find((sample) => now - sample.t <= FLING_WINDOW) || g.samples[0];
      const elapsed = Math.max(1, now - oldest.t);
      const speed = (event.clientY - oldest.y) / elapsed;
      const totalDy = event.clientY - g.startY;

      if (speed > FLING_SPEED && totalDy > cell) {
        pulse('drop');
      } else if (!g.moved && now - g.startT <= TAP_MAX_MS) {
        pulse('cw');
      }
    }

    surface.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' || gesture) return;
      event.preventDefault();
      try {
        surface.setPointerCapture(event.pointerId);
      } catch {
        // 무시
      }
      gesture = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        anchorX: event.clientX,
        startT: event.timeStamp,
        samples: [{ t: event.timeStamp, y: event.clientY }],
        moved: false,
        soft: false,
      };
    });

    surface.addEventListener('pointermove', (event) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const g = gesture;
      const cell = Math.max(1, getCellSize());
      const totalDx = event.clientX - g.startX;
      const totalDy = event.clientY - g.startY;

      if (Math.abs(totalDx) > TAP_SLOP || Math.abs(totalDy) > TAP_SLOP) g.moved = true;

      let dx = event.clientX - g.anchorX;
      while (dx >= cell) {
        pushMove(1);
        g.anchorX += cell;
        dx -= cell;
      }
      while (dx <= -cell) {
        pushMove(-1);
        g.anchorX -= cell;
        dx += cell;
      }

      const downward = totalDy > cell && totalDy > Math.abs(totalDx);
      if (downward && !g.soft) {
        g.soft = true;
        press('down', 'gesture');
      } else if (!downward && g.soft && totalDy < cell / 2) {
        g.soft = false;
        release('down', 'gesture');
      }

      g.samples.push({ t: event.timeStamp, y: event.clientY });
      while (g.samples.length > 2 && event.timeStamp - g.samples[0].t > FLING_WINDOW * 2) {
        g.samples.shift();
      }
    });

    surface.addEventListener('pointerup', (event) => finish(event, false));
    surface.addEventListener('pointercancel', (event) => finish(event, true));
    surface.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  return {
    press,
    release,
    pulse,
    update,
    drain,
    requeue,
    isHeld,
    releaseAll,
    attachKeyboard,
    attachButtons,
    attachGestures,
  };
}
