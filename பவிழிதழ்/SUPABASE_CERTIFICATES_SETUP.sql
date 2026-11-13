-- பவிழிதழ்: பதிவிறக்கக்கூடிய சான்றிதழ்களுக்கான ஒருமுறை Supabase அமைப்பு
-- Supabase Dashboard > SQL Editor-ல் முழுவதையும் ஒருமுறை இயக்கவும்.
-- இந்த SQL ஏற்கெனவே உள்ள posts/comments/site_settings அட்டவணைகளை மாற்றாது.

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  certificate_no text not null unique,
  recipient_name text not null,
  certificate_type text not null check (certificate_type in ('selection','selected_work','participation','special','winner')),
  event_name text not null,
  work_title text,
  category text,
  issue_year integer not null check (issue_year between 2000 and 2200),
  issued_on date not null,
  file_path text not null,
  file_name text not null,
  is_published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists certificates_public_date_idx on public.certificates (is_published, issued_on desc);
create index if not exists certificates_recipient_name_idx on public.certificates using gin (to_tsvector('simple', recipient_name));

alter table public.certificates enable row level security;

drop policy if exists "Published certificates are visible" on public.certificates;
create policy "Published certificates are visible"
  on public.certificates for select to anon, authenticated
  using (is_published = true);

drop policy if exists "Admins can view all certificates" on public.certificates;
create policy "Admins can view all certificates"
  on public.certificates for select to authenticated
  using (public.pavizhidhal_is_admin());

drop policy if exists "Admins can insert certificates" on public.certificates;
create policy "Admins can insert certificates"
  on public.certificates for insert to authenticated
  with check (public.pavizhidhal_is_admin());

drop policy if exists "Admins can update certificates" on public.certificates;
create policy "Admins can update certificates"
  on public.certificates for update to authenticated
  using (public.pavizhidhal_is_admin())
  with check (public.pavizhidhal_is_admin());

drop policy if exists "Admins can delete certificates" on public.certificates;
create policy "Admins can delete certificates"
  on public.certificates for delete to authenticated
  using (public.pavizhidhal_is_admin());

grant select on public.certificates to anon, authenticated;
grant insert, update, delete on public.certificates to authenticated;

-- பொது வாசகர்கள் PDF-ஐப் பதிவிறக்குவதற்கான Public Storage Bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pavizhidhal-certificates', 'pavizhidhal-certificates', true, 20971520, array['application/pdf'])
on conflict (id) do update
set public = true, file_size_limit = 20971520, allowed_mime_types = array['application/pdf'];

drop policy if exists "Public can read published certificate PDFs" on storage.objects;
create policy "Public can read published certificate PDFs"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'pavizhidhal-certificates');

drop policy if exists "Admins can upload certificate PDFs" on storage.objects;
create policy "Admins can upload certificate PDFs"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'pavizhidhal-certificates' and public.pavizhidhal_is_admin());

drop policy if exists "Admins can update certificate PDFs" on storage.objects;
create policy "Admins can update certificate PDFs"
  on storage.objects for update to authenticated
  using (bucket_id = 'pavizhidhal-certificates' and public.pavizhidhal_is_admin())
  with check (bucket_id = 'pavizhidhal-certificates' and public.pavizhidhal_is_admin());

drop policy if exists "Admins can delete certificate PDFs" on storage.objects;
create policy "Admins can delete certificate PDFs"
  on storage.objects for delete to authenticated
  using (bucket_id = 'pavizhidhal-certificates' and public.pavizhidhal_is_admin());
