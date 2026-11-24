begin;

-- Dashboard totals across the caller's own notices. Same rules as notice_metrics:
-- unique students per stage, Korean calendar days, own actions excluded, 1-4 suppressed.
-- Only the five dashboard stages are counted, even if activity_events gains other types.
create function public.manager_overview(p_from date, p_to date) returns jsonb
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

revoke all on function public.manager_overview(date, date) from public, anon, authenticated;
grant execute on function public.manager_overview(date, date) to authenticated;

commit;
