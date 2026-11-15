-- Keep portal access available for seven days after the compute session ends.
-- Applies to newly redeemed invitations and existing non-revoked sessions.
begin;

update public.access_grants g
set portal_access_expires_at = greatest(g.portal_access_expires_at, a.proposed_end_at + interval '7 days')
from public.compute_allocations a
where a.id = g.allocation_id and g.redeemed_at is not null
  and g.revoked_at is null and g.portal_access_expires_at is not null;

update public.portal_sessions s
set session_expires_at = g.portal_access_expires_at
from public.access_grants g
where g.id = s.access_grant_id and g.revoked_at is null
  and s.revoked_at is null and g.portal_access_expires_at > s.session_expires_at;

create or replace function public.portal_redeem(p_token_hash text, p_session_hash text)
returns timestamptz language plpgsql security definer set search_path = public, pg_temp as $$
declare grant_row access_grants%rowtype; expires timestamptz; session_end timestamptz;
begin
  select * into grant_row from access_grants where token_hash = p_token_hash for update;
  if not found or grant_row.revoked_at is not null or grant_row.redeemed_at is not null or grant_row.redeem_expires_at <= now() then
    raise exception 'INVALID_CREDENTIAL';
  end if;
  select proposed_end_at into session_end from compute_allocations
    where id = grant_row.allocation_id and status in ('scheduled', 'completed');
  if not found or session_end is null then
    raise exception 'INVALID_CREDENTIAL';
  end if;
  expires := greatest(now(), session_end) + interval '7 days';
  update access_grants set redeemed_at = now(), portal_access_expires_at = expires where id = grant_row.id;
  insert into portal_sessions(access_grant_id, session_token_hash, session_expires_at, last_seen_at)
  values (grant_row.id, p_session_hash, expires, now());
  return expires;
end; $$;

commit;
