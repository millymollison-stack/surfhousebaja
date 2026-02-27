/*
  # Enhanced Booking Management for Admins

  1. Changes
    - Add indexes for improved query performance
    - Update RLS policies for admin access
    - Add sorting indexes for common queries

  2. Security
    - Maintain existing RLS policies
    - Add specific admin policies for full booking management
*/

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings (created_at DESC);

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Admins can manage all bookings" ON bookings;

-- Create admin policy
CREATE POLICY "Admins can manage all bookings"
  ON bookings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Add composite index for user bookings with status
CREATE INDEX IF NOT EXISTS idx_bookings_user_status 
ON bookings (user_id, status, created_at DESC);

-- Add index for property bookings
CREATE INDEX IF NOT EXISTS idx_bookings_property 
ON bookings (property_id, start_date);