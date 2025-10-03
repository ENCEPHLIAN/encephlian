-- Helper view for current user memberships
CREATE OR REPLACE VIEW my_memberships AS
  SELECT cm.clinic_id, cm.role AS clinic_role
  FROM clinic_memberships cm
  WHERE cm.user_id = auth.uid();

-- RLS POLICIES ------------------------------------------------------------

-- Profiles: self + admins
CREATE POLICY "profiles_self_admin" ON profiles
FOR SELECT USING (
  id = auth.uid() 
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

CREATE POLICY "profiles_update_self" ON profiles
FOR UPDATE USING (id = auth.uid());

-- Clinics: visible if member or admin/ops
CREATE POLICY "clinics_scope" ON clinics
FOR SELECT USING (
  EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = clinics.id)
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

CREATE POLICY "clinics_insert_admin" ON clinics
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

-- Clinic memberships: user sees own memberships; admin/ops see all
CREATE POLICY "cm_scope" ON clinic_memberships
FOR SELECT USING (
  clinic_memberships.user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

CREATE POLICY "cm_insert_admin" ON clinic_memberships
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

-- Studies: user must be member of that clinic; admin/ops see all
CREATE POLICY "studies_scope" ON studies
FOR SELECT USING (
  EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = studies.clinic_id)
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

CREATE POLICY "studies_insert" ON studies
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = studies.clinic_id)
  AND owner = auth.uid()
);

CREATE POLICY "studies_update" ON studies
FOR UPDATE USING (
  owner = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

-- Files inherit study scope
CREATE POLICY "files_scope" ON study_files
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM studies s 
    WHERE s.id = study_files.study_id
    AND (
      EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = s.clinic_id)
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
    )
  )
);

CREATE POLICY "files_insert" ON study_files
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM studies s WHERE s.id = study_files.study_id AND s.owner = auth.uid())
);

-- Drafts/reports inherit study scope
CREATE POLICY "drafts_scope" ON ai_drafts
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM studies s 
    WHERE s.id = ai_drafts.study_id
    AND (
      EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = s.clinic_id)
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
    )
  )
);

CREATE POLICY "drafts_insert" ON ai_drafts
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM studies s WHERE s.id = ai_drafts.study_id AND s.owner = auth.uid())
);

CREATE POLICY "reports_scope" ON reports
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM studies s 
    WHERE s.id = reports.study_id
    AND (
      EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = s.clinic_id)
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
    )
  )
);

CREATE POLICY "reports_write" ON reports
FOR INSERT WITH CHECK (interpreter = auth.uid());

CREATE POLICY "reports_update" ON reports
FOR UPDATE USING (interpreter = auth.uid());

-- Wallet: owner or admin
CREATE POLICY "wallet_scope" ON wallets
FOR SELECT USING (
  user_id = auth.uid() 
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

CREATE POLICY "wallet_update" ON wallets
FOR UPDATE USING (
  user_id = auth.uid() 
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

CREATE POLICY "wallet_insert" ON wallets
FOR INSERT WITH CHECK (user_id = auth.uid());

-- Payments: owner or admin
CREATE POLICY "payments_scope" ON payments
FOR SELECT USING (
  user_id = auth.uid() 
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

CREATE POLICY "payments_insert" ON payments
FOR INSERT WITH CHECK (user_id = auth.uid());

-- Events: inherit via study
CREATE POLICY "events_scope" ON review_events
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM studies s 
    WHERE s.id = review_events.study_id
    AND (
      EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = s.clinic_id)
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
    )
  )
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

-- FUNCTIONS & TRIGGERS ----------------------------------------------------

-- Auto-create profile on signup
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

-- Default wallet on signup
CREATE OR REPLACE FUNCTION public.ensure_wallet()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO wallets(user_id, credits) VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_wallet 
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_wallet();

-- Credit wallet function (idempotent)
CREATE OR REPLACE FUNCTION public.credit_wallet(p_user_id UUID, p_credits INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO wallets (user_id, credits, updated_at)
  VALUES (p_user_id, p_credits, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET credits = wallets.credits + p_credits,
      updated_at = NOW();
END;
$$;

-- Consume credit and sign report (transactional)
CREATE OR REPLACE FUNCTION public.consume_credit_and_sign(
  p_user_id UUID,
  p_study_id UUID,
  p_cost INT,
  p_content JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_credits INT;
  v_report_id UUID;
BEGIN
  -- Check credits
  SELECT credits INTO v_current_credits
  FROM wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current_credits IS NULL OR v_current_credits < p_cost THEN
    RAISE EXCEPTION 'Insufficient credits. Required: %, Available: %', p_cost, COALESCE(v_current_credits, 0);
  END IF;

  -- Deduct credits
  UPDATE wallets
  SET credits = credits - p_cost,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Insert or update report
  INSERT INTO reports (study_id, interpreter, status, content, signed_at)
  VALUES (p_study_id, p_user_id, 'signed', p_content, NOW())
  ON CONFLICT (study_id) DO UPDATE
  SET interpreter = p_user_id,
      status = 'signed',
      content = p_content,
      signed_at = NOW()
  RETURNING id INTO v_report_id;

  -- Update study state
  UPDATE studies
  SET state = 'signed'
  WHERE id = p_study_id;

  -- Log event
  INSERT INTO review_events (study_id, actor, event, payload)
  VALUES (p_study_id, p_user_id, 'sign', jsonb_build_object('credits_deducted', p_cost, 'report_id', v_report_id));

  RETURN jsonb_build_object('success', true, 'report_id', v_report_id, 'credits_remaining', v_current_credits - p_cost);
END;
$$;

-- Storage policies (private with signed URLs)
CREATE POLICY "Authenticated users can upload to eeg-raw"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'eeg-raw' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read from eeg-raw"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'eeg-raw' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can upload to eeg-clean"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'eeg-clean' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read from eeg-clean"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'eeg-clean' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can upload to eeg-reports"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'eeg-reports' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read from eeg-reports"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'eeg-reports' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can upload to eeg-json"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'eeg-json' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read from eeg-json"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'eeg-json' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can upload to eeg-preview"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'eeg-preview' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read from eeg-preview"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'eeg-preview' AND auth.uid() IS NOT NULL);