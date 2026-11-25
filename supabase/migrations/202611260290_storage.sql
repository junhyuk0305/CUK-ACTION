-- Notice image storage. See docs/CONTRACT.md section 9.
-- Public read. Managers upload, replace and delete only under <own user id>/<notice id>/<file>.
-- The local DB test harness skips this file because PGlite has no storage schema.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notice-images', 'notice-images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists notice_images_read on storage.objects;
create policy notice_images_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'notice-images');

drop policy if exists notice_images_insert on storage.objects;
create policy notice_images_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'notice-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.manager_grants where user_id = (select auth.uid()))
  );

drop policy if exists notice_images_update on storage.objects;
create policy notice_images_update on storage.objects for update to authenticated
  using (
    bucket_id = 'notice-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.manager_grants where user_id = (select auth.uid()))
  )
  with check (
    bucket_id = 'notice-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists notice_images_delete on storage.objects;
create policy notice_images_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'notice-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.manager_grants where user_id = (select auth.uid()))
  );

commit;
