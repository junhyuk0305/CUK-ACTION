# Supabase 연결과 운영

2026-11-24에 운영 Supabase 프로젝트(cuk action)를 연결했습니다. 브라우저 테스트 모드는 실제 계정 인증이나 서버 보안을 제공하지 않습니다. 테스트 공간은 실서버 연결 뒤에도 "테스트 공간 열기"로 그대로 씁니다.

## 구성

- Supabase Auth: 아이디와 비밀번호 가입, 로그인, 로그아웃, 재설정. 아래 "아이디 로그인" 참고
- PostgreSQL `student_state`: 사용자별 프로필, 관심 공고, 작성본, 준비 상태
- `manager_grants`: 운영자가 부여한 담당자 권한
- `notices`: 담당자 소유의 공고, 검수 근거, 게시 상태
- `activity_events`: 인증된 사용자와 서버 시각으로 기록한 활동

`student_state`는 본인만 조회하고 수정합니다. 담당자 권한이 있어도 다른 학생의 작성본은 볼 수 없습니다. 담당자 권한은 가입 메타데이터나 프로필에서 읽지 않습니다. 학생 가입으로 `manager_grants`를 추가할 수 없습니다.

정적 Sites 화면은 Supabase Auth와 Data API에 HTTPS로 연결합니다. 권한 검사는 PostgreSQL RLS와 RPC에서 수행합니다. 따라서 Sites를 별도 서버로 전환할 필요는 없습니다. 기존 Sites의 비공개 방문 범위와 앱 내부의 Supabase 계정 권한은 별개입니다. 사이트 방문 범위는 그대로 유지합니다.

## 아이디 로그인

대회 시연용 서비스이고 대회 후 운영하지 않습니다. 이메일은 받지도 보내지도 않습니다. 비밀번호 원문은 어디에도 저장하지 않습니다.

- 아이디 규칙: 영문 소문자로 시작하는 영문 소문자·숫자 4~20자. 입력은 소문자로 바꿉니다. 비밀번호는 8자 이상, 72바이트 이하입니다. 규칙은 `src/login-id.js` 한 곳에 있습니다.
- Supabase Auth에는 아이디를 `<아이디>@id.cuk-action.invalid` 내부 이메일로 넣습니다. 화면에는 아이디만 보입니다. `Account.jsx`가 `user.email`에 아이디를 넣어 넘깁니다.
- Auth 설정: 이메일 확인 꺼짐(`mailer_autoconfirm=true`), 최소 비밀번호 8자. 가입하면 바로 로그인됩니다. 같은 아이디는 Auth가 `user_already_exists`로 거절합니다.
- 재설정: Edge Function `id-password-reset`(`--no-verify-jwt`)이 아이디와 새 비밀번호를 받습니다. `password_reset_target`이 고른 학생 계정만 서비스 키로 바꿉니다. 담당자(`manager_grants`)와 보호 계정(`app_metadata.protected=true`)은 바꾸지 않습니다. 없는 아이디, 거절, 성공 모두 `200 {"ok":true}`로 같게 응답합니다.
- 아이디를 아는 사람은 학생 비밀번호를 바꿀 수 있습니다. 시연용이라 수용한 설계입니다.
- 메일 발송 기능(`resetPasswordForEmail`, 이메일 변경, 알림 메일)을 켜지 않습니다. `.invalid` 도메인은 발송 단계에서 거절됩니다.

배포:

```sh
npx supabase db push --remote
npx supabase functions deploy id-password-reset --no-verify-jwt
```

심사용 계정은 학생 2개, 담당자 1개입니다. 세 계정 모두 보호 표시가 있습니다. 아이디와 비밀번호는 저장소와 문서에 남기지 않습니다.

보호 표시:

```sql
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"protected":true}'::jsonb
where email = 'LOGIN_ID@id.cuk-action.invalid';
```

## 나중에 연결할 때

1. 운영자가 Supabase 프로젝트를 생성합니다.
2. SQL Editor에서 `supabase/migrations/202611100001_initial.sql`을 한 번 실행합니다. 기존 테이블이 있는 프로젝트에 무조건 다시 실행하지 않습니다.
3. Auth의 이메일/비밀번호 가입을 설정합니다. 이메일 확인 여부와 발송 설정을 확인합니다.
4. Site URL과 허용 Redirect URL에 현재 배포 주소를 등록합니다. 로컬 테스트 주소는 별도로 등록합니다.
5. `.env.example`을 참고해 빌드 환경의 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_PUBLISHABLE_KEY`를 설정합니다. 두 값은 브라우저 공개용입니다.
6. 실제 모드로 빌드하고 기존 Sites 프로젝트에 배포합니다. Vite 변수는 빌드 시 반영됩니다. Sites의 런타임 변수만 바꾸면 이미 만든 정적 파일은 바뀌지 않습니다.
7. 실제 학생 2명과 담당자 2명으로 클라우드 인수 검증을 수행합니다.

`service_role`, `sb_secret_` 키나 DB 비밀번호를 프런트엔드, 저장소, `.openai/hosting.json`에 넣지 않습니다. 이 웹의 실행에는 관리자 비밀키가 필요하지 않습니다. 브라우저 API는 공개키와 로그인한 사용자의 토큰을 사용합니다. 공개키라도 RLS 없는 테이블을 추가해서는 안 됩니다.

## 담당자 권한 부여

담당자가 먼저 아이디로 가입한 뒤 운영자가 아이디와 담당 부서를 확인합니다. SQL Editor에서 아이디의 내부 이메일을 지정해 아래 명령을 실행합니다. 아래 SQL의 `CONFIRMED_MANAGER_EMAIL`도 `<아이디>@id.cuk-action.invalid`로 바꿔 씁니다.

```sql
insert into public.manager_grants(user_id)
select id from auth.users
where email = 'MANAGER_ID@id.cuk-action.invalid'
on conflict (user_id) do nothing;
```

권한 회수:

```sql
delete from public.manager_grants
where user_id in (
  select id from auth.users where email = 'CONFIRMED_MANAGER_EMAIL'
);
```

담당 공고 이관은 SQL Editor에서 운영자만 수행합니다. 새 담당자의 권한을 먼저 부여하고 대상 공고 ID를 확인합니다.

```sql
update public.notices
set owner_id = (select id from auth.users where email = 'NEW_CONFIRMED_MANAGER_EMAIL')
where id = 'EXACT_NOTICE_UUID'
  and exists (
    select 1 from public.manager_grants g join auth.users u on u.id = g.user_id
    where u.email = 'NEW_CONFIRMED_MANAGER_EMAIL'
  );
```

권한을 회수하면 DB의 수정과 집계 호출은 즉시 차단됩니다. 기존 로그인 토큰에 담당자 권한을 저장하지 않습니다. 화면이 오래 열려 있어도 DB에서 거절합니다.

## 게시 검수

임시저장은 작성 중인 공고를 보관합니다. 게시할 때 DB가 다음 항목을 검사합니다.

- 검수 확인값
- HTTPS 원문 주소와 HTTPS 또는 `mailto:` 신청 경로
- 유효한 마감일과 마감 근거
- 제목, 부서, 설명, 후속 절차
- 조건별 비교 규칙과 원문 근거
- 하나 이상의 조건과 준비 항목
- 작성 문항이 있다면 문항명과 1~10000자 범위의 제한

입력값 검사는 원문 내용의 사실 여부를 보증하지 않습니다. 담당자가 원문과 첨부파일을 대조해야 합니다. 자동 판정이 불가능한 조건은 `manual` 항목으로 남깁니다. 이 항목은 학생 화면에서 확인 필요로 표시합니다.

공고는 삭제 대신 `archived` 상태로 보관합니다. 학생이 준비 중인 작성본은 학생 저장 데이터에 남습니다. 현재 게시 공고 목록에서 제외되므로 학생 화면은 저장한 공고 스냅샷을 사용해야 합니다.

## 집계의 의미

`notice_metrics`는 담당 공고와 시작일, 종료일을 받습니다. 한국 시간 기준 시작일 00:00부터 종료일 다음 날 00:00 전까지 집계합니다. 최대 367일을 허용합니다. 각 단계의 고유 사용자 수이며 동일 사용자의 반복 행동은 한 번으로 계산합니다. 담당자 본인의 이벤트는 제외합니다.

분모는 같은 공고와 같은 기간의 상세 조회 고유 사용자 수입니다. 관심 등록과 준비 시작이 반드시 같은 기간의 상세 조회 뒤에 발생하는 것은 아닙니다. 따라서 단계별 수를 엄밀한 전환 퍼널로 해석하지 않습니다. 행동 기록만으로 중도 포기 원인을 알 수 없습니다.

1~4명은 `null`로 숨깁니다. 분모에도 같은 제한을 적용합니다. 0명과 5명 이상만 숫자로 반환합니다. 원시 활동 기록이나 학생별 목록은 담당자에게 제공하지 않습니다. 이 제한이 모든 외부 정보 결합에 대한 익명성을 보증하는 것은 아닙니다.

`link`는 원문 또는 신청 경로 이동입니다. `complete`는 학생의 제출 완료 자기보고입니다. 공식 접수 결과는 연동하지 않았으며 집계 항목에 존재하지 않습니다. 완료 표시 취소가 과거 이벤트를 삭제하지는 않습니다.

## 검증

```powershell
node scripts/test-db.mjs
```

PGlite 안에서 실제 PostgreSQL 테이블, 권한, RLS, 트리거, RPC를 실행합니다. `supabase/tests/bootstrap.sql`은 테스트 전용 `auth.uid()` 대체 함수와 역할을 만듭니다. 운영 Supabase에는 실행하지 않습니다.

검사 범위는 학생 간 읽기/수정/삭제 차단, 학생의 담당자 권한 획득 차단, 담당자 간 공고 수정 차단, 검수 없는 게시 차단, 게시 후 학생 조회와 준비 기록, 재로그인에 해당하는 DB 사용자 전환 후 작성본 복원, 집계 소수 제한, 링크와 완료 분리, 권한 회수입니다.

이 검증은 Supabase 이메일 발송, 실제 로그인 네트워크, 클라우드 배포에 마이그레이션이 적용됐는지를 검증하지 않습니다. 연결 후 실제 두 학생과 두 담당자의 브라우저 세션으로 다시 확인해야 합니다.

정책 작성 기준: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Database Functions](https://supabase.com/docs/guides/database/functions).
