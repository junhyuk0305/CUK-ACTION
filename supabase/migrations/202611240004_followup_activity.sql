-- Follow-up self-report events and current follow-up metrics.
-- Students' private state is never read: aggregation uses on/off events only.
begin;

alter table public.activity_events add column step_id text null;
alter table public.activity_events drop constraint activity_events_type_check;
alter table public.activity_events add constraint activity_events_type_check
  check (type in ('view','interest','start','complete','link','followup_on','followup_off'));
alter table public.activity_events add constraint activity_events_step_check
  check ((type in ('followup_on','followup_off')) = (step_id is not null));

-- Separate from record_activity so the five funnel stages cannot carry a step.
create function public.record_followup(p_notice_id uuid, p_option_id text, p_step_id text, p_checked boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare notice_data jsonb; options jsonb; steps jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.' using errcode = '42501'; end if;
  select data into notice_data from public.notices where id = p_notice_id and status = 'published';
  if not found then
    raise exception '게시된 공고가 아닙니다.' using errcode = '42501';
  end if;
  if p_step_id is null or p_checked is null then raise exception '지원하지 않는 활동입니다.'; end if;
  options := case when jsonb_typeof(notice_data->'options') = 'array' then notice_data->'options' else '[]'::jsonb end;
  if p_option_id is null then
    if jsonb_array_length(options) > 0 then raise exception '신청 항목이 변경됐습니다. 공고를 다시 확인하세요.'; end if;
    steps := notice_data->'followupSteps';
  else
    select case when o ? 'followupSteps' then o->'followupSteps' else notice_data->'followupSteps' end into steps
    from jsonb_array_elements(options) as o where o->>'id' = p_option_id limit 1;
    if not found then raise exception '신청 항목이 변경됐습니다. 공고를 다시 확인하세요.'; end if;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(steps) = 'array' then steps else '[]'::jsonb end) as s
    where s->>'id' = p_step_id
  ) then
    raise exception '후속 절차가 변경됐습니다. 공고를 다시 확인하세요.';
  end if;
  insert into public.activity_events(user_id,notice_id,type,option_id,step_id)
    values (auth.uid(),p_notice_id,case when p_checked then 'followup_on' else 'followup_off' end,p_option_id,p_step_id);
end;
$$;

create or replace function public.notice_metrics(p_notice_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; counts jsonb; has_small boolean; option_counts jsonb; followup_counts jsonb;
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
  -- Current self-reported state, not limited to the selected period: each student's latest
  -- on/off event per (option, step). Steps follow the offline order and labels.
  with options as (
    select o.value as option, o.ordinality as position
    from public.notices n,
      jsonb_array_elements(case when jsonb_typeof(n.data->'options') = 'array' then n.data->'options' else '[]'::jsonb end) with ordinality as o
    where n.id = p_notice_id
  ),
  subjects as (
    select null::text as option_id, null::jsonb as option, 0::bigint as position, n.data->'followupSteps' as steps
    from public.notices n where n.id = p_notice_id and not exists (select 1 from options)
    union all
    select op.option->>'id', op.option, op.position,
      case when op.option ? 'followupSteps' then op.option->'followupSteps' else n.data->'followupSteps' end
    from options op cross join public.notices n where n.id = p_notice_id
  ),
  steps as (
    select sub.option_id, sub.position, s.ordinality as step_position, s.value->>'id' as step_id,
      case when sub.option is null then s.value->>'label'
        else coalesce(sub.option->>'label', n.data->>'label') || ' / ' || (s.value->>'label') end as label
    from subjects sub cross join public.notices n,
      jsonb_array_elements(case when jsonb_typeof(sub.steps) = 'array' then sub.steps else '[]'::jsonb end) with ordinality as s
    where n.id = p_notice_id
  ),
  latest as (
    select distinct on (e.user_id, e.option_id, e.step_id) e.user_id, e.option_id, e.step_id, e.type
    from public.activity_events e
    where e.notice_id = p_notice_id and e.type in ('followup_on','followup_off') and e.user_id <> auth.uid()
    order by e.user_id, e.option_id, e.step_id, e.created_at desc, e.id desc
  ),
  totals as (
    select st.position, st.step_position, st.label, count(distinct l.user_id) filter (where l.type = 'followup_on')::integer as n
    from steps st left join latest l on l.option_id is not distinct from st.option_id and l.step_id = st.step_id
    group by st.position, st.step_position, st.label
  )
  select coalesce(jsonb_agg(jsonb_build_object('label',label,'count',case when n between 1 and 4 then null else n end) order by position, step_position), '[]'::jsonb)
    into followup_counts from totals;
  return jsonb_build_object('noticeId',p_notice_id,'fromDate',p_from,'toDate',p_to,
    'counts',counts,'denominator',counts->'view','denominatorLabel','기간 내 해당 공고 상세 조회 고유 사용자',
    'suppressionThreshold',5,'suppressed',has_small,'optionCounts',option_counts,'followupCounts',followup_counts);
end;
$$;

revoke all on function public.record_followup(uuid,text,text,boolean), public.notice_metrics(uuid,date,date) from public, anon, authenticated;
grant execute on function public.record_followup(uuid,text,text,boolean), public.notice_metrics(uuid,date,date) to authenticated;

commit;
