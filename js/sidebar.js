// 왼쪽 사이드바: 연도별로 묶은 전체 글 목록 (날짜 + 제목).
// 화면이 넓을 때만 CSS로 보인다.

import { escapeHtml } from './markdown.js';

function yearOf(date) {
  return /^\d{4}/.exec(date ?? '')?.[0] ?? '날짜 없음';
}

function shortDate(date) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(date ?? '');
  return m ? `${m[1]}.${m[2]}` : '';
}

function groupByYear(posts) {
  const groups = new Map();
  for (const post of posts) {
    const year = yearOf(post.date);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(post);
  }
  return groups;
}

function renderItem(post) {
  return `
    <li>
      <a class="sidebar-link" href="#/post/${escapeHtml(post.slug)}" data-slug="${escapeHtml(post.slug)}">
        <time class="sidebar-date" datetime="${escapeHtml(post.date ?? '')}">${shortDate(post.date)}</time>
        <span class="sidebar-post-title">${escapeHtml(post.title)}</span>
      </a>
    </li>`;
}

export function renderSidebar(container, posts) {
  const sections = [...groupByYear(posts)]
    .map(
      ([year, items]) => `
        <h3 class="sidebar-year">${escapeHtml(year)}</h3>
        <ul class="sidebar-list">${items.map(renderItem).join('')}</ul>`,
    )
    .join('');

  container.innerHTML = `
    <h2 class="sidebar-title">전체 글 <span class="sidebar-count">${posts.length}</span></h2>
    ${sections}`;
}

// 지금 보고 있는 글을 강조한다. slug가 null이면 강조를 모두 지운다.
export function setActivePost(container, slug) {
  for (const link of container.querySelectorAll('.sidebar-link')) {
    if (link.dataset.slug === slug) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}
