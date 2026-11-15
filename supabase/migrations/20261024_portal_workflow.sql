-- Run once in the Supabase SQL Editor after the initial schema from this chat.
-- Additive migration: Google Drive documents + availability + secure portal RPCs.
begin;

alter table public.applications
  add column if not exists program text,
  add column if not exists ktm_drive_url text,
  add column if not exists proposal_drive_url text,
  add column if not exists availability_preferences jsonb not null default '[]'::jsonb,
  add column if not exists consented_at timestamptz,
  add column if not exists submission_key uuid;
create unique index if not exists applications_submission_key_idx on public.applications(submission_key) where submission_key is not null;

create table if not exists public.portal_rate_limits (
  bucket text primary key,
  hits integer not null,
  resets_at timestamptz not null
);
alter table public.portal_rate_limits enable row level security;

create or replace function public.portal_allow_request(p_bucket text, p_max integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare requests integer;
begin
  delete from portal_rate_limits where resets_at < now() - interval '1 day';
  insert into portal_rate_limits(bucket, hits, resets_at)
  values (p_bucket, 1, now() + make_interval(secs => p_seconds))
  on conflict(bucket) do update set
    hits = case when portal_rate_limits.resets_at <= now() then 1 else portal_rate_limits.hits + 1 end,
    resets_at = case when portal_rate_limits.resets_at <= now() then now() + make_interval(secs => p_seconds) else portal_rate_limits.resets_at end
  returning hits into requests;
  return requests <= p_max;
end; $$;

-- Atomic exchange: the consumed access token cannot be redeemed twice.
create or replace function public.portal_redeem(p_token_hash text, p_session_hash text)
returns timestamptz language plpgsql security definer set search_path = public, pg_temp as $$
declare grant_row access_grants%rowtype; expires timestamptz;
begin
  select * into grant_row from access_grants where token_hash = p_token_hash for update;
  if not found or grant_row.revoked_at is not null or grant_row.redeemed_at is not null or grant_row.redeem_expires_at <= now() then
    raise exception 'INVALID_CREDENTIAL';
  end if;
  if not exists(select 1 from compute_allocations where id = grant_row.allocation_id and status in ('scheduled', 'completed')) then
    raise exception 'INVALID_CREDENTIAL';
  end if;
  expires := now() + interval '7 days';
  update access_grants set redeemed_at = now(), portal_access_expires_at = expires where id = grant_row.id;
  insert into portal_sessions(access_grant_id, session_token_hash, session_expires_at, last_seen_at)
  values (grant_row.id, p_session_hash, expires, now());
  return expires;
end; $$;

-- Slot reservations include a 20-minute provisioning buffer and 30-minute export/cleanup buffer.
alter table public.compute_allocations add column if not exists resource_window tstzrange;
update public.compute_allocations set resource_window = tstzrange(proposed_start_at - interval '20 minutes', proposed_end_at + interval '30 minutes', '[)')
where resource_window is null and status in ('awaiting_availability', 'user_confirmed', 'scheduled');
do $$ begin
  if not exists(select 1 from pg_constraint where conname = 'exclusive_compute_window' and conrelid = 'public.compute_allocations'::regclass) then
    alter table public.compute_allocations add constraint exclusive_compute_window exclude using gist(resource_window with &&)
    where (status in ('awaiting_availability', 'user_confirmed', 'scheduled'));
  end if;
end $$;

create or replace function public.portal_propose_slot(
  p_application_id uuid, p_start timestamptz, p_end timestamptz,
  p_gpu text, p_instance text, p_workspace integer, p_cost numeric, p_admin text,
  p_confirm_hash text, p_decline_hash text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare allocation uuid; response_deadline timestamptz;
begin
  perform pg_advisory_xact_lock(741259);
  if p_start < now() + interval '1 hour' or p_end <= p_start or p_end > p_start + interval '12 hours' or p_workspace < 20 or p_workspace > 2000 or p_cost <= 0 then
    raise exception 'INVALID_ALLOCATION';
  end if;
  if not exists(select 1 from applications where id = p_application_id and status in ('approved_in_principle', 'awaiting_availability', 'user_confirmed')) then raise exception 'INVALID_APPLICATION_STATE'; end if;
  if exists(select 1 from compute_allocations where application_id = p_application_id and status = 'scheduled') then raise exception 'ALREADY_SCHEDULED'; end if;
  update compute_allocations set status = 'expired', updated_at = now() where status = 'awaiting_availability' and confirmation_expires_at <= now();
  update availability_confirmations set response_status = 'expired' where response_status = 'pending' and expires_at <= now();
  update compute_allocations set status = 'cancelled', updated_at = now() where application_id = p_application_id and status in ('proposed', 'awaiting_availability', 'user_confirmed');
  response_deadline := least(now() + interval '24 hours', p_start - interval '30 minutes');
  insert into compute_allocations(application_id, status, instance_type, gpu_name, workspace_ebs_gb, proposed_start_at, proposed_end_at, confirmation_expires_at, cost_limit_usd, created_by_email, resource_window)
  values(p_application_id, 'awaiting_availability', p_instance, p_gpu, p_workspace, p_start, p_end, response_deadline, p_cost, p_admin, tstzrange(p_start - interval '20 minutes', p_end + interval '30 minutes', '[)')) returning id into allocation;
  insert into availability_confirmations(allocation_id, confirm_token_hash, decline_token_hash, expires_at)
  values(allocation, p_confirm_hash, p_decline_hash, response_deadline);
  update applications set status = 'awaiting_availability', updated_at = now() where id = p_application_id;
  insert into audit_logs(actor_type, actor_email, action, target_type, target_id, after_data)
  values('admin', p_admin, 'propose_slot', 'allocation', allocation, jsonb_build_object('start_at', p_start, 'end_at', p_end));
  return allocation;
end; $$;

-- Explicit POST action prevents email link scanners from confirming a timeslot.
create or replace function public.portal_respond(p_token_hash text, p_response text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare confirmation availability_confirmations%rowtype; app_id uuid;
begin
  perform pg_advisory_xact_lock(741259);
  if p_response not in ('confirmed', 'declined') then raise exception 'INVALID_LINK'; end if;
  select * into confirmation from availability_confirmations where
    (p_response = 'confirmed' and confirm_token_hash = p_token_hash) or (p_response = 'declined' and decline_token_hash = p_token_hash) for update;
  if not found or confirmation.expires_at <= now() then raise exception 'INVALID_LINK'; end if;
  if not exists(select 1 from compute_allocations where id = confirmation.allocation_id and status in ('awaiting_availability', 'user_confirmed')) then raise exception 'INVALID_LINK'; end if;
  if confirmation.response_status <> 'pending' then return confirmation.response_status; end if;
  update availability_confirmations set response_status = p_response, responded_at = now() where id = confirmation.id;
  update compute_allocations set status = case when p_response = 'confirmed' then 'user_confirmed' else 'cancelled' end, updated_at = now()
    where id = confirmation.allocation_id returning application_id into app_id;
  update applications set status = case when p_response = 'confirmed' then 'user_confirmed' else 'approved_in_principle' end, updated_at = now() where id = app_id;
  insert into audit_logs(actor_type, action, target_type, target_id, after_data)
  values('applicant', 'respond_availability', 'allocation', confirmation.allocation_id, jsonb_build_object('response', p_response));
  return p_response;
end; $$;

-- Review and its audit record commit together.
create or replace function public.portal_review(p_application_id uuid, p_decision text, p_note text, p_admin text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(741259);
  if p_decision not in ('approved_in_principle', 'rejected', 'revision_requested') then raise exception 'INVALID_REVIEW'; end if;
  if exists(select 1 from compute_allocations where application_id = p_application_id and status = 'scheduled') then raise exception 'ALREADY_SCHEDULED'; end if;
  update applications set status = p_decision, updated_at = now() where id = p_application_id;
  if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;
  if p_decision <> 'approved_in_principle' then
    update compute_allocations set status = 'cancelled', updated_at = now() where application_id = p_application_id and status in ('proposed', 'awaiting_availability', 'user_confirmed');
  end if;
  insert into application_reviews(application_id, reviewer_email, decision, note) values(p_application_id, p_admin, p_decision, p_note);
  insert into audit_logs(actor_type, actor_email, action, target_type, target_id, after_data) values('admin', p_admin, 'review_application', 'application', p_application_id, jsonb_build_object('decision', p_decision));
end; $$;

revoke all on function public.portal_allow_request(text, integer, integer) from public, anon, authenticated;
revoke all on function public.portal_redeem(text, text) from public, anon, authenticated;
revoke all on function public.portal_propose_slot(uuid, timestamptz, timestamptz, text, text, integer, numeric, text, text, text) from public, anon, authenticated;
revoke all on function public.portal_respond(text, text) from public, anon, authenticated;
revoke all on function public.portal_review(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.portal_allow_request(text, integer, integer) to service_role;
grant execute on function public.portal_redeem(text, text) to service_role;
grant execute on function public.portal_propose_slot(uuid, timestamptz, timestamptz, text, text, integer, numeric, text, text, text) to service_role;
grant execute on function public.portal_respond(text, text) to service_role;
grant execute on function public.portal_review(uuid, text, text, text) to service_role;
notify pgrst, 'reload schema';
commit;
