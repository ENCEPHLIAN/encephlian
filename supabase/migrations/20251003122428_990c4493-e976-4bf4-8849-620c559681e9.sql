-- Create enum types
CREATE TYPE public.app_role AS ENUM ('admin', 'neurologist', 'clinic_admin');
CREATE TYPE public.study_state AS ENUM ('uploaded', 'preprocessing', 'ai_draft', 'in_review', 'signed', 'failed');
CREATE TYPE public.sla_type AS ENUM ('TAT', 'STAT');
CREATE TYPE public.payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');

-- Profiles table (auto-created on signup)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Clinics table
CREATE TABLE public.clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

-- Clinic memberships (users belong to clinics)
CREATE TABLE public.clinic_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, clinic_id)
);

ALTER TABLE public.clinic_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their clinic memberships"
  ON public.clinic_memberships FOR SELECT
  USING (auth.uid() = user_id);

-- Security definer function to check clinic membership
CREATE OR REPLACE FUNCTION public.user_belongs_to_clinic(_user_id UUID, _clinic_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinic_memberships
    WHERE user_id = _user_id AND clinic_id = _clinic_id
  )
$$;

-- Clinics RLS: users see only their clinics
CREATE POLICY "Users can view their clinics"
  ON public.clinics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_memberships
      WHERE clinic_memberships.clinic_id = clinics.id
        AND clinic_memberships.user_id = auth.uid()
    )
  );

-- Credits wallet (per clinic)
CREATE TABLE public.credits_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE UNIQUE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.credits_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their clinic's wallet"
  ON public.credits_wallets FOR SELECT
  USING (public.user_belongs_to_clinic(auth.uid(), clinic_id));

-- Payments table (Razorpay transactions)
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  credits INTEGER NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their clinic's payments"
  ON public.payments FOR SELECT
  USING (public.user_belongs_to_clinic(auth.uid(), clinic_id));

CREATE POLICY "Users can create payments for their clinics"
  ON public.payments FOR INSERT
  WITH CHECK (
    public.user_belongs_to_clinic(auth.uid(), clinic_id)
    AND auth.uid() = user_id
  );

-- Studies table (core entity)
CREATE TABLE public.studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL,
  patient_name TEXT NOT NULL,
  patient_age INTEGER,
  patient_gender TEXT,
  indication TEXT,
  sla_type sla_type NOT NULL DEFAULT 'TAT',
  state study_state NOT NULL DEFAULT 'uploaded',
  signed_by UUID REFERENCES public.profiles(id),
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.studies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view studies from their clinics"
  ON public.studies FOR SELECT
  USING (public.user_belongs_to_clinic(auth.uid(), clinic_id));

CREATE POLICY "Users can create studies for their clinics"
  ON public.studies FOR INSERT
  WITH CHECK (
    public.user_belongs_to_clinic(auth.uid(), clinic_id)
    AND auth.uid() = created_by
  );

CREATE POLICY "Neurologists can update studies"
  ON public.studies FOR UPDATE
  USING (
    public.user_belongs_to_clinic(auth.uid(), clinic_id)
    AND public.has_role(auth.uid(), 'neurologist')
  );

-- Study files (EEG files in storage)
CREATE TABLE public.study_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  content_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.study_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view files from their clinic's studies"
  ON public.study_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.studies
      WHERE studies.id = study_files.study_id
        AND public.user_belongs_to_clinic(auth.uid(), studies.clinic_id)
    )
  );

CREATE POLICY "Users can create files for their studies"
  ON public.study_files FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.studies
      WHERE studies.id = study_files.study_id
        AND public.user_belongs_to_clinic(auth.uid(), studies.clinic_id)
    )
    AND auth.uid() = uploaded_by
  );

-- Reports table (structured report data)
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE UNIQUE,
  background_activity TEXT,
  epileptiform_discharges TEXT,
  other_abnormalities TEXT,
  clinical_correlation TEXT,
  impression TEXT,
  ai_draft JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reports from their clinic's studies"
  ON public.reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.studies
      WHERE studies.id = reports.study_id
        AND public.user_belongs_to_clinic(auth.uid(), studies.clinic_id)
    )
  );

CREATE POLICY "Neurologists can manage reports"
  ON public.reports FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.studies
      WHERE studies.id = reports.study_id
        AND public.user_belongs_to_clinic(auth.uid(), studies.clinic_id)
    )
    AND public.has_role(auth.uid(), 'neurologist')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.studies
      WHERE studies.id = reports.study_id
        AND public.user_belongs_to_clinic(auth.uid(), studies.clinic_id)
    )
    AND public.has_role(auth.uid(), 'neurologist')
  );

-- Audit log
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
  ON public.audit_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for new user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_clinics
  BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_credits_wallets
  BEFORE UPDATE ON public.credits_wallets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_studies
  BEFORE UPDATE ON public.studies
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_reports
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Create storage bucket for EEG files
INSERT INTO storage.buckets (id, name, public)
VALUES ('eeg-files', 'eeg-files', false);

-- Storage policies for EEG files
CREATE POLICY "Users can upload EEG files for their studies"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'eeg-files'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can view EEG files from their clinic's studies"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'eeg-files'
    AND auth.uid() IS NOT NULL
  );

-- Indexes for performance
CREATE INDEX idx_clinic_memberships_user ON public.clinic_memberships(user_id);
CREATE INDEX idx_clinic_memberships_clinic ON public.clinic_memberships(clinic_id);
CREATE INDEX idx_studies_clinic ON public.studies(clinic_id);
CREATE INDEX idx_studies_state ON public.studies(state);
CREATE INDEX idx_studies_created_at ON public.studies(created_at DESC);
CREATE INDEX idx_payments_clinic ON public.payments(clinic_id);
CREATE INDEX idx_study_files_study ON public.study_files(study_id);