/*
  # Add sample property data

  1. Sample Data
    - Add a luxury beach house property with amenities
    - Add sample property images
    - Add some existing bookings

  2. Changes
    - Insert property data
    - Insert property images
    - Insert sample bookings
*/

-- Insert sample property
INSERT INTO properties (id, title, description, price_per_night, bedrooms, bathrooms, max_guests, amenities, house_rules)
VALUES (
  'f3d3e867-e0c6-4cc5-a05d-b5e368f8c766',
  'Luxurious Oceanfront Villa',
  'Experience the ultimate beachfront getaway in this stunning modern villa. Perched directly on the pristine shoreline, this architectural masterpiece offers breathtaking ocean views from every room. The open-concept living space seamlessly blends indoor and outdoor living, featuring floor-to-ceiling windows, a gourmet kitchen, and an expansive deck perfect for sunset watching.',
  799.99,
  4,
  3,
  8,
  '["WiFi", "Infinity Pool", "Parking", "Coffee Maker", "TV", "Beach Access", "BBQ Grill", "Air Conditioning"]',
  'Check-in: 3:00 PM
Check-out: 11:00 AM
No smoking
No parties or events
Pets allowed with prior approval
Quiet hours: 10:00 PM - 8:00 AM'
)
ON CONFLICT (id) DO NOTHING;

-- Insert sample images
INSERT INTO property_images (property_id, url, position)
VALUES 
  ('f3d3e867-e0c6-4cc5-a05d-b5e368f8c766', 'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=2000&q=80', 1),
  ('f3d3e867-e0c6-4cc5-a05d-b5e368f8c766', 'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=2000&q=80', 2),
  ('f3d3e867-e0c6-4cc5-a05d-b5e368f8c766', 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=2000&q=80', 3),
  ('f3d3e867-e0c6-4cc5-a05d-b5e368f8c766', 'https://images.unsplash.com/photo-1507652313519-d4e9174996dd?auto=format&fit=crop&w=2000&q=80', 4),
  ('f3d3e867-e0c6-4cc5-a05d-b5e368f8c766', 'https://images.unsplash.com/photo-1613553507747-5f8d62ad5904?auto=format&fit=crop&w=2000&q=80', 5)
ON CONFLICT DO NOTHING;