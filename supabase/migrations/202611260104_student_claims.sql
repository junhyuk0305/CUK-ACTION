begin;

-- Runs in the same transaction as submission; a withdrawn application does not make a new claim.
create function public.store_application_claims() returns trigger
language plpgsql set search_path = '' as $$
declare
  rules jsonb;
begin
  if new.status <> 'submitted' or new.claims = '[]'::jsonb then return new; end if;
  select data->'rules' into rules from public.notices where id = new.notice_id;

  if exists (
    select 1 from jsonb_array_elements(new.claims) c
    where jsonb_typeof(c) <> 'object' or jsonb_typeof(c->'qualificationId') is distinct from 'string'
       or (c ? 'note' and jsonb_typeof(c->'note') <> 'string')
       or char_length(c->>'note') > 500
       or not exists (select 1 from jsonb_array_elements(rules) r
                      where r->>'field' = 'custom' and r->>'value' = c->>'qualificationId')
  ) then raise exception '공고의 자격과 자기 신고 설명을 확인하세요.'; end if;
  if exists (select 1 from jsonb_array_elements(new.claims) c group by (c->>'qualificationId')::uuid having count(*) > 1) then
    raise exception '같은 자격을 두 번 신고할 수 없습니다.';
  end if;

  insert into public.student_qualifications(user_id,qualification_id,status,note,application_id)
  select new.user_id, (c->>'qualificationId')::uuid, 'claimed', coalesce(c->>'note',''), new.id
  from jsonb_array_elements(new.claims) c order by (c->>'qualificationId')::uuid
  on conflict (user_id,qualification_id) do update
    set status = 'claimed', note = excluded.note, application_id = excluded.application_id,
        decided_by = null, decided_at = null
    where student_qualifications.status <> 'verified';
  return new;
end;
$$;

create trigger store_application_claims after insert or update of claims on public.applications
for each row execute function public.store_application_claims();
revoke all on function public.store_application_claims() from public, anon, authenticated;

commit;
