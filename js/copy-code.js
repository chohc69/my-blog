// 코드 블록의 '복사' 버튼. 화면이 바뀌어도 동작하도록 document에 이벤트를 위임한다.

const DEFAULT_LABEL = '복사';
const RESET_DELAY = 2000;
const timers = new WeakMap();

function setLabel(button, label) {
  button.textContent = label;
  clearTimeout(timers.get(button));
  timers.set(
    button,
    setTimeout(() => {
      button.textContent = DEFAULT_LABEL;
    }, RESET_DELAY),
  );
}

// Clipboard API를 쓸 수 없을 때(https가 아닌 주소, 권한 거부)의 예전 방식.
function legacyCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.className = 'visually-hidden';
  document.body.append(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.remove();
  if (!ok) throw new Error('copy failed');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    legacyCopy(text);
  }
}

async function handleClick(event) {
  const button = event.target.closest('.copy-button');
  if (!button) return;

  const code = button.closest('.code-block')?.querySelector('code');
  if (!code) return;

  try {
    await copyText(code.textContent);
    setLabel(button, '복사됨');
  } catch {
    setLabel(button, '복사 실패');
  }
  // 임시 textarea로 옮겨간 포커스를 버튼으로 되돌린다.
  button.focus();
}

export function initCopyButtons() {
  document.addEventListener('click', handleClick);
}
