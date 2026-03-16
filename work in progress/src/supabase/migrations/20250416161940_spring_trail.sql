/*
  # Fix Profile Policies

  1. Changes
    - Update RLS policies for profiles table to allow proper user creation and access
    - Remove unnecessary checks that were causing authentication issues
    - Simplify profile management policies

  2. Security
    - Maintain secure access patterns while allowing necessary operations
    - Ensure users can only access their own profiles
    - Allow profile creation during signup
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Create new policies
CREATE POLICY "Enable read access for users"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Enable insert for authenticated users only"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable update for users based on id"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);