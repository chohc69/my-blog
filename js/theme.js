// 다크 모드 토글.
// 초기 테마는 index.html <head>의 인라인 스크립트가 먼저 적용한다.

const STORAGE_KEY = 'theme';
const root = document.documentElement;
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function getStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function storeTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 이번 방문 동안만 유지
  }
}

function applyTheme(theme, button) {
  root.dataset.theme = theme;

  const label = theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환';
  button.setAttribute('aria-label', label);
  button.title = label;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.content = getComputedStyle(root).getPropertyValue('--color-bg').trim();
  }
}

export function initTheme(button) {
  applyTheme(root.dataset.theme || (systemDark.matches ? 'dark' : 'light'), button);

  button.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    storeTheme(next);
    applyTheme(next, button);
  });

  // 사용자가 직접 고른 적이 없으면 시스템 설정 변경을 따라간다.
  systemDark.addEventListener('change', (event) => {
    if (!getStoredTheme()) applyTheme(event.matches ? 'dark' : 'light', button);
  });
}
