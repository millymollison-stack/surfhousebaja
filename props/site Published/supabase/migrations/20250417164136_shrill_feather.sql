/*
  # Add location fields to properties table

  1. Changes
    - Add address field for street address
    - Add latitude and longitude fields for precise location
    - Add location_type field to distinguish between address and coordinates

  2. Security
    - Maintain existing RLS policies
*/

DO $$ 
BEGIN
  -- Add address field if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'properties' AND column_name = 'address'
  ) THEN
    ALTER TABLE properties ADD COLUMN address text;
  END IF;

  -- Add latitude field if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'properties' AND column_name = 'latitude'
  ) THEN
    ALTER TABLE properties ADD COLUMN latitude double precision;
  END IF;

  -- Add longitude field if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'properties' AND column_name = 'longitude'
  ) THEN
    ALTER TABLE properties ADD COLUMN longitude double precision;
  END IF;

  -- Add location_type field if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'properties' AND column_name = 'location_type'
  ) THEN
    ALTER TABLE properties ADD COLUMN location_type text CHECK (location_type IN ('address', 'coordinates')) DEFAULT 'address';
  END IF;
END $$;