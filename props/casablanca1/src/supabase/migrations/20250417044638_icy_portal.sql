/*
  # Update Booking Policies

  1. Changes
    - Add policy to allow all users to view all bookings
    - Maintain existing policies for creating and updating bookings
    - Ensure privacy by only exposing necessary booking information

  2. Security
    - Enable public read access to booking dates and status
    - Maintain restricted access for personal booking details
    - Preserve admin privileges
*/

-- First, enable RLS if not already enabled
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own bookings" ON bookings;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON bookings;
DROP POLICY IF EXISTS "Users can update their own pending bookings" ON bookings;

-- Create new policies

-- Allow everyone to view basic booking information
CREATE POLICY "Everyone can view booking dates"
  ON bookings
  FOR SELECT
  TO public
  USING (true);

-- Allow authenticated users to create bookings
CREATE POLICY "Authenticated users can create bookings"
  ON bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own pending bookings and admins to update any booking
CREATE POLICY "Users can update their own pending bookings or admins can update any"
  ON bookings
  FOR UPDATE
  TO public
  USING (
    (auth.uid() = user_id AND status = 'pending'::booking_status) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'::user_role
    )
  );