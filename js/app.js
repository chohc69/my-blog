import { createRouter } from './router.js';
import { initTheme } from './theme.js';
import { initCopyButtons } from './copy-code.js';
import { renderSidebar, setActivePost } from './sidebar.js';
import {
  SITE_TITLE,
  renderError,
  renderHome,
  renderNotFound,
  renderPost,
  renderTag,
  renderTagIndex,
} from './views.js';

const main = document.getElementById('main');
const sidebar = document.getElementById('sidebar');
const navLinks = document.querySelectorAll('.site-nav [data-nav]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let postsPromise = null;
let renderId = 0;
let isFirstRender = true;

function loadPosts() {
  postsPromise ??= fetch('posts/index.json')
    .then((res) => {
      if (!res.ok) throw new Error(`글 목록을 불러오지 못했습니다. (HTTP ${res.status})`);
      return res.json();
    })
    .then((list) =>
      list
        .filter((post) => post && typeof post.slug === 'string' && typeof post.title === 'string')
        .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? ''))),
    )
    .then((list) => {
      renderSidebar(sidebar, list);
      return list;
    })
    .catch((error) => {
      postsPromise = null; // 다음 이동 때 다시 시도
      throw error;
    });
  return postsPromise;
}

// 헤더 메뉴에서 현재 화면에 해당하는 항목을 표시한다 (view.nav: 'posts' | 'tags').
function setActiveNav(key) {
  for (const link of navLinks) {
    if (link.dataset.nav === key) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

// activeSlug: 사이드바에서 강조할 글 (글 상세 화면일 때만)
async function show(buildView, activeSlug = null) {
  const id = ++renderId;
  main.setAttribute('aria-busy', 'true');

  let view;
  try {
    view = await buildView();
  } catch (error) {
    console.error(error);
    view = renderError(error);
  }

  // 로딩 중 다른 페이지로 이동했다면 이전 결과는 버린다.
  if (id !== renderId) return;

  main.innerHTML = view.html;
  view.setup?.(main);
  setActivePost(sidebar, activeSlug);
  setActiveNav(view.nav ?? null);
  main.removeAttribute('aria-busy');
  document.title = view.title === SITE_TITLE ? SITE_TITLE : `${view.title} | ${SITE_TITLE}`;

  if (!isFirstRender) {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
  isFirstRender = false;
}

// '#제목' 같은 문서 내 앵커는 해시를 바꾸지 않고 스크롤만 한다.
// (해시를 바꾸면 현재 글의 라우트 정보가 사라지기 때문)
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;

  const href = link.getAttribute('href');
  if (href.startsWith('#/')) return;

  event.preventDefault();
  let target = null;
  try {
    target = document.getElementById(decodeURIComponent(href.slice(1)));
  } catch {
    return;
  }
  if (!target) return;

  target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
  if (target === main) main.focus({ preventScroll: true });
});

initTheme(document.getElementById('theme-toggle'));
initCopyButtons();

createRouter(
  [
    { pattern: /^\/$/, handler: () => show(async () => renderHome(await loadPosts())) },
    {
      pattern: /^\/post\/([^/]+)\/?$/,
      handler: (slug) => show(async () => renderPost(slug, await loadPosts()), slug),
    },
    { pattern: /^\/tags\/?$/, handler: () => show(async () => renderTagIndex(await loadPosts())) },
    {
      pattern: /^\/tag\/([^/]+)\/?$/,
      handler: (tag) => show(async () => renderTag(tag, await loadPosts())),
    },
  ],
  () => show(renderNotFound),
).start();
