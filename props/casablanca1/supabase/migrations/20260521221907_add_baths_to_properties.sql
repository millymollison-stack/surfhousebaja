-- Add missing baths column to properties table
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS baths INTEGER;