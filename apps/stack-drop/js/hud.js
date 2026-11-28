// DOM 갱신: 점수판, 오버레이(시작/일시정지/게임 오버), 기록 목록, 미리보기 설명 텍스트.
// 동적 값은 모두 textContent로 넣는다(innerHTML 사용 안 함).

const numberFormat = new Intl.NumberFormat('ko-KR');

export function formatNumber(value) {
  return numberFormat.format(value);
}

function $(id) {
  return document.getElementById(id);
}

export function createHud() {
  const el = {
    score: $('score-value'),
    best: $('best-value'),
    level: $('level-value'),
    lines: $('lines-value'),
    pause: $('pause-button'),
    pauseText: $('pause-text'),
    overlay: $('overlay'),
    panels: {
      start: $('panel-start'),
      pause: $('panel-pause'),
      over: $('panel-over'),
    },
    overScore: $('over-score'),
    overLines: $('over-lines'),
    overLevel: $('over-level'),
    overBadge: $('over-badge'),
    records: $('record-list'),
    recordsEmpty: $('records-empty'),
    nextLabel: $('next-label'),
    holdLabel: $('hold-label'),
  };
  const shown = { score: -1, best: -1, level: -1, lines: -1 };

  function setValue(key, value) {
    if (shown[key] === value) return;
    shown[key] = value;
    el[key].textContent = formatNumber(value);
  }

  function setStats({ score, best, level, lines }) {
    setValue('score', score);
    setValue('best', best);
    setValue('level', level);
    setValue('lines', lines);
  }

  // kind: 'start' | 'pause' | 'over' | null
  function showOverlay(kind) {
    Object.entries(el.panels).forEach(([name, panel]) => {
      panel.hidden = name !== kind;
    });
    el.overlay.hidden = kind === null;
    if (kind) el.overlay.setAttribute('aria-labelledby', `${kind}-title`);
  }

  function setGameOver({ score, lines, level, isNewRecord, isNewBest }) {
    el.overScore.textContent = formatNumber(score);
    el.overLines.textContent = formatNumber(lines);
    el.overLevel.textContent = formatNumber(level);
    if (isNewBest) el.overBadge.textContent = '최고 점수 갱신!';
    else if (isNewRecord) el.overBadge.textContent = '새 기록!';
    el.overBadge.hidden = !(isNewBest || isNewRecord);
  }

  function setPauseState(phase) {
    const paused = phase === 'paused';
    const label = paused ? '계속하기' : '일시정지';
    el.pause.setAttribute('aria-label', label);
    el.pause.setAttribute('aria-pressed', String(paused));
    el.pauseText.textContent = label;
    el.pause.disabled = !(phase === 'playing' || phase === 'clearing' || phase === 'paused');
  }

  function renderRecords(records, highlightIndex = -1) {
    el.records.replaceChildren();
    records.forEach((record, i) => {
      const item = document.createElement('li');
      item.className = 'record';
      if (i === highlightIndex) item.classList.add('record--new');

      const score = document.createElement('span');
      score.className = 'record__score';
      score.textContent = `${formatNumber(record.score)}점`;

      const meta = document.createElement('span');
      meta.className = 'record__meta';
      const start = record.startLevel && record.startLevel > 1 ? ` (시작 ${record.startLevel})` : '';
      meta.textContent = `${formatNumber(record.lines)}줄 · 레벨 ${record.level}${start}`;

      const time = document.createElement('time');
      time.className = 'record__date';
      time.dateTime = record.date;
      time.textContent = record.date.replaceAll('-', '.');

      item.append(score, meta, time);
      if (i === highlightIndex) {
        const badge = document.createElement('span');
        badge.className = 'record__badge';
        badge.textContent = '새 기록';
        item.append(badge);
      }
      el.records.append(item);
    });
    el.recordsEmpty.hidden = records.length > 0;
  }

  function setPreviewLabels(nextText, holdText) {
    if (el.nextLabel.textContent !== nextText) el.nextLabel.textContent = nextText;
    if (el.holdLabel.textContent !== holdText) el.holdLabel.textContent = holdText;
  }

  return { setStats, showOverlay, setGameOver, setPauseState, renderRecords, setPreviewLabels };
}
