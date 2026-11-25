-- LG-04 (D6): every metric counts student accounts only. Accounts with a manager grant are left
-- out, not just the notice owner. The screen says "로그인한 학생의 행동만" and other managers can
-- open notices through the student view.
-- LG-03: "내 데이터 삭제" overwrites student_state with an empty state and sends no off events.
-- The trigger below closes the follow-up checks that the saved state no longer holds.
-- Function bodies are copied from 202611240002 and 202611240004. Only the lines marked LG-04 change.
begin;

create or replace function public.manager_overview(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  result jsonb;
begin
  if me is null or not exists (select 1 from public.manager_grants g where g.user_id = me) then
    raise exception '담당자 계정만 통합 현황을 확인할 수 있습니다.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception '집계 기간은 시작일부터 최대 367일입니다.';
  end if;
  with stages(type) as (values ('view'), ('interest'), ('start'), ('complete'), ('link')),
  owned as (select n.id, n.status, n.data, n.updated_at from public.notices n where n.owner_id = me),
  ev as (
    select e.notice_id, e.user_id, e.type, (e.created_at at time zone 'Asia/Seoul')::date as day
    from public.activity_events e join owned o on o.id = e.notice_id
    where e.user_id <> me
      and not exists (select 1 from public.manager_grants g where g.user_id = e.user_id) -- LG-04
      and e.type in ('view', 'interest', 'start', 'complete', 'link')
      and e.created_at >= (p_from::timestamp at time zone 'Asia/Seoul')
      and e.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Seoul')
  ),
  days as (select g::date as day from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g),
  total_cells as (
    select s.type, count(distinct ev.user_id)::integer as n
    from stages s left join ev on ev.type = s.type group by s.type
  ),
  day_cells as (
    select d.day, s.type, count(distinct ev.user_id)::integer as n
    from days d cross join stages s left join ev on ev.day = d.day and ev.type = s.type
    group by d.day, s.type
  ),
  notice_cells as (
    select o.id, s.type, count(distinct ev.user_id)::integer as n
    from owned o cross join stages s left join ev on ev.notice_id = o.id and ev.type = s.type
    group by o.id, s.type
  ),
  totals as (
    select jsonb_object_agg(c.type, case when c.n between 1 and 4 then null else c.n end) as counts
    from total_cells c
  ),
  trend as (
    select jsonb_agg(jsonb_build_object('date', to_char(x.day, 'YYYY-MM-DD')) || x.counts order by x.day) as rows
    from (
      select c.day, jsonb_object_agg(c.type, case when c.n between 1 and 4 then null else c.n end) as counts
      from day_cells c group by c.day
    ) x
  ),
  per_notice as (
    select jsonb_agg(jsonb_build_object(
        'id', o.id, 'title', o.data->'title', 'category', o.data->'category', 'status', o.status,
        'deadline', o.data->'deadline', 'bundleId', o.data->'bundleId', 'counts', x.counts
      ) order by o.updated_at desc, o.id) as rows,
      count(*)::integer as n
    from owned o join (
      select c.id, jsonb_object_agg(c.type, case when c.n between 1 and 4 then null else c.n end) as counts
      from notice_cells c group by c.id
    ) x on x.id = o.id
  ),
  flags as (
    select coalesce(bool_or(a.n between 1 and 4), false) as suppressed
    from (
      select n from total_cells union all select n from day_cells union all select n from notice_cells
    ) a
  )
  select jsonb_build_object(
      'source', 'activity',
      'fromDate', to_char(p_from, 'YYYY-MM-DD'), 'toDate', to_char(p_to, 'YYYY-MM-DD'),
      'counts', t.counts, 'denominator', t.counts->'view',
      'denominatorLabel', '기간 내 담당 공고를 상세 조회한 고유 학생 수',
      'trend', coalesce(tr.rows, '[]'::jsonb), 'notices', coalesce(p.rows, '[]'::jsonb),
      'suppressionThreshold', 5, 'noticeCount', p.n, 'suppressed', f.suppressed)
    into result
    from totals t, trend tr, per_notice p, flags f;
  return result;
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
      and not exists (select 1 from public.manager_grants g where g.user_id = e.user_id) -- LG-04
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
      and not exists (select 1 from public.manager_grants g where g.user_id = e.user_id) -- LG-04
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
      and not exists (select 1 from public.manager_grants g where g.user_id = e.user_id) -- LG-04
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

-- LG-03: after each state update, a step whose latest event is "on" but whose check is gone from
-- the saved state gets an "off" event. Application keys are the notice id, or "<notice id>::<option id>".
-- Aggregation still reads events only. UPDATE only: deleting an auth user cascades a DELETE here,
-- and inserting events for that user would fail the foreign key.
create function public.close_removed_followups() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_events(user_id, notice_id, type, option_id, step_id)
  select l.user_id, l.notice_id, 'followup_off', l.option_id, l.step_id
  from (
    select distinct on (e.notice_id, e.option_id, e.step_id) e.user_id, e.notice_id, e.option_id, e.step_id, e.type
    from public.activity_events e
    where e.user_id = new.user_id and e.type in ('followup_on','followup_off')
    order by e.notice_id, e.option_id, e.step_id, e.created_at desc, e.id desc
  ) l
  where l.type = 'followup_on'
    and not coalesce(new.data->'applications'->(l.notice_id::text || coalesce('::' || l.option_id, ''))->'followupChecks' ? l.step_id, false);
  return null;
end;
$$;
revoke all on function public.close_removed_followups() from public, anon, authenticated;
create trigger student_state_close_followups after update on public.student_state
  for each row execute function public.close_removed_followups();

commit;
