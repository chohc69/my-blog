// 글 목록 검색. 각 글의 data-search(제목·요약·태그, 소문자)에
// 입력한 단어가 모두 들어 있는 글만 보여준다.

function toTerms(query) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function statusText(termCount, matchCount) {
  if (!termCount) return '';
  return matchCount ? `${matchCount}개의 글을 찾았습니다.` : '검색 결과가 없습니다.';
}

export function setupSearch(root) {
  const input = root.querySelector('#post-search');
  const status = root.querySelector('#search-status');
  if (!input || !status) return;

  const items = [...root.querySelectorAll('.post-item')];

  input.addEventListener('input', () => {
    const terms = toTerms(input.value);
    let matchCount = 0;
    for (const item of items) {
      const haystack = item.dataset.search ?? '';
      const match = terms.every((term) => haystack.includes(term));
      item.hidden = !match;
      if (match) matchCount++;
    }
    status.textContent = statusText(terms.length, matchCount);
  });
}
