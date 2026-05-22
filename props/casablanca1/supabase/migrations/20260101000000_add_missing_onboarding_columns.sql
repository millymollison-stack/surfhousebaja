-- Add missing columns to onboarding_data that the frontend expects
-- Fix: Could not find the 'baths' column of 'onboarding_data' in the schema cache

ALTER TABLE public.onboarding_data ADD COLUMN IF NOT EXISTS baths TEXT;
ALTER TABLE public.onboarding_data ADD COLUMN IF NOT EXISTS beds TEXT;
ALTER TABLE public.onboarding_data ADD COLUMN IF NOT EXISTS bedrooms TEXT;
ALTER TABLE public.onboarding_data ADD COLUMN IF NOT EXISTS guests TEXT;
ALTER TABLE public.onboarding_data ADD COLUMN IF NOT EXISTS hero_image TEXT;
ALTER TABLE public.onboarding_data ADD COLUMN IF NOT EXISTS host_name TEXT;
ALTER TABLE public.onboarding_data ADD COLUMN IF NOT EXISTS images TEXT[];
ALTER TABLE public.onboarding_data ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.onboarding_data ADD COLUMN IF NOT EXISTS price TEXT;
ALTER TABLE public.onboarding_data ADD COLUMN IF NOT EXISTS rating TEXT;
ALTER TABLE public.onboarding_data ADD COLUMN IF NOT EXISTS reviews TEXT;

-- Add unique constraint so upsert (ON CONFLICT) works
ALTER TABLE public.onboarding_data ADD CONSTRAINT onboarding_data_user_id_key UNIQUE (user_id);