/*
  # Add property sections

  1. Changes
    - Add new columns for property sections:
      - property_details (text, nullable)
      - activities (text, nullable)
      - local_area (text, nullable)
    - Remove house_rules column as it's being replaced by property_details
*/

ALTER TABLE properties
DROP COLUMN IF EXISTS house_rules;

ALTER TABLE properties
ADD COLUMN IF NOT EXISTS property_details text,
ADD COLUMN IF NOT EXISTS activities text,
ADD COLUMN IF NOT EXISTS local_area text;