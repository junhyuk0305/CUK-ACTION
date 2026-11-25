-- decide_qualification: the owner of the notice a self-claim came in through marks it verified or rejected.
-- Same scope as the student_qualifications read policy. A decided row may be decided again; it never returns to claimed.
begin;

create function public.decide_qualification(p_user_id uuid, p_qualification_id uuid, p_verified boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare result text;
begin
  if p_verified is null then raise exception '확인 또는 반려 중 하나를 골라야 합니다.'; end if;
  update public.student_qualifications sq
  set status = case when p_verified then 'verified' else 'rejected' end, decided_by = auth.uid(), decided_at = now()
  where sq.user_id = p_user_id and sq.qualification_id = p_qualification_id and exists (
    select 1 from public.applications a
    join public.notices n on n.id = a.notice_id
    join public.manager_grants g on g.user_id = n.owner_id
    where a.id = sq.application_id and n.owner_id = auth.uid()
  )
  returning sq.status into result;
  if result is null then
    raise exception '담당 공고에 들어온 자기 신고만 확인할 수 있습니다.' using errcode = '42501';
  end if;
  return result;
end;
$$;
revoke all on function public.decide_qualification(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.decide_qualification(uuid, uuid, boolean) to authenticated;

commit;
