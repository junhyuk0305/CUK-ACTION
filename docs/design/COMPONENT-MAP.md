# 기존 컴포넌트 재사용 계획

> 2026-11-11 재검토: 사용자가 Before의 디자인을 선호했습니다. 기존 After의 화면 구성은 채택 보류입니다. [시각 레퍼런스 재조사](VISUAL-REFERENCES-02.md)를 먼저 확인하고 기존 시안을 확정안으로 적용하지 마세요.
작성일: 2026-11-11. `src` 읽기 전용 조사. 작업 1이 같은 폴더를 수정할 수 있으므로 줄 번호 대신 파일과 식별자를 사용한다. 데이터 형태는 최신 코드에서 다시 확인한다.

상태: 있음=동작 재사용, 일부=동작은 있으나 표현/접근성 보완, 신규=표현 부품만 필요. 모든 표 항목을 별도 파일로 만들라는 뜻은 아니다.

| 설계 요소 | 현재 상태와 위치 | 작업 3 수정 | 보존할 계약 |
|---|---|---|---|
| 디자인 토큰 | 일부 / `src/style.css :root` | 색 2종 수정, control/error bg 추가. 폰트/크기/반응형 통일 | 기존 blue/ink, 호환 클래스 |
| AppShell / 내비게이션 | 있음 / `src/main.jsx`, `style.css`, `student.css` | Sidebar 224px, 여백 32px, 모바일 메뉴 유지 | 역할별 메뉴, menu-backdrop, Escape, dirty 이탈 |
| AccountRoot / AccessScreen | 있음 / `src/Account.jsx`, `account.css` | 글자 크기/상태/역할 구분만 정돈 | 실제 인증 미연동 안내, A/B 분리, 세션 복원 |
| Button / IconButton | 일부 / `.button`, `.icon-button`, `.text-button` 다수 | CSS 변형 통일. 여러 화면이 함께 쓸 때만 작은 JSX wrapper | onClick, type, disabled, aria-label 전달. 기존 테스트 이름 보존 |
| Input / Field | 일부 / Profile, Manager, WorkflowFields | label/error/help id 연결. 기존 native input 유지 | 값, required/min/max, 빈 시각의 의미 |
| Tabs / 필터 | 일부 / main detail-tabs, Manager workspace-tabs | 상세 탭 키보드/ARIA 보완. 필터는 button+aria-pressed | 기존 tab ids, 필터 전체 초기화 |
| Badge / 상태 | 일부 / `.tag`, `.eligibility`, manager-status | 14px와 semantic palette 통일 | 조건/준비/게시/접수 값 분리 |
| SaveStatus | 있음 / `src/useStudentState.js`, main saveLabel/data-status | 상태 위치와 문구 통일. 저장 로직 재작성 금지 | pending/saving/error, flush/retry, 마지막 입력 |
| Empty / Notice | 있음 / main Empty, `.warning`, `.info-note` | 최초 없음/필터 없음/실패 구분, 행동 연결 | 서버 실패를 빈 결과로 바꾸지 않음 |
| ResumeBlock | 일부 / main home hero, active/completed | 장식 히어로를 작업 재개 블록으로 배치 변경 | 기존 next 신청 선택, 후속 경고, 기수 id |
| NoticeRow | 일부 / main NoticeCard, notice-grid | 행 목록 형태를 같은 데이터와 이벤트로 표현 | save/open, 조회/관심 이벤트, noticeKind, eligibility |
| 조건 상세 | 있음 / main selected와 conditions 탭 | 마감/근거/판정의 정보 위계 | ruleResults, confirmed/unknown/fail와 수동 확인 |
| OptionPicker | 있음 / main `.option-picker`, workflow.js | native 선택 또는 키보드 가능한 선택군 | applicationOptions, withOption, 옵션별 id와 마감 |
| 직접 작성 | 있음 / main questions/textarea | 16px 입력, 저장 상태 고정 위치, 오류 연결 | answers, 질문 식별자, 다운로드, 스냅샷 |
| Checklist | 있음 / main prepare/checklist | 완료 수와 실제 제출 안내를 근접 배치 | progress, tasks/checks, 자기보고 gate |
| ChangeNotice | 있음 / main changed-requirements, student.css | 최신 값과 보관본 안내, 확인 컨트롤 정돈 | reviewedRequirements/requirementsKey, 완료 차단 |
| FollowupSteps | 있음 / `src/FollowupSteps.jsx`, workflow.css | 14px 근거, 44px label, 선행/기한 강조 | followupProgress, toggleFollowup, ready/requires |
| Profile Dialog | 일부 / main Profile | focus trap 범위 검토, 배경 inert, 실패 초점 연결 | 저장 전 임시 p, 닫기 복귀, Escape, 가상 프로필 |
| Confirm Dialog | 일부 / window.confirm 및 자기보고 버튼 | 위험 이탈 confirm 유지. 자기보고 설명창은 좁은 범위 추가 | canComplete, dirty/saving 검사 우회 금지 |
| Manager 목록 | 있음 / `src/Manager.jsx` manager-notice | 카드 → 제목/상태/마감 행. 기존 필터/초안 불러오기 유지 | notices/search/statusFilter/categoryFilter/sort |
| Manager 통합 현황 | 있음 / `src/ManagerOverview.jsx`, overview.css | 지표 간격, 차트/비교 우선순위, 대비 | source/period/preset/sort/selectedId, 고유 인원 |
| TrendChart | 있음 / ManagerOverview 내부 | 색/범례/테이블 읽기 개선 | 날짜 선택, 키보드, 데이터 표, null 구간 |
| SelectedNotice | 있음 / overview-notice-detail | 선택 배경/초점, 수정 행동 통일 | 기간, 출처, counts, denominator |
| 공고 Editor | 있음 / Manager.jsx | 단계 제목, 공통 Field, 저장 바 개선 | editorOrigin/editorContext, dirty, saving, reviewed |
| WorkflowFields | 있음 / `src/WorkflowFields.jsx` | 반복 입력과 삭제 이름, 날짜/시각/근거 정돈 | options/followupSteps id와 선행 단계, 새 필드 보존 |
| NoticeMetrics | 있음 / Manager.jsx 내부 | 기간/행동/후속 집계 섹션 구분 | 기존 gateway RPC, 1~4명 비공개, 현재 후속 집계 |
| 모바일 비교표 | 일부 / overview.css/workflow.css | region 이름, focus, scroll 안내. 선택 상세 연결 | 데이터 전체 열 접근, 페이지 overflow 방지 |

## 추출 원칙

첫 적용에서 공통 파일은 `src/ui.jsx` 하나 이내를 권장한다. 2곳 이상 반복되는 Button, Field, StatusBadge, AsyncNotice처럼 단순한 표현만 추출한다. 기존 CSS만으로 충분하면 파일을 만들지 않는다. AppShell, ResumeBlock, NoticeRow, SelectedNotice를 일회성 사용인데도 각각 디렉터리로 분리하지 않는다.

props는 실제 호출부가 요구하는 값으로 한정한다. Button은 native props를 전달한다. Field는 id/label/help/error/children 정도로 시작한다. StatusBadge에 업무 규칙 계산을 넣지 않는다. 범용 DataGrid, 디자인 시스템 레지스트리, 상태관리 라이브러리를 만들지 않는다.

## 바꾸지 않을 계층

- `src/gateway.js`: 로컬/서버 저장, 역할/집계 보호. UI가 직접 저장소를 조작하지 않음.
- `src/useStudentState.js`: 저장 경쟁과 재시도. 시안의 메모리 저장 코드로 대체 금지.
- `src/logic.js`, `src/workflow.js`: 조건, 마감, 준비, 기수, 후속 선후관계.
- fixtures, DB, RPC: 디자인 작업을 위해 정답이나 비공개 기준 수정 금지.

읽기 중 `WorkflowFields.jsx`에 `cu12Institution` 선택이 확인됐다. 작업 1의 새 데이터일 수 있다. 이 필드를 디자인 정리 과정에서 삭제하지 않는다. 실행 전 최신 CORE-VALIDATION-RESULTS와 현재 파일을 대조한다.

## 미리보기와 제품의 차이

미리보기는 plain HTML/CSS/JS이고 기존 업무 모듈을 가져오지 않는다. 두 가상 기수, 일부 문항, 가상 수치는 배치와 상호작용 설명용이다. 전체 공고/알림/프로필/편집 기능을 구현한 대체 앱이 아니다. 디자인 규격과 CSS 값을 참고하고 업무 상태 로직은 제품의 기존 구현을 재사용한다.

시안 담당자 목록은 공고 목록과 일부 지표를 한 표에 놓았다. 작업 3에서는 기존 getManagerOverview 응답을 활용 가능한 통합 비교 화면에 먼저 적용한다. 관리 목록에 집계를 붙이기 위한 새 RPC는 이번 범위에 포함하지 않는다.
