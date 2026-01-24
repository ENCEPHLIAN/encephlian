-- Add SKU field to clinics table for tenant-level feature gating
ALTER TABLE public.clinics 
ADD COLUMN IF NOT EXISTS sku text NOT NULL DEFAULT 'pilot',
ADD COLUMN IF NOT EXISTS sku_config jsonb DEFAULT '{}'::jsonb;

-- Add check constraint for valid SKU values
ALTER TABLE public.clinics 
ADD CONSTRAINT clinics_sku_check CHECK (sku IN ('internal', 'pilot', 'prod'));