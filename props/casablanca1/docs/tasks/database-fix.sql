-- Fix: Run only what's needed

-- 1. Add owner_id (if not exists)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- 2. Enable RLS (if not enabled)
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_dates ENABLE ROW LEVEL SECURITY;

-- 3. Create policies (drop existing first, then create)
DROP POLICY IF EXISTS "Anyone can view properties" ON properties;
CREATE POLICY "Anyone can view properties" ON properties FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert properties" ON properties;
CREATE POLICY "Users can insert properties" ON properties FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update properties" ON properties;
CREATE POLICY "Users can update properties" ON properties FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete properties" ON properties;
CREATE POLICY "Users can delete properties" ON properties FOR DELETE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can view bookings" ON bookings;
CREATE POLICY "Users can view bookings" ON bookings FOR SELECT USING (
  property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert bookings" ON bookings;
CREATE POLICY "Users can insert bookings" ON bookings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update bookings" ON bookings;
CREATE POLICY "Users can update bookings" ON bookings FOR UPDATE USING (
  property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid())
);

DROP POLICY IF EXISTS "Anyone can view property images" ON property_images;
CREATE POLICY "Anyone can view property images" ON property_images FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage property images" ON property_images;
CREATE POLICY "Users can manage property images" ON property_images FOR ALL USING (
  property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid())
);

DROP POLICY IF EXISTS "Anyone can view reviews" ON reviews;
CREATE POLICY "Anyone can view reviews" ON reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage reviews" ON reviews;
CREATE POLICY "Users can manage reviews" ON reviews FOR ALL USING (
  property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can view blocked dates" ON blocked_dates;
CREATE POLICY "Users can view blocked dates" ON blocked_dates FOR SELECT USING (
  property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can manage blocked dates" ON blocked_dates;
CREATE POLICY "Users can manage blocked dates" ON blocked_dates FOR ALL USING (
  property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid())
);
