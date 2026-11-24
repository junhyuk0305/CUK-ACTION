-- ID login password reset: returns a user only when the account may be reset.
-- Managers and accounts marked app_metadata.protected=true are never returned.
create function public.password_reset_target(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
  where u.email = lower(p_email)
    and coalesce(u.raw_app_meta_data->>'protected', '') <> 'true'
    and not exists (select 1 from public.manager_grants g where g.user_id = u.id);
$$;
revoke all on function public.password_reset_target(text) from public, anon, authenticated;
grant execute on function public.password_reset_target(text) to service_role;
