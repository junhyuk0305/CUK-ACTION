-- notice_funnel: unique students per source, stage, block and question for one notice.
-- Same owner check, Korean-time period, manager exclusion and 1~4 suppression as notice_metrics.
-- Stages hold both orders from CONTRACT 5. The screen picks the order by applyMode.
-- blocks and questions hold only ids that have events. The screen joins them with the current notice.
begin;

create function public.notice_funnel(p_notice_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.notices n join public.manager_grants g on g.user_id = n.owner_id
    where n.id = p_notice_id and n.owner_id = auth.uid()
  ) then raise exception '담당 공고의 집계만 확인할 수 있습니다.' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception '집계 기간은 시작일부터 최대 367일입니다.';
  end if;
  with ev as (
    select e.user_id, e.type, e.source, e.block_id, e.question_id
    from public.activity_events e
    where e.notice_id = p_notice_id
      and e.created_at >= (p_from::timestamp at time zone 'Asia/Seoul')
      and e.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Seoul')
      and e.user_id <> auth.uid()
      and not exists (select 1 from public.manager_grants g where g.user_id = e.user_id)
  ),
  cells as (
    select 'sources' as part, s.key, count(distinct ev.user_id)::integer as n
    from (values ('alert'), ('kakao'), ('browse'), ('direct')) s(key)
    left join ev on ev.type = 'view' and ev.source = s.key group by s.key
    union all
    select 'stages', s.key, count(distinct ev.user_id)::integer
    from (values ('view'), ('apply_start'), ('question'), ('submit'), ('start'), ('link'), ('complete')) s(key)
    left join ev on ev.type = s.key group by s.key
    union all
    select 'blocks', ev.block_id, count(distinct ev.user_id)::integer from ev where ev.type = 'block' group by ev.block_id
    union all
    select 'questions', ev.question_id, count(distinct ev.user_id)::integer from ev where ev.type = 'question' group by ev.question_id
  ),
  parts as (
    select part, jsonb_object_agg(key, case when n between 1 and 4 then null else n end) as counts
    from cells group by part
  )
  select jsonb_build_object('noticeId', p_notice_id,
      'fromDate', to_char(p_from, 'YYYY-MM-DD'), 'toDate', to_char(p_to, 'YYYY-MM-DD'),
      'sources', (select counts from parts where part = 'sources'),
      'stages', (select counts from parts where part = 'stages'),
      'blocks', coalesce((select counts from parts where part = 'blocks'), '{}'::jsonb),
      'questions', coalesce((select counts from parts where part = 'questions'), '{}'::jsonb),
      'suppressionThreshold', 5,
      'suppressed', coalesce((select bool_or(n between 1 and 4) from cells), false))
    into result;
  return result;
end;
$$;
revoke all on function public.notice_funnel(uuid, date, date) from public, anon, authenticated;
grant execute on function public.notice_funnel(uuid, date, date) to authenticated;

commit;
