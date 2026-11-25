-- Form lock: once a notice is published or archived, signed-in users cannot change its question
-- structure or applyMode. Labels, hints and fields outside the questions stay editable.
-- Operator accounts are not blocked, matching how validate_notice guards owner_id.
begin;

create function public.lock_notice_form() returns trigger language plpgsql set search_path = '' as $$
declare
  old_shape jsonb;
  new_shape jsonb;
begin
  if old.status not in ('published','archived') or current_user not in ('authenticated','anon') then
    return new;
  end if;
  if coalesce(nullif(old.data->'applyMode', 'null'::jsonb), '"external"'::jsonb)
     <> coalesce(nullif(new.data->'applyMode', 'null'::jsonb), '"external"'::jsonb) then
    raise exception '게시 후에는 신청 방식을 바꿀 수 없습니다.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', q->'id', 'type', q->'type', 'required', q->'required',
      'max', q->'max', 'options', q->'options', 'profileField', q->'profileField') order by n), '[]'::jsonb)
    into old_shape from jsonb_array_elements(public.notice_questions(old.data)) with ordinality as t(q, n);
  select coalesce(jsonb_agg(jsonb_build_object('id', q->'id', 'type', q->'type', 'required', q->'required',
      'max', q->'max', 'options', q->'options', 'profileField', q->'profileField') order by n), '[]'::jsonb)
    into new_shape from jsonb_array_elements(public.notice_questions(new.data)) with ordinality as t(q, n);
  if old_shape <> new_shape then
    raise exception '게시 후에는 문항 구조를 바꿀 수 없습니다. 제목과 안내 문구는 고칠 수 있습니다.';
  end if;
  return new;
end $$;

create trigger notices_form_lock before update on public.notices
  for each row execute function public.lock_notice_form();

revoke all on function public.lock_notice_form() from public, anon, authenticated;

commit;
