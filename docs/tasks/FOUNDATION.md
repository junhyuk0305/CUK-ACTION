# 기반 작업 지시문

너는 CUK Action의 공통 기반을 만든다. 오늘 밤 두 세션이 이 기반 위에서 동시에 작업한다. 한 세션은 담당자 쪽, 한 세션은 학생 쪽이다. 기반이 틀리면 두 세션이 밤새 어긋난다. 그래서 이 작업만은 전체 테스트로 확인한다.

마감은 오늘 23시 30분이다. 사용자는 자정까지 깨어 있다. 약속 문서로 풀 수 없는 문제만 묻고, 나머지는 스스로 정해 진행한다.

## 먼저 읽을 것

1. `docs/CONTRACT.md`. 만들 것의 모양이 전부 여기 있다. 이 문서가 기준이다.
2. `../자료/CUK Action 구현 계획.md`의 "자정 전: 공통 기반", "파일 소유".
3. `docs/tasks/NIGHT-manager.md`, `docs/tasks/NIGHT-student.md`. 기반을 쓸 두 세션의 지시문이다. 이들이 기대하는 파일 이름과 맞춰야 한다.
4. `supabase/migrations/202611240005_open_notices.sql`. 지금의 게시 검사 함수 `validate_notice`다.
5. `scripts/test-db.mjs`의 앞 40줄과 `supabase/tests/bootstrap.sql`. 로컬 DB 테스트 방식이다.
6. `src/logic.js`. 자격 판정 함수 `evaluate`다.

## 상황

- 대회 제출용 프로젝트다. 실제 사용자는 없다.
- 운영 DB에는 공고 683건이 있다. 이 데이터의 모양은 바꾸지 않는다. 새 게시 검사는 기존 공고를 그대로 통과시켜야 한다.
- 작업 폴더는 `cuk-action-web`이고 브랜치는 `main`이다.

## 규칙

- 운영 DB에 접속하지 않는다. 배포하지 않는다. push하지 않는다.
- 마이그레이션은 추가만 한다. 기존 테이블의 줄을 고치거나 지우는 문장을 쓰지 않는다.
- 기존 테스트를 고치거나 지우지 않는다. 기존 테스트는 전부 그대로 통과해야 한다.
- `src/backend.js`, `src/gateway.js`, `src/logic.js`, `src/main.jsx`, `src/Manager.jsx`는 고치지 않는다.
- `docs/CONTRACT.md`대로 만들 수 없는 부분이 나오면 문서를 고치고, 고친 내용을 마지막 보고에 적는다. 조용히 다르게 만들지 않는다.
- 요청하지 않은 기능을 넣지 않는다. 두 세션이 만들 함수와 화면은 만들지 않는다.
- 커밋 메시지는 영어 한 줄로 쓴다. 마지막 줄에 사용 중인 도구의 공동 작성자 표기를 붙인다.

## 작업

### F0. 브랜치

- `main`에서 `feat/foundation-1126` 브랜치를 만든다.
- `docs/CONTRACT.md`, `docs/tasks/NIGHT-manager.md`, `docs/tasks/NIGHT-student.md`, `docs/tasks/FOUNDATION.md`는 아직 커밋되지 않았다. 기반 커밋에 함께 넣는다.

### F1. 기반 마이그레이션

파일: `supabase/migrations/202611260001_foundation.sql`. `begin;`과 `commit;`으로 감싼다.

**새 테이블.** `CONTRACT.md` 4절의 칸대로 만든다.

| 테이블 | 제약 | 읽기 정책 | 로그인 사용자 권한 |
|---|---|---|---|
| applications | (notice_id, user_id) 유일. status 값 검사. jsonb 칸 종류 검사 | 본인. 또는 그 공고의 소유자이면서 담당자 권한이 있는 사람 | select만 |
| qualifications | name 유일, 1~40자. description 200자까지 | 로그인한 모두 | select, insert. insert는 담당자 권한이 있고 owner_id가 본인일 때만 |
| student_qualifications | (user_id, qualification_id) 기본 키. status 값 검사. note 500자까지 | 본인. 또는 application_id의 공고 소유자이면서 담당자 권한이 있는 사람 | select만 |
| notifications | (user_id, notice_id, kind) 유일. kind 값 검사 | 본인 | select, read_at 칸 update |

- 모든 테이블에 RLS를 켠다.
- 먼저 `anon`, `authenticated`의 모든 권한을 빼고 위 표의 권한만 준다. `anon`에는 아무 권한도 주지 않는다.
- applications와 student_qualifications에는 `updated_at`을 두고 기존 `touch_updated_at` 트리거를 붙인다.
- 외래 키: notice_id는 notices를, user_id는 auth.users를, qualification_id는 qualifications를 가리킨다. 공고나 사용자가 지워지면 함께 지운다. application_id는 신청서가 지워지면 null로 둔다.
- 조회에 쓸 색인: applications(notice_id), notifications(user_id, created_at), student_qualifications(application_id).

**이벤트 확장.** `CONTRACT.md` 5절.

- `activity_events`에 칸 3개를 추가한다. `source`, `block_id`, `question_id`. 모두 text이고 null을 허용한다.
- 종류 검사를 다시 만든다. 기존 7종에 `block`, `apply_start`, `question`, `submit`을 더한다.
- 검사 추가: `source`는 null이거나 4개 값 중 하나. `block_id`는 종류가 `block`일 때만 있다. `question_id`는 종류가 `question`일 때만 있다.
- 기존 `step_id` 검사와 기존 함수 `record_activity`, `record_followup`, `notice_metrics`, `manager_overview`는 건드리지 않는다.

**SQL 도우미.**

- `public.notice_questions(data jsonb) returns jsonb`. `data->'questions'`의 각 문항에 빠진 값을 채워 배열로 돌려준다. id가 없으면 `q1`, `q2` 순서, type이 없으면 `long`, required가 없으면 `true`. `immutable`, `set search_path = ''`.
- `src/contract.js`의 `noticeQuestions`와 같은 결과를 내야 한다.

**게시 검사 확장.** `validate_notice`를 `create or replace`로 다시 정의한다. `202611240005_open_notices.sql`의 본문을 그대로 가져와 아래만 바꾼다.

- `applyMode`가 있으면 `site` 또는 `external`이어야 한다.
- `applyMode`가 `site`이면 원문 주소, 신청 주소, 준비 항목 1개 이상을 요구하지 않는다. 값이 들어 있으면 형식 검사는 그대로 한다.
- `applyMode`가 없거나 `external`이면 지금과 똑같이 검사한다.
- 자격 조건에 `custom`을 허용한다. `op`는 `eq`, `value`는 `qualifications`에 있는 id여야 한다.
- 문항 검사를 종류별로 한다.
  - `type`이 없는 옛 문항: 지금 검사 그대로.
  - `profile`: `profileField`가 5개 값 중 하나.
  - `short`: `max` 1~200.
  - `long`: `max` 1~10000.
  - `select`: `options`가 글자 배열 2~20개.
  - `type`이 있는 문항은 `id`가 비어 있지 않은 글자이고 `required`가 참 거짓 값이다. id는 공고 안에서 겹치지 않는다.
- `blocks`가 있으면 검사한다. 배열, 60개까지, 각 블록의 id가 비어 있지 않고 겹치지 않음, 종류 3개 중 하나, `heading`과 `text`는 `text` 1~2000자, `image`는 `https://`로 시작하는 `src`와 비어 있지 않은 `alt`.
- 거절 문구는 기존처럼 담당자가 읽는 한국어 문장으로 쓴다.

### F2. 약속 코드

파일: `src/contract.js`, `src/contract.test.js`.

내보낼 것:

| 이름 | 내용 |
|---|---|
| `APPLY_MODES`, `BLOCK_TYPES`, `QUESTION_TYPES`, `PROFILE_FIELDS`, `EVENT_TYPES`, `SOURCES` | `CONTRACT.md`의 값 목록. `PROFILE_FIELDS`에는 화면 라벨을 함께 둔다 |
| `applyMode(notice)` | 없으면 `external` |
| `isSchoolNotice(notice)` | `sourceArchiveId`가 있으면 참 |
| `noticeBlocks(notice)` | `CONTRACT.md` 2절의 규칙대로 블록 배열 |
| `noticeQuestions(notice)` | 빠진 id, type, required를 채운 문항 배열 |
| `ruleStatus(rule, profile, verifiedIds)` | `custom`은 직접 판정, 나머지는 `logic.js`의 `evaluate` |
| `eligibility(notice, profile, verifiedIds)` | `{ results, pass, fail, unknown, total }` |
| `needsOnboarding(profile)` | 학과, 학년, 재학 상태 중 하나라도 비면 참 |
| `resolveSource(search, cameFromList)` | 주소의 `src` 값이 4개 중 하나면 그 값, 아니면 `browse` 또는 `direct` |

테스트에 넣을 것:
- 옛 문항이 `q1`, `q2`, `long`, `true`로 채워진다. id가 있는 문항은 그대로다.
- `blocks`가 있으면 그대로, 발췌만 있으면 `x1`부터, 둘 다 없으면 `s1` 한 블록이다. 빈 줄은 블록이 되지 않는다.
- `custom` 자격은 확인된 id면 `pass`, 아니면 `unknown`이다.
- `eligibility`의 `fail`이 `logic.js`의 판정과 맞는다.
- `resolveSource`가 모르는 값을 버린다.

### F3. 로컬 DB 테스트 준비

파일: `scripts/db-harness.mjs`, `scripts/test-db-foundation.mjs`, `scripts/test-db-student.mjs`, `scripts/test-db-manager.mjs`.

`db-harness.mjs`:
- `createDb({ prefixes })`를 내보낸다.
- 하는 일: PGlite를 띄우고, `bootstrap.sql`, 기존 마이그레이션을 `test-db.mjs`와 같은 순서로, 기반 마이그레이션을 넣는다. 그다음 `supabase/migrations`에서 파일 이름이 `prefixes` 중 하나로 시작하는 파일을 이름 순서로 넣는다.
- 이름에 `storage`가 들어간 파일은 넣지 않는다. 저장소 설정은 PGlite에서 돌지 않는다.
- 돌려주는 것: `db`, 미리 만든 사용자 id, `asUser`, `denied`, `addNotice`, `check`. `test-db.mjs`의 같은 이름 함수와 같은 방식이다.
- 미리 만드는 사용자: 학생 4명, 담당자 2명. 담당자 2명에게는 `manager_grants`를 준다.

`test-db-foundation.mjs`가 확인할 것:
- 기존 모양의 공고가 게시된다. `applyMode`, `blocks`, 문항 id가 없는 공고다.
- 사이트 접수 공고가 원문 주소, 신청 주소, 준비 항목 없이 게시된다.
- 외부 신청 공고는 원문 주소 없이 게시되지 않는다.
- 잘못된 문항과 블록은 게시되지 않는다. 종류별로 하나씩 확인한다.
- `notice_questions`가 `src/contract.js`의 `noticeQuestions`와 같은 결과를 낸다. 같은 입력을 양쪽에 넣어 비교한다.
- 학생이 자기 신청서는 읽고 다른 학생의 신청서는 읽지 못한다.
- 담당자가 자기 공고의 신청서는 읽고 다른 담당자 공고의 신청서는 읽지 못한다.
- 학생이 applications, student_qualifications, notifications에 직접 넣지 못한다.
- 학생이 자기 알림의 `read_at`은 고치고 다른 칸은 고치지 못한다.
- 담당자는 자격을 만들고 학생은 만들지 못한다.
- 새 종류 이벤트 줄이 검사를 통과한다. `block`에 `block_id`가 없으면 거절된다.

테스트용 신청서와 자격 줄은 관리자 권한으로 직접 넣는다. 넣는 함수는 두 세션이 만든다.

`test-db-student.mjs`와 `test-db-manager.mjs`:
- 빈 틀이다. 각각 `createDb({ prefixes: ['2026112601'] })`, `createDb({ prefixes: ['2026112602'] })`를 부르고 "기반이 열린다"는 확인 하나만 둔다.
- 두 세션이 여기에 테스트를 채운다.

### F4. 빈 틀

| 파일 | 내용 |
|---|---|
| `src/ApplicationForm.jsx` | `CONTRACT.md` 7절의 props를 받는다. `noticeQuestions`로 읽은 문항을 종류별 입력 칸으로 그린다. 저장, 기록, 자동 채움은 넣지 않는다 |
| `src/NoticeBlocks.jsx` | `noticeBlocks`로 읽은 블록을 종류별로 그린다. 블록마다 `data-block-id`를 붙인다. `onReach`는 받기만 하고 부르지 않는다 |
| `src/student-api.js` | 파일 머리에 학생 세션이 채울 함수 목록을 주석으로 적는다. 내보내는 것은 없다 |
| `src/manager-api.js` | 파일 머리에 담당자 세션이 채울 함수 목록을 주석으로 적는다. 내보내는 것은 없다 |

- 두 부품은 기존 스타일 클래스를 쓴다. 새 스타일 파일을 만들지 않는다.
- 두 부품을 기존 화면에 연결하지 않는다. 연결은 두 세션이 한다.

### F5. 테스트 등록

- `package.json`의 `test`는 지금 파일 이름을 하나씩 적는다. 두 세션이 `package.json`을 고치지 않고도 새 테스트 파일이 잡히게 바꾼다.
- 지금 `test` 목록에 없는 테스트 파일은 계속 빠져 있어야 한다. `core-validation.source.test.js`가 그렇다.
- 바꾸기 전과 후에 `npm test`의 테스트 수가 같은지 확인한다. 새로 만든 `contract.test.js`만큼만 늘어야 한다.
- `test:db`는 `test-db.mjs`, `test-db-foundation.mjs`, `test-db-student.mjs`, `test-db-manager.mjs`를 차례로 돌리게 바꾼다.
- 윈도우 환경이다. 따옴표와 경로 구분자에 주의한다.

### F6. 전체 확인과 커밋

- `npm run build`, `npm test`, `npm run test:db`를 돌린다. 전부 통과해야 한다.
- 통과하면 `feat/foundation-1126`에 커밋 하나로 넣는다.

### F7. 작업 폴더

- `git worktree add ../cuk-action-manager -b feat/manager-1126 feat/foundation-1126`
- `git worktree add ../cuk-action-student -b feat/student-1126 feat/foundation-1126`
- 각 폴더에서 의존성을 설치한다.
- `cuk-action-web`에 `.env`로 시작하는 파일이 있으면 두 폴더에 복사한다. 내용을 출력하지 않는다.
- 각 폴더에서 `npm run build`, `npm test`, `npm run test:db`가 통과하는지 확인한다.

## 시간이 모자라면

순서대로 끝낸다. F1, F2, F3이 먼저다. 23시까지 F4가 안 끝났으면 F4를 건너뛰고 F6, F7로 간다. 건너뛴 것은 보고에 적는다.

## 마지막 보고

아래를 채워 이 파일 끝에 쓰고 사용자에게도 같은 내용을 말한다.

| 작업 | 상태 | 메모 |
|---|---|---|
| F0 | 완료 | feat/foundation-1126. 지시문 4개를 기반 커밋에 넣음 |
| F1 | 완료 | 202611260001_foundation.sql. 테이블 4개, 정책, 이벤트 칸 3개와 검사, notice_questions, validate_notice 확장 |
| F2 | 완료 | src/contract.js, src/contract.test.js 7개 |
| F3 | 완료 | db-harness.mjs, 기반 DB 테스트 32개, 두 세션용 빈 틀 각 1개 |
| F4 | 완료 | ApplicationForm.jsx, NoticeBlocks.jsx, student-api.js, manager-api.js. 화면에 연결하지 않음 |
| F5 | 완료 | scripts/run-tests.mjs가 테스트 파일을 찾음. 88개에서 95개로 늘었고 늘어난 7개는 contract.test.js |
| F6 | 완료 | 빌드, 단위, DB 테스트 통과. 커밋 6938c79 |
| F7 | 완료 | cuk-action-manager, cuk-action-student. npm ci, .env 파일 3개 복사, 각 폴더에서 세 확인 통과 |

### 테스트 결과

- 빌드: 통과.
- 단위 테스트: 95개 통과. 기존 88개에 `contract.test.js` 7개가 더해졌다.
- DB 테스트: `test-db.mjs` 46개, 학생 전용 집계 6개, 공고 저장 3개, 기반 32개, 학생 틀 1개, 담당자 틀 1개. 모두 통과.
- 세 폴더(`cuk-action-web`, `cuk-action-manager`, `cuk-action-student`)에서 같은 결과가 나왔다.

### 기반 커밋

`6938c79` (`feat/foundation-1126`). 두 작업 폴더의 브랜치도 이 커밋에서 시작한다. 이 보고는 커밋하지 않았다.

### `docs/CONTRACT.md`를 고친 곳

없다. 약속 문서대로 만들 수 있었다.

### 스스로 정한 것

- `PROFILE_FIELDS`는 `{ name: '이름', studentNo: '학번', department: '학과', year: '학년', phone: '연락처' }` 객체다. 키 순서가 화면 순서다. 나머지 값 목록은 배열이다.
- `verifiedIds`는 배열과 Set을 모두 받는다.
- `noticeBlocks`는 발췌의 각 줄 앞뒤 공백을 지운다. 발췌와 요약이 모두 비면 빈 배열을 돌려준다.
- JSON `null`은 값이 없는 것으로 본다. JS와 SQL이 같다. `applyMode: null`은 외부 신청, `blocks: null`은 블록 없음이다. 문항의 `id`, `type`, `required`가 `null`이면 채운다.
- 선택형 선택지는 비어 있지 않은 글자여야 한다.
- 문항 id 중복은 `notice_questions()`로 채운 뒤의 id로 검사한다. 옛 문항이 받는 `q2`와 새 문항의 `q2`도 겹침으로 본다.
- 이미지 블록 `src`는 DB에서 `https://`로 시작하는지만 검사한다. `notice-images` 주소인지는 검사하지 않는다. 저장소 주소는 담당자 세션이 정한다.
- 사이트 접수 공고의 거절 문구는 따로 뒀다. "게시하려면 미리보기 확인이 필요하고, 원문 주소는 HTTPS, 신청 주소는 HTTPS나 이메일이어야 합니다." 외부 신청 공고의 문구는 그대로다.
- `qualifications.description`은 null을 허용한다. `name`은 공백만으로 쓸 수 없다.
- `notifications`의 `pass`, `total`, `unknown`은 null을 허용하지 않고 기본값이 없다. 알림을 만드는 트리거가 값을 넣는다.
- `npm test`는 `src`, `supabase/tests`, `supabase/functions` 아래의 `*.test.js`, `*.test.mjs`를 모두 돈다. `*.source.test.js`는 뺀다. 담당자 세션의 서버 함수 테스트도 잡힌다.
- `test:db`는 네 파일을 `&&`로 잇는다. 앞 파일이 실패하면 뒤 파일은 돌지 않는다.

### 두 세션이 알아야 할 것

- `createDb({ prefixes })`는 `{ db, ids, asUser, denied, addNotice, check, notice, passed }`를 돌려준다. `ids`는 `studentA`~`studentD`, `managerA`, `managerB`다. 담당자 두 명은 `manager_grants`가 있다.
- 학생 DB 테스트는 `2026112601`로 시작하는 마이그레이션만 넣는다. 담당자 DB 테스트는 `2026112602`만 넣는다. 서로의 마이그레이션은 아침 통합 전까지 상대 테스트에 들어가지 않는다. 기존 `test-db.mjs`는 새 마이그레이션을 넣지 않는다.
- 이름에 `storage`가 들어간 마이그레이션은 DB 테스트에서 빠진다.
- 새 테스트 파일은 `package.json`을 고치지 않아도 `npm test`에 잡힌다. 파일 이름이 `.test.js`나 `.test.mjs`로 끝나야 한다.
- 지금 `validate_notice`는 `applyMode`를 게시 후 바꾸는 것을 막지 않는다. 담당자 세션의 양식 잠금 트리거가 막는다.
- `202611240005`에서 이미 준비 항목과 신청 주소를 필수에서 뺐다. 그래서 사이트 접수에서 실제로 달라진 것은 원문 주소가 필수가 아니게 된 것뿐이다.
- `custom` 조건의 `value`는 게시 시점에 `qualifications`에 있는 uuid여야 한다.
- `notice_questions`는 보안 정의자 함수가 아니고 모든 역할이 부를 수 있다. 트리거 안에서 그대로 쓸 수 있다.
- 새 테이블 쓰기 권한은 `qualifications` insert와 `notifications.read_at` update뿐이다. 나머지 쓰기는 보안 정의자 함수로 한다.
- 새 종류 이벤트는 `activity_events`의 검사를 통과한다. `block`은 `block_id`가, `question`은 `question_id`가 있어야 한다. 다른 종류에는 두 칸이 없어야 한다. 기존 `record_activity`는 새 종류를 받지 않는다.
- `ApplicationForm`은 문항 종류별 입력 칸만 그린다. `short`, `long` 문항 아래에 글자 수를 보여 준다. `NoticeBlocks`의 이미지에는 스타일이 없어서 넓은 이미지가 칸을 넘칠 수 있다.

