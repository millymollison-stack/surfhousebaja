/*
  # Update booking policies for admin access

  1. Changes
    - Add policy for admins to view all bookings with user information
    - Ensure proper join between bookings and profiles tables

  2. Security
    - Maintain RLS enabled
    - Add specific policy for admin access
*/

-- Ensure admins can view all bookings and related user information
CREATE POLICY "Admins have full access to bookings and user data" ON bookings
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Add policy for profiles table to allow admins to view all user data
CREATE POLICY "Admins can view all user profiles" ON profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);