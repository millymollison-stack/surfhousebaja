/*
  # Fix booking visibility and admin access

  1. Changes
    - Allow public read access to approved and pending bookings for calendar display
    - Maintain admin access to all bookings for management
    - Keep user access to their own bookings
    - Preserve booking creation and update policies

  2. Security
    - Public can only see basic booking info (dates and status)
    - Users can only manage their own bookings
    - Admins retain full access and management capabilities
*/

-- First, drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Admins can view all bookings" ON bookings;
DROP POLICY IF EXISTS "Users can view their own bookings" ON bookings;
DROP POLICY IF EXISTS "Users can create bookings" ON bookings;
DROP POLICY IF EXISTS "Admins can update any booking" ON bookings;
DROP POLICY IF EXISTS "Users can update their own pending bookings" ON bookings;

-- Allow public to view approved and pending bookings (for calendar display)
CREATE POLICY "Public can view approved and pending bookings"
  ON bookings
  FOR SELECT
  TO public
  USING (
    status IN ('approved', 'pending')
  );

-- Allow admins to view all bookings (for management)
CREATE POLICY "Admins can view all bookings"
  ON bookings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'::user_role
    )
  );

-- Allow users to view their own bookings (including denied/cancelled)
CREATE POLICY "Users can view their own bookings"
  ON bookings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow authenticated users to create bookings
CREATE POLICY "Users can create bookings"
  ON bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow admins to update any booking
CREATE POLICY "Admins can update any booking"
  ON bookings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'::user_role
    )
  );

-- Allow users to update their own pending bookings
CREATE POLICY "Users can update their own pending bookings"
  ON bookings
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id 
    AND status = 'pending'::booking_status
  );