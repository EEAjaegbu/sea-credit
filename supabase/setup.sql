-- Sea Credit Supabase setup v1. Run the whole file in the project's SQL Editor.
-- Safe to re-run against this schema. No customer data is deleted.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  phone text not null default '',
  address text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists private.reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.reviewers enable row level security;
revoke all on private.reviewers from public, anon, authenticated;

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  request_id uuid not null,
  reference text not null unique default ('SC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))),
  applicant_name text not null,
  applicant_email text not null,
  product text not null check (product in ('salary_advance','personal_credit')),
  amount bigint not null check (amount between 50000 and 1000000),
  term_months integer not null check (term_months in (1,3,6)),
  phone text not null,
  address text not null,
  employment_type text not null check (employment_type in ('salaried','self_employed','other')),
  employer text not null,
  job_title text not null,
  monthly_income bigint not null check (monthly_income between 1 and 100000000),
  purpose text not null,
  status text not null default 'submitted' check (status in ('submitted','under_review','needs_information','approved','declined','cancelled')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, request_id)
);
create index if not exists applications_owner_created on public.applications(user_id,created_at desc);
create index if not exists applications_status on public.applications(status);
create table if not exists public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  actor_role text not null check (actor_role in ('customer','admin')),
  status text not null,
  note text not null check (char_length(note) between 5 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists application_events_parent on public.application_events(application_id,created_at);

create or replace function private.sea_is_reviewer()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from private.reviewers where user_id = (select auth.uid())); $$;
revoke all on function private.sea_is_reviewer() from public, anon, authenticated;
grant execute on function private.sea_is_reviewer() to authenticated;

alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.application_events enable row level security;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists applications_read on public.applications;
create policy applications_read on public.applications for select to authenticated
using (user_id = (select auth.uid()) or (select private.sea_is_reviewer()));
drop policy if exists application_events_read on public.application_events;
create policy application_events_read on public.application_events for select to authenticated
using (exists(select 1 from public.applications a where a.id = application_id and (a.user_id = (select auth.uid()) or (select private.sea_is_reviewer()))));
-- All writes go through narrowly scoped RPCs; a client cannot set owner, role or history.
revoke all on public.profiles, public.applications, public.application_events from public, anon, authenticated;
grant select on public.profiles, public.applications, public.application_events to authenticated;

create or replace function private.sea_create_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  v_name := left(trim(coalesce(new.raw_user_meta_data->>'name','')),100);
  if char_length(v_name) < 2 then v_name := 'Sea Credit Customer'; end if;
  insert into public.profiles(id,name) values(new.id,v_name) on conflict(id) do nothing;
  return new;
end; $$;
revoke all on function private.sea_create_profile() from public, anon, authenticated;
drop trigger if exists sea_credit_profile_created on auth.users;
create trigger sea_credit_profile_created after insert on auth.users for each row execute function private.sea_create_profile();
insert into public.profiles(id,name)
select id, case when char_length(trim(coalesce(raw_user_meta_data->>'name',''))) >= 2
 then left(trim(raw_user_meta_data->>'name'),100) else 'Sea Credit Customer' end
from auth.users on conflict(id) do nothing;

create or replace function public.sea_setup_status()
returns jsonb language sql stable set search_path = '' as $$ select jsonb_build_object('schemaVersion',1); $$;
revoke all on function public.sea_setup_status() from public;
grant execute on function public.sea_setup_status() to anon, authenticated;

create or replace function public.sea_current_profile()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.profiles; v_email text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Sign in to continue.'; end if;
  select * into p from public.profiles where id=auth.uid();
  if not found then raise exception 'Your profile is missing. Ask the project owner to rerun the setup script.'; end if;
  select email into v_email from auth.users where id=auth.uid();
  return jsonb_build_object('id',p.id,'name',p.name,'email',v_email,'phone',p.phone,'address',p.address,
    'role',case when private.sea_is_reviewer() then 'admin' else 'customer' end,'createdAt',p.created_at);
end; $$;
revoke all on function public.sea_current_profile() from public, anon;
grant execute on function public.sea_current_profile() to authenticated;

create or replace function public.sea_update_profile(p_name text,p_phone text,p_address text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Sign in to continue.'; end if;
  if not coalesce(char_length(trim(p_name)) between 2 and 100,false) then raise exception 'Name must contain 2–100 characters.'; end if;
  if not coalesce(char_length(trim(p_phone)) between 7 and 20 and p_phone ~ '^[+0-9 ()-]+$',false) then raise exception 'Enter a valid phone number.'; end if;
  if not coalesce(char_length(trim(p_address)) between 5 and 300,false) then raise exception 'Address must contain 5–300 characters.'; end if;
  update public.profiles set name=trim(p_name),phone=trim(p_phone),address=trim(p_address) where id=auth.uid();
  return public.sea_current_profile();
end; $$;
revoke all on function public.sea_update_profile(text,text,text) from public, anon;
grant execute on function public.sea_update_profile(text,text,text) to authenticated;

create or replace function private.sea_validate_fields(f jsonb)
returns void language plpgsql set search_path = '' as $$
declare key text; lo integer; hi integer;
begin
  if not coalesce(f->'testConsent' = 'true'::jsonb,false) then raise exception 'Confirm that this is fictional test information.'; end if;
  if not coalesce(f->>'product' in ('salary_advance','personal_credit'),false) then raise exception 'Choose a valid product.'; end if;
  if not coalesce(jsonb_typeof(f->'amount')='number' and (f->>'amount')::numeric=trunc((f->>'amount')::numeric) and (f->>'amount')::numeric between 50000 and 1000000,false) then raise exception 'Amount must be ₦50,000–₦1,000,000 in whole naira.'; end if;
  if not coalesce(jsonb_typeof(f->'termMonths')='number' and (f->>'termMonths')::numeric in (1,3,6),false) then raise exception 'Choose 1, 3 or 6 months.'; end if;
  if not coalesce(jsonb_typeof(f->'monthlyIncome')='number' and (f->>'monthlyIncome')::numeric=trunc((f->>'monthlyIncome')::numeric) and (f->>'monthlyIncome')::numeric between 1 and 100000000,false) then raise exception 'Enter a valid monthly income in whole naira.'; end if;
  if not coalesce(f->>'employmentType' in ('salaried','self_employed','other'),false) then raise exception 'Choose an employment status.'; end if;
  for key,lo,hi in select * from (values ('phone',7,20),('address',5,300),('employer',2,120),('jobTitle',2,100),('purpose',10,1000)) as fields(k,l,h) loop
    if not coalesce(jsonb_typeof(f->key)='string' and char_length(trim(f->>key)) between lo and hi,false) then raise exception 'Invalid or missing field: %',key; end if;
  end loop;
  if not (f->>'phone' ~ '^[+0-9 ()-]+$') then raise exception 'Enter a valid phone number.'; end if;
end; $$;
revoke all on function private.sea_validate_fields(jsonb) from public, anon, authenticated;

create or replace function public.sea_submit_application(p_fields jsonb,p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_name text; v_email text; v_count integer;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Sign in to continue.'; end if;
  if private.sea_is_reviewer() then raise exception using errcode='42501',message='Reviewer accounts cannot submit applications.'; end if;
  if p_request_id is null then raise exception 'Missing request identifier.'; end if;
  -- Lock the customer row to serialize simultaneous submissions and enforce the open-request limit.
  select name into v_name from public.profiles where id=auth.uid() for update;
  if not found then raise exception 'Your customer profile is missing.'; end if;
  select id into v_id from public.applications where user_id=auth.uid() and request_id=p_request_id;
  if found then return v_id; end if;
  perform private.sea_validate_fields(p_fields);
  select count(*) into v_count from public.applications where user_id=auth.uid() and status in ('submitted','under_review','needs_information');
  if v_count >= 5 then raise exception 'You already have five open applications.'; end if;
  select email into v_email from auth.users where id=auth.uid();
  insert into public.applications(user_id,request_id,applicant_name,applicant_email,product,amount,term_months,
    phone,address,employment_type,employer,job_title,monthly_income,purpose)
  values(auth.uid(),p_request_id,v_name,v_email,p_fields->>'product',(p_fields->>'amount')::bigint,(p_fields->>'termMonths')::integer,
    trim(p_fields->>'phone'),trim(p_fields->>'address'),p_fields->>'employmentType',trim(p_fields->>'employer'),trim(p_fields->>'jobTitle'),
    (p_fields->>'monthlyIncome')::bigint,trim(p_fields->>'purpose')) returning id into v_id;
  insert into public.application_events(application_id,actor_id,actor_role,status,note)
    values(v_id,auth.uid(),'customer','submitted','Application submitted for test review.');
  return v_id;
end; $$;
revoke all on function public.sea_submit_application(jsonb,uuid) from public, anon;
grant execute on function public.sea_submit_application(jsonb,uuid) to authenticated;

create or replace function public.sea_change_application(p_id uuid,p_version integer,p_action text,p_fields jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.applications; v_reviewer boolean; v_status text; v_note text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Sign in to continue.'; end if;
  v_reviewer := private.sea_is_reviewer();
  select * into a from public.applications where id=p_id and (user_id=auth.uid() or v_reviewer) for update;
  if not found then raise exception 'Application not found.'; end if;
  if p_version is distinct from a.version then raise exception using errcode='40001',message='This application changed. Refresh before updating it.'; end if;
  if a.status in ('approved','declined','cancelled') then raise exception 'This application is closed.'; end if;
  if p_action='review' then
    if not v_reviewer then raise exception using errcode='42501',message='Only reviewers can record decisions.'; end if;
    v_status := p_fields->>'status';
    if not coalesce(v_status in ('under_review','needs_information','approved','declined') and v_status<>a.status,false) then raise exception 'This status change is not permitted.'; end if;
    v_note := trim(p_fields->>'note');
  elsif p_action='resubmit' then
    if v_reviewer or a.user_id<>auth.uid() or a.status<>'needs_information' then raise exception using errcode='42501',message='Only the applicant can respond to an information request.'; end if;
    perform private.sea_validate_fields(p_fields);
    update public.applications set product=p_fields->>'product',amount=(p_fields->>'amount')::bigint,term_months=(p_fields->>'termMonths')::integer,
      phone=trim(p_fields->>'phone'),address=trim(p_fields->>'address'),employment_type=p_fields->>'employmentType',employer=trim(p_fields->>'employer'),
      job_title=trim(p_fields->>'jobTitle'),monthly_income=(p_fields->>'monthlyIncome')::bigint,purpose=trim(p_fields->>'purpose') where id=p_id;
    v_status := 'submitted'; v_note := trim(p_fields->>'note');
  elsif p_action='cancel' then
    if v_reviewer or a.user_id<>auth.uid() then raise exception using errcode='42501',message='Only the applicant can withdraw this request.'; end if;
    v_status := 'cancelled'; v_note := 'Application withdrawn by the customer.';
  else raise exception 'Unknown application action.';
  end if;
  if not coalesce(char_length(v_note) between 5 and 2000,false) then raise exception 'The customer-facing message must contain 5–2000 characters.'; end if;
  update public.applications set status=v_status,version=version+1,updated_at=clock_timestamp() where id=p_id;
  insert into public.application_events(application_id,actor_id,actor_role,status,note)
    values(p_id,auth.uid(),case when v_reviewer then 'admin' else 'customer' end,v_status,v_note);
  return p_id;
end; $$;
revoke all on function public.sea_change_application(uuid,integer,text,jsonb) from public, anon;
grant execute on function public.sea_change_application(uuid,integer,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
