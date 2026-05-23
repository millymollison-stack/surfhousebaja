/*
  # Fix Security Issues - Part 1: Indexes

  1. Add missing indexes on foreign keys
    - blocked_dates.property_id
    - property_images.property_id

  2. Remove unused indexes on bookings table
*/

-- Add missing indexes on foreign keys
CREATE INDEX IF NOT EXISTS idx_blocked_dates_property_id 
ON blocked_dates(property_id);

CREATE INDEX IF NOT EXISTS idx_property_images_property_id 
ON property_images(property_id);

-- Drop unused indexes
DROP INDEX IF EXISTS idx_bookings_created_at;
DROP INDEX IF EXISTS idx_bookings_dates;
DROP INDEX IF EXISTS idx_bookings_property;
DROP INDEX IF EXISTS idx_bookings_status;