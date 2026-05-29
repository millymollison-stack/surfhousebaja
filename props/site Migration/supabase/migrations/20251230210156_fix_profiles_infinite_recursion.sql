/*
  # Fix Profiles Infinite Recursion Issue

  ## Overview
  The previous security migration inadvertently caused infinite recursion in the profiles table policies
  by directly querying the profiles table within the policy itself.

  ## Changes Made
  
  ### 1. Ensure is_admin() Function Exists
  - Creates a SECURITY DEFINER function that bypasses RLS when checking admin status
  - This prevents infinite recursion when policies need to check if a user is an admin
  
  ### 2. Update Profiles Policies
  - Replaces direct profile table queries with the is_admin() function
  - Maintains the same security model but without recursion
  - Uses (select auth.uid()) for optimization as intended in the security fix

  ## Security Notes
  - The is_admin() function is SECURITY DEFINER so it bypasses RLS
  - This is safe because it only checks the current user's own admin status
  - All other security restrictions remain in place
*/

-- Ensure the is_admin function exists with proper configuration
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- Drop and recreate profiles policies using is_admin() function
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;

-- SELECT policy - anyone can view profiles, optimized with is_admin()
CREATE POLICY "profiles_select_policy" ON profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (select auth.uid())
    OR
    is_admin()
    OR
    true
  );

-- INSERT policy - users can only create their own profile
CREATE POLICY "profiles_insert_policy" ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    id = (select auth.uid())
  );

-- UPDATE policy - users can update their own profile, admins can update any
CREATE POLICY "profiles_update_policy" ON profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = (select auth.uid())
    OR
    is_admin()
  )
  WITH CHECK (
    id = (select auth.uid())
    OR
    is_admin()
  );