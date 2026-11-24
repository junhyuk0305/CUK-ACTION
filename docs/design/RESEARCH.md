# CUK ACTION 디자인 조사

확인일: 2026-11-11 KST. 범위: 공개 GitHub, 패키지 메타데이터, 공식 문서, 공개 제품 화면, 로컬 앱 조작.

## 결정

주된 UI 기준: **Radix Primitives의 접근성 동작 규격**. 제품 스타일은 CUK ACTION의 남색과 기존 간격 단계를 계승한다. 작업 3의 기본안은 새 UI 패키지 없이 기존 React, CSS, lucide-react를 재사용한다. Radix 코드를 복제한 구현이라는 뜻은 아니다.

이유: 앱에는 이미 저장, 준비, 기수 선택, 게시 검수, 집계 복귀가 구현돼 있다. 새 라이브러리의 화면 모델에 맞춰 바꾸면 검증된 상태 연결을 다시 확인해야 한다. 현재 문제는 기능 부족보다 글자 크기, 대비, 정보 위치, 목록 밀도에 가깝다. Dialog와 Tabs의 키보드 규격을 명확히 정하고 기존 구현이 그 규격을 충족하는지 먼저 검사한다.

추가 패키지 도입 조건: 기존 프로필 대화상자에서 초점 순환, Escape, 배경 비활성화, 초점 복귀를 안정적으로 구현하지 못할 때만 `@radix-ui/react-dialog`를 개별 검토한다. 스타일 체계와 상태관리를 함께 교체하지 않는다.

## GitHub 비교

다음 숫자는 조사 시점 GitHub API 응답이다. 인기도는 생태계 규모의 참고값이다. 품질 점수나 최신 인기 순위로 해석하지 않는다. 원본은 [github-snapshot.json](../../_ref/uiux-2026-11-11/github-snapshot.json).

| 프로젝트 | Stars | 최근 push UTC | 확인한 릴리스 | 라이선스 | 유지보수 판단 |
|---|---:|---|---|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | 127,823 | 11.10 | shadcn CLI 4.23.0 / 10.27 | MIT | 저장소 활성. CLI 버전과 복사한 컴포넌트 버전 구분 필요 |
| [Radix Primitives](https://github.com/radix-ui/primitives) | 19,490 | 10.14 | latest release API 값 없음 | MIT | 저장소 활성. 공식 릴리스 문서와 개별 npm 패키지로 확인 |
| [Material UI](https://github.com/mui/material-ui) | 99,314 | 11.10 | 9.5.0 / 10.09 | MIT | 저장소 활성. 주요 버전 이행 정책 제공 |
| [Ant Design](https://github.com/ant-design/ant-design) | 100,142 | 11.10 | 6.7.0 / 11.04 | MIT | 저장소 활성. 변경 이력과 디자인 토큰 문서 제공 |
| [Mantine](https://github.com/mantinedev/mantine) | 31,929 | 11.09 | 9.8.0 / 11.09 | MIT | 저장소 활성. 버전별 이행 문서 제공 |

모두 archived=false. 최근 push는 지원 보장이나 보안 감사를 뜻하지 않는다. 코드 도입 때는 실제 설치 버전의 LICENSE와 종속 패키지를 다시 확인하고 저작권 고지를 보존한다. 템플릿 구매나 유료 코드 복제는 하지 않았다.

## 도입 적합성

현재 `package.json`: React `^19.0.0`, Vite `^6.0.0`, lucide-react. 조사 시 lockfile은 React/React DOM **19.3.1**. 의존성 원본은 [npm-snapshot.json](../../_ref/uiux-2026-11-11/npm-snapshot.json). 호환 범위 확인과 실제 설치 검증은 별개다. 후보 패키지는 설치하지 않았다.

| 후보 | 접근성 근거와 남는 책임 | 범위 | 의존성과 React 호환 | CUK 도입 비용 판단 |
|---|---|---|---|---|
| shadcn/ui | 접근 가능한 컴포넌트와 개방된 코드. 수정 후 품질은 앱이 책임 | 기본 입력, 표, Sidebar, 차트 조합 예제 | CLI는 런타임 UI 패키지가 아님. 선택 레지스트리의 primitive와 Tailwind 설정 확인 필요. 공식 React 19 안내 존재 | 높음. 기존 CSS와 중복 체계, 복사 코드의 업데이트 추적 필요. 전체 채택 제외 |
| Radix | WAI-ARIA 패턴, 초점 관리, 키보드 이동을 공식 설명. 레이블과 대비는 앱 책임 | Dialog, Tabs, Select 등 저수준 상호작용. 업무 표와 날짜 흐름은 직접 구성 | Dialog 1.3.1, Tabs 1.2.1 peer React 16.8~19 범위. 스타일 엔진 강제 없음. 개별 패키지도 내부 종속성 있음 | 규격만 적용 시 낮음. 패키지 추가는 필요한 부품에 한정. 주 기준 채택 |
| MUI | 공식 접근성 안내와 컴포넌트 API. 조합한 화면의 실제 보조기술 검증 필요 | 폼, 테이블, 레이아웃. 고급 데이터 도구는 MUI X | 9.5.0 React 17/18/19. 기본 설치는 Emotion 2종 포함 | 높음. ThemeProvider와 스타일 우선순위, Material 기본 형태 재조정. 전체 채택 제외 |
| Ant Design | Modal의 키보드와 초점 옵션, Semantic DOM 명세. 모든 표 동작의 접근성을 일괄 보장하지 않음 | 운영 폼, Table, DatePicker, Upload 등 | 6.7.0 peer React >=18. rc 계열과 날짜 관련 의존성 포함 | 담당자 화면엔 적합하나 학생까지 교체하면 비용 높음. 현재 규모에서 제외 |
| Mantine | Modal의 focus trap과 복귀 동작 명시. 실제 레이블과 오류 연결 확인 필요 | AppShell, 입력, 폼, 날짜와 확장 도구 | 9.8.0 peer React ^19.2.0와 hooks 9.8.0. 현재 lockfile 19.3.1은 범위 내. package.json 하한 19.0.0만 보고 호환 판단하면 안 됨 | 중~높음. Provider, 전역 CSS, hooks 버전 정렬과 기존 CSS 이행 필요. 신규 앱 대안으로 보류 |

비용은 라이선스 비용과 개발 비용을 분리했다. 다섯 후보의 확인한 오픈소스 코어는 MIT다. [MUI X](https://mui.com/x/introduction/licensing/)의 고급 기능은 상용 라이선스가 포함될 수 있다. 이 설계에는 유료 기능이 필요하지 않다. 개발 비용 등급은 현재 코드에서의 상대 추정이다. 벤치마크, 설치 크기, 이행 인일을 실측한 결과가 아니다.

공식 문서:

- [shadcn 소개](https://ui.shadcn.com/docs), [React 19 안내](https://ui.shadcn.com/docs/changelog/2024-10-react-19)
- [Radix 접근성](https://www.radix-ui.com/primitives/docs/overview/accessibility), [Dialog](https://www.radix-ui.com/primitives/docs/components/dialog), [Tabs](https://www.radix-ui.com/primitives/docs/components/tabs), [릴리스](https://www.radix-ui.com/primitives/docs/overview/releases)
- [MUI 설치와 peer 범위](https://mui.com/material-ui/getting-started/installation/), [버전 정책](https://mui.com/material-ui/getting-started/versions/)
- [Ant Design 소개](https://ant.design/docs/react/introduce/), [Modal](https://ant.design/components/modal/)
- [Mantine 시작](https://mantine.dev/getting-started/), [Modal](https://mantine.dev/core/modal/)

## 실제 SaaS 흐름과 화면

라이브러리 데모와 아래 제품 조사는 구분한다. 로그인 뒤 운영 데이터를 조작하지 않았다. 공개 가이드의 실제 제품 캡처와 공개 신청 포털을 확인했다. 공식 가이드 캡처가 현재 모든 계정의 화면과 같다는 보장은 없다.

| 제품 / 확인 범위 | 관찰한 흐름과 화면 | CUK에 적용 | 제외 |
|---|---|---|---|
| Submittable / 공식 Program Insights 문서와 화면 이미지 | Data Portal → Program Insights → Project 선택. 문서의 프로젝트 드롭다운, 지표 영역, 돌아가는 메뉴 확인 | 집계 범위를 먼저 고른 뒤 수치 해석. 공고 제목과 분모를 상세에 유지 | 자격별 개인 분석, 작성 필드별 분석. CUK에서는 개인정보 노출 위험과 집계 목적 불일치 |
| Airtable / 공식 Interface Designer 가이드의 제품 캡처 | Dashboard 선택 → 원본 테이블 지정 → 지표/차트/목록 구성 → 미리보기. Grid와 오른쪽 설정 패널 확인 | 고정된 열로 공고 비교. 선택한 공고를 별도 상세로 연결. 한 페이지에 모든 설명을 늘어놓지 않음 | 범용 대시보드 편집기, 차트 빌더, 임의 열 구성 |
| SurveyMonkey Apply / 공개 운영 포털과 공식 FAQ | Baumberger Endowment 포털의 Programs → MORE → 프로그램 상세 직접 이동. 검색, 모집 기간, 상세 정보 확인. 신청은 하지 않음 | 탐색 목록의 마감과 조건 → 상세 → 준비 진입. 입력 작업 완료와 실제 제출 구분 | 로그인 뒤 제출 완료나 선정 상태를 직접 확인했다고 주장하지 않음. CUK 자기보고를 공식 접수로 표시하지 않음 |

출처와 로컬 증거:

- [Submittable Program Insights](https://submittable.help/en/articles/10139823-program-insights), [제품 화면](../../_ref/uiux-2026-11-11/reference-submittable-image-5.png). 캡처는 Data Portal 메뉴와 Project 선택 영역. 전체 대시보드 조작은 미실시.
- [Airtable 가이드](https://www.airtable.com/guides/collaborate/interface-designer-dashboards), [Grid 제품 화면](../../_ref/uiux-2026-11-11/reference-airtable-image-7.png). 첫 캡처는 지연 로딩 이미지 누락. 스크롤로 로딩 후 다시 확인.
- [Apply 공개 운영 포털](https://baumbergerendowment.smapply.io/), [목록 캡처](../../_ref/uiux-2026-11-11/reference-apply-live-list.png), [상세 캡처](../../_ref/uiux-2026-11-11/reference-apply-live-detail.png), [신청 FAQ](https://help.surveymonkey.com/en/apply/faqs/application-faq/), [운영 목록 문서](https://help.surveymonkey.com/en/apply/monitor/manage-apps/).
- [Apply 보고서](https://help.surveymonkey.com/en/apply/analyze/program-reports/)도 재확인. 프로그램별 보고서 필터 참고. [온디맨드 데모](https://apply.surveymonkey.com/apply-demo/)는 연락처 제출을 요구해 진행하지 않음.

제품 색, 폰트, 아이콘, 코드를 복제하지 않았다. 캡처는 내부 조사 증거이며 제품 자산으로 넣지 않는다.

## 로컬 앱 실제 사용

별도의 Playwright 브라우저 컨텍스트에서 가상 계정 사용. 사용자의 브라우저 저장소에는 접근하지 않았다. 앱 외부 요청은 차단했다. [재현 스크립트](../../_ref/uiux-2026-11-11/inspect_current.py), [관찰값](../../_ref/uiux-2026-11-11/current-observations.json).

1. 학생 A 진입 → 공고 검색 → 학생 프로젝트 선택 → 준비 시작 → 직접 작성 → 저장 확인 → 체크리스트 1개 선택.
2. 390px에서 준비 화면 확인 → 메뉴로 홈 복귀.
3. 담당자 A 진입 → 최근 7일 → 준비 시작 기준 비교 → 공고 선택 → 수정 화면 → 복귀. 기간, 정렬, 선택 공고 보존 확인.
4. 담당자 공고 관리 목록을 1440px와 390px에서 확인.

| 관찰 | 설계 변경 | 보존 |
|---|---|---|
| 홈 첫 공고 메타 y=1319.23px, 10px 글자. 히어로 y=365px, 높이 253.44px | 진행 중인 준비 1건을 상단에 배치. 탐색 필터를 단일 묶음으로 축소. 보조 텍스트 14px | 상황별 묶음, 데이터 출처, 전체 탐색은 접힘/전용 화면으로 접근 유지 |
| 학생 설명 11px, 보조색 #788296 | 본문 16px, 보조 14px, 보조색 #56647a | 브랜드 #0c2e86과 #14254b |
| 준비 상세에서 체크리스트와 접수 안내가 긴 설명 아래에 위치 | 제목 아래 마감/기수, 작업 탭, 체크리스트와 실제 제출 구분 | 기수별 저장, 근거, 직접 작성, 자기보고 조건 |
| 담당자 8개 공고가 큰 카드로 세로 나열 | 제목/상태/마감을 행으로 비교. 수치 선택 상세와 수정 연결 | 집계 기간, 분모, 소수 비공개, 수정 후 복귀 |

표시 위치 비교는 첫 화면 상태가 다른 대표 시안 간 측정이다. 시간 단축, 전환율, 사용자 만족도 개선을 검증한 실험이 아니다.

## 간격 기준

새 외부 사이트에서 간격을 추출하지 않았다. 기존 승인 기준인 [_ref/간격카드_2026-11-10.md](../../_ref/간격카드_2026-11-10.md)의 8/16/24/32/48/64px 단계를 계승한다. 원본은 학생 시안의 추정값이다. 이번 세션의 DOM 측정으로 현재 앱의 24px 카드 안쪽과 32px 히어로 안쪽을 확인했다. 이를 외부 SaaS의 Dembrandt 실측값으로 표현하지 않는다.

공식 접근성 기준: [일반 텍스트 대비 4.5:1](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [24px 타깃 최소와 예외](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). CUK의 주 버튼과 입력은 사용 편의를 위해 더 큰 44px 이상으로 설계한다.
