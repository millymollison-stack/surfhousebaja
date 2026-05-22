/*
  # Fix Security Issues - Part 4: Other Table Policies

  1. Fix blocked_dates policies
  2. Fix property_images policies
  3. Fix properties policies
  4. Fix reviews policies
*/

-- ============================================================================
-- BLOCKED DATES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Blocked dates are viewable by everyone" ON blocked_dates;
DROP POLICY IF EXISTS "Only admins can manage blocked dates" ON blocked_dates;

CREATE POLICY "blocked_dates_select_policy" ON blocked_dates
  FOR SELECT
  USING (true);

CREATE POLICY "blocked_dates_admin_policy" ON blocked_dates
  FOR ALL
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

-- ============================================================================
-- PROPERTY IMAGES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Property images are viewable by everyone" ON property_images;
DROP POLICY IF EXISTS "Only admins can manage property images" ON property_images;

CREATE POLICY "property_images_select_policy" ON property_images
  FOR SELECT
  USING (true);

CREATE POLICY "property_images_admin_policy" ON property_images
  FOR ALL
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

-- ============================================================================
-- PROPERTIES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Only admins can insert properties" ON properties;
DROP POLICY IF EXISTS "Only admins can update properties" ON properties;
DROP POLICY IF EXISTS "Properties are viewable by everyone" ON properties;

CREATE POLICY "properties_select_policy" ON properties
  FOR SELECT
  USING (true);

CREATE POLICY "properties_admin_policy" ON properties
  FOR ALL
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

-- ============================================================================
-- REVIEWS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view verified reviews" ON reviews;
DROP POLICY IF EXISTS "Authenticated users can create reviews" ON reviews;
DROP POLICY IF EXISTS "Admins can view all reviews" ON reviews;
DROP POLICY IF EXISTS "Admins can update reviews" ON reviews;
DROP POLICY IF EXISTS "Admins can delete reviews" ON reviews;

CREATE POLICY "reviews_select_policy" ON reviews
  FOR SELECT
  USING (
    is_verified = true
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "reviews_insert_policy" ON reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "reviews_update_policy" ON reviews
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

CREATE POLICY "reviews_delete_policy" ON reviews
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  );