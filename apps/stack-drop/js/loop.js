// requestAnimationFrame 게임 루프.
// dt는 ms 기반이라 화면 주사율(60/120/144Hz)과 무관하게 속도가 같다.
// 탭 전환·디버거 정지 뒤 큰 dt로 조각이 순간 낙하하지 않도록 100ms로 제한한다.

const MAX_DT = 100;

export function createLoop(step) {
  let frame = 0;
  let last = null;
  let running = false;

  function tick(now) {
    if (!running) return;
    const dt = last === null ? 0 : Math.min(now - last, MAX_DT);
    last = now;
    step(dt);
    if (running) frame = window.requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    last = null; // 재개 시 멈춰 있던 시간을 dt로 넘기지 않는다
    frame = window.requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    window.cancelAnimationFrame(frame);
    last = null;
  }

  return { start, stop, isRunning: () => running };
}
