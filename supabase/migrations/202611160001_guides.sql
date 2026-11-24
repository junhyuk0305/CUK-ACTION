create table public.guide_drafts (
 official_id text primary key check(official_id ~ '^[0-9]+$'), owner_id uuid not null references auth.users, rows jsonb not null default '[]'
);
create table public.approved_guides (official_id text primary key references public.guide_drafts, rows jsonb not null);
alter table public.guide_drafts enable row level security;
alter table public.approved_guides enable row level security;
revoke all on public.guide_drafts,public.approved_guides from anon,authenticated;
grant select on public.approved_guides to anon,authenticated;
grant select on public.guide_drafts to authenticated;
create policy approved_read on public.approved_guides for select using(true);
create policy draft_owner on public.guide_drafts for select using(owner_id=auth.uid() and exists(select 1 from public.manager_grants where user_id=auth.uid()));
create function public.write_notice_guide(p_user uuid,p_id text,p_mode text,p_rows jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from manager_grants where user_id=p_user)
 or exists(select 1 from notices where data->>'sourceUrl' ~ ('[?&]articleNo='||p_id||'(&|$)') and owner_id<>p_user)
 then raise exception 'not owner'; end if;
 insert into guide_drafts(official_id,owner_id) values(p_id,p_user) on conflict do nothing;
 perform 1 from guide_drafts where official_id=p_id and owner_id=p_user for update;
 if not found then raise exception 'not owner'; end if;
 if p_mode='draft' then update guide_drafts set rows=p_rows where official_id=p_id;
 elsif p_mode='approve' then
 insert into approved_guides values(p_id,p_rows) on conflict(official_id) do update set rows=excluded.rows;
 elsif p_mode<>'claim' then raise exception 'invalid mode'; end if;
end $$;
revoke all on function public.write_notice_guide(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.write_notice_guide(uuid,text,text,jsonb) to service_role;

-- Import only audited aggregates with INSERT ... ON CONFLICT on the full source/period key.
create table public.notice_responses (
 notice_id uuid references public.notices not null, source text not null check(trim(source)<>''), starts date not null, ends date not null check(ends>=starts),
 total integer not null check(total>=0), target integer not null check(target between 0 and total),
 route integer not null check(route between 0 and total), materials integer not null check(materials between 0 and total),
 primary key(notice_id,source,starts,ends)
);
alter table public.notice_responses enable row level security;
revoke all on public.notice_responses from public,anon,authenticated;
create function public.response_metrics(p_notice_id uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from notices join manager_grants on owner_id=user_id where id=p_notice_id and owner_id=auth.uid()) then raise exception 'not owner'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('source',source,'zero',total=0,'counts',jsonb_build_object(
 '대상',case when target not between 1 and 4 then target end,
 '신청 경로',case when route not between 1 and 4 then route end,
 '준비물',case when materials not between 1 and 4 then materials end)) order by source)
 from notice_responses where notice_id=p_notice_id and starts=p_from and ends=p_to),'[]');
end $$;
revoke all on function public.response_metrics(uuid,date,date) from public,anon;
grant execute on function public.response_metrics(uuid,date,date) to authenticated;
