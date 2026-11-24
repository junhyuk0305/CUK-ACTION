# 작업 3 실행안

> 2026-11-11 재검토: 사용자가 Before의 디자인을 선호했습니다. 기존 After의 화면 구성은 채택 보류입니다. [시각 레퍼런스 재조사](VISUAL-REFERENCES-02.md)를 먼저 확인하고 기존 시안을 확정안으로 적용하지 마세요.
작성일: 2026-11-11. 상태: 조사와 설계 완료. 제품 UI 적용 전.

## 시작점

1. [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)의 토큰과 규격을 적용한다.
2. [USER-FLOWS.md](USER-FLOWS.md)의 상태 보존 계약을 지킨다.
3. [COMPONENT-MAP.md](COMPONENT-MAP.md)로 기존 구현을 찾아 재사용한다.
4. [preview.html](../../_ref/uiux-2026-11-11/preview.html)에서 학생 홈, 준비 상세, 담당자 목록의 Before/After를 확인한다.

기본 선택: Radix 접근성 규격, 기존 React/CSS/lucide 재사용, 추가 패키지 없음. Supabase/AI/카카오/학교 시스템 연결과 배포는 범위 밖이다.

## 동시 작업 확인

착수 시 이미 main, Manager, gateway, style, useStudentState, package.json과 검사 스크립트에 변경이 있었다. 이번 세션은 제품 `src`를 수정하지 않았다.

진행 중 작업 1의 변경이 관찰됐다. `docs/CORE-VALIDATION-RESULTS.md`에 따르면 CU12 학년/학기와 본교/타 대학 과목 제한, 추가 검수 초안, 기숙사 후속 절차가 추가됐다. 작업 3은 최신 코드와 이 결과를 먼저 읽어야 한다. 학기 입력, `cu12Institution`, 추가 조건 표시를 이전 화면으로 덮어쓰지 않는다.

증거: `_ref/uiux-2026-11-11/src-before.json`, `src-concurrent-changes.json`. 이 목록은 같은 폴더의 시간 차이이며 이번 디자인 작업의 수정 목록이 아니다. 다른 세션의 변경은 되돌리지 않았다. 현재 캡처는 디자인 조사 중의 코드 상태이므로 최종 작업 1 버전의 회귀 캡처와 동일하다고 가정하지 않는다.

## 적용 순서와 완료 조건

| 단계 | 수정 대상 | 할 일 | 검증 기준 |
|---|---|---|---|
| 0. 기준선 | 읽기/검사만 | git status, 최신 작업 1 결과, package scripts, 현재 화면 캡처 | 저장 실패, 기수별 작성, 집계 복귀의 현재 동작 기록 |
| 1. 토큰 | style.css | muted/orange 대비, control/error-bg 추가, 타이포와 간격, focus | 실제 렌더 색 대비. 390/1440px. 기존 브랜드 유지 |
| 2. 기본 부품 | style.css, 필요 시 ui.jsx | 버튼 44px, 입력/오류/상태, 탭 키보드. 반복할 때만 추출 | Tab/Shift+Tab/Space/Enter/Arrow/Escape, 오류 필드 연결 |
| 3. 준비 상세 | main.jsx, student.css, workflow.css, FollowupSteps.jsx | 마감/기수 우선, 작업 탭, 체크리스트, 변경 안내, 저장 상태, 후속 | 두 기수 입력 보존, 마감/충돌, 변경 확인 gate, 취소 연쇄 |
| 4. 학생 확장 | main.jsx, student.css, Account.jsx/account.css | 홈 재개 블록, 공고 행 목록, 내 신청/관심/알림/프로필 | 검색 전체 초기화, 보관함 복귀, 프로필 학기 입력, A/B 분리 |
| 5. 담당자 비교 | ManagerOverview.jsx, overview.css | 표 밀도, 선택 상세, 지표와 기간의 근접 배치 | 7일/14일, source, sort, selectedId, 수정 복귀, 비공개 |
| 6. 담당자 운영 | Manager.jsx, manager.css, WorkflowFields.jsx | 관리 목록 행, 편집 단계, 저장 바, 검수와 오류 | dirty 이탈, saving 중복 차단, 게시 내리고 임시저장, 옵션 필드 유지 |
| 7. 통합 검사 | 기존 scripts + 필요한 UI 검사 | 반응형, 키보드, 저장 경쟁, 외부 요청, 회귀 | 아래 검사 전부 통과. 실패를 약한 assertion으로 교체 금지 |

상세 한 화면을 먼저 완성하고 학생 홈과 담당자로 확장한다. 스타일 파일을 한꺼번에 합치거나 폴더 구조를 바꾸지 않는다. 작업마다 diff의 모든 줄이 요청과 연결되는지 확인한다.

## 최소 구현 지침

- CSS: 현재 변수 이름을 우선 유지한다. 컴포넌트별 하드코딩을 해당 토큰으로 치환하되 관련 없는 스타일은 그대로 둔다.
- React: 현재 event handler와 상태 훅을 보존하고 JSX 배치만 옮긴다. 준비 화면 remount로 답변이나 선택 옵션이 초기화되지 않게 한다.
- 상태: gateway/useStudentState 응답으로 저장 성공을 표시한다. 시안의 setTimeout 성공이나 전역 메모리 객체를 가져오지 않는다.
- 목록: 기존 NoticeCard의 open/save/eligibility 계약을 그대로 NoticeRow 형태에 연결한다. 소유자에게 없는 담당자 행동은 렌더하지 않는다.
- 집계: N+1 요청 없이 기존 Overview 데이터로 표를 구성한다. 새 서버 계약이 필요한 관리 목록 통합은 보류하고 기존 집계 보기 경로를 유지한다.
- 폼: 입력을 바꾸면 reviewed=false인 현재 규칙을 보존한다. `type=button`과 submit을 구분한다. id를 행 인덱스가 아닌 안정된 id에서 만든다.
- 프로필: 학년과 학기, 미입력, 직접 확인을 별도로 표시한다. 새로 추가된 필드를 빠뜨리지 않는다.
- 미리보기에는 준비 중 상태를 대표로 넣었다. 제품은 신규/마감/게시 종료/변경/후속 상태를 모두 대응한다.

## 검사 명령과 의미

```powershell
npm test
npm run test:db
npm run build
# 로컬 서버 포트 확인 후
npm run dev
# 다른 터미널에서
npm run test:browser
git diff --check
```

작업 1 결과 문서의 보고값: 규칙 23개, DB 22개, 기존 브라우저 6개와 신규 핵심 검증 1개. **이 디자인 세션에서 해당 전체 검사를 다시 실행한 것은 아니다.** 작업 3은 현재 package.json과 check_browser.py 목록을 기준으로 실행한다.

필수 UI 회귀:

| 시나리오 | 기대 결과 |
|---|---|
| 학생 A 작성 후 B 진입 | B에게 A 작성본 미노출 |
| 기수 1 작성/체크 후 기수 2, 다시 1 | 작성과 체크가 기수별로 그대로 복원 |
| CU12 4학년 2학기, 본교/타 대학 선택 | 최신 작업 1 정답표 유지. 미입력 학기 확인 필요 |
| 마감시각 없음/정확한 경계/자료 충돌 | 기존 규칙과 같은 제한. 날짜 표시만으로 판정 변경 금지 |
| 저장 지연 중 연속 입력, 저장 실패 후 재시도 | 마지막 입력 보존, 거짓 성공 없음, 이탈 방어 |
| 공고 문항/기수/일정 변경 | 기존 작성본 보존, 최신 내용 확인 전 자기보고 제한 |
| 체크리스트 완료와 링크 클릭 | 공식 접수 완료로 표시하지 않음 |
| 후속 선행 단계 취소/기한 변경 | 후행 완료 취소 또는 재확인 |
| 게시 종료/옵션 삭제 | 기존 작성본 보관 접근 가능 |
| 담당자 7일 집계 → 정렬 → 선택 → 수정 → 저장 → 복귀 | source/period/sort/selectedId/scroll/focus 복원 |
| 0명, 1~4명, 5명, 미연동 | 각각 0명/비공개/5명/미연동. 표와 tooltip 일치 |
| 320/390/1440px, 200% 확대 | 페이지 가로 넘침 없음. 표 내부 스크롤 가능 |
| 키보드와 reduced-motion | 순서와 초점 복귀, 탭 화살표, 대화상자 trap, 동작 감소 |
| 가상 흐름 전체 | 외부 런타임 요청 0, pageerror 0 |

접근성 추가 확인: NVDA 또는 동등한 화면 읽기 도구로 Dialog 제목, 오류 필드, 상태 변경, 표 열/행 이름을 실제 확인한다. 이 세션에서는 화면 읽기 도구 검사를 수행하지 않았다.

## 이번 세션의 미리보기 검증

재실행:

```powershell
python _ref/uiux-2026-11-11/verify_preview.py
```

로컬 파일 직접 실행 지원: `_ref/uiux-2026-11-11/preview.html`. CSS/JS/Before 캡처는 상대 파일로 포함하며 외부 폰트와 CDN이 없다. 폴더를 함께 보관한다. 앱에서 HTTP 미리보기를 원하면 아래 명령을 실행한다.

```powershell
python -m http.server 4174 --bind 127.0.0.1 --directory _ref/uiux-2026-11-11
```

주소: `http://127.0.0.1:4174/preview.html`. 서버가 실행 중일 때만 유효하다. 기존 제품 dev 서버와 별도 포트를 사용한다.

검사 범위: 홈/준비/담당자/컴포넌트 4화면 × 320/390/1440px. 검색 빈 결과/초기화, 체크리스트 gate, 대화상자 Escape/확인, 후속 취소, 기수별 작성본, 탭 화살표, 담당자 수정 후 필터 복귀, 저장 재시도 상태, Before 이미지 로딩. [결과 JSON](../../_ref/uiux-2026-11-11/verification.json)에 실제 측정값 기록.

한계: 시안은 완전한 SaaS가 아니다. 서버 저장/인증/외부 제출/실제 집계는 구현하지 않았다. 가상 수치의 기간 변경은 맥락 유지 시연이며 재집계를 하지 않는다. 담당자 간단 편집은 제목 반영만 시연한다. 모든 업무 규칙은 제품에서 회귀 검증해야 한다.

## 인계 산출물

- 조사와 선택 근거: RESEARCH.md
- 토큰/컴포넌트 정본: DESIGN-SYSTEM.md
- 화면별 우선순위와 상태 전환: USER-FLOWS.md
- 기존 코드 대조: COMPONENT-MAP.md
- 파일별 실행안: 이 문서
- 별도 시안: preview.html, app.html, design.css, design.js
- 증거: Before/After PNG, GitHub/npm snapshot, current-observations.json, verification.json
- 실행 스크립트: inspect_current.py, inspect_references.py, verify_preview.py

미결 선택: 제품 적용을 막는 필수 선택 없음. 추가 UI 패키지와 유료 라이선스는 채택하지 않는다. 실제 사용자 효과와 화면 읽기 도구 평가는 작업 3 이후 검증한다.
