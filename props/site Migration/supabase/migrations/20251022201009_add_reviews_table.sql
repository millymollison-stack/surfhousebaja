/*
  # Add Reviews Table

  1. New Tables
    - `reviews`
      - `id` (uuid, primary key)
      - `guest_name` (text) - Name of the person leaving the review
      - `guest_email` (text) - Email for verification
      - `rating` (integer) - Rating from 1-5 stars
      - `review_text` (text) - The actual review content
      - `stay_date` (date) - When they stayed at the property
      - `is_verified` (boolean) - Whether admin has verified this review
      - `display_order` (integer) - Order to display reviews (lower numbers first)
      - `created_at` (timestamptz) - When review was submitted
      - `updated_at` (timestamptz) - Last update time

  2. Security
    - Enable RLS on `reviews` table
    - Add policy for public to read verified reviews only
    - Add policy for authenticated admins to manage all reviews
    - Add policy for anyone to submit a review (will need admin verification)

  3. Indexes
    - Add index on display_order for efficient sorting
    - Add index on is_verified for filtering published reviews
*/

-- Create reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_name text NOT NULL,
  guest_email text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text text NOT NULL,
  stay_date date NOT NULL,
  is_verified boolean DEFAULT false,
  display_order integer DEFAULT 999,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view verified reviews
CREATE POLICY "Anyone can view verified reviews"
  ON reviews
  FOR SELECT
  USING (is_verified = true);

-- Policy: Admins can view all reviews
CREATE POLICY "Admins can view all reviews"
  ON reviews
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy: Anyone can submit a review
CREATE POLICY "Anyone can submit reviews"
  ON reviews
  FOR INSERT
  WITH CHECK (true);

-- Policy: Admins can update reviews
CREATE POLICY "Admins can update reviews"
  ON reviews
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy: Admins can delete reviews
CREATE POLICY "Admins can delete reviews"
  ON reviews
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_reviews_display_order ON reviews(display_order);
CREATE INDEX IF NOT EXISTS idx_reviews_verified ON reviews(is_verified);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS reviews_updated_at ON reviews;
CREATE TRIGGER reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_reviews_updated_at();