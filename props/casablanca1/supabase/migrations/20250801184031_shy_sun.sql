/*
  # Add denial_reason column to bookings table

  1. Changes
    - Add `denial_reason` column to `bookings` table
    - Column allows null values to store optional reason when booking is denied
    - Only relevant when booking status is 'denied'

  2. Security
    - No changes to existing RLS policies needed
    - Column inherits existing table permissions
*/

-- Add denial_reason column to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS denial_reason text;