# CLAUDE.md

이 파일은 이 저장소에서 작업할 때 Claude Code가 따라야 할 지침입니다.

## 프로젝트 개요

마크다운(`.md`) 파일로 작성한 글을 읽어 블로그 웹사이트로 보여주는 정적 사이트입니다.
**프레임워크·빌드 도구·npm 의존성 없이** 순수 HTML, CSS, JavaScript(ES Modules)만 사용합니다.

### 핵심 요구사항
- 깔끔하고 읽기 좋은 디자인 (본문 가독성 최우선)
- 다크 모드 지원 (시스템 설정 자동 감지 + 수동 토글)
- 모바일 우선 반응형 레이아웃
- 프레임워크/라이브러리 없이 구현 (React, Vue, Tailwind, jQuery, 번들러 등 사용 금지)

## 디렉터리 구조

```
my-blog/
├── index.html          # 단일 진입점 (SPA 셸)
├── css/
│   └── style.css       # 전체 스타일 (CSS 변수 기반 테마)
├── js/
│   ├── app.js          # 진입점: 초기화, 라우팅
│   ├── router.js       # 해시 기반 라우터
│   ├── markdown.js     # 마크다운 → HTML 파서 (직접 구현)
│   ├── frontmatter.js  # front matter 파싱
│   ├── theme.js        # 다크 모드 토글
│   ├── views.js        # 글 목록 / 글 상세(목차 포함) / 404 렌더링
│   ├── search.js       # 글 목록 검색 (제목·요약·태그)
│   ├── sidebar.js      # 넓은 화면(≥1024px) 왼쪽 사이드바: 연도별 날짜+제목 목록
│   └── copy-code.js    # 코드 블록 복사 버튼
└── posts/
    ├── index.json      # 글 목록 매니페스트
    └── *.md            # 블로그 글
```

## 동작 방식

1. `index.html`이 로드되면 `js/app.js`가 `posts/index.json`을 `fetch`로 불러옵니다.
   (브라우저는 디렉터리 목록을 읽을 수 없으므로 매니페스트가 필요합니다.)
2. 해시 라우팅을 사용합니다. 서버 설정 없이 GitHub Pages 등 정적 호스팅에서 동작하게 하기 위함입니다.
   - `#/` → 글 목록 (최신순)
   - `#/post/<slug>` → 글 상세 (`posts/<slug>.md`를 fetch 후 렌더링)
   - `#/tags` → 태그 모아보기
   - `#/tag/<tag>` → 태그별 목록
   - 그 외 → 404 뷰
   - `#제목-id` 같은 문서 내 앵커는 라우트가 아닙니다. `app.js`가 클릭을 가로채 해시를 바꾸지 않고 스크롤만 합니다.
3. 마크다운은 `js/markdown.js`의 자체 파서로 HTML로 변환합니다.

## 글 작성 규칙

`posts/` 아래에 `<slug>.md` 파일을 만들고 상단에 front matter를 작성합니다.

```markdown
---
title: 글 제목
date: 2026-10-07
tags: [javascript, css]
description: 목록에 표시될 짧은 요약
---

본문...
```

새 글을 추가하면 **반드시 `posts/index.json`에도 항목을 추가**합니다.

```json
[
  { "slug": "hello-world", "title": "글 제목", "date": "2026-10-07", "tags": ["javascript"], "description": "요약" }
]
```

- `slug`는 파일명과 같아야 하며 영문 소문자, 숫자, 하이픈만 사용합니다.
- 날짜 형식은 `YYYY-MM-DD`입니다.

## 마크다운 파서 지원 범위

`js/markdown.js`는 다음 문법을 지원해야 합니다.

- 제목 `#` ~ `######` (각 제목에 id 부여 → 앵커 링크 가능)
- 문단, 줄바꿈, 수평선 `---`
- **굵게**, *기울임*, ~~취소선~~, `인라인 코드`
- 링크 `[text](url)`, 이미지 `![alt](src)`
- 순서 있는/없는 목록 (중첩 포함), 인용문 `>`
- 펜스 코드 블록 ```` ```lang ```` (언어명을 `class="language-xxx"`로 부여)
- 표 (GFM 스타일)

**보안**: 텍스트와 코드 블록 내용은 반드시 HTML 이스케이프합니다. 링크 URL은 `javascript:` 스킴을 차단합니다. 렌더링 결과를 `innerHTML`에 넣기 전 이 규칙이 지켜졌는지 확인합니다.

## 디자인 가이드

### 레이아웃 & 타이포그래피
- 본문 최대 폭 `~70ch` (약 680–720px), 가운데 정렬
- 본문 글자 크기 `1.0625rem`~`1.125rem`, 줄 간격 `1.75` 내외
- 시스템 폰트 스택 사용 (한글 고려: `"Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`), 코드는 고정폭 폰트
- 여백은 넉넉하게, 장식은 최소화
- 단위는 `rem` 기반, 간격은 일관된 스케일 사용

### 테마 (다크 모드)
- 모든 색상은 `:root`의 CSS 변수로 정의합니다. 하드코딩된 색상값을 컴포넌트에 직접 쓰지 않습니다.
  - 예: `--color-bg`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-border`, `--color-code-bg`
- 다크 모드 적용 우선순위:
  1. 사용자가 토글로 선택한 값 (`localStorage`의 `theme` 키: `"light"` | `"dark"`)
  2. 없으면 `prefers-color-scheme` 시스템 설정
- `<html data-theme="dark">` 속성으로 테마를 적용합니다.
- 페이지 로드 시 깜빡임(FOUC)을 막기 위해 테마 결정 스크립트는 `<head>` 안에 인라인으로 두어 CSS 적용 전에 실행합니다.
- `localStorage` 접근은 `try/catch`로 감쌉니다 (사생활 보호 모드 대응).
- 두 테마 모두 텍스트 대비 WCAG AA(4.5:1) 이상을 유지합니다.

### 반응형
- 모바일 우선(mobile-first)으로 작성하고 `min-width` 미디어 쿼리로 확장합니다.
- `<meta name="viewport" content="width=device-width, initial-scale=1">` 필수
- 좌우 여백은 모바일에서 최소 `16px`
- 가로 스크롤이 생기면 안 됩니다. 코드 블록과 표만 자체적으로 `overflow-x: auto` 처리합니다.
- 이미지는 `max-width: 100%; height: auto;`
- 터치 대상(버튼, 링크)은 최소 44×44px

### 접근성
- 시맨틱 태그 사용: `header`, `nav`, `main`, `article`, `footer`, `time`
- 테마 토글 버튼에 `aria-label` 제공, 키보드 포커스 표시(`:focus-visible`) 유지
- 라우트 변경 시 `document.title` 갱신 및 페이지 상단으로 스크롤

## 코딩 컨벤션

- ES Modules (`<script type="module">`) 사용, 전역 변수 최소화
- `const`/`let`만 사용 (`var` 금지), 비동기는 `async/await`
- 함수는 작고 단일 책임으로 유지
- `fetch` 실패 시 사용자에게 오류 메시지를 보여줍니다 (빈 화면 금지)
- 외부 CDN 스크립트나 npm 패키지를 추가하지 않습니다. 필요하면 먼저 사용자에게 확인합니다.
- 들여쓰기 2칸, 세미콜론 사용, 문자열은 작은따옴표

## 로컬 실행

`fetch`는 `file://` 프로토콜에서 동작하지 않으므로 로컬 서버가 필요합니다.

```bash
python -m http.server 8000
```

그 후 브라우저에서 `http://localhost:8000` 접속.

## 변경 후 확인 사항

- 라이트/다크 모드 모두에서 화면 확인
- 모바일 폭(375px)과 데스크톱 폭에서 확인
- 브라우저 콘솔에 오류가 없는지 확인
- 새 마크다운 문법을 추가했다면 `posts/`에 예시 글로 렌더링 확인
