-- Application option activity and per-option notice metrics.
begin;

alter table public.activity_events add column option_id text null;

-- Replace instead of overloading so a two-argument RPC call resolves to one function.
drop function public.record_activity(uuid, text);
create function public.record_activity(p_notice_id uuid, p_type text, p_option_id text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare notice_data jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.' using errcode = '42501'; end if;
  select data into notice_data from public.notices where id = p_notice_id and status = 'published';
  if not found then
    raise exception '게시된 공고가 아닙니다.' using errcode = '42501';
  end if;
  if p_type not in ('view','interest','start','complete','link') or p_type is null then
    raise exception '지원하지 않는 활동입니다.';
  end if;
  if p_option_id is not null and not exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(notice_data->'options') = 'array' then notice_data->'options' else '[]'::jsonb end) as o
    where o->>'id' = p_option_id
  ) then
    raise exception '신청 항목이 변경됐습니다. 공고를 다시 확인하세요.';
  end if;
  insert into public.activity_events(user_id,notice_id,type,option_id) values (auth.uid(),p_notice_id,p_type,p_option_id);
end;
$$;

create or replace function public.notice_metrics(p_notice_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; counts jsonb; has_small boolean; option_counts jsonb;
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
  -- Same shape and order as the offline calculation: notice options in saved order.
  with options as (
    select o.value as option, o.ordinality as position
    from public.notices n,
      jsonb_array_elements(case when jsonb_typeof(n.data->'options') = 'array' then n.data->'options' else '[]'::jsonb end) with ordinality as o
    where n.id = p_notice_id
  ),
  stages as (select unnest(array['view','interest','start','complete','link']) as type),
  totals as (
    select op.position, s.type, count(distinct e.user_id)::integer as n
    from options op cross join stages s
    left join public.activity_events e on e.type = s.type and e.notice_id = p_notice_id
      and e.option_id = op.option->>'id'
      and e.created_at >= (p_from::timestamp at time zone 'Asia/Seoul')
      and e.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Seoul')
      and e.user_id <> auth.uid()
    group by op.position, s.type
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',op.option->'id','label',op.option->'label','counts',c.counts) order by op.position), '[]'::jsonb)
    into option_counts
  from options op join (
    select position, jsonb_object_agg(type, case when n between 1 and 4 then null else n end) as counts from totals group by position
  ) c on c.position = op.position;
  return jsonb_build_object('noticeId',p_notice_id,'fromDate',p_from,'toDate',p_to,
    'counts',counts,'denominator',counts->'view','denominatorLabel','기간 내 해당 공고 상세 조회 고유 사용자',
    'suppressionThreshold',5,'suppressed',has_small,'optionCounts',option_counts);
end;
$$;

revoke all on function public.record_activity(uuid,text,text), public.notice_metrics(uuid,date,date) from public, anon, authenticated;
grant execute on function public.record_activity(uuid,text,text), public.notice_metrics(uuid,date,date) to authenticated;

commit;
