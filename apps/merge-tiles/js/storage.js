// localStorage 래퍼. 모든 접근을 try/catch로 감싸 사생활 보호 모드에서도 게임이 동작하게 한다.
// 블로그와 같은 오리진을 쓰므로 게임 데이터 키에는 'merge-tiles:' 접두사를 붙인다.
// 'theme' 키만은 블로그와 공유한다.

import { RECORD_LIMIT, isValidRecord, isValidState } from './game.js';

const PREFIX = 'merge-tiles:';
const THEME_KEY = 'theme';

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장할 수 없는 환경에서는 이번 방문 동안만 유지
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // 무시
  }
}

function readJSON(key, fallback) {
  const raw = read(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    write(key, JSON.stringify(value));
  } catch {
    // 직렬화 실패 시 저장하지 않음
  }
}

export function loadBest() {
  const value = readJSON(`${PREFIX}best`, 0);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function saveBest(best) {
  writeJSON(`${PREFIX}best`, best);
}

export function loadRecords() {
  const value = readJSON(`${PREFIX}records`, []);
  if (!Array.isArray(value) || value.length > RECORD_LIMIT || !value.every(isValidRecord)) return [];
  return value;
}

export function saveRecords(records) {
  writeJSON(`${PREFIX}records`, records);
}

// 진행 중 게임: { state, snapshot, lastRecord }
// snapshot은 되돌리기용 직전 상태, lastRecord는 게임 오버 때 추가한 기록(되돌리면 취소하기 위함).
export function loadGame() {
  const value = readJSON(`${PREFIX}state`, null);
  if (!value || typeof value !== 'object' || !isValidState(value.state)) return null;
  const snapshot = isValidState(value.snapshot) ? value.snapshot : null;
  const lastRecord = isValidRecord(value.lastRecord) ? value.lastRecord : null;
  return { state: value.state, snapshot, lastRecord };
}

export function saveGame(game) {
  writeJSON(`${PREFIX}state`, game);
}

export function clearGame() {
  remove(`${PREFIX}state`);
}

export function readTheme() {
  const value = read(THEME_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}

export function writeTheme(theme) {
  write(THEME_KEY, theme);
}

export const THEME_STORAGE_KEY = THEME_KEY;
