// 스크린리더용 aria-live 알림.
// polite: 연타 시 마지막 메시지만 읽도록 디바운스한다. assertive: 즉시 읽는다(게임 오버 등).

const POLITE_DELAY = 300;

function setText(element, message) {
  // 같은 문구가 연속으로 와도 다시 읽히도록 비운 뒤 다음 프레임에 채운다.
  element.textContent = '';
  window.setTimeout(() => {
    element.textContent = message;
  }, 30);
}

export function createAnnouncer(politeElement, assertiveElement) {
  let timer = 0;

  function polite(message) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => setText(politeElement, message), POLITE_DELAY);
  }

  function assertive(message) {
    window.clearTimeout(timer);
    setText(assertiveElement, message);
  }

  // 사용자가 직접 요청한 정보(판 읽기)는 디바운스 없이 바로 읽는다.
  function now(message) {
    window.clearTimeout(timer);
    setText(politeElement, message);
  }

  return { polite, assertive, now };
}
