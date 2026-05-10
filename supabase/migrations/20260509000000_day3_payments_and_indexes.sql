-- ============================================================
-- Migration: 20260509000000_day3_payments_and_indexes.sql
-- Day 3: Payments table + performance indexes
-- ============================================================

-- ─── payments ────────────────────────────────────────────────────────────────
-- Tracks all payment intents / confirmed payments (Stripe events land here)
-- Stripe webhook handler (Day 4) will upsert rows into this table.

create type payment_status as enum (
  'pending',
  'processing',
  'succeeded',
  'failed',
  'refunded',
  'disputed'
);

create type payment_product as enum (
  'one_time_analysis',     -- €30 one-time diagnostic
  'recurring_monthly'      -- €4.90/month subscription
);

create table if not exists public.payments (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users(id) on delete set null,
  assessment_id         uuid references public.assessments(id) on delete set null,

  -- Stripe references
  stripe_payment_intent_id  text unique,
  stripe_subscription_id    text,
  stripe_customer_id        text,

  -- Product & amount
  product               payment_product not null,
  amount_cents          integer not null,     -- Amount in cents (€30 = 3000, €4.90 = 490)
  currency              text not null default 'eur',

  -- Status lifecycle
  status                payment_status not null default 'pending',
  paid_at               timestamptz,
  refunded_at           timestamptz,

  -- Metadata
  metadata              jsonb not null default '{}',

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Indexes for common queries
create index if not exists idx_payments_user_id        on public.payments(user_id);
create index if not exists idx_payments_assessment_id  on public.payments(assessment_id);
create index if not exists idx_payments_status         on public.payments(status);
create index if not exists idx_payments_stripe_pi      on public.payments(stripe_payment_intent_id);

-- ─── assessments: performance indexes ────────────────────────────────────────
create index if not exists idx_assessments_email       on public.assessments(email);
create index if not exists idx_assessments_session_id  on public.assessments(session_id);
create index if not exists idx_assessments_status      on public.assessments(status);
create index if not exists idx_assessments_completed_at on public.assessments(completed_at desc);

-- ─── RLS: payments ────────────────────────────────────────────────────────────
alter table public.payments enable row level security;

-- Users can read their own payments
create policy "Users can view own payments"
  on public.payments for select
  using (auth.uid() = user_id);

-- Service role (webhooks) can insert / update payments
-- (No client-side insert — only via edge functions with service role key)

-- ─── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger payments_updated_at
  before update on public.payments
  for each row execute function public.handle_updated_at();

-- ─── Grant read access to anon / authenticated ────────────────────────────────
grant select on public.payments to authenticated;
