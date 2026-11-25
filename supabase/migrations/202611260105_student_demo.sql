begin;

-- Seed one marked demo account atomically. Authentication and account cleanup use the Auth admin API.
create function public.replace_student_demo(p_user uuid, p_notice_ids uuid[], p_profile jsonb, p_events jsonb, p_applications jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  matched integer;
begin
  perform 1 from auth.users
    where id = p_user and email ~ '^demo(0[1-9]|[1-3][0-9]|40)@id[.]cuk-action[.]invalid$'
      and raw_app_meta_data->>'cuk_demo_seed' = 'student-1126-v1'
    for update;
  if not found or exists (select 1 from public.manager_grants where user_id = p_user) then
    raise exception '시연용 학생 계정을 확인하세요.' using errcode = '42501';
  end if;

  if cardinality(p_notice_ids) is distinct from 3 or jsonb_typeof(p_profile) is distinct from 'object'
    or jsonb_typeof(p_events) is distinct from 'array' or jsonb_typeof(p_applications) is distinct from 'array' then
    raise exception '시연 공고 3개와 학생 데이터를 확인하세요.';
  end if;
  perform 1 from public.notices
    where id = any(p_notice_ids) and status = 'published' and data->>'applyMode' = 'site' order by id for share;
  get diagnostics matched = row_count;
  if matched <> 3 then raise exception '게시된 서로 다른 사이트 신청 공고 3개가 필요합니다.'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_events) e(notice_id uuid, type text)
    where e.notice_id is null or not (e.notice_id = any(p_notice_ids))
       or e.type is null or e.type not in ('view','block','apply_start','question','submit')
  ) or exists (
    select 1 from jsonb_to_recordset(p_applications) a(notice_id uuid)
    where a.notice_id is null or not (a.notice_id = any(p_notice_ids))
  ) then raise exception '지정한 공고의 학생 데이터만 넣을 수 있습니다.'; end if;

  insert into public.student_state(user_id, data)
  values (p_user, jsonb_build_object('profile',p_profile,'saved','[]'::jsonb,'applications','{}'::jsonb,'read','[]'::jsonb))
  on conflict (user_id) do update set data = jsonb_set(student_state.data, '{profile}', excluded.data->'profile');

  delete from public.activity_events where user_id = p_user and notice_id = any(p_notice_ids);
  insert into public.activity_events(user_id,notice_id,type,source,block_id,question_id)
  select p_user,e.notice_id,e.type,e.source,e.block_id,e.question_id
  from jsonb_to_recordset(p_events) e(notice_id uuid,type text,source text,block_id text,question_id text);

  delete from public.applications a where a.user_id = p_user and a.notice_id = any(p_notice_ids)
    and not exists (select 1 from jsonb_to_recordset(p_applications) planned(notice_id uuid) where planned.notice_id = a.notice_id);
  insert into public.applications(user_id,notice_id,status,answers,profile_snapshot,eligibility)
  select p_user,a.notice_id,'submitted',a.answers,a.profile_snapshot,a.eligibility
  from jsonb_to_recordset(p_applications) a(notice_id uuid,answers jsonb,profile_snapshot jsonb,eligibility jsonb)
  on conflict (notice_id,user_id) do update set status = excluded.status, answers = excluded.answers,
    profile_snapshot = excluded.profile_snapshot, eligibility = excluded.eligibility, claims = excluded.claims;
end;
$$;

revoke all on function public.replace_student_demo(uuid,uuid[],jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.replace_student_demo(uuid,uuid[],jsonb,jsonb,jsonb) to service_role;

commit;
