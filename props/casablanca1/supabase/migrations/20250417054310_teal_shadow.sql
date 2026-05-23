/*
  # Fix admin bookings permissions

  1. Changes
    - Update RLS policies for bookings table to ensure admins can see all bookings
    - Add explicit policy for admin access
    - Modify existing policies to handle both user and admin roles correctly

  2. Security
    - Maintain user data privacy while allowing admin oversight
    - Ensure proper role-based access control
*/

-- First, drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Everyone can view booking dates" ON bookings;
DROP POLICY IF EXISTS "Authenticated users can create bookings" ON bookings;
DROP POLICY IF EXISTS "Users can update their own pending bookings or admins can update any" ON bookings;

-- Create new, more specific policies

-- Allow admins to see all bookings
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

-- Allow users to see their own bookings
CREATE POLICY "Users can view their own bookings"
  ON bookings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow users to create bookings
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