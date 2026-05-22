-- Multi-tenant Database Setup for Surf House Baja Template

-- Run this in Supabase SQL Editor

-- 1. Add owner_id to properties table
ALTER TABLE properties 
ADD COLUMN owner_id UUID REFERENCES auth.users(id);

-- 2. Create indexes for better performance
CREATE INDEX idx_properties_owner_id ON properties(owner_id);
CREATE INDEX idx_bookings_property_id ON bookings(property_id);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_dates ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for Properties

-- Anyone can view properties
CREATE POLICY "Anyone can view properties"
ON properties FOR SELECT
USING (true);

-- Users can insert their own properties
CREATE POLICY "Users can insert properties"
ON properties FOR INSERT
WITH CHECK (auth.uid() = owner_id);

-- Users can update their own properties
CREATE POLICY "Users can update properties"
ON properties FOR UPDATE
USING (auth.uid() = owner_id);

-- Users can delete their own properties
CREATE POLICY "Users can delete properties"
ON properties FOR DELETE
USING (auth.uid() = owner_id);

-- 5. Create RLS Policies for Bookings

-- Users can view bookings for their properties
CREATE POLICY "Users can view bookings"
ON bookings FOR SELECT
USING (
  property_id IN (
    SELECT id FROM properties 
    WHERE owner_id = auth.uid()
  )
);

-- Users can insert bookings
CREATE POLICY "Users can insert bookings"
ON bookings FOR INSERT
WITH CHECK (true);

-- Users can update bookings for their properties
CREATE POLICY "Users can update bookings"
ON bookings FOR UPDATE
USING (
  property_id IN (
    SELECT id FROM properties 
    WHERE owner_id = auth.uid()
  )
);

-- 6. Create RLS Policies for Property Images

CREATE POLICY "Anyone can view property images"
ON property_images FOR SELECT
USING (true);

CREATE POLICY "Users can manage property images"
ON property_images FOR ALL
USING (
  property_id IN (
    SELECT id FROM properties 
    WHERE owner_id = auth.uid()
  )
);

-- 7. Create RLS Policies for Reviews

CREATE POLICY "Anyone can view reviews"
ON reviews FOR SELECT
USING (true);

CREATE POLICY "Users can manage reviews for their properties"
ON reviews FOR ALL
USING (
  property_id IN (
    SELECT id FROM properties 
    WHERE owner_id = auth.uid()
  )
);

-- 8. Create RLS Policies for Blocked Dates

CREATE POLICY "Users can view blocked dates"
ON blocked_dates FOR SELECT
USING (
  property_id IN (
    SELECT id FROM properties 
    WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "Users can manage blocked dates"
ON blocked_dates FOR ALL
USING (
  property_id IN (
    SELECT id FROM properties 
    WHERE owner_id = auth.uid()
  )
);
