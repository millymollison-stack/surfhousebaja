/*
  # Initial Schema Setup for Property Rental Website

  1. New Tables
    - profiles
      - User profile information
      - Linked to Supabase auth
    - properties
      - Property details and settings
    - property_images
      - Images associated with properties
    - bookings
      - Booking records with status
    - blocked_dates
      - Dates blocked by admin

  2. Security
    - RLS policies for each table
    - Secure access patterns for different user roles
*/

-- Create custom types
CREATE TYPE booking_status AS ENUM ('pending', 'approved', 'denied', 'cancelled');
CREATE TYPE user_role AS ENUM ('admin', 'user');

-- Create profiles table
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text NOT NULL,
  full_name text,
  avatar_url text,
  role user_role DEFAULT 'user',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create properties table
CREATE TABLE properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  price_per_night decimal NOT NULL,
  bedrooms integer NOT NULL,
  bathrooms integer NOT NULL,
  max_guests integer NOT NULL,
  amenities jsonb DEFAULT '[]',
  house_rules text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create property_images table
CREATE TABLE property_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  url text NOT NULL,
  position integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create bookings table
CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_price decimal NOT NULL,
  status booking_status DEFAULT 'pending',
  guest_count integer NOT NULL,
  special_requests text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_dates CHECK (end_date > start_date)
);

-- Create blocked_dates table
CREATE TABLE blocked_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_blocked_dates CHECK (end_date > start_date)
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_dates ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Properties policies
CREATE POLICY "Properties are viewable by everyone"
  ON properties FOR SELECT
  USING (true);

CREATE POLICY "Only admins can insert properties"
  ON properties FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  ));

CREATE POLICY "Only admins can update properties"
  ON properties FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  ));

-- Property images policies
CREATE POLICY "Property images are viewable by everyone"
  ON property_images FOR SELECT
  USING (true);

CREATE POLICY "Only admins can manage property images"
  ON property_images FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  ));

-- Bookings policies
CREATE POLICY "Users can view their own bookings"
  ON bookings FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Users can insert their own bookings"
  ON bookings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pending bookings"
  ON bookings FOR UPDATE
  USING (
    (auth.uid() = user_id AND status = 'pending') OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Blocked dates policies
CREATE POLICY "Blocked dates are viewable by everyone"
  ON blocked_dates FOR SELECT
  USING (true);

CREATE POLICY "Only admins can manage blocked dates"
  ON blocked_dates FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  ));

-- Functions
CREATE OR REPLACE FUNCTION check_booking_overlap(
  p_property_id uuid,
  p_start_date date,
  p_end_date date,
  p_booking_id uuid DEFAULT NULL
) RETURNS boolean AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers
CREATE OR REPLACE FUNCTION prevent_booking_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF check_booking_overlap(NEW.property_id, NEW.start_date, NEW.end_date, NEW.id) THEN
    RAISE EXCEPTION 'Booking dates overlap with existing booking or blocked dates';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_booking_overlap_trigger
BEFORE INSERT OR UPDATE ON bookings
FOR EACH ROW
WHEN (NEW.status = 'approved')
EXECUTE FUNCTION prevent_booking_overlap();