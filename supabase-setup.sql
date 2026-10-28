-- Execute este script no SQL Editor do seu projeto Supabase.
-- Depois de criar seu usuário em Authentication > Users, execute o INSERT
-- indicado no README para autorizá-lo como administrador.

create table if not exists public.gallery_projects (
  id text primary key,
  category text not null check (category in ('logos', 'artes', 'vestuario')),
  title text not null,
  description text not null default '',
  year text not null default '',
  format text not null default '',
  tags jsonb not null default '[]'::jsonb,
  files jsonb not null default '[]'::jsonb,
  sort_order integer not null default 9999,
  updated_at timestamptz not null default now()
);

create table if not exists public.gallery_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.gallery_projects enable row level security;
alter table public.gallery_admins enable row level security;

create or replace function public.is_gallery_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.gallery_admins
    where user_id = auth.uid()
  );
$$;
revoke all on function public.is_gallery_admin() from public;
grant execute on function public.is_gallery_admin() to authenticated;

drop policy if exists "Projects are public to read" on public.gallery_projects;
create policy "Projects are public to read"
  on public.gallery_projects for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can insert projects" on public.gallery_projects;
create policy "Admins can insert projects"
  on public.gallery_projects for insert
  to authenticated
  with check (public.is_gallery_admin());

drop policy if exists "Admins can update projects" on public.gallery_projects;
create policy "Admins can update projects"
  on public.gallery_projects for update
  to authenticated
  using (public.is_gallery_admin())
  with check (public.is_gallery_admin());

drop policy if exists "Admins can delete projects" on public.gallery_projects;
create policy "Admins can delete projects"
  on public.gallery_projects for delete
  to authenticated
  using (public.is_gallery_admin());

drop policy if exists "Admins can read their own admin record" on public.gallery_admins;
create policy "Admins can read their own admin record"
  on public.gallery_admins for select
  to authenticated
  using (user_id = auth.uid());

-- Cria o bucket público para as imagens. A leitura é pública; o envio/alteração
-- e a exclusão ficam restritos aos administradores autorizados.
insert into storage.buckets (id, name, public)
values ('gallery-images', 'gallery-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Gallery images are public to read" on storage.objects;
create policy "Gallery images are public to read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'gallery-images');

drop policy if exists "Admins can upload gallery images" on storage.objects;
create policy "Admins can upload gallery images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'gallery-images' and public.is_gallery_admin());

drop policy if exists "Admins can update gallery images" on storage.objects;
create policy "Admins can update gallery images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'gallery-images' and public.is_gallery_admin())
  with check (bucket_id = 'gallery-images' and public.is_gallery_admin());

drop policy if exists "Admins can delete gallery images" on storage.objects;
create policy "Admins can delete gallery images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'gallery-images' and public.is_gallery_admin());
