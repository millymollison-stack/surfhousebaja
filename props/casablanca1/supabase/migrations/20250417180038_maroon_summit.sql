/*
  # Add featured images support

  1. Changes
    - Add is_featured column to property_images table
    - Default to false for existing images
*/

ALTER TABLE property_images
ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;