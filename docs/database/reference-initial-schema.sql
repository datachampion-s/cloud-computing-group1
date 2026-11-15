-- DCS Compute Portal: MVP schema
-- Semua waktu disimpan sebagai timestamptz (UTC); tampilkan WIB di aplikasi.

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  applicant_name text not null,
  applicant_email text not null,
  institution text not null,
  student_id text,
  eligibility_status text not null default 'pending'
    check (eligibility_status in ('pending', 'eligible', 'ineligible')),
  project_title text not null,
  proposal_summary text,
  workload_description text,
  estimated_dataset_gb numeric(10,2)
    check (estimated_dataset_gb is null or estimated_dataset_gb >= 0),
  estimated_compute_hours numeric(8,2)
    check (estimated_compute_hours is null or estimated_compute_hours > 0),
  status text not null default 'submitted'
    check (status in (
      'submitted', 'under_review', 'approved_in_principle',
      'awaiting_availability', 'user_confirmed', 'scheduled',
      'rejected', 'revision_requested', 'cancelled'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists applications_email_idx
  on public.applications (lower(applicant_email));
create index if not exists applications_status_idx
  on public.applications (status, created_at desc);


-- Metadata file proposal. File fisiknya ada di private Supabase Storage bucket.
create table if not exists public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  content_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  uploaded_at timestamptz not null default now()
);

create index if not exists application_documents_application_idx
  on public.application_documents (application_id);


-- Riwayat keputusan admin untuk aplikasi.
create table if not exists public.application_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  reviewer_email text not null,
  decision text not null
    check (decision in ('approved_in_principle', 'rejected', 'revision_requested')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists application_reviews_application_idx
  on public.application_reviews (application_id, created_at desc);


-- Alokasi dan slot yang diusulkan admin.
create table if not exists public.compute_allocations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id),
  status text not null default 'proposed'
    check (status in (
      'proposed', 'awaiting_availability', 'user_confirmed',
      'scheduled', 'expired', 'cancelled', 'completed'
    )),
  instance_type text not null,
  gpu_name text not null,
  root_ebs_gb integer not null default 30 check (root_ebs_gb > 0),
  workspace_ebs_gb integer not null check (workspace_ebs_gb > 0),
  proposed_start_at timestamptz not null,
  proposed_end_at timestamptz not null,
  confirmation_expires_at timestamptz,
  cost_limit_usd numeric(10,2) check (cost_limit_usd is null or cost_limit_usd >= 0),
  ami_id text,
  container_image text,
  finalized_at timestamptz,
  created_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (proposed_end_at > proposed_start_at)
);

create index if not exists compute_allocations_schedule_idx
  on public.compute_allocations (status, proposed_start_at, proposed_end_at);
create index if not exists compute_allocations_application_idx
  on public.compute_allocations (application_id, created_at desc);


-- Hashed one-time Confirm / Decline link credentials.
create table if not exists public.availability_confirmations (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null unique
    references public.compute_allocations(id) on delete cascade,
  response_status text not null default 'pending'
    check (response_status in ('pending', 'confirmed', 'declined', 'expired')),
  confirm_token_hash text not null unique,
  decline_token_hash text not null unique,
  expires_at timestamptz not null,
  responded_at timestamptz,
  change_request_note text,
  created_at timestamptz not null default now()
);


-- Hashed one-time applicant access token and seven-day portal grant.
create table if not exists public.access_grants (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null unique
    references public.compute_allocations(id) on delete cascade,
  token_hash text not null unique,
  created_by_email text not null,
  created_at timestamptz not null default now(),
  redeem_expires_at timestamptz not null,
  redeemed_at timestamptz,
  portal_access_expires_at timestamptz,
  revoked_at timestamptz,
  failed_attempt_count integer not null default 0 check (failed_attempt_count >= 0),
  check (
    portal_access_expires_at is null
    or redeemed_at is not null
  )
);

create index if not exists access_grants_expiry_idx
  on public.access_grants (portal_access_expires_at);


-- Simpan hash session cookie, jangan simpan session token plaintext.
create table if not exists public.portal_sessions (
  id uuid primary key default gen_random_uuid(),
  access_grant_id uuid not null
    references public.access_grants(id) on delete cascade,
  session_token_hash text not null unique,
  session_expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists portal_sessions_grant_idx
  on public.portal_sessions (access_grant_id);


-- Satu record sesi compute per allocation; retry provisioning dicatat di record yang sama.
create table if not exists public.compute_sessions (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null unique
    references public.compute_allocations(id),
  status text not null default 'scheduled'
    check (status in (
      'scheduled', 'provisioning', 'ready', 'active', 'exporting',
      'artifact_ready', 'completed', 'capacity_failed', 'provision_failed',
      'export_failed', 'recovery_required', 'cancelled'
    )),
  aws_region text not null,
  ec2_instance_id text,
  root_volume_id text,
  workspace_volume_id text,
  provision_schedule_name text,
  stop_schedule_name text,
  export_schedule_name text,
  jupyter_url text,
  provisioned_at timestamptz,
  ready_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  export_started_at timestamptz,
  export_completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or started_at is null or ended_at >= started_at)
);

create index if not exists compute_sessions_status_idx
  on public.compute_sessions (status, updated_at desc);


-- Metadata artifact yang disimpan di private Amazon S3.
create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null
    references public.compute_allocations(id) on delete cascade,
  compute_session_id uuid references public.compute_sessions(id),
  s3_bucket text not null,
  s3_key text not null,
  filename text not null,
  content_type text,
  bytes bigint not null default 0 check (bytes >= 0),
  sha256_checksum text,
  uploaded_at timestamptz not null default now(),
  verified_at timestamptz,
  downloadable_until timestamptz,
  deleted_at timestamptz,
  unique (s3_bucket, s3_key)
);

create index if not exists artifacts_allocation_idx
  on public.artifacts (allocation_id, uploaded_at desc);


-- Log email transaksional; jangan simpan isi token atau link rahasia di sini.
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid references public.compute_allocations(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  template text not null,
  recipient text not null,
  sender text,
  provider text not null,
  provider_message_id text,
  delivery_status text not null default 'queued'
    check (delivery_status in ('queued', 'sent', 'failed', 'bounced')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_events_allocation_idx
  on public.email_events (allocation_id, created_at desc);


-- Audit trail untuk aksi admin dan automation.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('admin', 'system', 'applicant')),
  actor_email text,
  action text not null,
  target_type text not null,
  target_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_target_idx
  on public.audit_logs (target_type, target_id, created_at desc);


-- RLS aktif, tanpa policy client-side.
-- Akses data dilakukan lewat Next.js backend dengan Supabase service role.
alter table public.applications enable row level security;
alter table public.application_documents enable row level security;
alter table public.application_reviews enable row level security;
alter table public.compute_allocations enable row level security;
alter table public.availability_confirmations enable row level security;
alter table public.access_grants enable row level security;
alter table public.portal_sessions enable row level security;
alter table public.compute_sessions enable row level security;
alter table public.artifacts enable row level security;
alter table public.email_events enable row level security;
alter table public.audit_logs enable row level security;


-- Bucket dokumen proposal yang private.
insert into storage.buckets (id, name, public)
values ('application-documents', 'application-documents', false)
on conflict (id) do update set public = false;