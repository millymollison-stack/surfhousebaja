-- Add unique constraints needed by the upsert logic
-- 1. properties.slug must be unique (URL identifier)
-- 2. properties.owner_id must be unique (one property per user)
-- If constraints already exist (from prior partial runs), this is safe due to IF NOT EXISTS / CONFLICT handling

-- Unique constraint on slug (global URL key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'properties_slug_key'
  ) THEN
    ALTER TABLE public.properties ADD CONSTRAINT properties_slug_key UNIQUE (slug);
  END IF;
END $$;

-- Unique constraint on owner_id (one property per user)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'properties_owner_id_key'
  ) THEN
    ALTER TABLE public.properties ADD CONSTRAINT properties_owner_id_key UNIQUE (owner_id);
  END IF;
END $$;
