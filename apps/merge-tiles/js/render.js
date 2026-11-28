// DOM 렌더링: 타일 요소 생성/이동/삭제, 점수판, 메달, 기록, 오버레이, 토스트.
// 타일은 id별 요소(Map)로 유지하고 위치는 CSS 변수(--row, --col)로만 지정한다.

import { MEDALS, medalFor, medalTitle } from './game.js';

const SLIDE_MS = 120;
const TOAST_MS = 1800;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const numberFormat = new Intl.NumberFormat('ko-KR');

export function formatNumber(value) {
  return numberFormat.format(value);
}

function tileClass(value) {
  const classes = ['tile', value >= 2048 ? 'tile--super' : `tile--v${value}`];
  if (value >= 10000) classes.push('tile--xs-text');
  else if (value >= 1000) classes.push('tile--small-text');
  return classes.join(' ');
}

function placeTile(element, index, size) {
  element.style.setProperty('--row', String(Math.floor(index / size)));
  element.style.setProperty('--col', String(index % size));
}

function createTileElement(tile, index, size, variant) {
  const element = document.createElement('div');
  element.className = tileClass(tile.value);
  if (variant) element.classList.add(variant);
  placeTile(element, index, size);

  const inner = document.createElement('span');
  inner.className = 'tile__inner';
  inner.textContent = String(tile.value);
  element.append(inner);
  return element;
}

function formatShortDate(date) {
  const [, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}`;
}

export function createRenderer(elements) {
  const tiles = new Map();
  let pending = null;
  let toastTimer = 0;

  function addTile(tile, index, size, variant) {
    const element = createTileElement(tile, index, size, variant);
    tiles.set(tile.id, element);
    elements.tileLayer.append(element);
  }

  function removeTile(id) {
    const element = tiles.get(id);
    if (element) element.remove();
    tiles.delete(id);
  }

  // 진행 중인 애니메이션의 남은 단계를 즉시 확정한다(연타 대응).
  function finishPending() {
    if (!pending) return;
    const { timer, complete } = pending;
    pending = null;
    window.clearTimeout(timer);
    complete();
  }

  // 상태 전체를 애니메이션 없이 다시 그린다(시작·되돌리기·복원).
  function sync(state) {
    finishPending();
    tiles.forEach((element) => element.remove());
    tiles.clear();
    state.cells.forEach((tile, index) => {
      if (tile) addTile(tile, index, state.size);
    });
  }

  // 한 턴: 슬라이드 → (120ms 후) 흡수된 타일 제거 + 합쳐진 타일 팝 → 새 타일 등장
  function animateMove(result) {
    finishPending();
    const { state, moves, merges, spawned } = result;

    moves.forEach(({ id, to }) => {
      const element = tiles.get(id);
      if (element) placeTile(element, to, state.size);
    });

    const complete = () => {
      merges.forEach(({ from, to, newId, value }) => {
        from.forEach(removeTile);
        addTile({ id: newId, value }, to, state.size, 'is-merged');
      });
      if (spawned) addTile({ id: spawned.id, value: spawned.value }, spawned.index, state.size, 'is-new');
    };

    if (reducedMotion.matches) {
      complete();
      return;
    }
    pending = { timer: window.setTimeout(finishPending, SLIDE_MS), complete };
  }

  function updateScore(score, best) {
    elements.scoreValue.textContent = formatNumber(score);
    elements.bestValue.textContent = formatNumber(best);
  }

  function floatGain(gained) {
    if (gained <= 0 || reducedMotion.matches) return;
    const element = document.createElement('span');
    element.className = 'score-float';
    element.setAttribute('aria-hidden', 'true');
    element.textContent = `+${formatNumber(gained)}`;
    element.addEventListener('animationend', () => element.remove());
    // animationend가 오지 않는 환경 대비
    window.setTimeout(() => element.remove(), 1000);
    elements.scoreCard.append(element);
  }

  function updateUndo(undoLeft, available) {
    const button = elements.undoButton;
    button.disabled = !available;
    elements.undoCount.textContent = String(undoLeft);
    button.setAttribute('aria-label', `되돌리기 (${undoLeft}회 남음)`);
    elements.overlayUndo.hidden = !available;
  }

  function updateMedals(maxTile) {
    const current = medalFor(maxTile);
    const level = current ? current.level : 0;

    MEDALS.forEach((medal, index) => {
      const item = elements.medalList.querySelector(`[data-medal="${medal.key}"]`);
      const earned = level >= index + 1;
      item.classList.toggle('is-earned', earned);
      item.querySelector('.visually-hidden').textContent = `${medal.name} 메달 ${earned ? '획득' : '미획득'}`;
    });

    const master = elements.medalList.querySelector('[data-medal="master"]');
    const stars = current && current.key === 'master' ? current.stars : 0;
    master.classList.toggle('is-earned', stars > 0);
    master.querySelector('.medal__badge').textContent = stars > 1 ? `★${stars}` : '★';
    master.querySelector('.visually-hidden').textContent = stars > 0
      ? `마스터 메달 별 ${stars}개 획득`
      : '마스터 메달 미획득';
  }

  function renderRecords(records, highlightIndex) {
    const list = elements.recordList;
    list.replaceChildren();
    elements.recordsEmpty.hidden = records.length > 0;
    list.hidden = records.length === 0;

    records.forEach((record, index) => {
      const item = document.createElement('li');
      item.className = 'record';
      if (index === highlightIndex) item.classList.add('is-new');

      const score = document.createElement('span');
      score.className = 'record__score';
      score.textContent = formatNumber(record.score);

      const tile = document.createElement('span');
      tile.className = 'record__tile';
      tile.textContent = `최고 ${formatNumber(record.maxTile)}`;

      const time = document.createElement('time');
      time.className = 'record__date';
      time.dateTime = record.date;
      time.textContent = formatShortDate(record.date);

      item.append(score, tile, time);

      if (index === highlightIndex) {
        const badge = document.createElement('span');
        badge.className = 'record__badge';
        badge.textContent = '새 기록';
        item.append(badge);
      }
      list.append(item);
    });
  }

  function showOverlay(state) {
    const medal = medalFor(state.maxTile);
    elements.overlayScore.textContent = formatNumber(state.score);
    elements.overlayTile.textContent = formatNumber(state.maxTile);
    elements.overlayMedal.textContent = medal ? `${medalTitle(medal)} 메달` : '없음';
    elements.overlay.hidden = false;
  }

  function hideOverlay() {
    elements.overlay.hidden = true;
  }

  function showToast(text) {
    const toast = elements.toast;
    window.clearTimeout(toastTimer);
    toast.textContent = text;
    toast.hidden = false;
    toast.classList.remove('is-visible');
    // 다시 그려야 애니메이션이 재시작된다.
    void toast.offsetWidth;
    toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
      toast.classList.remove('is-visible');
    }, TOAST_MS);
  }

  return {
    sync,
    animateMove,
    finishPending,
    updateScore,
    floatGain,
    updateUndo,
    updateMedals,
    renderRecords,
    showOverlay,
    hideOverlay,
    showToast,
  };
}
