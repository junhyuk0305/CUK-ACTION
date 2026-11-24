-- The public home reads published notices from this table instead of a static file.
-- Visitors without an account see only published rows and only the id, status and data columns.
create policy public_published_notices on public.notices for select to anon using (status = 'published');
grant select (id, status, data) on public.notices to anon;
