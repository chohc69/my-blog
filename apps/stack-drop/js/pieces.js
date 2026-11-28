// 4칸 조각 7종의 모양 데이터와 회전 보정(벽 차기) 후보.
// 조각 id(I, O, T, S, Z, J, L)는 코드 내부 식별자로만 쓰고 화면에는 표시하지 않는다.
// DOM 의존 없음 → Node에서 단독 테스트 가능.

export const COLS = 10;
export const ROWS = 22;          // 보이는 20줄 + 위쪽 버퍼 2줄
export const HIDDEN_ROWS = 2;
export const VISIBLE_ROWS = ROWS - HIDDEN_ROWS;

export const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// 생성 방향(회전 0) 셀 목록 [x, y]. 좌표는 회전 상자 왼쪽 위 기준.
// 일자 조각은 4×4 상자의 둘째 줄에 둔다(생성 후 1칸 내려오면 보이는 영역 첫 줄에 나타남).
const DEFS = {
  I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};

// 시계 방향 회전: (x, y) → (n − 1 − y, x)
export function rotateCellsCw(cells, size) {
  return cells.map(([x, y]) => [size - 1 - y, x]);
}

function buildRotations(def) {
  if (def.size === 2) return [def.cells];
  const states = [def.cells];
  for (let i = 1; i < 4; i += 1) {
    states.push(rotateCellsCw(states[i - 1], def.size));
  }
  return states;
}

// SHAPES[type][rot] = [[x, y] × 4]
export const SHAPES = Object.freeze(Object.fromEntries(
  TYPES.map((type) => [type, buildRotations(DEFS[type])]),
));

export function pieceSize(type) {
  return DEFS[type].size;
}

export function rotationCount(type) {
  return SHAPES[type].length;
}

// 색 인덱스(1~7). 0은 빈칸.
export function typeIndex(type) {
  return TYPES.indexOf(type) + 1;
}

// 회전 보정 후보 (dx, dy). dy 음수 = 위로. 제자리 → 좌우 → 위로 순서.
const KICKS_STANDARD_CW = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]];
const KICKS_LONG_CW = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]];

// 반시계 회전은 같은 표에서 좌우를 뒤집는다(회전 방향 쪽으로 먼저 밀려남).
function mirror(kicks) {
  return kicks.map(([dx, dy]) => [dx === 0 ? 0 : -dx, dy]);
}

const KICKS = {
  standard: { cw: KICKS_STANDARD_CW, ccw: mirror(KICKS_STANDARD_CW) },
  long: { cw: KICKS_LONG_CW, ccw: mirror(KICKS_LONG_CW) },
};

// dir: 1 = 시계, -1 = 반시계
export function kickCandidates(type, dir) {
  if (type === 'O') return [];
  const table = type === 'I' ? KICKS.long : KICKS.standard;
  return dir === 1 ? table.cw : table.ccw;
}

// 스크린리더용 모양 설명 (알파벳 id를 화면에 노출하지 않기 위함)
export const SHAPE_NAMES = {
  I: '일자 막대',
  O: '네모',
  T: 'ㅗ 모양',
  S: '오른쪽으로 오르는 계단',
  Z: '왼쪽으로 오르는 계단',
  J: '왼쪽 갈고리',
  L: '오른쪽 갈고리',
};
