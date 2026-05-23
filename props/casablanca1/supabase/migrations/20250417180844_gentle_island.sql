/*
  # Add main photo support

  1. Changes
    - Add is_main column to property_images table
    - Default to false for existing images
    - Add constraint to ensure only one main photo per property
*/

ALTER TABLE property_images
ADD COLUMN IF NOT EXISTS is_main boolean DEFAULT false;

-- Create a function to ensure only one main photo per property
CREATE OR REPLACE FUNCTION ensure_single_main_photo()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_main THEN
    UPDATE property_images
    SET is_main = false
    WHERE property_id = NEW.property_id
      AND id != NEW.id
      AND is_main = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to enforce the single main photo constraint
DROP TRIGGER IF EXISTS ensure_single_main_photo_trigger ON property_images;
CREATE TRIGGER ensure_single_main_photo_trigger
BEFORE INSERT OR UPDATE ON property_images
FOR EACH ROW
EXECUTE FUNCTION ensure_single_main_photo();