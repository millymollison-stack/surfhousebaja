/*
  # Fix Security Issues - Part 3: Profiles RLS Policies

  1. Remove duplicate profiles policies
  2. Create consolidated, optimized policies using (select auth.uid())
*/

-- Drop all existing policies on profiles
DROP POLICY IF EXISTS "Allow profile creation during signup" ON profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "admin_full_access" ON profiles;

-- Create optimized policies for profiles
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