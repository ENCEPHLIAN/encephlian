-- Drop old trigger and function that uses 'credits' instead of 'tokens'
DROP TRIGGER IF EXISTS on_auth_user_created_wallet ON auth.users;
DROP FUNCTION IF EXISTS public.ensure_wallet();

-- The ensure_wallets() function already exists and is correct
-- Now insert the missing records for the current user
INSERT INTO profiles (id, email, full_name)
SELECT 
  id, 
  email, 
  COALESCE(raw_user_meta_data->>'full_name', email) as full_name
FROM auth.users
WHERE id = 'f1b8a438-7229-4873-b1dc-d1803be5db62'
ON CONFLICT (id) DO NOTHING;

INSERT INTO wallets (user_id, tokens, updated_at)
SELECT id, 0, NOW()
FROM auth.users
WHERE id = 'f1b8a438-7229-4873-b1dc-d1803be5db62'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO earnings_wallets (user_id, balance_inr, total_earned_inr, updated_at)
SELECT id, 0, 0, NOW()
FROM auth.users
WHERE id = 'f1b8a438-7229-4873-b1dc-d1803be5db62'
ON CONFLICT (user_id) DO NOTHING;