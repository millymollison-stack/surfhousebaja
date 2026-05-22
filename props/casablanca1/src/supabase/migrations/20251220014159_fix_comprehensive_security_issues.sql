/*
  # Comprehensive Security Fixes

  ## Overview
  This migration addresses multiple critical security and performance issues identified in the database audit.

  ## Changes Made

  ### 1. Indexes
  - **Added**: Index on `bookings.property_id` to support foreign key constraint
  - **Removed**: Unused indexes that are not being utilized by queries:
    - `idx_bookings_payment_intent` on bookings table
    - `idx_property_images_property_id` on property_images table
    - `idx_blocked_dates_property_id` on blocked_dates table

  ### 2. RLS Policy Optimizations
  - **Fixed `profiles` table policies**: Updated to use `(select auth.uid())` instead of `auth.uid()` to prevent re-evaluation for each row
  - **Consolidated duplicate permissive policies**: Removed redundant policies that caused multiple policy evaluations

  ### 3. Tables with Policy Changes
  
  #### profiles
  - Fixed `profiles_select_policy` and `profiles_update_policy` to use optimized auth function calls
  
  #### blocked_dates
  - Consolidated `blocked_dates_admin_policy` and `blocked_dates_select_policy` into single policies per action
  - Separated into distinct SELECT, INSERT, UPDATE, DELETE policies
  
  #### properties
  - Consolidated `properties_admin_policy` and `properties_select_policy`
  - Separated into distinct policies per action
  
  #### property_images
  - Consolidated `property_images_admin_policy` and `property_images_select_policy`
  - Separated into distinct policies per action
  
  #### reviews
  - Consolidated duplicate INSERT policies
  - Removed redundant "Anyone can submit reviews" policy
  
  ### 4. Function Security
  - Fixed `check_booking_overlap` trigger function to use immutable search_path
  
  ## Security Notes
  - All policies now use `(select auth.uid())` for optimal performance
  - Each action (SELECT, INSERT, UPDATE, DELETE) has exactly one policy per table
  - Anonymous access is preserved only where intentionally needed (public read access)
  - Admin checks are consistently implemented across all policies
*/

-- ========================================
-- PART 1: INDEX MANAGEMENT
-- ========================================

-- Add missing index for bookings.property_id foreign key
CREATE INDEX IF NOT EXISTS idx_bookings_property_id ON bookings(property_id);

-- Remove unused indexes
DROP INDEX IF EXISTS idx_bookings_payment_intent;
DROP INDEX IF EXISTS idx_property_images_property_id;
DROP INDEX IF EXISTS idx_blocked_dates_property_id;

-- ========================================
-- PART 2: FIX PROFILES RLS POLICIES
-- ========================================

-- Drop existing profiles policies
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON profiles;

-- Create optimized profiles policies using (select auth.uid())
CREATE POLICY "profiles_select_policy" ON profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (select auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid())
      AND p.role = 'admin'
    )
    OR
    true
  );

CREATE POLICY "profiles_insert_policy" ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    id = (select auth.uid())
  );

CREATE POLICY "profiles_update_policy" ON profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = (select auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid())
      AND p.role = 'admin'
    )
  )
  WITH CHECK (
    id = (select auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid())
      AND p.role = 'admin'
    )
  );

-- ========================================
-- PART 3: CONSOLIDATE BLOCKED_DATES POLICIES
-- ========================================

-- Drop existing blocked_dates policies
DROP POLICY IF EXISTS "blocked_dates_admin_policy" ON blocked_dates;
DROP POLICY IF EXISTS "blocked_dates_select_policy" ON blocked_dates;

-- Create consolidated policies for blocked_dates
CREATE POLICY "blocked_dates_select_policy" ON blocked_dates
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "blocked_dates_insert_policy" ON blocked_dates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "blocked_dates_update_policy" ON blocked_dates
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "blocked_dates_delete_policy" ON blocked_dates
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  );

-- ========================================
-- PART 4: CONSOLIDATE PROPERTIES POLICIES
-- ========================================

-- Drop existing properties policies
DROP POLICY IF EXISTS "properties_admin_policy" ON properties;
DROP POLICY IF EXISTS "properties_select_policy" ON properties;

-- Create consolidated policies for properties
CREATE POLICY "properties_select_policy" ON properties
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "properties_insert_policy" ON properties
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "properties_update_policy" ON properties
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "properties_delete_policy" ON properties
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  );

-- ========================================
-- PART 5: CONSOLIDATE PROPERTY_IMAGES POLICIES
-- ========================================

-- Drop existing property_images policies
DROP POLICY IF EXISTS "property_images_admin_policy" ON property_images;
DROP POLICY IF EXISTS "property_images_select_policy" ON property_images;

-- Create consolidated policies for property_images
CREATE POLICY "property_images_select_policy" ON property_images
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "property_images_insert_policy" ON property_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "property_images_update_policy" ON property_images
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "property_images_delete_policy" ON property_images
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  );

-- ========================================
-- PART 6: CONSOLIDATE REVIEWS POLICIES
-- ========================================

-- Drop duplicate reviews INSERT policies
DROP POLICY IF EXISTS "Anyone can submit reviews" ON reviews;
DROP POLICY IF EXISTS "reviews_insert_policy" ON reviews;

-- Recreate single INSERT policy for reviews
CREATE POLICY "reviews_insert_policy" ON reviews
  FOR INSERT
  TO public
  WITH CHECK (true);

-- ========================================
-- PART 7: FIX FUNCTION SEARCH PATH
-- ========================================

-- Recreate check_booking_overlap trigger function with immutable search_path
CREATE OR REPLACE FUNCTION public.check_booking_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM bookings
    WHERE property_id = NEW.property_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status IN ('approved', 'pending')
    AND (
      (NEW.start_date, NEW.end_date) OVERLAPS (start_date, end_date)
    )
  ) THEN
    RAISE EXCEPTION 'Booking dates overlap with existing booking';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blocked_dates
    WHERE property_id = NEW.property_id
    AND (
      (NEW.start_date, NEW.end_date) OVERLAPS (start_date, end_date)
    )
  ) THEN
    RAISE EXCEPTION 'Booking dates overlap with blocked dates';
  END IF;

  RETURN NEW;
END;
$function$;

-- Recreate the check_booking_overlap function (non-trigger version) with proper search_path
CREATE OR REPLACE FUNCTION public.check_booking_overlap(
  p_property_id uuid,
  p_start_date date,
  p_end_date date,
  p_booking_id uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM (
      SELECT start_date, end_date FROM bookings
      WHERE property_id = p_property_id
      AND status = 'approved'
      AND id != p_booking_id
      UNION ALL
      SELECT start_date, end_date FROM blocked_dates
      WHERE property_id = p_property_id
    ) dates
    WHERE (p_start_date, p_end_date) OVERLAPS (dates.start_date, dates.end_date)
  );
END;
$function$;