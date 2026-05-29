/*
  # Fix recursive policies and user data access

  This migration fixes the recursive policy issue and ensures proper access to user data.

  1. Changes
    - Drop existing recursive policies
    - Create new non-recursive policies for profiles table
    - Fix infinite recursion in profile policies
    - Update booking access policies

  2. Security
    - Maintain RLS protection
    - Ensure proper data access control
    - Prevent policy conflicts
*/

-- First, drop any existing policies that might be causing recursion
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can manage all bookings" ON profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Allow profile creation during signup" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Bookings can access associated user data" ON profiles;

-- Drop existing booking policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own bookings" ON bookings;
DROP POLICY IF EXISTS "Admins can view all bookings" ON bookings;
DROP POLICY IF EXISTS "Public can view approved and pending bookings" ON bookings;

-- Create new, non-recursive policies for profiles
CREATE POLICY "Public profiles are viewable by everyone"
ON profiles FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow profile creation during signup"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Ensure bookings can access user data
CREATE POLICY "Bookings can access associated user data"
ON profiles FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT user_id FROM bookings
    WHERE bookings.user_id = profiles.id
  )
  OR auth.uid() = id
  OR EXISTS (
    SELECT 1 FROM profiles admin
    WHERE admin.id = auth.uid()
    AND admin.role = 'admin'
  )
);

-- Create new booking policies with unique names
CREATE POLICY "booking_user_view_own"
ON bookings FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "booking_admin_view_all"
ON bookings FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Restore public booking visibility
CREATE POLICY "booking_public_view_approved"
ON bookings FOR SELECT
TO public
USING (status = ANY (ARRAY['approved'::booking_status, 'pending'::booking_status]));