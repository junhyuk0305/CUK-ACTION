# 약속 문서

2026년 11월 25일 확정. 담당자 세션과 학생 세션이 함께 지키는 데이터 약속이다.
기획은 `../자료/CUK Action 본선 최종안.md`, 일정과 묶음은 `../자료/CUK Action 구현 계획.md`에 있다.

밤 작업 중에는 이 문서와 기반 파일을 고치지 않는다. 고쳐야 하면 진행 기록에 "통합 요청"으로 적는다.

## 1. 기반 파일

| 파일 | 내용 |
|---|---|
| `supabase/migrations/202611260001_foundation.sql` | 테이블, 읽기 권한, 이벤트 확장, 게시 검사 확장, SQL 도우미 |
| `src/contract.js` | 종류 값, 블록과 문항과 자격을 읽는 함수 |
| `src/ApplicationForm.jsx` | 신청서 부품. 기반은 빈 틀, 학생 세션이 채운다 |
| `src/NoticeBlocks.jsx` | 본문 블록 부품. 기반은 빈 틀, 학생 세션이 채운다 |
| `src/student-api.js`, `src/manager-api.js` | 서버 통로. 기반은 빈 틀, 각 세션이 채운다 |
| `scripts/db-harness.mjs` | 로컬 DB 테스트 준비 함수 |

## 2. 공고 데이터

`notices.data`에 아래를 추가한다. 기존 필드는 그대로 둔다.

### 신청 방식

```
applyMode: 'site' | 'external'
```

- 없으면 `external`로 읽는다.
- 게시 후에는 바꿀 수 없다.
- `site`는 원문 주소, 신청 주소, 준비 항목이 없어도 게시된다.
- `external`의 게시 검사는 지금과 같다.

### 본문 블록

```
blocks: [
  { id: 'b-3f2a', type: 'heading', text: '모집 대상' },
  { id: 'b-91cd', type: 'text', text: '본교 3~4학년 재학생을 모집합니다.' },
  { id: 'b-77e0', type: 'image', src: 'https://…/notice-images/…png', alt: '활동 일정표' }
]
```

- 종류: `heading`, `text`, `image`.
- id는 만들 때 한 번 정하고 바꾸지 않는다. 글을 고쳐도 id는 유지한다.
- 최대 60개. 글은 블록당 2000자.
- `image`의 `src`는 `notice-images` 저장소 주소만 쓴다. `alt`는 필수다.
- `blocks`가 없거나 비었으면 `contract.js`의 `noticeBlocks(notice)`가 대신 만든다.
  - `excerpt`가 있으면 줄 단위로 나눈다. id는 `x1`, `x2` 순서다.
  - `excerpt`도 없으면 `summary` 한 블록이다. id는 `s1`이다.
- 화면은 `notice.blocks`를 직접 읽지 않고 `noticeBlocks(notice)`를 쓴다.

### 문항

```
questions: [
  { id: 'q-a1', type: 'profile', label: '이름', profileField: 'name', required: true },
  { id: 'q-b2', type: 'short', label: '지원 분야', hint: '한 줄로 적어 주세요', max: 100, required: true },
  { id: 'q-c3', type: 'long', label: '지원 동기', hint: '', max: 1000, required: true },
  { id: 'q-d4', type: 'select', label: '희망 기수', options: ['1기', '2기'], required: false }
]
```

| 종류 | 뜻 | 추가 칸 |
|---|---|---|
| `profile` | 학생 기본 정보. 프로필 값으로 미리 채움 | `profileField`: name, studentNo, department, year, phone |
| `short` | 단답 | `max` 1~200 |
| `long` | 서술형 | `max` 1~10000 |
| `select` | 하나 고르기 | `options` 2~20개 |

- 옛 문항에는 id, type, required가 없다. `contract.js`의 `noticeQuestions(notice)`가 채워서 돌려준다.
  - id는 `q1`, `q2` 순서, type은 `long`, required는 `true`.
- SQL에서는 `public.notice_questions(data jsonb)`가 같은 결과를 돌려준다.
- 편집기는 저장할 때 모든 문항에 id, type, required를 써 넣는다.
- 외부 신청 공고의 준비용 답변은 지금처럼 `student_state`에 순서 번호로 저장한다. 바꾸지 않는다.

### 자격 조건

기존 6종은 그대로다. 한 종류를 추가한다.

```
{ field: 'custom', op: 'eq', value: '<qualifications.id>', label: '봉사 30시간 이상', evidence: '담당자가 직접 확인' }
```

판정은 `contract.js`를 쓴다. `logic.js`는 고치지 않는다.

```
ruleStatus(rule, profile, verifiedIds)  ->  'pass' | 'fail' | 'unknown'
eligibility(notice, profile, verifiedIds)  ->  { results, pass, fail, unknown, total }
```

- `custom`은 학생이 그 자격을 확인받았으면 `pass`, 아니면 `unknown`이다. `fail`은 없다.
- 나머지 종류는 `logic.js`의 `evaluate`와 같다.
- 알림 기준: `fail === 0`.
- 자격 미충족 표시 기준: `fail > 0`.

## 3. 학생 프로필

`student_state.data.profile`에 두 칸을 추가한다.

```
studentNo: '202612345'
phone: '010-0000-0000'
```

- 가입 후 입력에서 필수: `department`, `year`, `status`.
- 이 셋 중 하나라도 비어 있으면 입력 화면을 띄운다.
- 나머지는 선택이다.

## 4. 새 테이블

기반이 테이블과 읽기 권한을 만든다. 쓰기는 아래 "DB 함수"로만 한다. 로그인 사용자에게 직접 쓰기 권한을 주지 않는다.

### applications

| 칸 | 형식 | 내용 |
|---|---|---|
| id | uuid | |
| notice_id | uuid | 공고 |
| user_id | uuid | 학생 |
| status | text | `submitted`, `withdrawn` |
| answers | jsonb | `{ '<문항 id>': '답' }` |
| profile_snapshot | jsonb | 제출 시점 프로필. name, studentNo, department, year, status, phone, gpa, residence |
| eligibility | jsonb | 제출 시점 판정. `eligibility()` 결과 그대로 |
| claims | jsonb | `[{ qualificationId, note }]` |
| submitted_at, updated_at | timestamptz | |

- 한 학생은 한 공고에 한 줄이다. 다시 제출하면 같은 줄을 고친다.
- 읽기: 본인, 그 공고의 소유 담당자.

### qualifications

| 칸 | 형식 | 내용 |
|---|---|---|
| id | uuid | |
| owner_id | uuid | 만든 담당자 |
| name | text | 1~40자. 중복 불가 |
| description | text | 200자까지 |

- 읽기: 로그인한 모두.
- 만들기: 담당자만. 직접 insert를 허용한다.
- 수정과 삭제는 없다.

### student_qualifications

| 칸 | 형식 | 내용 |
|---|---|---|
| user_id, qualification_id | uuid | 묶어서 한 줄 |
| status | text | `claimed`, `verified`, `rejected` |
| note | text | 학생이 쓴 설명. 500자까지 |
| application_id | uuid | 신고가 들어온 신청서 |
| decided_by, decided_at | | 확인한 담당자와 시각 |

- 읽기: 본인, 그 신청서가 달린 공고의 소유 담당자.
- `verified`가 된 줄은 학생이 다시 신고해도 `claimed`로 돌아가지 않는다.
- 확인된 자격은 모든 공고에서 인정한다.

### notifications

| 칸 | 형식 | 내용 |
|---|---|---|
| id | bigint | |
| user_id | uuid | 학생 |
| notice_id | uuid | 공고 |
| kind | text | `new_notice` |
| pass, total, unknown | int | 알림 시점 판정 |
| created_at, read_at | timestamptz | |

- 한 학생은 한 공고에 한 줄이다.
- 읽기: 본인. `read_at`만 본인이 고칠 수 있다.
- 공고가 `published`로 바뀌는 순간 한 번만 만든다. 게시 후 자격을 고쳐도 다시 만들지 않는다.
- 담당자 계정에는 만들지 않는다.

## 5. 이벤트

`activity_events`에 종류와 칸을 추가한다. 기존 7종과 기존 함수는 그대로 둔다.

| 종류 | 언제 | 칸 |
|---|---|---|
| `view` | 상세를 열 때. 기존 종류 | `source` |
| `block` | 블록이 절반 이상 1초 보였을 때 | `block_id` |
| `apply_start` | 신청서를 열 때 | |
| `question` | 문항에 답을 쓰고 칸을 벗어날 때 | `question_id` |
| `submit` | 제출할 때 | |

- `source` 값: `alert`, `kakao`, `browse`, `direct`.
- 주소의 `?src=` 값으로 정한다. 값이 없으면 목록에서 들어오면 `browse`, 주소로 바로 들어오면 `direct`다.
- `block`과 `question`은 같은 학생, 같은 공고, 같은 id로 하루에 한 번만 기록한다.
- 집계는 종류별 고유 학생 수다. 담당자 계정은 뺀다. 1~4명은 가린다.

단계 순서:
- 사이트 접수: `view` → `apply_start` → `question` → `submit`
- 외부 신청: `view` → `start` → `link` → `complete`

## 6. DB 함수

이름과 인자는 약속이다. 구현은 맡은 세션이 한다.

### 학생 세션

| 함수 | 하는 일 |
|---|---|
| `record_event(p_notice_id uuid, p_type text, p_source text, p_block_id text, p_question_id text)` | 새 종류 이벤트 기록. 하루 한 번 규칙 포함 |
| `submit_application(p_notice_id uuid, p_answers jsonb, p_profile_snapshot jsonb, p_eligibility jsonb, p_claims jsonb)` | 신청서 넣기 또는 고치기. 신고를 `student_qualifications`에 `claimed`로 넣기. `submit` 이벤트 기록 |
| `withdraw_application(p_notice_id uuid)` | 상태를 `withdrawn`으로 |
| `notice_eligibility(p_rules jsonb, p_profile jsonb, p_user uuid)` | 서버 자격 판정. `eligibility()`와 같은 결과 |
| 게시 알림 트리거 | 공고가 게시될 때 `fail = 0`인 학생에게 `notifications` 만들기 |

`submit_application`의 거절 조건: 게시 공고가 아님, `applyMode`가 `site`가 아님, 마감일이 지남, 필수 문항이 빔.

### 담당자 세션

| 함수 | 하는 일 |
|---|---|
| 양식 잠금 트리거 | 게시된 적 있는 공고의 문항 구조와 `applyMode` 변경을 거절 |
| `notice_funnel(p_notice_id uuid, p_from date, p_to date)` | 유입별, 단계별, 블록별, 문항별 고유 학생 수 |
| `decide_qualification(p_user_id uuid, p_qualification_id uuid, p_verified boolean)` | 신고를 `verified` 또는 `rejected`로 |

양식 잠금 규칙:
- 대상: 이전 상태가 `published` 또는 `archived`인 공고.
- 금지: 문항 추가, 삭제, 순서 변경, `type`, `required`, `max`, `options`, `profileField` 변경.
- 허용: `label`, `hint` 변경.
- 비교는 `notice_questions()` 결과로 한다.
- 운영자 계정의 변경은 막지 않는다.

기존 `notice_metrics`와 `manager_overview`는 담당자 세션만 고친다.
신청서와 자격 줄은 담당자가 함수 없이 읽기 권한으로 직접 조회한다.

## 7. 화면 부품

### ApplicationForm

```
<ApplicationForm notice profile verifiedIds value onChange readOnly preview />
```

- `value`: `{ answers: {}, claims: [] }`.
- `preview`가 참이면 저장과 기록을 하지 않는다. 담당자 미리보기가 쓴다.
- 학생 세션이 소유한다. 담당자 세션은 가져다 쓰기만 한다.

### NoticeBlocks

```
<NoticeBlocks notice onReach />
```

- 블록마다 `data-block-id`를 붙인다.
- `onReach(blockId)`는 블록이 절반 이상 1초 보이면 한 번 부른다.
- 학생 세션이 소유한다.

## 8. 서버 함수

담당자 세션이 만든다.

| 함수 | 입력 | 출력 |
|---|---|---|
| `notice-draft` | `{ url }` | `{ fields, evidence, duplicateNoticeId }` |
| `notice-suggest` | `{ noticeId, fromDate, toDate }` | `{ suggestions: [{ blockId, reason, suggestion }] }` |

`notice-draft` 규칙:
- `www.catholic.ac.kr` 공지 상세 주소만 받는다.
- `/_attach/`, `/_custom/`, `/_res/` 경로에는 요청하지 않는다. 이미지와 첨부는 읽지 않는다.
- 받은 원문은 저장하지 않는다.
- 규칙으로 먼저 채우고 남은 칸만 AI에 맡긴다.
- AI에 보내기 전에 전화번호, 이메일, 학번 모양 숫자를 가린다. 명단 모양이 남으면 AI를 부르지 않고 규칙 결과만 돌려준다.
- 같은 원문의 게시 공고가 있으면 `duplicateNoticeId`에 넣는다.

`notice-suggest` 규칙:
- AI에는 공고 본문과 블록별 집계 비율만 보낸다. 학생 정보는 보내지 않는다.
- 5명 미만 집계는 보내지 않는다.

두 함수 모두 담당자 권한과 공고 소유를 서버에서 확인한다. 키가 없으면 503을 돌려준다.
화면에는 "AI가 정리한 정보이니 원문을 확인하세요"를 함께 보여 준다.

## 9. 이미지 저장소

- 저장소 이름: `notice-images`. 누구나 읽을 수 있다.
- 올리기: 담당자만. 경로는 `<담당자 id>/<공고 id>/<파일>`.
- 형식: png, jpg, webp. 5MB까지.
- 저장소 설정은 로컬 DB 테스트에서 돌릴 수 없다. 담당자 세션이 `202611260290_storage.sql`에 따로 쓰고 테스트에서 뺀다.

## 10. 알려진 한계

- 신청서의 자격 판정은 학생 화면이 계산해 보낸 값이다. 서버가 다시 계산하지 않는다.
- 카카오 유입은 주소 꼬리표만 지원한다. 실제 발송은 없다.
