// 글 상단의 front matter(--- 로 감싼 key: value 블록)를 파싱한다.
// 지원 값: 문자열, 따옴표 문자열, 배열 [a, b, c]

const FRONT_MATTER_RE = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function parseFrontMatter(source) {
  const match = source.match(FRONT_MATTER_RE);
  if (!match) return { data: {}, content: source };

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (m) data[m[1]] = parseValue(m[2].trim());
  }
  return { data, content: source.slice(match[0].length) };
}

function parseValue(raw) {
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw
      .slice(1, -1)
      .split(',')
      .map((item) => unquote(item.trim()))
      .filter(Boolean);
  }
  return unquote(raw);
}

function unquote(value) {
  return value.replace(/^(['"])(.*)\1$/, '$2');
}
