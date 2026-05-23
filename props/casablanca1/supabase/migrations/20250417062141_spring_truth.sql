/*
  # Fix booking policies for admin access

  1. Changes
    - Simplify and clarify booking policies
    - Ensure admins can view all bookings
    - Maintain public visibility of approved/pending bookings
    - Fix policy conflicts

  2. Security
    - Maintain proper access control
    - Keep public visibility for calendar view
    - Ensure admin full access
*/

-- First, drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public can view approved and pending bookings" ON bookings;
DROP POLICY IF EXISTS "Admins can view all bookings" ON bookings;
DROP POLICY IF EXISTS "Users can view their own bookings" ON bookings;
DROP POLICY IF EXISTS "Users can create bookings" ON bookings;
DROP POLICY IF EXISTS "Admins can update any booking" ON bookings;
DROP POLICY IF EXISTS "Users can update their own pending bookings" ON bookings;

-- Create new policies with proper hierarchy

-- 1. Public visibility for calendar
CREATE POLICY "Public can view approved and pending bookings"
  ON bookings
  FOR SELECT
  TO public
  USING (status IN ('approved', 'pending'));

-- 2. Admin access (highest priority)
CREATE POLICY "Admins can manage all bookings"
  ON bookings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'::user_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'::user_role
    )
  );

-- 3. User access to own bookings
CREATE POLICY "Users can view their own bookings"
  ON bookings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. Booking creation
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