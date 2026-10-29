-- =====================================================================
-- Scaling · Plataforma de Agencia de IA
-- Esquema inicial: workspaces + 7 servicios
--   0. Núcleo (workspaces, miembros, clientes de la agencia)
--   1. Captación de clientes (ICP, listas, leads, scraping)
--   2. Cold Email Marketing IA
--   3. ADS IA Automatizados
--   4. Automatización de Redes Sociales
--   5. CRM Inteligente (estilo GoHighLevel)
--   6. Agente IA de Texto (web, WhatsApp...)
--   7. Agente IA de Voz (Smart Calling)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0. Núcleo
-- ---------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on public.workspace_members (user_id);

create or replace function public.is_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  );
$$;

-- Clientes de la agencia (a quién le vendes los servicios)
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  industry text,
  website text,
  monthly_fee numeric(12,2),
  services text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 1. Captación de clientes
-- ---------------------------------------------------------------------
create table public.icps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  industry text,
  location text,
  company_size text,
  job_titles text[] not null default '{}',
  pains text,
  offer text,
  created_at timestamptz not null default now()
);

create table public.lead_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  icp_id uuid references public.icps(id) on delete set null,
  name text not null,
  source text not null default 'manual'
    check (source in ('manual','csv','google_maps','decision_makers','complex','clay')),
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  list_id uuid references public.lead_lists(id) on delete set null,
  company text,
  first_name text,
  last_name text,
  title text,
  email text,
  phone text,
  website text,
  city text,
  country text,
  linkedin_url text,
  rating numeric(2,1),
  reviews_count int,
  source text,
  status text not null default 'new'
    check (status in ('new','clean','invalid','contacted','replied','converted')),
  email_valid boolean,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.leads (workspace_id, list_id);
create index on public.leads (workspace_id, lower(email));

create table public.scrape_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  list_id uuid not null references public.lead_lists(id) on delete cascade,
  kind text not null check (kind in ('google_maps','decision_makers','complex','clay')),
  params jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  provider_run_id text,
  result_count int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ---------------------------------------------------------------------
-- 2. Cold Email Marketing IA
-- ---------------------------------------------------------------------
create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  offer text,
  from_name text,
  from_email text,
  daily_limit int not null default 30,
  status text not null default 'draft' check (status in ('draft','active','paused','done')),
  created_at timestamptz not null default now()
);

create table public.email_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  step_order int not null,
  delay_days int not null default 0,
  subject text not null,
  body text not null,
  unique (campaign_id, step_order)
);

create table public.email_enrollments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  current_step int not null default 1,
  status text not null default 'active'
    check (status in ('active','replied','bounced','completed','unsubscribed')),
  next_send_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (campaign_id, lead_id)
);
create index on public.email_enrollments (status, next_send_at);

create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  enrollment_id uuid not null references public.email_enrollments(id) on delete cascade,
  step_id uuid references public.email_steps(id) on delete set null,
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'sent' check (status in ('sent','failed')),
  provider_id text,
  error text,
  sent_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. ADS IA Automatizados
-- ---------------------------------------------------------------------
create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  platform text not null check (platform in ('meta','google','tiktok','linkedin')),
  objective text not null default 'leads',
  product text,
  audience text,
  budget_daily numeric(12,2),
  ai_insights text,
  status text not null default 'draft' check (status in ('draft','active','paused','done')),
  created_at timestamptz not null default now()
);

create table public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.ad_campaigns(id) on delete cascade,
  angle text,
  headline text not null,
  primary_text text not null,
  description text,
  cta text,
  image_prompt text,
  status text not null default 'draft' check (status in ('draft','approved','live','paused')),
  impressions int not null default 0,
  clicks int not null default 0,
  conversions int not null default 0,
  spend numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. Automatización de Redes Sociales
-- ---------------------------------------------------------------------
create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  platform text not null check (platform in ('instagram','facebook','linkedin','tiktok','x')),
  content text not null,
  media_url text,
  scheduled_at timestamptz,
  status text not null default 'draft' check (status in ('draft','scheduled','published','failed')),
  published_at timestamptz,
  external_id text,
  error text,
  created_at timestamptz not null default now()
);
create index on public.social_posts (status, scheduled_at);

-- ---------------------------------------------------------------------
-- 5. CRM Inteligente
-- ---------------------------------------------------------------------
create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  position int not null
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  first_name text,
  last_name text,
  email text,
  phone text,
  company text,
  tags text[] not null default '{}',
  source text,
  ai_score int check (ai_score between 0 and 100),
  ai_summary text,
  ghl_id text,
  created_at timestamptz not null default now()
);
create index on public.contacts (workspace_id, lower(email));
create index on public.contacts (workspace_id, phone);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  stage_id uuid not null references public.pipeline_stages(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  title text not null,
  value numeric(12,2) not null default 0,
  status text not null default 'open' check (status in ('open','won','lost')),
  created_at timestamptz not null default now()
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  type text not null check (type in ('note','email','call','chat','sms')),
  content text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Agente IA de Texto
-- ---------------------------------------------------------------------
create table public.text_agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  channel text not null default 'web' check (channel in ('web','whatsapp','instagram','messenger')),
  system_prompt text not null,
  knowledge text,
  welcome_message text,
  whatsapp_phone_id text unique,
  public_key uuid not null unique default gen_random_uuid(),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.text_agents(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  channel text not null,
  external_user text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.conversations (agent_id, external_user);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------
-- 7. Agente IA de Voz
-- ---------------------------------------------------------------------
create table public.voice_agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  provider text not null default 'vapi' check (provider in ('vapi','retell')),
  provider_agent_id text,
  voice text,
  first_message text,
  script text not null,
  goal text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid references public.voice_agents(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  direction text not null default 'outbound' check (direction in ('inbound','outbound')),
  to_number text,
  status text not null default 'queued',
  duration_sec int,
  recording_url text,
  transcript text,
  summary text,
  outcome text,
  provider_call_id text unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS: todo se aísla por workspace
-- ---------------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create policy "members read workspace" on public.workspaces
  for select to authenticated using (public.is_member(id));
create policy "owner updates workspace" on public.workspaces
  for update to authenticated using (owner_id = (select auth.uid()));
create policy "members read membership" on public.workspace_members
  for select to authenticated using (public.is_member(workspace_id));

do $$
declare t text;
begin
  foreach t in array array[
    'clients','icps','lead_lists','leads','scrape_jobs',
    'email_campaigns','email_steps','email_enrollments','email_messages',
    'ad_campaigns','ad_creatives','social_posts',
    'pipelines','pipeline_stages','contacts','opportunities','activities',
    'text_agents','conversations','messages','voice_agents','calls'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "workspace members" on public.%I for all to authenticated
         using (public.is_member(workspace_id)) with check (public.is_member(workspace_id))', t);
    execute format('create index if not exists %I on public.%I (workspace_id)', t || '_ws_idx', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Triggers de alta: workspace propio + pipeline por defecto
-- ---------------------------------------------------------------------
create or replace function public.seed_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare p uuid;
begin
  insert into public.pipelines (workspace_id, name) values (new.id, 'Ventas') returning id into p;
  insert into public.pipeline_stages (workspace_id, pipeline_id, name, position) values
    (new.id, p, 'Nuevo lead', 1),
    (new.id, p, 'Contactado', 2),
    (new.id, p, 'Reunión agendada', 3),
    (new.id, p, 'Propuesta enviada', 4),
    (new.id, p, 'Cerrado', 5);
  return new;
end;
$$;

create trigger on_workspace_created
  after insert on public.workspaces
  for each row execute function public.seed_workspace();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare ws uuid;
begin
  insert into public.workspaces (name, owner_id)
  values (coalesce(new.raw_user_meta_data->>'agency_name', 'Mi Agencia IA'), new.id)
  returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.seed_workspace() from public, anon, authenticated;
