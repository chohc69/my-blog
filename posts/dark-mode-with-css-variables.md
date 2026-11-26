---
title: CSS 변수로 다크 모드 만들기
date: 2026-10-01
tags: [css, javascript, 다크모드]
description: CSS 변수와 data 속성 하나로 깜빡임 없는 다크 모드를 구현하는 방법.
---

다크 모드를 만드는 방법은 여러 가지지만, 프레임워크 없이 가장 깔끔한 방법은
**CSS 변수**와 `<html>`의 **data 속성** 하나를 조합하는 것입니다.

## 1. 색상을 변수로 정의하기

모든 색상을 `:root`에 변수로 모아두고, 다크 테마에서는 변수 값만 바꿉니다.

```css
:root {
  --color-bg: #ffffff;
  --color-text: #24292f;
}

:root[data-theme="dark"] {
  --color-bg: #0f1115;
  --color-text: #d4d8de;
}

body {
  background: var(--color-bg);
  color: var(--color-text);
}
```

컴포넌트에는 색상값을 직접 쓰지 않고 항상 변수를 씁니다.
그러면 테마를 바꿀 때 CSS를 한 줄도 고칠 필요가 없어요.

## 2. 어떤 테마를 쓸지 정하기

우선순위는 다음과 같습니다.

1. 사용자가 버튼으로 직접 고른 테마 (`localStorage`에 저장)
2. 없으면 운영체제 설정 (`prefers-color-scheme`)

## 3. 깜빡임 막기

JavaScript 모듈은 페이지가 그려진 뒤에 실행됩니다.
그래서 테마를 모듈에서 정하면, 다크 모드 사용자는 **흰 화면이 번쩍**하는 걸 보게 됩니다.

해결책은 간단합니다. `<head>` 안에 작은 인라인 스크립트를 두어 CSS보다 먼저 실행하는 거죠.

```html
<script>
  (() => {
    let theme = null;
    try { theme = localStorage.getItem('theme'); } catch (e) {}
    if (theme !== 'light' && theme !== 'dark') {
      theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = theme;
  })();
</script>
```

> `localStorage`는 사생활 보호 모드 등에서 오류를 낼 수 있으니 꼭 `try/catch`로 감싸세요.

## 4. 시스템 설정 변화 따라가기

사용자가 직접 고른 적이 없다면, 운영체제 테마가 바뀔 때 함께 바뀌는 게 자연스럽습니다.

```javascript
const media = matchMedia('(prefers-color-scheme: dark)');
media.addEventListener('change', (event) => {
  if (!getStoredTheme()) applyTheme(event.matches ? 'dark' : 'light');
});
```

## 정리

| 단계 | 하는 일 |
| --- | --- |
| CSS 변수 | 색상을 한 곳에서 관리 |
| data 속성 | 테마 전환 스위치 |
| 인라인 스크립트 | 첫 화면 깜빡임 방지 |
| `matchMedia` | 시스템 설정 반영 |

이 블로그도 정확히 이 방식으로 동작합니다. 오른쪽 위 버튼을 눌러 보세요!
