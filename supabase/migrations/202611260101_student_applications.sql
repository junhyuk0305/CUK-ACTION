begin;

-- Lock the published notice while its form and deadline are in use.
create function public.open_site_application_notice(p_notice_id uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare
  notice_data jsonb;
  deadline_date date;
  deadline_at timestamp;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  select data into notice_data from public.notices where id = p_notice_id and status = 'published' for share;
  if not found then
    raise exception '게시된 공고가 아닙니다.' using errcode = '42501';
  end if;
  if notice_data->>'applyMode' is distinct from 'site' then
    raise exception '사이트 신청 공고만 접수할 수 있습니다.';
  end if;
  deadline_date := nullif(btrim(notice_data->>'deadline'), '')::date;
  if deadline_date is not null and coalesce(notice_data->>'deadlineStatus', '') <> 'conflict' then
    if coalesce(notice_data->>'deadlineTime','') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      deadline_at := deadline_date + (notice_data->>'deadlineTime')::time;
    else
      deadline_at := deadline_date + 1;
    end if;
    if clock_timestamp() >= (deadline_at at time zone 'Asia/Seoul') then
      raise exception '신청 기간이 지났습니다.';
    end if;
  end if;
  return notice_data;
end;
$$;

create function public.submit_application(p_notice_id uuid, p_answers jsonb, p_profile_snapshot jsonb, p_eligibility jsonb, p_claims jsonb)
returns public.applications language plpgsql security definer set search_path = '' as $$
declare
  questions jsonb := public.notice_questions(public.open_site_application_notice(p_notice_id));
  q jsonb;
  answer text;
  application public.applications;
begin
  if jsonb_typeof(p_answers) is distinct from 'object'
    or jsonb_typeof(p_profile_snapshot) is distinct from 'object'
    or jsonb_typeof(p_eligibility) is distinct from 'object'
    or jsonb_typeof(p_claims) is distinct from 'array' then
    raise exception '신청서 형식을 확인하세요.';
  end if;
  if exists (
    select 1 from jsonb_each(p_answers) a
    where jsonb_typeof(a.value) <> 'string'
       or not exists (select 1 from jsonb_array_elements(questions) item where item->>'id' = a.key)
  ) then
    raise exception '공고 문항에 맞게 답을 입력하세요.';
  end if;
  for q in select value from jsonb_array_elements(questions) loop
    answer := p_answers->>(q->>'id');
    if coalesce(answer, '') ~ '^[[:space:]]*$' then
      if (q->>'required')::boolean then
        raise exception '필수 문항에 답을 입력하세요. (%)', q->>'label';
      end if;
    elsif q->>'type' in ('short','long') and char_length(answer) > (q->>'max')::integer then
      raise exception '문항의 글자 수를 확인하세요. (%)', q->>'label';
    elsif q->>'type' = 'select' and not ((q->'options') ? answer) then
      raise exception '문항의 선택지를 확인하세요. (%)', q->>'label';
    end if;
  end loop;

  insert into public.applications (notice_id,user_id,status,answers,profile_snapshot,eligibility,claims)
  values (p_notice_id,auth.uid(),'submitted',p_answers,p_profile_snapshot,p_eligibility,p_claims)
  on conflict (notice_id,user_id) do update
    set status = 'submitted', answers = excluded.answers, profile_snapshot = excluded.profile_snapshot,
        eligibility = excluded.eligibility, claims = excluded.claims,
        submitted_at = case when applications.status = 'withdrawn' then excluded.submitted_at else applications.submitted_at end
  returning * into application;

  insert into public.activity_events(user_id,notice_id,type) values (auth.uid(),p_notice_id,'submit');
  return application;
end;
$$;

create function public.withdraw_application(p_notice_id uuid) returns public.applications
language plpgsql security definer set search_path = '' as $$
declare
  application public.applications;
begin
  perform public.open_site_application_notice(p_notice_id);
  update public.applications set status = 'withdrawn'
    where notice_id = p_notice_id and user_id = auth.uid()
    returning * into application;
  if not found then raise exception '취소할 신청서가 없습니다.'; end if;
  return application;
end;
$$;

revoke all on function public.open_site_application_notice(uuid),
  public.submit_application(uuid,jsonb,jsonb,jsonb,jsonb), public.withdraw_application(uuid)
  from public, anon, authenticated;
grant execute on function public.submit_application(uuid,jsonb,jsonb,jsonb,jsonb), public.withdraw_application(uuid) to authenticated;

commit;
