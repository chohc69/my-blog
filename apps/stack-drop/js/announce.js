// 스크린리더용 aria-live 알림.
// polite: 짧은 시간에 연속으로 생긴 알림은 400ms 디바운스로 합쳐 한 번에 읽는다.
// assertive: 즉시 읽는다(게임 오버).

const POLITE_DELAY = 400;

function setText(element, message) {
  // 같은 문구가 연속으로 와도 다시 읽히도록 비운 뒤 잠시 후 채운다.
  element.textContent = '';
  window.setTimeout(() => {
    element.textContent = message;
  }, 30);
}

export function createAnnouncer(politeElement, assertiveElement) {
  let timer = 0;
  let pending = [];

  function flush() {
    if (pending.length === 0) return;
    setText(politeElement, pending.join(' '));
    pending = [];
  }

  function polite(message) {
    pending.push(message);
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, POLITE_DELAY);
  }

  function assertive(message) {
    window.clearTimeout(timer);
    pending = [];
    setText(assertiveElement, message);
  }

  return { polite, assertive };
}
