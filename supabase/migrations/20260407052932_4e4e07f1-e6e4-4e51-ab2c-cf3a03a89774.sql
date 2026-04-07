ALTER TABLE public.clinics ALTER COLUMN brand_name SET DEFAULT 'ENCEPHLIAN';
UPDATE public.clinics SET brand_name = 'ENCEPHLIAN' WHERE brand_name = 'Clinic Portal' OR brand_name IS NULL;