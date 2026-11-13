-- Run after setup.sql or migration 002. Requires Supabase Storage.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('application-documents','application-documents',false,5242880,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['application/pdf','image/jpeg','image/png'];

create or replace function private.sea_document_access(object_name text, editing boolean)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
    and split_part(object_name,'/',3) in ('bank_statement','identification','utility_bill','employment_proof','house_photo','office_photos','passport_photo','guarantor_identity')
    and object_name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-z_]+/[a-f0-9-]{36}[.](pdf|jpg|png)$'
    and exists(select 1 from public.applications a
      where a.id::text=split_part(object_name,'/',2) and a.user_id::text=split_part(object_name,'/',1)
      and case when editing then a.user_id=auth.uid() and not private.sea_is_reviewer() and a.status in ('submitted','needs_information')
        else a.user_id=auth.uid() or private.sea_is_reviewer() end);
$$;
revoke all on function private.sea_document_access(text,boolean) from public,anon;
grant execute on function private.sea_document_access(text,boolean) to authenticated;
drop policy if exists sea_documents_read on storage.objects;
create policy sea_documents_read on storage.objects for select to authenticated
using(bucket_id='application-documents' and private.sea_document_access(name,false));
drop policy if exists sea_documents_insert on storage.objects;
create policy sea_documents_insert on storage.objects for insert to authenticated
with check(bucket_id='application-documents' and private.sea_document_access(name,true));
drop policy if exists sea_documents_delete on storage.objects;
create policy sea_documents_delete on storage.objects for delete to authenticated
using(bucket_id='application-documents' and private.sea_document_access(name,true));
-- No UPDATE policy: document replacement requires a new upload; no overwrite/upsert.
notify pgrst, 'reload schema';
commit;
