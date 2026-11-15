-- Requires 20261024_portal_workflow.sql. Run in the Supabase SQL Editor.
-- Save the application and its notification together, including browser retries.
begin;

alter table public.email_events
  add column if not exists attempt_count integer not null default 0,
  add column if not exists claimed_at timestamptz;
alter table public.email_events drop constraint if exists email_events_delivery_status_check;
alter table public.email_events add constraint email_events_delivery_status_check
  check (delivery_status in ('queued', 'sending', 'sent', 'failed', 'bounced'));
create unique index if not exists application_notification_once_idx
  on public.email_events(application_id) where template = 'new_application';

create or replace function public.portal_submit_application(p_application jsonb, p_notification_email text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare app_id uuid; event_id uuid; created boolean := true;
begin
  if p_notification_email is null or p_notification_email !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$' then raise exception 'INVALID_NOTIFICATION_RECIPIENT'; end if;
  insert into applications(applicant_name, applicant_email, institution, student_id, program, project_title,
    ktm_drive_url, proposal_drive_url, availability_preferences, consented_at, submission_key)
  values(p_application->>'name', p_application->>'email', 'Universitas Negeri Semarang',
    p_application->>'nim', p_application->>'program', p_application->>'title',
    p_application->>'ktm', p_application->>'proposal', p_application->'preferences', now(),
    (p_application->>'submissionKey')::uuid)
  on conflict(submission_key) where submission_key is not null do nothing returning id into app_id;
  if app_id is null then
    created := false;
    select id into app_id from applications where submission_key = (p_application->>'submissionKey')::uuid;
    select id into event_id from email_events where application_id = app_id and template = 'new_application';
  else
    insert into email_events(application_id, template, recipient, provider, delivery_status)
    values(app_id, 'new_application', p_notification_email, 'gmail', 'queued') returning id into event_id;
  end if;
  return jsonb_build_object('id', app_id, 'email_event_id', event_id, 'created', created);
end; $$;

-- Only one background task may claim an email at a time. Stale claims can recover.
create or replace function public.portal_claim_application_email(p_event_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare affected integer;
begin
  update email_events set delivery_status = 'sending', claimed_at = now(), attempt_count = attempt_count + 1
  where id = p_event_id and template = 'new_application' and
    (delivery_status in ('queued', 'failed') or (delivery_status = 'sending' and claimed_at < now() - interval '5 minutes'));
  get diagnostics affected = row_count;
  return affected = 1;
end; $$;

revoke all on function public.portal_submit_application(jsonb, text) from public, anon, authenticated;
revoke all on function public.portal_claim_application_email(uuid) from public, anon, authenticated;
grant execute on function public.portal_submit_application(jsonb, text) to service_role;
grant execute on function public.portal_claim_application_email(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
