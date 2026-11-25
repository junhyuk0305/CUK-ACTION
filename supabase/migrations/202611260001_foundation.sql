-- Shared foundation for site applications. See docs/CONTRACT.md sections 2, 4 and 5.
-- Adds tables, read policies, event columns, the notice_questions helper and publish checks.
-- Writes to the new tables go through DB functions that the night sessions add.
begin;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.notices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'submitted' check (status in ('submitted','withdrawn')),
  answers jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'),
  profile_snapshot jsonb not null default '{}' check (jsonb_typeof(profile_snapshot) = 'object'),
  eligibility jsonb not null default '{}' check (jsonb_typeof(eligibility) = 'object'),
  claims jsonb not null default '[]' check (jsonb_typeof(claims) = 'array'),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notice_id, user_id)
);
create table public.qualifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null unique check (char_length(name) between 1 and 40 and btrim(name) <> ''),
  description text check (char_length(description) <= 200)
);
create table public.student_qualifications (
  user_id uuid not null references auth.users(id) on delete cascade,
  qualification_id uuid not null references public.qualifications(id) on delete cascade,
  status text not null default 'claimed' check (status in ('claimed','verified','rejected')),
  note text check (char_length(note) <= 500),
  application_id uuid references public.applications(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, qualification_id)
);
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  notice_id uuid not null references public.notices(id) on delete cascade,
  kind text not null default 'new_notice' check (kind in ('new_notice')),
  pass integer not null,
  total integer not null,
  unknown integer not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, notice_id, kind)
);
create index applications_notice_idx on public.applications(notice_id);
create index notifications_user_time_idx on public.notifications(user_id, created_at);
create index student_qualifications_application_idx on public.student_qualifications(application_id);

create trigger applications_updated before update on public.applications for each row execute function public.touch_updated_at();
create trigger student_qualifications_updated before update on public.student_qualifications for each row execute function public.touch_updated_at();

alter table public.applications enable row level security;
alter table public.qualifications enable row level security;
alter table public.student_qualifications enable row level security;
alter table public.notifications enable row level security;

create policy own_or_managed_applications on public.applications for select to authenticated using (
  user_id = (select auth.uid()) or exists (
    select 1 from public.notices n join public.manager_grants g on g.user_id = n.owner_id
    where n.id = notice_id and n.owner_id = (select auth.uid())
  )
);
create policy signed_in_qualifications on public.qualifications for select to authenticated using (true);
create policy managed_qualification_insert on public.qualifications for insert to authenticated with check (
  owner_id = (select auth.uid()) and exists (select 1 from public.manager_grants where user_id = (select auth.uid()))
);
create policy own_or_managed_student_qualifications on public.student_qualifications for select to authenticated using (
  user_id = (select auth.uid()) or exists (
    select 1 from public.applications a
    join public.notices n on n.id = a.notice_id
    join public.manager_grants g on g.user_id = n.owner_id
    where a.id = application_id and n.owner_id = (select auth.uid())
  )
);
create policy own_notifications on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy own_notification_read on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.applications, public.qualifications, public.student_qualifications, public.notifications from anon, authenticated;
grant select on public.applications, public.student_qualifications to authenticated;
grant select, insert on public.qualifications to authenticated;
grant select, update (read_at) on public.notifications to authenticated;

-- Events: four new types and three columns. Existing types, step check and functions stay as they are.
alter table public.activity_events add column source text null;
alter table public.activity_events add column block_id text null;
alter table public.activity_events add column question_id text null;
alter table public.activity_events drop constraint activity_events_type_check;
alter table public.activity_events add constraint activity_events_type_check
  check (type in ('view','interest','start','complete','link','followup_on','followup_off','block','apply_start','question','submit'));
alter table public.activity_events add constraint activity_events_source_check
  check (source is null or source in ('alert','kakao','browse','direct'));
alter table public.activity_events add constraint activity_events_block_check
  check ((type = 'block') = (block_id is not null));
alter table public.activity_events add constraint activity_events_question_check
  check ((type = 'question') = (question_id is not null));

-- Same result as noticeQuestions() in src/contract.js. A missing or null id, type or required is filled.
create function public.notice_questions(data jsonb) returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(case when jsonb_typeof(q) = 'object' then q || jsonb_build_object(
      'id', case when coalesce(q->'id','null'::jsonb) = 'null'::jsonb then to_jsonb('q' || n) else q->'id' end,
      'type', case when coalesce(q->'type','null'::jsonb) = 'null'::jsonb then '"long"'::jsonb else q->'type' end,
      'required', case when coalesce(q->'required','null'::jsonb) = 'null'::jsonb then 'true'::jsonb else q->'required' end)
    else q end order by n), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(data->'questions') = 'array' then data->'questions' else '[]'::jsonb end)
    with ordinality as t(q, n);
$$;

-- Body copied from 202611240005_open_notices.sql. Changes: applyMode, site notices without a source URL,
-- custom conditions, typed questions and body blocks. Notices without applyMode are checked as before.
create or replace function public.validate_notice() returns trigger language plpgsql set search_path = '' as $$
declare item jsonb; field text; op text; deadline date; mode text; kind text; ids text[];
begin
  if tg_op = 'UPDATE' and new.owner_id <> old.owner_id and current_user in ('authenticated','anon') then
    raise exception '공고 담당자는 운영자만 변경할 수 있습니다.';
  end if;
  if new.status <> 'published' then return new; end if;
  if jsonb_typeof(new.data) is distinct from 'object' then
    raise exception '게시하려면 공고 데이터 형식을 확인해야 합니다.';
  end if;
  if new.data ? 'applyMode' and new.data->'applyMode' <> 'null'::jsonb
    and (jsonb_typeof(new.data->'applyMode') is distinct from 'string' or new.data->>'applyMode' not in ('site','external')) then
    raise exception '게시하려면 신청 방식을 사이트 접수나 외부 링크 신청으로 정해야 합니다.';
  end if;
  mode := coalesce(new.data->>'applyMode', 'external');
  foreach field in array array['rules','tasks','questions'] loop
    if jsonb_typeof(new.data->field) is distinct from 'array' then
      raise exception '게시하려면 조건, 준비 항목, 문항을 목록으로 입력해야 합니다.';
    end if;
  end loop;
  foreach field in array case when mode = 'site' then array['title','department','summary'] else array['title','department','summary','sourceUrl'] end loop
    if jsonb_typeof(new.data->field) is distinct from 'string' or length(btrim(new.data->>field)) = 0 then
      raise exception '게시하려면 필수 정보를 비어 있지 않은 텍스트로 입력해야 합니다.';
    end if;
  end loop;
  foreach field in array array['category','label','color','applicationInstructions','sourceArchiveId','followup','deadlineEvidence','applicationUrl','deadline','deadlineNote','postedAt','sourceUrl'] loop
    if new.data ? field and jsonb_typeof(new.data->field) is distinct from 'string' then
      raise exception '게시하려면 공고의 표시 정보를 텍스트로 입력해야 합니다.';
    end if;
  end loop;
  if new.data ? 'sourceReview' and new.data->'sourceReview' <> 'null'::jsonb then
    if jsonb_typeof(new.data->'sourceReview') is distinct from 'object' then
      raise exception '게시하려면 원문 검수 기록의 형식을 확인해야 합니다.';
    end if;
    foreach field in array array['checkedAt','scope'] loop
      if new.data->'sourceReview' ? field and jsonb_typeof(new.data->'sourceReview'->field) is distinct from 'string' then
        raise exception '게시하려면 검수 날짜와 범위를 텍스트로 입력해야 합니다.';
      end if;
    end loop;
    if new.data->'sourceReview' ? 'remainingChecks' then
      item := new.data->'sourceReview'->'remainingChecks';
      if jsonb_typeof(item) = 'array' then
        if exists (select 1 from jsonb_array_elements(item) as v where jsonb_typeof(v) is distinct from 'string') then
          raise exception '게시하려면 남은 검수 사항을 텍스트 목록으로 입력해야 합니다.';
        end if;
      elsif jsonb_typeof(item) is distinct from 'string' then
        raise exception '게시하려면 남은 검수 사항을 텍스트로 입력해야 합니다.';
      end if;
    end if;
    if new.data->'sourceReview' ? 'attachmentUrls' then
      item := new.data->'sourceReview'->'attachmentUrls';
      if jsonb_typeof(item) is distinct from 'array' then
        raise exception '게시하려면 근거 자료 주소를 목록으로 입력해야 합니다.';
      end if;
      if exists (select 1 from jsonb_array_elements(item) as v where jsonb_typeof(v) is distinct from 'string') then
        raise exception '게시하려면 근거 자료 주소를 텍스트 목록으로 입력해야 합니다.';
      end if;
    end if;
  end if;
  if new.data->'reviewed' is distinct from 'true'::jsonb
    or (not (mode = 'site' and length(btrim(coalesce(new.data->>'sourceUrl',''))) = 0)
      and coalesce(new.data->>'sourceUrl','') !~ '^https://[^[:space:]/]+(/[^[:space:]]*)?$')
    or (length(btrim(coalesce(new.data->>'applicationUrl',''))) > 0
      and coalesce(new.data->>'applicationUrl','') !~ '^https://[^[:space:]/]+(/[^[:space:]]*)?$'
      and coalesce(new.data->>'applicationUrl','') !~ '^mailto:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') then
    if mode = 'site' then
      raise exception '게시하려면 미리보기 확인이 필요하고, 원문 주소는 HTTPS, 신청 주소는 HTTPS나 이메일이어야 합니다.';
    end if;
    raise exception '게시하려면 검수 확인과 HTTPS 원문이 필요하고, 신청 주소는 HTTPS나 이메일이어야 합니다.';
  end if;
  if length(btrim(coalesce(new.data->>'deadline',''))) > 0 then
    if new.data->>'deadline' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception '게시하려면 유효한 마감일이 필요합니다.';
    end if;
    begin deadline := (new.data->>'deadline')::date;
    exception when others then raise exception '게시하려면 유효한 마감일이 필요합니다.'; end;
    if to_char(deadline, 'YYYY-MM-DD') <> new.data->>'deadline' then
      raise exception '게시하려면 유효한 마감일이 필요합니다.';
    end if;
  end if;
  if (length(btrim(coalesce(new.data->>'deadline',''))) > 0 or length(btrim(coalesce(new.data->>'deadlineNote',''))) > 0)
    and length(btrim(coalesce(new.data->>'deadlineEvidence',''))) = 0 then
    raise exception '마감일이나 마감 문구를 게시하려면 근거 문장이 필요합니다.';
  end if;
  for item in select value from jsonb_array_elements(new.data->'rules') loop
    field := item->>'field'; op := item->>'op';
    if jsonb_typeof(item) is distinct from 'object' or field is null or field not in ('status','year','department','gpa','residence','manual','custom')
      or op is null or op not in ('eq','in','min') or not item ? 'value'
      or jsonb_typeof(item->'label') is distinct from 'string' or jsonb_typeof(item->'evidence') is distinct from 'string'
      or length(btrim(coalesce(item->>'label',''))) = 0 or length(btrim(coalesce(item->>'evidence',''))) = 0 then
      raise exception '게시하려면 조건의 항목, 비교 방식, 값, 이름과 근거를 확인해야 합니다.';
    end if;
    if field = 'custom' and (op <> 'eq' or jsonb_typeof(item->'value') is distinct from 'string'
      or item->>'value' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or not exists (select 1 from public.qualifications where id = (item->>'value')::uuid)) then
      raise exception '게시하려면 직접 만든 자격을 자격 목록에서 골라야 합니다.';
    end if;
    if (op = 'min' and (field not in ('gpa','residence','year') or jsonb_typeof(item->'value') is distinct from 'number'))
      or (op = 'eq' and (jsonb_typeof(item->'value') is distinct from 'string' or length(btrim(item->>'value')) = 0))
      or (op = 'in' and jsonb_typeof(item->'value') is distinct from 'array') then
      raise exception '게시하려면 조건의 비교 값 형식을 확인해야 합니다.';
    end if;
    if op = 'in' then
      if jsonb_array_length(item->'value') = 0 or exists (select 1 from jsonb_array_elements(item->'value') as v where jsonb_typeof(v) is distinct from 'string' or length(btrim(v #>> '{}')) = 0) then
        raise exception '게시하려면 조건의 선택 값을 하나 이상 입력해야 합니다.';
      end if;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(new.data->'tasks') loop
    if jsonb_typeof(item) is distinct from 'string' or length(btrim(item #>> '{}')) = 0 then
      raise exception '게시하려면 비어 있지 않은 준비 항목이 필요합니다.';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(new.data->'questions') loop
    if jsonb_typeof(item) = 'object' and coalesce(item->'type','null'::jsonb) <> 'null'::jsonb then
      kind := item->>'type';
      if jsonb_typeof(item->'type') is distinct from 'string' or kind not in ('profile','short','long','select')
        or jsonb_typeof(item->'id') is distinct from 'string' or length(btrim(item->>'id')) = 0
        or jsonb_typeof(item->'required') is distinct from 'boolean'
        or jsonb_typeof(item->'label') is distinct from 'string' or length(btrim(item->>'label')) = 0
        or (item ? 'hint' and jsonb_typeof(item->'hint') is distinct from 'string') then
        raise exception '게시하려면 문항마다 id, 종류, 제목과 필수 여부를 정해야 합니다.';
      end if;
      if kind = 'profile' and (jsonb_typeof(item->'profileField') is distinct from 'string'
        or item->>'profileField' not in ('name','studentNo','department','year','phone')) then
        raise exception '게시하려면 기본 정보 문항의 항목을 이름, 학번, 학과, 학년, 연락처 중에서 골라야 합니다.';
      end if;
      if kind in ('short','long') and (jsonb_typeof(item->'max') is distinct from 'number' or item->>'max' !~ '^[0-9]{1,5}$'
        or (item->>'max')::integer < 1 or (item->>'max')::integer > case when kind = 'short' then 200 else 10000 end) then
        if kind = 'short' then raise exception '게시하려면 단답 문항의 글자 수를 1~200자로 설정해야 합니다.'; end if;
        raise exception '게시하려면 서술형 문항의 글자 수를 1~10000자로 설정해야 합니다.';
      end if;
      if kind = 'select' and (jsonb_typeof(item->'options') is distinct from 'array'
        or jsonb_array_length(item->'options') not between 2 and 20
        or exists (select 1 from jsonb_array_elements(item->'options') as v where jsonb_typeof(v) is distinct from 'string' or length(btrim(v #>> '{}')) = 0)) then
        raise exception '게시하려면 선택형 문항에 선택지를 2~20개 입력해야 합니다.';
      end if;
      continue;
    end if;
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'label') is distinct from 'string'
      or length(btrim(coalesce(item->>'label',''))) = 0 or jsonb_typeof(item->'max') is distinct from 'number'
      or (item ? 'hint' and jsonb_typeof(item->'hint') is distinct from 'string')
      or coalesce(item->>'max','') !~ '^[0-9]{1,5}$' then
      raise exception '게시하려면 작성 문항과 글자 수 제한을 확인해야 합니다.';
    end if;
    if (item->>'max')::integer < 1 or (item->>'max')::integer > 10000 then
      raise exception '게시하려면 문항당 글자 수를 1~10000자로 설정해야 합니다.';
    end if;
  end loop;
  -- Ids after filling, so an old question's q2 cannot collide with a typed question's id.
  if exists (select 1 from jsonb_array_elements(public.notice_questions(new.data)) as q group by q->>'id' having count(*) > 1) then
    raise exception '게시하려면 문항 id가 서로 달라야 합니다.';
  end if;
  if new.data ? 'blocks' and new.data->'blocks' <> 'null'::jsonb then
    if jsonb_typeof(new.data->'blocks') is distinct from 'array' or jsonb_array_length(new.data->'blocks') > 60 then
      raise exception '게시하려면 본문 블록을 60개 이하의 목록으로 입력해야 합니다.';
    end if;
    ids := array[]::text[];
    for item in select value from jsonb_array_elements(new.data->'blocks') loop
      if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'id') is distinct from 'string'
        or length(btrim(item->>'id')) = 0 or item->>'id' = any(ids) then
        raise exception '게시하려면 본문 블록마다 서로 다른 id가 필요합니다.';
      end if;
      ids := ids || (item->>'id');
      kind := item->>'type';
      if jsonb_typeof(item->'type') is distinct from 'string' or kind not in ('heading','text','image') then
        raise exception '게시하려면 본문 블록의 종류를 소제목, 문단, 이미지 중에서 골라야 합니다.';
      end if;
      if kind in ('heading','text') and (jsonb_typeof(item->'text') is distinct from 'string'
        or length(btrim(item->>'text')) = 0 or char_length(item->>'text') > 2000) then
        raise exception '게시하려면 소제목과 문단에 1~2000자의 글을 입력해야 합니다.';
      end if;
      if kind = 'image' and (jsonb_typeof(item->'src') is distinct from 'string' or item->>'src' !~ '^https://'
        or jsonb_typeof(item->'alt') is distinct from 'string' or length(btrim(item->>'alt')) = 0) then
        raise exception '게시하려면 이미지 블록에 HTTPS 이미지 주소와 대체 글이 필요합니다.';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

commit;
