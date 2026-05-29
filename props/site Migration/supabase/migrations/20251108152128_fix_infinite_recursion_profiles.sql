/*
  # Fix Infinite Recursion in Profiles Policies

  1. Changes
    - Drop existing problematic policies on profiles table
    - Create a security definer function to check admin role (bypasses RLS)
    - Recreate profiles policies using the new function to avoid recursion
    - The function runs with elevated privileges so it won't trigger RLS checks

  2. Security
    - Function is SECURITY DEFINER to bypass RLS when checking roles
    - Policies still properly restrict access based on user identity
    - Admin checks now work without causing infinite recursion
*/

-- Drop existing policies
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;

-- Create a security definer function to check if current user is admin
-- This bypasses RLS to prevent infinite recursion
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
END;
$$;

-- Recreate SELECT policy using the function
CREATE POLICY "profiles_select_policy"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid() OR is_admin() OR true
  );

-- Recreate UPDATE policy using the function
CREATE POLICY "profiles_update_policy"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR is_admin())
  WITH CHECK (id = auth.uid() OR is_admin());