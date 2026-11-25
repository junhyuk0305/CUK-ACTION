# 통합 기록 (2026-11-26 밤 작업)

feat/foundation-1126에 학생 브랜치와 담당자 브랜치를 합쳤다. push, 배포, 운영 DB 접속은 하지 않았다.

## 1. 커밋

| 커밋 | 내용 |
|---|---|
| bf60fd7 | feat/student-1126(26b0788) 병합. 충돌 없음 |
| 7c354bd | feat/manager-1126(a5c0f06) 병합. 충돌 없음 |
| 382e73f | 통합 DB 테스트 `scripts/test-db-integration.mjs` 추가. `npm run test:db`에 연결 |
| d42961a | `public/privacy.html` 담당자 열람 범위 수정 |
| d005d85 | 사이트 접수 공고의 편집기 검수 칸 문구 수정 |
| (이 커밋) | 이 문서 |

병합 직후 빌드, 단위 테스트, DB 테스트가 모두 통과했다. 병합 때문에 고친 코드는 없다.

## 2. 맞물리는 지점

6개 모두 어긋난 곳이 없었다. 그래서 고친 구현도, 새 마이그레이션도 없다. 지점 3~6은 `scripts/test-db-integration.mjs`로 확인했다. 이 테스트는 학생 함수로 기록을 만들고 담당자 함수와 화면 도우미로 읽는다.

1. **미리보기 props**: 맞음. `PreviewDialog`는 `<NoticeBlocks notice/>`와 `<ApplicationForm notice profile verifiedIds value onChange preview/>`를 부른다. 학생 구현의 props와 같다. `onReach`를 넘기지 않으므로 미리보기는 도달을 기록하지 않는다. `preview`일 때 ApplicationForm은 자기 상태로만 답을 들고 `onChange`를 부르지 않는다.
2. **편집기 저장 모양**: 맞음. 요청문의 `formQuestions`라는 이름은 코드에 없다. 약속 문서의 `questions`로 확인했다. 편집기는 `editorNotice()` 결과를 `notices.data`에 그대로 저장하고, 학생 쪽은 `flatten()`으로 그대로 읽는다. 블록은 `noticeBlocks()`, 문항은 `noticeQuestions()`, 신청 방식은 `applyMode()`로 읽는다. `submit_application`은 SQL `notice_questions()`로 같은 문항을 읽는다. `custom` 자격은 `{ field: 'custom', op: 'eq', value: <qualifications.id> }`로 저장되고, 학생 `eligibility()`, SQL `notice_eligibility()`, 신고 저장 트리거가 같은 `value`를 읽는다. 테스트는 편집기 도우미(`newBlock`, `newQuestion`, `withType`, `editorNotice`)로 만든 공고에 실제 제출을 넣는다.
3. **이벤트와 집계**: 맞음. `record_event`가 쓰는 `view`+`source`, `block`+`block_id`, `apply_start`, `question`+`question_id`와 `submit_application`이 쓰는 `submit`을 `notice_funnel`이 그대로 센다. 테스트에서 학생 6명이 기록했고 유입 `alert 5, kakao 비공개`, 단계 `6, 5, 5, 5`, 블록 `6, 5`, 문항 `5, 5`가 나왔다. 같은 날 같은 블록 재기록은 한 번만 셌고 담당자 본인 기록은 빠졌다. `stageRows`, `blockRows`, `questionRows`도 저장된 공고의 id와 맞물렸다.
4. **신청서와 신청자 화면**: 맞음. `submit_application`이 저장한 줄을 담당자 A가 읽기 권한으로 읽었다. `applicantRow`, `answerRows`, `ruleRows`, `claimRows`가 이름, 학번, 학과, 학년, 자격 1/2, 답변, 신고 설명과 "확인 대기"를 보였다. 담당자 B는 신청서와 신고를 읽지 못하고 `decide_qualification`도 거절됐다. 담당자 A가 확인하자 `verified`가 됐고, 학생의 서버 판정 `notice_eligibility`가 그 자격을 충족으로 셌다.
5. **확인된 신고 재신고**: 유지됨. 학생 마이그레이션 `202611260104`의 신고 트리거가 `where status <> 'verified'`로 덮어쓰기를 막는다. 담당자 세션은 이 파일을 보지 못해 위험을 적었다. 같은 공고 재제출과 다른 담당자 공고 제출 뒤에도 상태, 설명, 신청서 id, 확인자가 그대로였다. 반려된 신고는 다시 신고하면 "확인 대기"로 돌아간다. 약속 문서는 `verified`만 보호하므로 이 동작은 그대로 두었다.
6. **두 트리거**: 함께 돈다. 양식 잠금은 `before update`, 게시 알림은 `after insert or update of status`다. 편집기는 `status`와 `data`를 한 번에 고치므로 두 트리거가 같은 갱신에서 돈다. 테스트 결과는 아래와 같다.
   - 임시저장에서 게시로 바꾸며 문항 제목을 고치면 잠금이 통과하고 조건이 맞는 학생에게만 알림이 생긴다.
   - 게시 종료 공고를 다시 게시하며 문항을 지우면 잠금이 갱신 전체를 거절한다. 그 사이 조건을 갖춘 학생에게도 알림이 생기지 않는다.
   - 제목만 고쳐 다시 게시하면 새 학생에게만 알림이 생기고 기존 학생의 알림은 늘지 않는다.

## 3. 통합 요청 처리

- 본문 이미지 크기: 학생 커밋 0455441이 `student.css`에 `.notice-blocks img{display:block;max-width:100%;height:auto}`를 이미 넣었다. 담당자 화면도 `main.jsx` 안에서 그려지므로 같은 규칙이 미리보기에 적용된다. 추가로 고치지 않았다.
- `public/privacy.html`: 2절과 9절을 고쳤다. 사이트로 제출한 신청서는 해당 공고 담당자가 읽는다. 신청서에는 답변, 제출 시점의 프로필, 자기 신고 설명이 들어간다. 외부 신청 공고의 준비 답변은 학생만 읽는다.
- `supabase/tests/notice-save.test.mjs`의 저장소 마이그레이션 제외 필터: 그대로 받았다.
- 편집기 검수 칸: 사이트 접수는 "카카오 발송은 연결하지 않았습니다. 알림은 서비스 안에서 보냅니다."를 보인다. 외부 신청은 기존 문구 그대로다.

## 4. 테스트

| 명령 | 결과 |
|---|---|
| `npm run build` | 통과 |
| `npm test` | 142개 통과. 기반 95개, 학생 추가 10개, 담당자 추가 37개 |
| `npm run test:db` | 모두 통과. 기존 46개, 학생 전용 집계 6개, 공고 저장 3개, 기반 32개, 학생 22개, 담당자 29개, 통합 7개 |

## 5. 운영 반영 목록

### 마이그레이션 (번호순)

운영에 이미 적용된 번호를 먼저 확인한다. 아래는 이번 기반과 두 브랜치가 추가한 파일이다.

1. `202611260001_foundation.sql`
2. `202611260101_student_applications.sql`
3. `202611260102_student_events.sql`
4. `202611260103_student_notifications.sql`
5. `202611260104_student_claims.sql`
6. `202611260105_student_demo.sql`
7. `202611260201_form_lock.sql`
8. `202611260202_notice_funnel.sql`
9. `202611260203_decide_qualification.sql`
10. `202611260290_storage.sql` (저장소 설정 파일. 로컬 테스트에서 돌리지 않았다)

### 서버 함수

| 함수 | 환경 변수 |
|---|---|
| `notice-draft` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, 선택 `GEMINI_MODEL` |
| `notice-suggest` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, 선택 `GEMINI_MODEL` |

`notice-guide`와 `id-password-reset`은 이번에 바뀌지 않았다.

### 시연 데이터

`scripts/seed-demo.mjs`는 서버 쪽 터미널에서 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, 선택 `CUK_DEMO_PASSWORD`로 돈다. 게시된 사이트 접수 공고 UUID 3개를 넘긴다. 정리는 `scripts/seed-demo-clean.mjs`다.

## 6. 고치지 않은 것과 이유

- `gateway.js` 테스트 모드에 새 기능 통로가 없다. 체험 계정에서는 사이트 접수 공고 게시, 이미지, 신청자, 집계, AI 기능이 안내 문구로만 보인다. 요청에 따라 고치지 않았다.
- 학생이 다른 공고에서 같은 자격을 다시 신고하면 `student_qualifications.application_id`가 새 공고로 옮겨 간다. 앞 공고 담당자에게는 "신고 없음"이 보인다. 확인된 신고는 옮겨 가지 않는다. 신고 줄을 공고별로 둘지는 약속 변경이라 정하지 않았다.
- 링크 초안의 학교 페이지 본문 영역 이름을 실제 페이지로 확인하지 않았다. 학교 홈페이지에 요청을 보내지 않는다는 규칙 때문이다.
- 실제 Supabase에서만 확인되는 항목을 확인하지 않았다. 서버 함수 환경 변수, `notice-draft`의 `.or()` 질의, 자격 중복 이름 오류 코드 23505, 저장소 버킷과 정책, 저장 후 공고 id와 `insertId` 일치가 해당한다.
- `public/privacy.html` 1절은 "학생에게는 이메일, 전화번호, 학번을 받지 않습니다"라고 적는다. 프로필에 학번과 연락처 칸이 생겨 이 문장과 맞지 않는다. 처리 항목 표에도 신청서 줄이 없다. 요청 범위가 담당자 열람 범위라서 고치지 않았다. 다음 문서 점검에서 정해야 한다.
- 담당자 미리보기는 `editorNotice(editing)`로 매번 새 공고 객체를 넘긴다. 미리보기 창이 열린 동안 편집기가 다시 그려지면 미리보기에 쓴 답이 지워질 수 있다. 저장하지 않는 답이라 고치지 않았다.

## 7. 브라우저로 볼 화면

로컬 서버 주소로 본다. 학생 계정과 담당자 계정을 함께 쓴다.

1. 담당자 편집기: 신청 방식 선택, 본문 블록 편집기, 이미지 블록, 양식 빌더, 직접 만든 자격, 링크 초안 칸, 검수 칸 문구.
2. 담당자 미리보기 창: 본문 블록, 넓은 이미지, 신청서 입력.
3. 게시 후 편집기: 문항 구조 잠금 안내와 DB 거절 문구.
4. 학생 공고 목록과 상세: 신청 방식 표시, 학교 공고 출처 줄, 본문 블록, "신청하기" 버튼.
5. 학생 신청서: 기본 정보, 자격 확인, 자기 신고, 문항, 제출 확인 창, 수정 제출과 취소.
6. 학생 알림: 새 공고 알림, 지원 조건 m/n, `?src=alert`로 연 상세.
7. 학생 내 정보: 필수 3칸 입력 화면, 학번과 연락처, 확인된 자격과 확인 대기 자격.
8. 담당자 신청자 표와 지원자 상세: 자격 미충족 표시, 흐린 취소 줄, 자기 신고 확인과 반려.
9. 담당자 공고별 집계: 유입, 단계와 전환율, 블록 도달 막대, 문항별 작성, AI 수정 제안 버튼.
10. 전체 대시보드: 분류 필터, 공고 여러 개 합쳐 보기.
11. 개인정보 처리방침 2절과 9절.
