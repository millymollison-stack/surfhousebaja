/*
  # Fix Security Issues - Part 2: Bookings RLS Policies

  1. Remove all duplicate bookings policies
  2. Create consolidated, optimized policies using (select auth.uid())
*/

-- Drop all existing policies on bookings table
DROP POLICY IF EXISTS "Admins can manage all bookings" ON bookings;
DROP POLICY IF EXISTS "Admins have full access" ON bookings;
DROP POLICY IF EXISTS "Admins have full access to bookings and user data" ON bookings;
DROP POLICY IF EXISTS "Users can create bookings" ON bookings;
DROP POLICY IF EXISTS "Users can update their own pending bookings" ON bookings;
DROP POLICY IF EXISTS "booking_admin_view_all" ON bookings;
DROP POLICY IF EXISTS "booking_public_view_approved" ON bookings;
DROP POLICY IF EXISTS "booking_user_view_own" ON bookings;

-- Create optimized policies for bookings
CREATE POLICY "bookings_select_policy" ON bookings
  FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
    OR
    status = 'approved'
  );

CREATE POLICY "bookings_insert_policy" ON bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "bookings_update_policy" ON bookings
  FOR UPDATE
  TO authenticated
  USING (
    (user_id = (select auth.uid()) AND status = 'pending')
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    (user_id = (select auth.uid()) AND status = 'pending')
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "bookings_delete_policy" ON bookings
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  );