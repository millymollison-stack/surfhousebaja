-- Add missing columns to properties table that the app expects
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS baths INTEGER;