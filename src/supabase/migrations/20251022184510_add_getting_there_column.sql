/*
  # Add getting_there column to properties table

  1. Changes
    - Add `getting_there` column to properties table for storing directions and travel information
    - Column type is TEXT to allow detailed travel instructions
    - Column is nullable to allow for gradual content addition

  2. Notes
    - This adds a new collapsible section for admin-editable travel directions
    - Provides a dedicated space for "how to get to the property" information
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'getting_there'
  ) THEN
    ALTER TABLE properties ADD COLUMN getting_there TEXT;
  END IF;
END $$;