begin;

-- The day boundary matches the Asia/Seoul reporting period, including concurrent writes.
create unique index student_daily_block_event on public.activity_events
  (user_id, notice_id, block_id, ((created_at at time zone 'Asia/Seoul')::date)) where type = 'block';
create unique index student_daily_question_event on public.activity_events
  (user_id, notice_id, question_id, ((created_at at time zone 'Asia/Seoul')::date)) where type = 'question';

-- Option views also retain their legacy option_id for the per-session report.
create function public.record_event(p_notice_id uuid, p_type text, p_source text,
  p_block_id text, p_question_id text, p_option_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  payload jsonb;
  valid_block boolean;
  line_count bigint;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.' using errcode = '42501'; end if;
  select data into payload from public.notices where id = p_notice_id and status = 'published' for share;
  if not found then raise exception '게시된 공고가 아닙니다.' using errcode = '42501'; end if;

  -- submit_application records submissions in the transaction that saves the answers.
  if p_type is null or p_type not in ('view','block','apply_start','question')
    or (p_type = 'view') <> (p_source is not null)
    or (p_type = 'block') <> (p_block_id is not null)
    or (p_type = 'question') <> (p_question_id is not null)
    or p_source not in ('alert','kakao','browse','direct') then
    raise exception '활동 종류와 기록 항목을 확인하세요.';
  end if;
  if p_option_id is not null and (p_type <> 'view' or not exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(payload->'options') = 'array'
      then payload->'options' else '[]'::jsonb end) o where o->>'id' = p_option_id
  )) then raise exception '공고의 신청 항목을 확인하세요.'; end if;

  if p_type in ('apply_start','question') and payload->>'applyMode' is distinct from 'site' then
    raise exception '사이트 신청 공고가 아닙니다.';
  end if;
  if p_type = 'question' and not exists (select 1 from jsonb_array_elements(public.notice_questions(payload)) q
    where q->>'id' = p_question_id) then raise exception '공고의 문항을 확인하세요.'; end if;

  if p_type = 'block' then
    if jsonb_typeof(payload->'blocks') = 'array' and payload->'blocks' <> '[]'::jsonb then
      select exists (select 1 from jsonb_array_elements(payload->'blocks') b where b->>'id' = p_block_id) into valid_block;
    else
      select count(*) into line_count from regexp_split_to_table(payload->>'excerpt', E'\n') as line
        where line ~ '[^[:space:]]';
      if line_count > 0 then
        select exists (select 1 from generate_series(1, line_count) i where p_block_id = 'x' || i) into valid_block;
      else
        valid_block := p_block_id = 's1' and coalesce(payload->>'summary','') ~ '[^[:space:]]';
      end if;
    end if;
    if not valid_block then raise exception '공고의 본문 블록을 확인하세요.'; end if;
  end if;

  insert into public.activity_events(user_id,notice_id,type,source,block_id,question_id,option_id)
    values(auth.uid(),p_notice_id,p_type,p_source,p_block_id,p_question_id,p_option_id)
    on conflict do nothing;
end;
$$;

create function public.record_event(p_notice_id uuid, p_type text, p_source text, p_block_id text, p_question_id text)
returns void language sql set search_path = '' as $$
  select public.record_event(p_notice_id,p_type,p_source,p_block_id,p_question_id,null);
$$;
revoke all on function public.record_event(uuid,text,text,text,text), public.record_event(uuid,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.record_event(uuid,text,text,text,text), public.record_event(uuid,text,text,text,text,text)
  to authenticated;
commit;
