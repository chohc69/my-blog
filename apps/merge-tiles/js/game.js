// 순수 게임 로직. DOM에 접근하지 않으며 Node에서도 단독으로 검증할 수 있다.
// 상태는 직렬화 가능한 순수 객체이고, 모든 함수는 입력 상태를 바꾸지 않고 새 상태를 돌려준다.

export const SIZE = 4;
export const DIRECTIONS = ['left', 'right', 'up', 'down'];
export const RECORD_LIMIT = 5;

// 메달 단계 (최고 타일 기준). 1024를 넘으면 값이 두 배가 될 때마다 마스터 별이 하나씩 늘어난다.
export const MEDALS = [
  { key: 'bronze', name: '브론즈', short: '동', tile: 128 },
  { key: 'silver', name: '실버', short: '은', tile: 256 },
  { key: 'gold', name: '골드', short: '금', tile: 512 },
  { key: 'platinum', name: '플래티넘', short: '백금', tile: 1024 },
];

const MASTER_MIN_TILE = 2048;

function emptyCells(size) {
  return new Array(size * size).fill(null);
}

function emptyIndices(cells) {
  const result = [];
  cells.forEach((cell, index) => {
    if (!cell) result.push(index);
  });
  return result;
}

function maxValue(cells) {
  return cells.reduce((max, cell) => (cell && cell.value > max ? cell.value : max), 0);
}

// 빈 칸 하나에 새 타일(2: 90%, 4: 10%)을 놓는다. 빈 칸이 없으면 상태를 그대로 돌려준다.
export function spawn(state, rng = Math.random) {
  const empties = emptyIndices(state.cells);
  if (empties.length === 0) return { state, spawned: null };

  const index = empties[Math.min(empties.length - 1, Math.floor(rng() * empties.length))];
  const value = rng() < 0.9 ? 2 : 4;
  const tile = { id: state.nextId, value };
  const cells = state.cells.slice();
  cells[index] = tile;

  return {
    state: { ...state, cells, nextId: state.nextId + 1, maxTile: Math.max(state.maxTile, value) },
    spawned: { id: tile.id, index, value },
  };
}

// 새 게임: 빈 판 + 타일 2개.
export function createGame(rng = Math.random, now = new Date()) {
  let state = {
    size: SIZE,
    cells: emptyCells(SIZE),
    score: 0,
    maxTile: 0,
    undoLeft: 1,
    over: false,
    nextId: 1,
    startedAt: now.toISOString(),
  };
  state = spawn(state, rng).state;
  state = spawn(state, rng).state;
  return state;
}

// 이동 방향 쪽이 앞이 되도록 각 라인의 셀 인덱스를 만든다. 이 변환 하나로 4방향을 처리한다.
export function lineIndices(direction, size = SIZE) {
  const lines = [];
  for (let a = 0; a < size; a += 1) {
    const line = [];
    for (let b = 0; b < size; b += 1) {
      const reversed = size - 1 - b;
      if (direction === 'left') line.push(a * size + b);
      else if (direction === 'right') line.push(a * size + reversed);
      else if (direction === 'up') line.push(b * size + a);
      else if (direction === 'down') line.push(reversed * size + a);
    }
    lines.push(line);
  }
  return lines;
}

// 빈 칸이 없고, 오른쪽·아래 이웃과 같은 값도 없으면 게임 오버.
export function isGameOver(cells, size = SIZE) {
  if (cells.some((cell) => !cell)) return false;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const value = cells[row * size + col].value;
      if (col + 1 < size && cells[row * size + col + 1].value === value) return false;
      if (row + 1 < size && cells[(row + 1) * size + col].value === value) return false;
    }
  }
  return true;
}

function sameLayout(a, b) {
  return a.every((cell, index) => (cell ? cell.id : null) === (b[index] ? b[index].id : null));
}

function unchanged(state) {
  return { state, moved: false, gained: 0, moves: [], merges: [], spawned: null };
}

// 한 방향으로 민다. 합쳐져 생긴 타일은 같은 이동에서 다시 합쳐지지 않는다.
// moves/merges의 위치는 모두 cells 인덱스(row * size + col)다.
export function move(state, direction, rng = Math.random) {
  if (state.over || !DIRECTIONS.includes(direction)) return unchanged(state);

  const cells = emptyCells(state.size);
  const moves = [];
  const merges = [];
  let nextId = state.nextId;
  let gained = 0;

  for (const line of lineIndices(direction, state.size)) {
    let target = 0;
    let lastMergeable = null;

    for (const from of line) {
      const tile = state.cells[from];
      if (!tile) continue;

      if (lastMergeable && lastMergeable.value === tile.value) {
        const to = line[target - 1];
        const value = tile.value * 2;
        const newId = nextId;
        nextId += 1;
        cells[to] = { id: newId, value };
        // 흡수되는 타일도 목적지까지 미끄러진 뒤 사라진다.
        moves.push({ id: tile.id, from, to });
        merges.push({ from: [lastMergeable.id, tile.id], to, newId, value });
        gained += value;
        lastMergeable = null;
      } else {
        const to = line[target];
        cells[to] = tile;
        moves.push({ id: tile.id, from, to });
        lastMergeable = tile;
        target += 1;
      }
    }
  }

  if (sameLayout(cells, state.cells)) return unchanged(state);

  const moved = {
    ...state,
    cells,
    nextId,
    score: state.score + gained,
    maxTile: Math.max(state.maxTile, maxValue(cells)),
  };
  const { state: spawnedState, spawned } = spawn(moved, rng);
  const next = { ...spawnedState, over: isGameOver(spawnedState.cells, spawnedState.size) };

  return { state: next, moved: true, gained, moves, merges, spawned };
}

// 최고 타일에 해당하는 메달. 128 미만이면 null.
// level: 1(브론즈) ~ 4(플래티넘), 5 이상은 마스터(stars = level - 4).
export function medalFor(maxTile) {
  if (!Number.isFinite(maxTile) || maxTile < MEDALS[0].tile) return null;
  const exponent = Math.floor(Math.log2(maxTile));
  if (maxTile >= MASTER_MIN_TILE) {
    const stars = exponent - 10;
    return { level: 4 + stars, key: 'master', name: '마스터', short: '★'.repeat(stars), stars };
  }
  const medal = MEDALS[exponent - 7];
  return { level: exponent - 6, key: medal.key, name: medal.name, short: medal.short, stars: 0 };
}

export function medalTitle(medal) {
  if (!medal) return '';
  return medal.key === 'master' ? `마스터 ${'★'.repeat(medal.stars)}` : medal.name;
}

// 기록을 추가하고 점수 내림차순으로 정렬해 상위 limit개만 남긴다.
// 같은 점수면 먼저 세운 기록이 위에 온다. index는 새 기록의 순위(목록에 못 들면 -1).
export function addRecord(records, record, limit = RECORD_LIMIT) {
  const list = records.slice();
  let index = list.findIndex((item) => item.score < record.score);
  if (index === -1) index = list.length;
  list.splice(index, 0, record);
  const trimmed = list.slice(0, limit);
  return { records: trimmed, index: index < limit ? index : -1 };
}

export function toDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isPowerOfTwo(value) {
  return Number.isInteger(value) && value >= 2 && (value & (value - 1)) === 0;
}

function isNonNegativeInt(value) {
  return Number.isInteger(value) && value >= 0;
}

export function isValidRecord(record) {
  return Boolean(record)
    && typeof record === 'object'
    && isNonNegativeInt(record.score)
    && isPowerOfTwo(record.maxTile)
    && typeof record.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(record.date);
}

// 저장소에서 읽은 상태가 올바른 형식인지 검사한다.
export function isValidState(state) {
  if (!state || typeof state !== 'object') return false;
  if (state.size !== SIZE || !Array.isArray(state.cells) || state.cells.length !== SIZE * SIZE) return false;
  if (!isNonNegativeInt(state.score) || !isNonNegativeInt(state.undoLeft) || state.undoLeft > 1) return false;
  if (!isNonNegativeInt(state.nextId) || typeof state.over !== 'boolean') return false;
  if (typeof state.startedAt !== 'string') return false;

  const ids = new Set();
  for (const cell of state.cells) {
    if (cell === null) continue;
    if (!cell || typeof cell !== 'object' || !isNonNegativeInt(cell.id) || !isPowerOfTwo(cell.value)) return false;
    if (cell.id >= state.nextId || ids.has(cell.id)) return false;
    ids.add(cell.id);
  }
  return isNonNegativeInt(state.maxTile) && state.maxTile >= maxValue(state.cells);
}
