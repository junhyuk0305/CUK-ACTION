begin;

-- Invoker rights keep custom qualifications subject to the caller's row policies.
create function public.notice_eligibility(p_rules jsonb, p_profile jsonb, p_user uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  rule jsonb;
  field text;
  op text;
  val jsonb;
  raw text;
  min_value double precision;
  result text;
  year_value text := p_profile->>'year';
  semester_value text := p_profile->>'semester';
  results jsonb := '[]';
  passes integer := 0;
  failures integer := 0;
  unknowns integer := 0;
begin
  for rule in select value from jsonb_array_elements(p_rules) loop
    field := rule->>'field';
    op := rule->>'op';
    val := p_profile->field;
    raw := regexp_replace(val #>> '{}', U&'^[[:space:]\00A0\FEFF]+|[[:space:]\00A0\FEFF]+$', '', 'g');
    result := 'unknown';
    if field = 'custom' then
      if exists (select 1 from public.student_qualifications sq
                 where sq.user_id = p_user and sq.qualification_id::text = rule->>'value' and sq.status = 'verified') then
        result := 'pass';
      end if;
    elsif field = 'cu12Course' then
      if op = 'eq' and rule->>'value' = 'home' then
        result := 'pass';
      elsif op = 'eq' and rule->>'value' = 'other' then
        if year_value in ('1','2','3') then result := 'pass';
        elsif year_value = '4' and semester_value = '1' then result := 'pass';
        elsif year_value = '4' and semester_value = '2' then result := 'fail';
        end if;
      end if;
    elsif field <> 'manual' and raw is not null and raw <> '' then
      if op = 'min' then
        -- Numeric inputs can be strings in stored profiles. Malformed values must not interrupt publication.
        if jsonb_typeof(val) = 'boolean' then raw := case when val = 'true'::jsonb then '1' else '0' end; end if;
        if raw ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' then
          begin
            min_value := raw::double precision;
            result := case when min_value >= (rule->>'value')::double precision then 'pass' else 'fail' end;
          exception when numeric_value_out_of_range or invalid_text_representation then
            result := 'unknown';
          end;
        end if;
      elsif op = 'in' then
        result := case when exists (select 1 from jsonb_array_elements(rule->'value') v where v = val) then 'pass' else 'fail' end;
      else
        result := case when val = rule->'value' then 'pass' else 'fail' end;
      end if;
    end if;
    results := results || jsonb_build_array(rule || jsonb_build_object('status',result));
    case result when 'pass' then passes := passes + 1;
                when 'fail' then failures := failures + 1;
                else unknowns := unknowns + 1; end case;
  end loop;
  return jsonb_build_object('results', results, 'pass', passes, 'fail', failures, 'unknown', unknowns,
                            'total', passes + failures + unknowns);
end;
$$;

create function public.notify_students_on_publication() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'published' or (tg_op = 'UPDATE' and old.status = 'published') then return new; end if;

  with eligible as materialized (
    select s.user_id, public.notice_eligibility(new.data->'rules', s.data->'profile', s.user_id) as score
    from public.student_state s
    where not exists (select 1 from public.manager_grants g where g.user_id = s.user_id)
      and not exists (
        select 1 from unnest(array['department','year','status']) f
        where coalesce(s.data->'profile'->>f, '') !~ U&'[^[:space:]\00A0\FEFF]'
      )
  )
  insert into public.notifications(user_id, notice_id, kind, pass, total, unknown)
  select user_id, new.id, 'new_notice', (score->>'pass')::integer, (score->>'total')::integer, (score->>'unknown')::integer
  from eligible where (score->>'fail')::integer = 0
  on conflict (user_id, notice_id, kind) do nothing;
  return new;
end;
$$;

create trigger notify_students_on_publication after insert or update of status on public.notices
for each row execute function public.notify_students_on_publication();

revoke all on function public.notice_eligibility(jsonb,jsonb,uuid), public.notify_students_on_publication()
  from public, anon, authenticated;
grant execute on function public.notice_eligibility(jsonb,jsonb,uuid) to authenticated;

commit;
