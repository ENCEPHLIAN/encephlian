-- Add professional profile fields
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS company_name TEXT DEFAULT 'ENCEPHLIAN',
ADD COLUMN IF NOT EXISTS phone_number TEXT,
ADD COLUMN IF NOT EXISTS medical_license_number TEXT,
ADD COLUMN IF NOT EXISTS specialization TEXT,
ADD COLUMN IF NOT EXISTS department TEXT,
ADD COLUMN IF NOT EXISTS hospital_affiliation TEXT,
ADD COLUMN IF NOT EXISTS credentials TEXT;