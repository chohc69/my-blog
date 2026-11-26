// 해시 기반 라우터. '#/'로 시작하는 해시만 라우트로 취급하고,
// '#heading-id' 같은 문서 내 앵커는 무시한다.

export function createRouter(routes, notFound) {
  function resolve(path) {
    for (const { pattern, handler } of routes) {
      const match = path.match(pattern);
      if (!match) continue;

      let params;
      try {
        params = match.slice(1).map(decodeURIComponent);
      } catch {
        break; // 잘못된 URL 인코딩
      }
      handler(...params);
      return;
    }
    notFound();
  }

  function currentPath() {
    const { hash } = window.location;
    return hash.startsWith('#/') ? hash.slice(1) : null;
  }

  window.addEventListener('hashchange', () => {
    const path = currentPath();
    if (path !== null) resolve(path);
  });

  return {
    start() {
      resolve(currentPath() ?? '/');
    },
  };
}
