// localStorage 래퍼. 모든 접근을 try/catch로 감싸 사생활 보호 모드에서도 게임이 동작하게 한다.
// 같은 오리진의 다른 앱과 겹치지 않도록 게임 키에는 'stack-drop:' 접두사를 붙이고,
// 'theme' 키만 블로그와 공유한다.

import { MIN_START_LEVEL, MAX_START_LEVEL } from './game.js';

const PREFIX = 'stack-drop:';
const THEME_KEY = 'theme';
export const THEME_STORAGE_KEY = THEME_KEY;
export const RECORD_LIMIT = 5;

export const DEFAULT_SETTINGS = Object.freeze({ startLevel: 1, das: 160, arr: 40 });

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

function isCount(value, max = Number.MAX_SAFE_INTEGER) {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

function isDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isValidRecord(record) {
  return Boolean(record) && typeof record === 'object'
    && isCount(record.score)
    && isCount(record.lines)
    && isCount(record.level, 999) && record.level >= 1
    && isDateString(record.date)
    && (record.startLevel === undefined
      || (isCount(record.startLevel, MAX_START_LEVEL) && record.startLevel >= MIN_START_LEVEL));
}

// 새 기록을 넣고 점수 내림차순(동점이면 새 기록 우선)으로 5개만 남긴다.
// 반환: { records, index } — index는 새 기록의 순위(0부터), 들지 못하면 -1
export function addRecord(records, record) {
  const sorted = [record, ...records].sort((a, b) => b.score - a.score);
  const kept = sorted.slice(0, RECORD_LIMIT);
  return { records: kept, index: kept.indexOf(record) };
}

export function loadBest() {
  const value = readJSON(`${PREFIX}best`, 0);
  return isCount(value) ? value : 0;
}

export function saveBest(best) {
  writeJSON(`${PREFIX}best`, best);
}

export function loadRecords() {
  const value = readJSON(`${PREFIX}records`, []);
  if (!Array.isArray(value) || value.length > RECORD_LIMIT || !value.every(isValidRecord)) return [];
  return value.slice().sort((a, b) => b.score - a.score);
}

export function saveRecords(records) {
  writeJSON(`${PREFIX}records`, records);
}

export function loadSettings() {
  const value = readJSON(`${PREFIX}settings`, null);
  const settings = { ...DEFAULT_SETTINGS };
  if (!value || typeof value !== 'object') return settings;
  if (Number.isInteger(value.startLevel)
    && value.startLevel >= MIN_START_LEVEL && value.startLevel <= MAX_START_LEVEL) {
    settings.startLevel = value.startLevel;
  }
  if (isCount(value.das, 1000)) settings.das = value.das;
  if (isCount(value.arr, 500)) settings.arr = value.arr;
  return settings;
}

export function saveSettings(settings) {
  writeJSON(`${PREFIX}settings`, settings);
}

export function readTheme() {
  const value = read(THEME_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}

export function writeTheme(theme) {
  write(THEME_KEY, theme);
}
