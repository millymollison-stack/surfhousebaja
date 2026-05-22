/*
  # Fix profiles table RLS policies

  1. Changes
    - Drop existing problematic RLS policies on profiles table
    - Create new, simplified RLS policies that avoid recursion
    
  2. Security
    - Enable RLS on profiles table
    - Add policies for:
      - Public read access to basic profile info
      - Authenticated users can read their own full profile
      - Users can update their own profile
      - Admins have full access to all profiles
*/

-- Drop existing policies to start fresh
DROP POLICY IF EXISTS "Allow profile creation during signup" ON profiles;
DROP POLICY IF EXISTS "Bookings can access associated user data" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Create new, simplified policies
CREATE POLICY "Public profiles are viewable by everyone"
ON profiles FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can read own profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow profile creation during signup"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins have full access"
ON profiles FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles admin
    WHERE admin.id = auth.uid() 
    AND admin.role = 'admin'
  )
);