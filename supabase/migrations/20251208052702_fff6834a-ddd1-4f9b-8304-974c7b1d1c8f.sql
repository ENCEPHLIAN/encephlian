-- Add unique constraint on user_roles for proper upsert
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

-- Add unique constraint on clinic_memberships for proper upsert
ALTER TABLE public.clinic_memberships DROP CONSTRAINT IF EXISTS clinic_memberships_user_id_clinic_id_key;
ALTER TABLE public.clinic_memberships ADD CONSTRAINT clinic_memberships_user_id_clinic_id_key UNIQUE (user_id, clinic_id);