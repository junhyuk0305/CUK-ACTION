-- Apply once through the Supabase SQL editor or CLI migrations as postgres.
begin;

create table public.student_state (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  data jsonb not null default '{"profile":{},"saved":[],"applications":{},"read":[]}',
  updated_at timestamptz not null default now(),
  constraint student_state_shape check (
    jsonb_typeof(data) = 'object' and data ?& array['profile','saved','applications','read']
    and jsonb_typeof(data->'profile') = 'object' and jsonb_typeof(data->'saved') = 'array'
    and jsonb_typeof(data->'applications') = 'object' and jsonb_typeof(data->'read') = 'array'
    and not data ? 'events' and octet_length(data::text) <= 2000000
  )
);
create table public.manager_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notice_shape check (
    jsonb_typeof(data) = 'object' and data ?& array['rules','tasks','questions']
    and jsonb_typeof(data->'rules') = 'array' and jsonb_typeof(data->'tasks') = 'array'
    and jsonb_typeof(data->'questions') = 'array' and octet_length(data::text) <= 200000
  )
);
create table public.activity_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  notice_id uuid not null references public.notices(id) on delete cascade,
  type text not null check (type in ('view','interest','start','complete','link')),
  created_at timestamptz not null default now()
);
create index notices_owner_idx on public.notices(owner_id);
create index notices_status_idx on public.notices(status);
create index activity_notice_time_idx on public.activity_events(notice_id, created_at);

alter table public.student_state enable row level security;
alter table public.manager_grants enable row level security;
alter table public.notices enable row level security;
alter table public.activity_events enable row level security;

-- No role in user metadata is trusted. Only a DB administrator grants this row.
create policy own_manager_grant on public.manager_grants for select to authenticated
  using (user_id = (select auth.uid()));
create policy own_state_select on public.student_state for select to authenticated
  using (user_id = (select auth.uid()));
create policy own_state_insert on public.student_state for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy own_state_update on public.student_state for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_state_delete on public.student_state for delete to authenticated
  using (user_id = (select auth.uid()));

create policy visible_notices on public.notices for select to authenticated using (
  status = 'published' or (owner_id = (select auth.uid()) and exists (
    select 1 from public.manager_grants where user_id = (select auth.uid())
  ))
);
create policy managed_notice_insert on public.notices for insert to authenticated with check (
  owner_id = (select auth.uid()) and exists (select 1 from public.manager_grants where user_id = (select auth.uid()))
);
create policy managed_notice_update on public.notices for update to authenticated using (
  owner_id = (select auth.uid()) and exists (select 1 from public.manager_grants where user_id = (select auth.uid()))
) with check (
  owner_id = (select auth.uid()) and exists (select 1 from public.manager_grants where user_id = (select auth.uid()))
);
-- Use archive status to retain student work and event history. No client DELETE grant.

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger student_state_updated before update on public.student_state for each row execute function public.touch_updated_at();
create trigger notices_updated before update on public.notices for each row execute function public.touch_updated_at();

create function public.validate_notice() returns trigger language plpgsql set search_path = '' as $$
declare item jsonb; field text; op text; deadline date;
begin
  if tg_op = 'UPDATE' and new.owner_id <> old.owner_id and current_user in ('authenticated','anon') then
    raise exception '공고 담당자는 운영자만 변경할 수 있습니다.';
  end if;
  if new.status <> 'published' then return new; end if;
  if jsonb_typeof(new.data) is distinct from 'object' then
    raise exception '게시하려면 공고 데이터 형식을 확인해야 합니다.';
  end if;
  foreach field in array array['rules','tasks','questions'] loop
    if jsonb_typeof(new.data->field) is distinct from 'array' then
      raise exception '게시하려면 조건, 준비 항목, 문항을 목록으로 입력해야 합니다.';
    end if;
  end loop;
  foreach field in array array['title','department','summary','followup','deadlineEvidence','sourceUrl','applicationUrl','deadline'] loop
    if jsonb_typeof(new.data->field) is distinct from 'string' or length(btrim(new.data->>field)) = 0 then
      raise exception '게시하려면 필수 정보를 비어 있지 않은 텍스트로 입력해야 합니다.';
    end if;
  end loop;
  foreach field in array array['category','label','color','applicationInstructions','sourceArchiveId'] loop
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
    or coalesce(new.data->>'sourceUrl','') !~ '^https://[^[:space:]/]+(/[^[:space:]]*)?$'
    or (coalesce(new.data->>'applicationUrl','') !~ '^https://[^[:space:]/]+(/[^[:space:]]*)?$'
      and coalesce(new.data->>'applicationUrl','') !~ '^mailto:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
    or coalesce(new.data->>'deadline','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception '게시하려면 검수 확인, HTTPS 원문, 신청 주소나 이메일, 마감일이 필요합니다.';
  end if;
  begin deadline := (new.data->>'deadline')::date;
  exception when others then raise exception '게시하려면 유효한 마감일이 필요합니다.'; end;
  if jsonb_array_length(new.data->'rules') < 1 or jsonb_array_length(new.data->'tasks') < 1 then
    raise exception '게시하려면 지원 조건과 준비 항목을 하나 이상 입력해야 합니다.';
  end if;
  for item in select value from jsonb_array_elements(new.data->'rules') loop
    field := item->>'field'; op := item->>'op';
    if jsonb_typeof(item) is distinct from 'object' or field is null or field not in ('status','year','department','gpa','residence','manual')
      or op is null or op not in ('eq','in','min') or not item ? 'value'
      or jsonb_typeof(item->'label') is distinct from 'string' or jsonb_typeof(item->'evidence') is distinct from 'string'
      or length(btrim(coalesce(item->>'label',''))) = 0 or length(btrim(coalesce(item->>'evidence',''))) = 0 then
      raise exception '게시하려면 조건의 항목, 비교 방식, 값, 이름과 근거를 확인해야 합니다.';
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
  return new;
end;
$$;
create trigger validate_notice_before_write before insert or update on public.notices for each row execute function public.validate_notice();

-- Caller cannot select a different student, backdate events, or read raw events.
create function public.record_activity(p_notice_id uuid, p_type text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.' using errcode = '42501'; end if;
  if not exists (select 1 from public.notices where id = p_notice_id and status = 'published') then
    raise exception '게시된 공고가 아닙니다.' using errcode = '42501';
  end if;
  if p_type not in ('view','interest','start','complete','link') or p_type is null then
    raise exception '지원하지 않는 활동입니다.';
  end if;
  insert into public.activity_events(user_id,notice_id,type) values (auth.uid(),p_notice_id,p_type);
end;
$$;

create function public.notice_metrics(p_notice_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; counts jsonb; has_small boolean;
begin
  if auth.uid() is null or not exists (
    select 1 from public.notices n join public.manager_grants g on g.user_id = n.owner_id
    where n.id = p_notice_id and n.owner_id = auth.uid()
  ) then raise exception '담당 공고의 집계만 확인할 수 있습니다.' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception '집계 기간은 시작일부터 최대 367일입니다.';
  end if;
  with stages as (select unnest(array['view','interest','start','complete','link']) as type),
  totals as (
    select s.type, count(distinct e.user_id)::integer as n
    from stages s left join public.activity_events e on e.type = s.type and e.notice_id = p_notice_id
      and e.created_at >= (p_from::timestamp at time zone 'Asia/Seoul')
      and e.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Seoul')
      and e.user_id <> auth.uid()
    group by s.type
  ) select jsonb_object_agg(type, case when n between 1 and 4 then null else n end), bool_or(n between 1 and 4)
    into counts,has_small from totals;
  return jsonb_build_object('noticeId',p_notice_id,'fromDate',p_from,'toDate',p_to,
    'counts',counts,'denominator',counts->'view','denominatorLabel','기간 내 해당 공고 상세 조회 고유 사용자',
    'suppressionThreshold',5,'suppressed',has_small);
end;
$$;

revoke all on public.student_state, public.manager_grants, public.notices, public.activity_events from anon, authenticated;
grant select, insert, update, delete on public.student_state to authenticated;
grant select on public.manager_grants to authenticated;
grant select, insert, update on public.notices to authenticated;
revoke all on function public.touch_updated_at(), public.validate_notice(), public.record_activity(uuid,text), public.notice_metrics(uuid,date,date) from public, anon, authenticated;
grant execute on function public.record_activity(uuid,text), public.notice_metrics(uuid,date,date) to authenticated;

commit;
