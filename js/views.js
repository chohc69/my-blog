// 각 화면을 { title, html } 형태로 만든다.
// 매니페스트·front matter에서 온 문자열은 모두 escapeHtml을 거친다.

import { escapeHtml, renderMarkdown } from './markdown.js';
import { parseFrontMatter } from './frontmatter.js';
import { setupSearch } from './search.js';

export const SITE_TITLE = 'my-blog';

const SLUG_RE = /^[a-z0-9-]+$/;
const CHARS_PER_MINUTE = 500;

const dateFormatter = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' });

function formatDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!m) return escapeHtml(value ?? '');
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dateFormatter.format(date);
}

function readingMinutes(markdown) {
  const chars = markdown.replace(/```[\s\S]*?```/g, '').replace(/[\s#*_`>|-]/g, '').length;
  return Math.max(1, Math.round(chars / CHARS_PER_MINUTE));
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function tagHref(tag) {
  return `#/tag/${escapeHtml(encodeURIComponent(tag))}`;
}

function renderTags(tags) {
  if (!tags.length) return '';
  const items = tags
    .map((tag) => `<li><a class="tag" href="${tagHref(tag)}">#${escapeHtml(tag)}</a></li>`)
    .join('');
  return `<ul class="tags" aria-label="태그">${items}</ul>`;
}

function searchText(post) {
  return [post.title, post.description ?? '', ...toArray(post.tags)].join(' ').toLowerCase();
}

// 제목 위 한 줄: (최신 글 라벨) + 'YYYY년 M월 D일'
function renderCardMeta(post, featured) {
  const label = featured ? '<span class="post-card-label">최신 글</span>' : '';
  const date = post.date
    ? `<time datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>`
    : '';
  if (!label && !date) return '';
  return `<p class="post-card-meta">${label}${date}</p>`;
}

function renderPostCard(post, { featured = false } = {}) {
  return `
    <li class="post-item post-card${featured ? ' post-card--featured' : ''}" data-search="${escapeHtml(searchText(post))}">
      <article class="post-card-body">
        ${renderCardMeta(post, featured)}
        <h3 class="post-card-title">
          <a href="#/post/${escapeHtml(post.slug)}">${escapeHtml(post.title)}</a>
        </h3>
        ${post.description ? `<p class="post-card-desc">${escapeHtml(post.description)}</p>` : ''}
        ${renderTags(toArray(post.tags))}
      </article>
    </li>`;
}

// featureFirst: 홈에서 가장 최근 글을 크게 보여줄 때
function renderPostList(posts, { featureFirst = false } = {}) {
  if (!posts.length) return '<p class="status">아직 작성된 글이 없습니다.</p>';
  const items = posts
    .map((post, i) => renderPostCard(post, { featured: featureFirst && i === 0 }))
    .join('');
  return `<ul class="post-list">${items}</ul>`;
}

function countTags(posts) {
  const counts = new Map();
  for (const post of posts) {
    for (const tag of toArray(post.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return counts;
}

function renderTagCloud(posts, { large = false } = {}) {
  const counts = countTags(posts);
  if (!counts.size) return '<p class="status">아직 태그가 없습니다.</p>';

  const items = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(
      ([tag, count]) =>
        `<li><a class="tag" href="${tagHref(tag)}">#${escapeHtml(tag)}<span class="tag-count">${count}</span></a></li>`,
    )
    .join('');
  const cls = large ? 'tag-cloud tag-cloud--large' : 'tag-cloud';
  return `<nav class="${cls}" aria-label="태그 목록"><ul class="tags">${items}</ul></nav>`;
}

function renderSearchBox() {
  return `
    <div class="search" role="search">
      <label class="visually-hidden" for="post-search">글 검색</label>
      <input class="search-input" id="post-search" type="search"
        placeholder="제목, 요약, 태그로 검색" autocomplete="off">
      <p class="search-status" id="search-status" aria-live="polite"></p>
    </div>`;
}

// 홈 소개 문구. 블로그 성격이 바뀌면 여기만 고치면 된다.
const HERO = {
  eyebrow: '마크다운으로 쓰는 기록',
  titleLead: '세상만사',
  titleHighlight: '알아가기',
  desc: '웹 개발 메모부터 매주 월요일 방산 뉴스 브리핑까지, 공부하고 정리한 것을 이곳에 남깁니다.',
};

function renderHero(posts) {
  const latest = posts[0]?.date;
  return `
    <section class="hero" aria-labelledby="hero-title">
      <p class="hero-eyebrow">${escapeHtml(HERO.eyebrow)}</p>
      <h1 class="hero-title" id="hero-title">
        ${escapeHtml(HERO.titleLead)}<br><span class="hero-highlight">${escapeHtml(HERO.titleHighlight)}</span>
      </h1>
      <p class="hero-desc">${escapeHtml(HERO.desc)}</p>
      <ul class="hero-stats">
        <li><strong>${posts.length}</strong>개의 글</li>
        <li><strong>${countTags(posts).size}</strong>개의 태그</li>
        ${latest ? `<li>최근 업데이트 <strong>${formatDate(latest)}</strong></li>` : ''}
      </ul>
    </section>`;
}

// 미니 웹앱 목록. 앱은 apps/<slug>/에 자체 완결되어 있다.
const APPS = [
  {
    slug: 'merge-tiles',
    title: '머지 타일',
    description: '방향키나 스와이프로 숫자 타일을 밀어 합치는 퍼즐. 메달과 최고 기록에 도전해 보세요.',
  },
  {
    slug: 'stack-drop',
    title: '스택 드롭',
    description: '떨어지는 블록을 돌리고 쌓아 가로줄을 지우는 퍼즐. ↓를 누르고 있으면 빨리 내려가요.',
  },
];

function renderAppCard(app) {
  const base = `apps/${escapeHtml(app.slug)}/`;
  return `
    <li class="post-card app-card">
      <img class="app-card-preview" src="${base}preview.svg" alt=""
        width="480" height="360" loading="lazy">
      <div class="app-card-body">
        <p class="post-card-meta"><span class="post-card-label">웹앱</span></p>
        <h3 class="post-card-title">
          <a href="${base}">${escapeHtml(app.title)}</a>
        </h3>
        <p class="post-card-desc">${escapeHtml(app.description)}</p>
      </div>
    </li>`;
}

function renderAppList() {
  if (!APPS.length) return '';
  return `
    <section aria-labelledby="apps-title">
      <h2 class="section-title" id="apps-title">미니 웹앱</h2>
      <ul class="post-list app-list">${APPS.map(renderAppCard).join('')}</ul>
    </section>`;
}

export function renderHome(posts) {
  return {
    title: SITE_TITLE,
    nav: 'posts',
    html: `
      ${renderHero(posts)}
      ${renderAppList()}
      ${posts.length ? renderSearchBox() : ''}
      <h2 class="section-title">모든 글</h2>
      ${renderPostList(posts, { featureFirst: true })}`,
    setup: setupSearch,
  };
}

export function renderTagIndex(posts) {
  const count = countTags(posts).size;
  return {
    title: '태그',
    nav: 'tags',
    html: `
      <header class="page-header">
        <h1 class="page-title">태그</h1>
        <p class="page-desc">${count}개의 태그로 글을 모아 볼 수 있어요.</p>
      </header>
      ${renderTagCloud(posts, { large: true })}`,
  };
}

// h2·h3가 3개 이상인 글에만 목차를 붙인다. h3는 바로 앞 h2 아래에 들어간다.
const TOC_MIN_ITEMS = 3;

function renderToc(headings) {
  const items = headings.filter((h) => h.level === 2 || h.level === 3);
  if (items.length < TOC_MIN_ITEMS) return '';

  const tree = [];
  for (const heading of items) {
    const parent = tree[tree.length - 1];
    if (heading.level === 3 && parent) parent.children.push(heading);
    else tree.push({ ...heading, children: [] });
  }

  const link = (h) => `<a href="#${escapeHtml(encodeURIComponent(h.id))}">${escapeHtml(h.text)}</a>`;
  const list = tree
    .map((h) => {
      const sub = h.children.length
        ? `<ol>${h.children.map((c) => `<li>${link(c)}</li>`).join('')}</ol>`
        : '';
      return `<li>${link(h)}${sub}</li>`;
    })
    .join('');

  return `
    <nav class="toc" aria-label="목차">
      <details open>
        <summary>목차</summary>
        <ol>${list}</ol>
      </details>
    </nav>`;
}

export function renderTag(tag, posts) {
  const tagged = posts.filter((post) => toArray(post.tags).includes(tag));
  if (!tagged.length) return renderNotFound();
  return {
    title: `#${tag}`,
    nav: 'tags',
    html: `
      <a class="back-link" href="#/tags">← 모든 태그</a>
      <header class="page-header">
        <h1 class="page-title">#${escapeHtml(tag)}</h1>
        <p class="page-desc">${tagged.length}개의 글</p>
      </header>
      ${renderPostList(tagged)}`,
  };
}

export async function renderPost(slug, posts) {
  if (!SLUG_RE.test(slug)) return renderNotFound();

  const res = await fetch(`posts/${slug}.md`);
  if (res.status === 404) return renderNotFound();
  if (!res.ok) throw new Error(`글을 불러오지 못했습니다. (HTTP ${res.status})`);

  const { data, content } = parseFrontMatter(await res.text());
  const body = renderMarkdown(content);
  const index = posts.findIndex((post) => post.slug === slug);
  const meta = posts[index] ?? {};

  const title = data.title || meta.title || slug;
  const date = data.date || meta.date || '';
  const tags = toArray(data.tags ?? meta.tags);

  // posts는 최신순: 앞쪽이 더 새 글, 뒤쪽이 더 오래된 글
  const newer = index > 0 ? posts[index - 1] : null;
  const older = index >= 0 ? posts[index + 1] : null;

  const navLink = (post, label, cls) =>
    post
      ? `<a class="post-nav-link ${cls}" href="#/post/${escapeHtml(post.slug)}">
           <span class="post-nav-label">${label}</span>
           <span class="post-nav-title">${escapeHtml(post.title)}</span>
         </a>`
      : '';

  return {
    title,
    nav: 'posts',
    html: `
      <article class="post">
        <header class="post-header">
          <h1 class="post-title">${escapeHtml(title)}</h1>
          <p class="post-meta">
            ${date ? `<time datetime="${escapeHtml(date)}">${formatDate(date)}</time><span aria-hidden="true">·</span>` : ''}
            <span>${readingMinutes(content)}분 읽기</span>
          </p>
          ${renderTags(tags)}
        </header>
        ${renderToc(body.headings)}
        <div class="prose">${body.html}</div>
        ${
          newer || older
            ? `<nav class="post-nav" aria-label="이전 글과 다음 글">
                 ${navLink(older, '← 이전 글', 'older')}
                 ${navLink(newer, '다음 글 →', 'newer')}
               </nav>`
            : ''
        }
      </article>`,
  };
}

export function renderNotFound() {
  return {
    title: '페이지를 찾을 수 없습니다',
    html: `
      <section class="empty-state">
        <h1>페이지를 찾을 수 없습니다</h1>
        <p>주소가 바뀌었거나 삭제된 글일 수 있어요.</p>
        <a class="button" href="#/">홈으로 가기</a>
      </section>`,
  };
}

// 브라우저가 던지는 영문 오류 메시지를 사용자용 한국어 문구로 바꾼다.
function errorMessage(error) {
  if (window.location.protocol === 'file:') {
    return '파일을 직접 열면 글을 불러올 수 없습니다. 로컬 서버(python -m http.server)로 실행해 주세요.';
  }
  if (error instanceof TypeError) {
    return '서버에 연결하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.';
  }
  if (error instanceof SyntaxError) {
    return '글 목록(posts/index.json) 형식이 올바르지 않습니다.';
  }
  return error?.message || '알 수 없는 오류가 발생했습니다.';
}

export function renderError(error) {
  const hint = escapeHtml(errorMessage(error));
  return {
    title: '오류',
    html: `
      <section class="empty-state">
        <h1>글을 불러오지 못했습니다</h1>
        <p>${hint}</p>
        <a class="button" href="#/">홈으로 가기</a>
      </section>`,
  };
}
