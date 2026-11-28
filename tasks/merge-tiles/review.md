# Review 서브에이전트 지침 — 머지 타일 (merge-tiles)

## 역할
너는 **Review 단계** 담당이다. Build 단계와 독립적으로 `apps/merge-tiles/`의 구현이
승인된 기획서 `apps/merge-tiles/spec.md`대로 동작하는지 검증한다.

## 수정 범위
- 생성: `apps/merge-tiles/review.md` (검증 보고서)
- 문제를 발견하면 `apps/merge-tiles/` 안의 코드(spec.md 제외)만 수정할 수 있다.
- 그 밖의 파일(루트 `index.html`, `css/`, `js/`, `posts/`, `CLAUDE.md`, `tasks/`)은 수정 금지. 커밋 금지.

## 검증 방법
1. **코드 리뷰**: `apps/merge-tiles/` 전체를 읽고 버그, spec 불일치, 보안(innerHTML에 이스케이프되지 않은 값, postMessage 오리진 검증), localStorage try/catch, 메모리/이벤트 누수, UI 문구에 "2048"이 나오는지 확인한다.
2. **브라우저 검증**: 내장 브라우저(`mcp__Claude_Browser__*`)를 쓴다. 로컬 서버는 저장소 루트에서
   `python -m http.server 8000`을 백그라운드로 실행해 `http://localhost:8000/apps/merge-tiles/`를 연다. 끝나면 서버를 종료한다.
   - 콘솔 오류 0건
   - 방향키·WASD로 이동/합치기, 점수·최고 점수 갱신, 새 게임, 되돌리기 1회, 새로고침 후 이어하기
   - 게임 오버 표시 (필요하면 localStorage 상태 주입으로 재현)
   - 라이트/다크 모드, 375px·320px·데스크톱 폭, 가로 스크롤 없음
   - `?embed=1`, `?theme=dark` 동작
   - 마우스 드래그로 스와이프 동작 확인 (가능 범위)
   - Build 보고의 "확인 못 한 항목": `prefers-reduced-motion`, 320px 폭 — 가능한 범위에서 확인
3. 블로그 본체(`http://localhost:8000/`)도 한 번 열어 앱 추가로 깨진 것이 없는지 확인한다.
4. 테스트 중 넣은 localStorage 값은 끝나면 정리한다 (`theme` 키는 원래 값을 기록해 두었다가 복원).

## review.md 형식
- 요약 (통과/조건부 통과/실패)
- 항목별 체크리스트 결과 (spec 9장 기준) — 통과/실패/미확인
- 발견한 문제와 조치 (수정했으면 파일·내용, 못 고쳤으면 이유)
- 남은 한계

## 완료 보고 (한국어)
결론, 고친 문제 목록, 미확인 항목을 짧게 보고한다. 스크린샷이 있다면 어떤 화면을 확인했는지 적는다.
