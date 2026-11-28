// 7개 주머니 생성기: 7종을 섞어 순서대로 꺼내고, 비면 다시 채운다.
// rng를 주입할 수 있어 테스트에서 순서를 재현할 수 있다.

import { TYPES } from './pieces.js';

export function shuffle(items, rng = Math.random) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

export function createBag(rng = Math.random) {
  let bag = [];
  return {
    next() {
      if (bag.length === 0) bag = shuffle(TYPES, rng);
      return bag.pop();
    },
  };
}

// 테스트용 고정 rng (mulberry32)
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
