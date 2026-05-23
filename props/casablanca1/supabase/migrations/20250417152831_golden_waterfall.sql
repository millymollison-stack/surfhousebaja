/*
  # Fix admin booking policies

  1. Changes
    - Simplify booking policies to avoid conflicts
    - Ensure admins have full access to all bookings
    - Maintain public visibility for calendar view
    - Fix policy hierarchy

  2. Security
    - Maintain proper access control
    - Keep public visibility for calendar
    - Ensure admin full access
*/

-- First, drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public can view approved and pending bookings" ON bookings;
DROP POLICY IF EXISTS "Admins can manage all bookings" ON bookings;
DROP POLICY IF EXISTS "Users can view their own bookings" ON bookings;
DROP POLICY IF EXISTS "Users can create bookings" ON bookings;
DROP POLICY IF EXISTS "Users can update their own pending bookings" ON bookings;

-- Create new policies with proper hierarchy

-- 1. Admin full access (highest priority)
CREATE POLICY "Admins have full access"
  ON bookings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'::user_role
    )
  );

-- 2. Public visibility for calendar
CREATE POLICY "Public can view approved and pending bookings"
  ON bookings
  FOR SELECT
  TO public
  USING (status IN ('approved', 'pending'));

-- 3. User access to own bookings
CREATE POLICY "Users can view their own bookings"
  ON bookings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. Booking creation for users
CREATE POLICY "Users can create bookings"
  ON bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 5. Users updating own pending bookings
CREATE POLICY "Users can update their own pending bookings"
  ON bookings
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id 
    AND status = 'pending'::booking_status
  )
  WITH CHECK (
    auth.uid() = user_id 
    AND status = 'pending'::booking_status
  );