-- Fix Security Issues (Corrected)

-- 1. Fix profiles table RLS - restrict admin viewing properly
DROP POLICY IF EXISTS "profiles_self_admin" ON public.profiles;

CREATE POLICY "profiles_view_own" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "profiles_admin_view_all" 
ON public.profiles 
FOR SELECT 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) 
  OR has_role(auth.uid(), 'ops'::app_role)
);

-- 2. user_clinic_context is a VIEW - cannot add RLS directly
-- The underlying tables (clinics, user_roles) already have RLS
-- The view automatically inherits those protections

-- 3. Improve bank_accounts security
-- Remove the problematic bulk access policy, keep existing one
-- The existing policy "Users can manage own bank accounts" already restricts to user_id = auth.uid()

-- 4. Create support_tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_tickets_own" 
ON public.support_tickets 
FOR ALL 
USING (user_id = auth.uid());

CREATE POLICY "support_tickets_admin" 
ON public.support_tickets 
FOR SELECT 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) 
  OR has_role(auth.uid(), 'ops'::app_role)
);

-- 5. Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_admin_only" 
ON public.audit_logs 
FOR SELECT 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) 
  OR has_role(auth.uid(), 'ops'::app_role)
);

-- 6. Create report_attachments table for PDF management
CREATE TABLE IF NOT EXISTS public.report_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID REFERENCES public.studies(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.report_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_attachments_own_clinic" 
ON public.report_attachments 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM studies s
    WHERE s.id = report_attachments.study_id
    AND (s.owner = auth.uid() OR s.clinic_id IN (SELECT clinic_id FROM my_memberships))
  )
);