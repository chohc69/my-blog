// 테마 적용·토글과 외부 변화 반영.
// 초기 테마는 index.html <head>의 인라인 스크립트가 CSS보다 먼저 적용한다.
// 우선순위: ?theme 파라미터 → localStorage 'theme'(블로그와 공유) → prefers-color-scheme
// 캔버스는 CSS 변화를 자동 반영하지 않으므로 테마가 바뀌면 onChange 콜백으로 알린다.

import { THEME_STORAGE_KEY, readTheme, writeTheme } from './storage.js';

const root = document.documentElement;
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function isTheme(value) {
  return value === 'light' || value === 'dark';
}

function paramTheme() {
  const value = new URLSearchParams(location.search).get('theme');
  return isTheme(value) ? value : null;
}

function systemTheme() {
  return systemDark.matches ? 'dark' : 'light';
}

function resolveTheme() {
  return paramTheme() || readTheme() || systemTheme();
}

export function initTheme(button, onChange = () => {}) {
  function applyTheme(theme) {
    const changed = root.dataset.theme !== theme;
    root.dataset.theme = theme;

    if (button) {
      const label = theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환';
      button.setAttribute('aria-label', label);
      button.title = label;
    }

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.content = getComputedStyle(root).getPropertyValue('--color-bg').trim();
    }
    if (changed) onChange(theme);
  }

  applyTheme(isTheme(root.dataset.theme) ? root.dataset.theme : resolveTheme());

  if (button) {
    button.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      writeTheme(next);
      applyTheme(next);
    });
  }

  // 다른 탭이나 같은 오리진의 부모 페이지(블로그)에서 토글하면 반영한다.
  window.addEventListener('storage', (event) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    applyTheme(readTheme() || paramTheme() || systemTheme());
  });

  // 사용자가 직접 고른 값이 없을 때만 시스템 설정 변경을 따라간다.
  systemDark.addEventListener('change', (event) => {
    if (!paramTheme() && !readTheme()) applyTheme(event.matches ? 'dark' : 'light');
  });

  // 보조 수단: 같은 오리진 부모가 보내는 테마 메시지.
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.type !== 'stack-drop:theme') return;
    if (isTheme(data.theme)) applyTheme(data.theme);
  });
}
