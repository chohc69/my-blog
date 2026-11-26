// 마크다운 → HTML 파서.
// 원문 HTML은 지원하지 않고 모두 이스케이프한다 (XSS 방지).

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// 인라인 처리 중 이미 변환된 HTML 조각을 숨겨두는 자리표시자
const PH = '\u0000';
const PH_RE = /\u0000(\d+)\u0000/g;

const RE = {
  fence: /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/,
  heading: /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/,
  hr: /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
  blockquote: /^ {0,3}>/,
  list: /^( *)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/,
  tableSep: /^ *\|? *:?-+:? *(?:\| *:?-+:? *)*\|? *$/,
  task: /^\[([ xX])\][ \t]+(.*)$/,
};

// 링크·이미지의 (url "title") 부분.
// <url> 형식이거나, 한 단계 괄호를 포함할 수 있는 url (예: wiki/A_(B))
const LINK_TARGET = String.raw`\(\s*(?:<([^<>\n]+)>|((?:[^\s()<>]|\([^\s()<>]*\))+))(?:\s+"([^"]*)")?\s*\)`;
const IMAGE_RE = new RegExp(String.raw`!\[([^\]]*)\]` + LINK_TARGET, 'g');
const LINK_RE = new RegExp(String.raw`\[([^\]]+)\]` + LINK_TARGET, 'g');

// index.html에 이미 있는 id. 같은 이름의 제목은 'main-1'처럼 번호가 붙는다.
const RESERVED_IDS = ['main', 'theme-toggle'];

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

// javascript:, vbscript:, data: 같은 위험한 스킴을 차단한다.
export function sanitizeUrl(url) {
  const normalized = url.replace(/[\u0000- \u007F]/g, '').toLowerCase();
  if (/^(javascript|vbscript|data):/.test(normalized)) return '#';
  return url.trim();
}

// HTML과 함께 제목 목록({ level, id, text })을 돌려준다. 목차를 만들 때 쓴다.
export function renderMarkdown(source) {
  const text = source
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '�')
    .replace(/^\t+/gm, (tabs) => '    '.repeat(tabs.length));
  const ctx = {
    slugs: new Map(RESERVED_IDS.map((id) => [id, 1])),
    headings: [],
    tight: false,
  };
  const html = parseBlocks(text.split('\n'), ctx);
  return { html, headings: ctx.headings };
}

export function parseMarkdown(source) {
  return renderMarkdown(source).html;
}

/* ---------------------------------------------------------------------------
   블록
   --------------------------------------------------------------------------- */

function parseBlocks(lines, ctx) {
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    let m;

    if (!line.trim()) {
      i++;
      continue;
    }

    if ((m = line.match(RE.fence))) {
      const [, fence, lang] = m;
      const closing = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`);
      const body = [];
      i++;
      while (i < lines.length && !closing.test(lines[i])) body.push(lines[i++]);
      i++;
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '<span></span>';
      // 복사 버튼 동작은 js/copy-code.js가 이벤트 위임으로 처리한다.
      out.push(
        `<div class="code-block"><div class="code-header">${label}` +
          '<button type="button" class="copy-button" aria-live="polite">복사</button></div>' +
          `<pre><code${cls}>${escapeHtml(body.join('\n'))}</code></pre></div>`,
      );
      continue;
    }

    if ((m = line.match(RE.heading))) {
      const level = m[1].length;
      const text = m[2] ?? '';
      const id = uniqueSlug(text, ctx.slugs);
      ctx.headings.push({ level, id, text: plainText(text) });
      out.push(`<h${level} id="${escapeHtml(id)}">${renderInline(text)}${headingAnchor(id)}</h${level}>`);
      i++;
      continue;
    }

    if (RE.hr.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    if (RE.blockquote.test(line)) {
      const inner = [];
      while (i < lines.length && lines[i].trim()) {
        inner.push(lines[i].replace(/^ {0,3}> ?/, ''));
        i++;
      }
      out.push(`<blockquote>${parseBlocks(inner, { ...ctx, tight: false })}</blockquote>`);
      continue;
    }

    if (isTableStart(lines, i)) {
      const header = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map(alignOf);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitRow(lines[i++]));
      }
      out.push(renderTable(header, aligns, rows));
      continue;
    }

    if ((m = line.match(RE.list))) {
      const start = i;
      const baseIndent = m[1].length;
      i++;
      while (i < lines.length) {
        if (!lines[i].trim()) {
          // 빈 줄 다음에도 목록이 이어지는지 확인
          let j = i + 1;
          while (j < lines.length && !lines[j].trim()) j++;
          if (j < lines.length && belongsToList(lines[j], baseIndent)) {
            i = j;
            continue;
          }
          break;
        }
        if (belongsToList(lines[i], baseIndent) || !startsBlock(lines[i])) {
          i++;
          continue;
        }
        break;
      }
      out.push(renderList(lines.slice(start, i), ctx));
      continue;
    }

    // 문단
    const para = [lines[i++]];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !interruptsParagraph(lines[i]) &&
      !isTableStart(lines, i)
    ) {
      para.push(lines[i++]);
    }
    const html = renderInline(para.map((l) => l.replace(/^ +/, '')).join('\n'));
    out.push(ctx.tight ? html : `<p>${html}</p>`);
  }

  return out.join('\n');
}

function startsBlock(line) {
  return (
    RE.fence.test(line) ||
    RE.heading.test(line) ||
    RE.hr.test(line) ||
    RE.blockquote.test(line) ||
    RE.list.test(line)
  );
}

// 숫자로 시작하는 문장("2026. 10. 7.")이 목록으로 바뀌지 않도록
// 문단 중간에서는 1번으로 시작하는 순서 목록만 문단을 끊는다.
function interruptsParagraph(line) {
  if (!startsBlock(line)) return false;
  const m = line.match(RE.list);
  if (m && /\d/.test(m[2]) && parseInt(m[2], 10) !== 1) return false;
  return true;
}

function belongsToList(line, baseIndent) {
  const m = line.match(RE.list);
  const indent = line.match(/^ */)[0].length;
  return (m && m[1].length >= baseIndent) || indent > baseIndent;
}

function renderList(blockLines, ctx) {
  const first = blockLines[0].match(RE.list);
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const tight = !blockLines.some((l) => !l.trim());
  const items = [];

  for (const line of blockLines) {
    const m = line.match(RE.list);
    if (m && m[1].length <= baseIndent + 1) {
      items.push({ lines: [m[3]], indent: m[1].length + m[2].length + 1 });
      continue;
    }
    const item = items[items.length - 1];
    const lead = line.match(/^ */)[0].length;
    item.lines.push(line.slice(Math.min(lead, item.indent)));
  }

  let hasTask = false;
  const html = items
    .map((item) => {
      let lines = item.lines;
      let checkbox = '';
      const task = lines[0].match(RE.task);
      if (task) {
        hasTask = true;
        checkbox = `<input type="checkbox" disabled${task[1] === ' ' ? '' : ' checked'}> `;
        lines = [task[2], ...lines.slice(1)];
      }
      const body = parseBlocks(lines, { ...ctx, tight });
      return `<li${task ? ' class="task-item"' : ''}>${checkbox}${body}</li>`;
    })
    .join('\n');

  const tag = ordered ? 'ol' : 'ul';
  const startNum = parseInt(first[2], 10);
  const startAttr = ordered && startNum !== 1 ? ` start="${startNum}"` : '';
  const classAttr = hasTask ? ' class="task-list"' : '';
  return `<${tag}${startAttr}${classAttr}>\n${html}\n</${tag}>`;
}

function isTableStart(lines, i) {
  return (
    i + 1 < lines.length &&
    lines[i].includes('|') &&
    lines[i + 1].includes('|') &&
    RE.tableSep.test(lines[i + 1])
  );
}

function splitRow(row) {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function alignOf(cell) {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return '';
}

function renderTable(header, aligns, rows) {
  const cell = (tag, text, idx) => {
    const align = aligns[idx] ? ` style="text-align:${aligns[idx]}"` : '';
    return `<${tag}${align}>${renderInline(text ?? '')}</${tag}>`;
  };
  const head = `<tr>${header.map((text, idx) => cell('th', text, idx)).join('')}</tr>`;
  const body = rows
    .map((row) => `<tr>${header.map((_, idx) => cell('td', row[idx], idx)).join('')}</tr>`)
    .join('\n');
  return `<div class="table-wrap"><table><thead>${head}</thead>${body ? `<tbody>${body}</tbody>` : ''}</table></div>`;
}

// 마크다운 기호를 걷어낸 순수 텍스트 (이스케이프 전). 목차 항목에 쓴다.
function plainText(text) {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\\(.)/g, '$1')
    .replace(/[`*~]/g, '')
    .replace(/(^|\s)_+|_+(?=\s|$)/g, '$1')
    .trim();
}

function headingAnchor(id) {
  return ` <a class="heading-anchor" href="#${escapeHtml(encodeURIComponent(id))}" aria-label="이 제목으로 이동">#</a>`;
}

function uniqueSlug(text, slugs) {
  const base =
    text
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[`*_~]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-') || 'section';
  const count = slugs.get(base) ?? 0;
  slugs.set(base, count + 1);
  return count ? `${base}-${count}` : base;
}

/* ---------------------------------------------------------------------------
   인라인
   --------------------------------------------------------------------------- */

function renderInline(text) {
  const tokens = [];
  let html = inlinePass(text, tokens);
  // 토큰 안에 다른 토큰이 들어 있을 수 있으므로 모두 풀릴 때까지 반복
  while (html.includes(PH)) {
    html = html.replace(PH_RE, (_, idx) => tokens[idx]);
  }
  return html;
}

function inlinePass(text, tokens) {
  const stash = (html) => `${PH}${tokens.push(html) - 1}${PH}`;

  let out = text
    // 인라인 코드
    .replace(/(`+)([\s\S]+?)\1(?!`)/g, (_, __, code) =>
      stash(`<code>${escapeHtml(code.trim())}</code>`))
    // 백슬래시 이스케이프
    .replace(/\\([\\`*_{}[\]()#+\-.!~>|])/g, (_, ch) => stash(escapeHtml(ch)))
    // 강제 줄바꿈 (줄 끝 공백 2개 또는 백슬래시)
    .replace(/(?: {2,}|\\)\n/g, () => stash('<br>'))
    // 이미지
    .replace(IMAGE_RE, (_, alt, angled, bare, title) => {
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      const src = sanitizeUrl(angled ?? bare);
      return stash(
        `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${titleAttr} loading="lazy">`,
      );
    })
    // 링크
    .replace(LINK_RE, (_, label, angled, bare, title) =>
      stash(renderLink(angled ?? bare, inlinePass(label, tokens), title)))
    // 자동 링크 <https://...> (링크 뒤에 처리해야 [a](<url>) 형식을 가로채지 않는다)
    .replace(/<(https?:\/\/[^\s>]+)>/g, (_, url) => stash(renderLink(url, escapeHtml(url))));

  out = escapeHtml(out)
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
    .replace(/\*(?=\S)([\s\S]*?\S)\*/g, '<em>$1</em>')
    .replace(/(^|[^\p{L}\p{N}_])_(?=\S)([\s\S]*?\S)_(?![\p{L}\p{N}_])/gu, '$1<em>$2</em>');

  return out;
}

function renderLink(href, labelHtml, title) {
  const url = sanitizeUrl(href);
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  const external = /^https?:\/\//i.test(url) ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<a href="${escapeHtml(url)}"${titleAttr}${external}>${labelHtml}</a>`;
}
