/*
  # Add property title and intro text fields
  
  1. Changes
    - Add property_title field to properties table
    - Add property_intro field to properties table
*/

ALTER TABLE properties
ADD COLUMN IF NOT EXISTS property_title text,
ADD COLUMN IF NOT EXISTS property_intro text;