-- Create a public bucket for profile images.
-- Run this once in the Supabase SQL Editor.

insert into storage.buckets (id, name, public)
values ('profile-images', 'profile-images', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload profile images
create policy "Authenticated users can upload profile images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'profile-images');

-- Allow authenticated users to update (overwrite) their uploads
create policy "Authenticated users can update profile images"
on storage.objects for update
to authenticated
using (bucket_id = 'profile-images');

-- Allow anyone to read profile images (public bucket)
create policy "Public read access for profile images"
on storage.objects for select
to public
using (bucket_id = 'profile-images');

-- Allow authenticated users to delete profile images
create policy "Authenticated users can delete profile images"
on storage.objects for delete
to authenticated
using (bucket_id = 'profile-images');
