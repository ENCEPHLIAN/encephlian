-- Drop existing schema and create fresh tables first
DROP VIEW IF EXISTS my_memberships CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS trg_profiles_wallet ON public.profiles;

DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.reports CASCADE;
DROP TABLE IF EXISTS public.study_files CASCADE;
DROP TABLE IF EXISTS public.studies CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.credits_wallets CASCADE;
DROP TABLE IF EXISTS public.clinic_memberships CASCADE;
DROP TABLE IF EXISTS public.clinics CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.ai_drafts CASCADE;
DROP TABLE IF EXISTS public.wallets CASCADE;
DROP TABLE IF EXISTS public.review_events CASCADE;

DROP FUNCTION IF EXISTS public.handle_updated_at CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;
DROP FUNCTION IF EXISTS public.has_role CASCADE;
DROP FUNCTION IF EXISTS public.user_belongs_to_clinic CASCADE;
DROP FUNCTION IF EXISTS public.ensure_wallet CASCADE;
DROP FUNCTION IF EXISTS public.credit_wallet CASCADE;
DROP FUNCTION IF EXISTS public.consume_credit_and_sign CASCADE;

DROP TYPE IF EXISTS public.payment_status CASCADE;
DROP TYPE IF EXISTS public.sla_type CASCADE;
DROP TYPE IF EXISTS public.study_state CASCADE;
DROP TYPE IF EXISTS public.app_role CASCADE;

-- Delete storage buckets
DELETE FROM storage.buckets WHERE id IN ('eeg-files', 'eeg-raw', 'eeg-clean', 'eeg-reports', 'eeg-json', 'eeg-preview');

-- PROFILES (users) ---------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT CHECK (role IN ('neurologist','clinic_admin','ops','admin')) NOT NULL DEFAULT 'neurologist',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- CLINICS & MEMBERSHIPS (multi-tenant) -----------------------------------
CREATE TABLE public.clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'IN',
  tz TEXT DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.clinic_memberships (
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('neurologist','clinic_admin')) NOT NULL DEFAULT 'neurologist',
  PRIMARY KEY (clinic_id, user_id)
);

ALTER TABLE public.clinic_memberships ENABLE ROW LEVEL SECURITY;

-- STUDIES -----------------------------------------------------------------
CREATE TABLE public.studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  owner UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  sla TEXT CHECK (sla IN ('TAT','STAT')) NOT NULL DEFAULT 'TAT',
  indication TEXT,
  state TEXT CHECK (state IN ('uploaded','preprocessed','in_review','signed','rejected')) DEFAULT 'uploaded',
  duration_min INT,
  srate_hz INT,
  montage TEXT,
  reference TEXT,
  meta JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.studies ENABLE ROW LEVEL SECURITY;

-- STUDY FILES -------------------------------------------------------------
CREATE TABLE public.study_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  kind TEXT CHECK (kind IN ('edf','nwb','preview','pdf','json','artifact_log')) NOT NULL,
  path TEXT NOT NULL,
  size_bytes BIGINT,
  checksum TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.study_files ENABLE ROW LEVEL SECURITY;

-- AI DRAFTS (placeholder) -------------------------------------------------
CREATE TABLE public.ai_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID REFERENCES studies(id) ON DELETE CASCADE,
  model TEXT,
  version TEXT,
  draft JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_drafts ENABLE ROW LEVEL SECURITY;

-- REPORTS -----------------------------------------------------------------
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID UNIQUE REFERENCES studies(id) ON DELETE CASCADE,
  interpreter UUID REFERENCES profiles(id),
  status TEXT CHECK (status IN ('draft','signed','amended')) DEFAULT 'draft',
  content JSONB NOT NULL,
  pdf_path TEXT,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- WALLET & PAYMENTS (Razorpay) -------------------------------------------
CREATE TABLE public.wallets (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  credits INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT DEFAULT 'razorpay',
  order_id TEXT UNIQUE,
  payment_id TEXT,
  status TEXT CHECK (status IN ('created','paid','failed')) NOT NULL DEFAULT 'created',
  amount_inr INT NOT NULL,
  credits_purchased INT NOT NULL,
  signature_valid BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- AUDIT LOG ---------------------------------------------------------------
CREATE TABLE public.review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID REFERENCES studies(id) ON DELETE CASCADE,
  actor UUID REFERENCES profiles(id),
  event TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.review_events ENABLE ROW LEVEL SECURITY;

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('eeg-raw', 'eeg-raw', false),
  ('eeg-clean', 'eeg-clean', false),
  ('eeg-reports', 'eeg-reports', false),
  ('eeg-json', 'eeg-json', false),
  ('eeg-preview', 'eeg-preview', false);

-- Indexes for performance
CREATE INDEX idx_studies_clinic_created ON studies(clinic_id, created_at DESC);
CREATE INDEX idx_studies_state_sla ON studies(state, sla);
CREATE INDEX idx_review_events_study_created ON review_events(study_id, created_at DESC);
CREATE INDEX idx_clinic_memberships_user ON clinic_memberships(user_id);
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_study_files_study ON study_files(study_id);