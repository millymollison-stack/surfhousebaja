/*
  # Fix recursive profiles policies

  1. Changes
    - Remove recursive admin policy that was causing infinite loops
    - Simplify and optimize profile access policies
    - Ensure proper role-based access control

  2. Security
    - Maintain RLS protection
    - Keep existing user access rules
    - Fix admin access implementation
*/

-- First, drop the problematic policies
DROP POLICY IF EXISTS "Admins have full access" ON profiles;

-- Create new, non-recursive admin policy
CREATE POLICY "admin_full_access"
ON profiles
FOR ALL 
TO authenticated
USING (
  role = 'admin'
);

-- Keep existing policies but ensure they're properly defined
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile"
ON profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Allow profile creation during signup" ON profiles;
CREATE POLICY "Allow profile creation during signup"
ON profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
ON profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone"
ON profiles
FOR SELECT
TO public
USING (true);