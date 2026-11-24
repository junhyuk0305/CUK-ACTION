-- Publish notices without a deadline, conditions, tasks or application link.
-- A deadline or deadline note still needs a source sentence.
create or replace function public.validate_notice() returns trigger language plpgsql set search_path = '' as $$
declare item jsonb; field text; op text; deadline date;
begin
  if tg_op = 'UPDATE' and new.owner_id <> old.owner_id and current_user in ('authenticated','anon') then
    raise exception '공고 담당자는 운영자만 변경할 수 있습니다.';
  end if;
  if new.status <> 'published' then return new; end if;
  if jsonb_typeof(new.data) is distinct from 'object' then
    raise exception '게시하려면 공고 데이터 형식을 확인해야 합니다.';
  end if;
  foreach field in array array['rules','tasks','questions'] loop
    if jsonb_typeof(new.data->field) is distinct from 'array' then
      raise exception '게시하려면 조건, 준비 항목, 문항을 목록으로 입력해야 합니다.';
    end if;
  end loop;
  foreach field in array array['title','department','summary','sourceUrl'] loop
    if jsonb_typeof(new.data->field) is distinct from 'string' or length(btrim(new.data->>field)) = 0 then
      raise exception '게시하려면 필수 정보를 비어 있지 않은 텍스트로 입력해야 합니다.';
    end if;
  end loop;
  foreach field in array array['category','label','color','applicationInstructions','sourceArchiveId','followup','deadlineEvidence','applicationUrl','deadline','deadlineNote','postedAt'] loop
    if new.data ? field and jsonb_typeof(new.data->field) is distinct from 'string' then
      raise exception '게시하려면 공고의 표시 정보를 텍스트로 입력해야 합니다.';
    end if;
  end loop;
  if new.data ? 'sourceReview' and new.data->'sourceReview' <> 'null'::jsonb then
    if jsonb_typeof(new.data->'sourceReview') is distinct from 'object' then
      raise exception '게시하려면 원문 검수 기록의 형식을 확인해야 합니다.';
    end if;
    foreach field in array array['checkedAt','scope'] loop
      if new.data->'sourceReview' ? field and jsonb_typeof(new.data->'sourceReview'->field) is distinct from 'string' then
        raise exception '게시하려면 검수 날짜와 범위를 텍스트로 입력해야 합니다.';
      end if;
    end loop;
    if new.data->'sourceReview' ? 'remainingChecks' then
      item := new.data->'sourceReview'->'remainingChecks';
      if jsonb_typeof(item) = 'array' then
        if exists (select 1 from jsonb_array_elements(item) as v where jsonb_typeof(v) is distinct from 'string') then
          raise exception '게시하려면 남은 검수 사항을 텍스트 목록으로 입력해야 합니다.';
        end if;
      elsif jsonb_typeof(item) is distinct from 'string' then
        raise exception '게시하려면 남은 검수 사항을 텍스트로 입력해야 합니다.';
      end if;
    end if;
    if new.data->'sourceReview' ? 'attachmentUrls' then
      item := new.data->'sourceReview'->'attachmentUrls';
      if jsonb_typeof(item) is distinct from 'array' then
        raise exception '게시하려면 근거 자료 주소를 목록으로 입력해야 합니다.';
      end if;
      if exists (select 1 from jsonb_array_elements(item) as v where jsonb_typeof(v) is distinct from 'string') then
        raise exception '게시하려면 근거 자료 주소를 텍스트 목록으로 입력해야 합니다.';
      end if;
    end if;
  end if;
  if new.data->'reviewed' is distinct from 'true'::jsonb
    or coalesce(new.data->>'sourceUrl','') !~ '^https://[^[:space:]/]+(/[^[:space:]]*)?$'
    or (length(btrim(coalesce(new.data->>'applicationUrl',''))) > 0
      and coalesce(new.data->>'applicationUrl','') !~ '^https://[^[:space:]/]+(/[^[:space:]]*)?$'
      and coalesce(new.data->>'applicationUrl','') !~ '^mailto:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') then
    raise exception '게시하려면 검수 확인과 HTTPS 원문이 필요하고, 신청 주소는 HTTPS나 이메일이어야 합니다.';
  end if;
  if length(btrim(coalesce(new.data->>'deadline',''))) > 0 then
    if new.data->>'deadline' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception '게시하려면 유효한 마감일이 필요합니다.';
    end if;
    begin deadline := (new.data->>'deadline')::date;
    exception when others then raise exception '게시하려면 유효한 마감일이 필요합니다.'; end;
    if to_char(deadline, 'YYYY-MM-DD') <> new.data->>'deadline' then
      raise exception '게시하려면 유효한 마감일이 필요합니다.';
    end if;
  end if;
  if (length(btrim(coalesce(new.data->>'deadline',''))) > 0 or length(btrim(coalesce(new.data->>'deadlineNote',''))) > 0)
    and length(btrim(coalesce(new.data->>'deadlineEvidence',''))) = 0 then
    raise exception '마감일이나 마감 문구를 게시하려면 근거 문장이 필요합니다.';
  end if;
  for item in select value from jsonb_array_elements(new.data->'rules') loop
    field := item->>'field'; op := item->>'op';
    if jsonb_typeof(item) is distinct from 'object' or field is null or field not in ('status','year','department','gpa','residence','manual')
      or op is null or op not in ('eq','in','min') or not item ? 'value'
      or jsonb_typeof(item->'label') is distinct from 'string' or jsonb_typeof(item->'evidence') is distinct from 'string'
      or length(btrim(coalesce(item->>'label',''))) = 0 or length(btrim(coalesce(item->>'evidence',''))) = 0 then
      raise exception '게시하려면 조건의 항목, 비교 방식, 값, 이름과 근거를 확인해야 합니다.';
    end if;
    if (op = 'min' and (field not in ('gpa','residence','year') or jsonb_typeof(item->'value') is distinct from 'number'))
      or (op = 'eq' and (jsonb_typeof(item->'value') is distinct from 'string' or length(btrim(item->>'value')) = 0))
      or (op = 'in' and jsonb_typeof(item->'value') is distinct from 'array') then
      raise exception '게시하려면 조건의 비교 값 형식을 확인해야 합니다.';
    end if;
    if op = 'in' then
      if jsonb_array_length(item->'value') = 0 or exists (select 1 from jsonb_array_elements(item->'value') as v where jsonb_typeof(v) is distinct from 'string' or length(btrim(v #>> '{}')) = 0) then
        raise exception '게시하려면 조건의 선택 값을 하나 이상 입력해야 합니다.';
      end if;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(new.data->'tasks') loop
    if jsonb_typeof(item) is distinct from 'string' or length(btrim(item #>> '{}')) = 0 then
      raise exception '게시하려면 비어 있지 않은 준비 항목이 필요합니다.';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(new.data->'questions') loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'label') is distinct from 'string'
      or length(btrim(coalesce(item->>'label',''))) = 0 or jsonb_typeof(item->'max') is distinct from 'number'
      or (item ? 'hint' and jsonb_typeof(item->'hint') is distinct from 'string')
      or coalesce(item->>'max','') !~ '^[0-9]{1,5}$' then
      raise exception '게시하려면 작성 문항과 글자 수 제한을 확인해야 합니다.';
    end if;
    if (item->>'max')::integer < 1 or (item->>'max')::integer > 10000 then
      raise exception '게시하려면 문항당 글자 수를 1~10000자로 설정해야 합니다.';
    end if;
  end loop;
  return new;
end;
$$;
