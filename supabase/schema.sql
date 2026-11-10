create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table if not exists public.crochet_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 100),
  category text not null check (char_length(trim(category)) between 1 and 50),
  description text not null check (char_length(trim(description)) between 1 and 1000),
  status text not null default 'Made to order'
    check (status in ('Made to order', 'Available to request', 'Inspiration')),
  image_path text not null,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crochet_items enable row level security;
grant select on public.crochet_items to anon, authenticated;
grant insert, update, delete on public.crochet_items to authenticated;

drop policy if exists "Anyone can view published crochet" on public.crochet_items;
create policy "Anyone can view published crochet"
  on public.crochet_items for select
  to anon, authenticated
  using (published or (select public.is_admin()));

drop policy if exists "Admins can add crochet" on public.crochet_items;
create policy "Admins can add crochet"
  on public.crochet_items for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists "Admins can update crochet" on public.crochet_items;
create policy "Admins can update crochet"
  on public.crochet_items for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can delete crochet" on public.crochet_items;
create policy "Admins can delete crochet"
  on public.crochet_items for delete
  to authenticated
  using ((select public.is_admin()));

create table if not exists public.site_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;
grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;

drop policy if exists "Anyone can view order availability" on public.site_settings;
create policy "Anyone can view order availability"
  on public.site_settings for select
  to anon, authenticated
  using (key = 'availability' or (select public.is_admin()));

drop policy if exists "Admins can manage site settings" on public.site_settings;
create policy "Admins can manage site settings"
  on public.site_settings for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

insert into public.site_settings (key, value)
values ('availability', 'available')
on conflict (key) do nothing;

create table if not exists public.order_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  contact text not null check (char_length(trim(contact)) between 1 and 140),
  description text not null check (char_length(trim(description)) between 1 and 2000),
  design_title text check (design_title is null or char_length(design_title) <= 300),
  reference_path text,
  status text not null default 'New'
    check (status in ('New', 'In discussion', 'Accepted', 'Declined', 'Completed')),
  created_at timestamptz not null default now()
);

alter table public.order_inquiries enable row level security;
revoke all on public.order_inquiries from anon, authenticated;
grant insert on public.order_inquiries to anon, authenticated;
grant select, update on public.order_inquiries to authenticated;

drop policy if exists "Visitors can submit new inquiries" on public.order_inquiries;
create policy "Visitors can submit new inquiries"
  on public.order_inquiries for insert
  to anon, authenticated
  with check (
    status = 'New'
    and char_length(trim(name)) between 1 and 80
    and char_length(trim(contact)) between 1 and 140
    and char_length(trim(description)) between 1 and 2000
    and (design_title is null or char_length(design_title) <= 300)
    and exists (
      select 1
      from public.site_settings
      where key = 'availability' and value = 'available'
    )
  );

drop policy if exists "Admins can view inquiries" on public.order_inquiries;
create policy "Admins can view inquiries"
  on public.order_inquiries for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins can update inquiries" on public.order_inquiries;
create policy "Admins can update inquiries"
  on public.order_inquiries for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Customers can attach a reference to their new inquiry" on public.order_inquiries;

create or replace function public.attach_inquiry_reference(
  p_inquiry_id uuid,
  p_reference_path text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_reference_path !~ ('^customer-requests/' || p_inquiry_id::text || '\.(jpg|png|webp)$') then
    return false;
  end if;

  update public.order_inquiries
  set reference_path = p_reference_path
  where id = p_inquiry_id
    and status = 'New'
    and reference_path is null;

  return found;
end;
$$;

revoke all on function public.attach_inquiry_reference(uuid, text) from public;
grant execute on function public.attach_inquiry_reference(uuid, text) to anon, authenticated;

insert into public.crochet_items (title, category, description, status, image_path, published)
select seed.title, seed.category, seed.description, seed.status, seed.image_path, true
from (values
  (
    'Star-Patch Beanie',
    'Wearables',
    'A deep green crochet beanie finished with a bold red star patch. Ask about sizing and color options for a custom make.',
    'Made to order',
    'site:images/Green%20and%20Red%20Star-Patch%20Beanie.png'
  ),
  (
    'Bear-Ear Beanie',
    'Wearables',
    'A playful lavender-and-mint beanie with soft bear ears and a little crochet bow detail.',
    'Available to request',
    'site:images/Lavender%20and%20Mint%20Bear-Ear%20Beanie.png'
  ),
  (
    'Striped Cat-Ear Beanie',
    'Wearables',
    'A bold red-and-black striped beanie with pointy cat ears. Share your favorite colors when you get in touch.',
    'Inspiration',
    'site:images/Striped%20Cat-Ear%20Beanie%20Display.png'
  ),
  (
    'Striped Slouchy Beanie',
    'Wearables',
    'A relaxed slouchy beanie in charcoal and soft gray stripes, topped with a big crochet ear detail.',
    'Made to order',
    'site:images/Striped%20Slouchy%20Crochet%20Beanie%20Mannequin.png'
  )
) as seed(title, category, description, status, image_path)
where not exists (select 1 from public.crochet_items);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('gallery-images', 'gallery-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('order-references', 'order-references', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view gallery images" on storage.objects;
create policy "Anyone can view gallery images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'gallery-images');

drop policy if exists "Admins can upload gallery images" on storage.objects;
create policy "Admins can upload gallery images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'gallery-images' and (select public.is_admin()));

drop policy if exists "Admins can update gallery images" on storage.objects;
create policy "Admins can update gallery images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'gallery-images' and (select public.is_admin()))
  with check (bucket_id = 'gallery-images' and (select public.is_admin()));

drop policy if exists "Admins can delete gallery images" on storage.objects;
create policy "Admins can delete gallery images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'gallery-images' and (select public.is_admin()));

drop policy if exists "Visitors can upload order reference images" on storage.objects;
create policy "Visitors can upload order reference images"
  on storage.objects for insert
  to anon
  with check (
    bucket_id = 'order-references'
    and (storage.foldername(name))[1] = 'customer-requests'
  );

drop policy if exists "Admins can view order reference images" on storage.objects;
create policy "Admins can view order reference images"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'order-references' and (select public.is_admin()));

drop policy if exists "Admins can delete order reference images" on storage.objects;
create policy "Admins can delete order reference images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'order-references' and (select public.is_admin()));
