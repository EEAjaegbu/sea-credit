-- Run ONLY as the project owner in Supabase SQL Editor.
-- First create and email-confirm the reviewer account through the app.
-- Replace the placeholder email below with the exact intended account.
do $$
declare target uuid;
begin
  select id into target from auth.users
    where lower(email)=lower('REPLACE_WITH_REVIEWER_EMAIL') and email_confirmed_at is not null;
  if target is null then raise exception 'No confirmed account found. Replace the email and confirm the account first.'; end if;
  insert into private.reviewers(user_id) values(target) on conflict(user_id) do nothing;
end $$;
