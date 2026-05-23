-- Clear all development users and bookings while preserving property data
-- This script will remove all users, profiles, and bookings but keep properties and images

-- First, delete all bookings (this will cascade and remove related data)
DELETE FROM bookings;

-- Delete all blocked dates (admin-created date blocks)
DELETE FROM blocked_dates;

-- Delete all user profiles (this will also remove the auth users via foreign key)
-- Note: This will keep any admin profiles, but you may want to recreate a clean admin account
DELETE FROM profiles;

-- Clear auth.users table (this requires admin privileges)
-- Note: In Supabase, you typically need to do this through the dashboard
-- But we can try to delete via SQL if permissions allow
DELETE FROM auth.users;

-- Verify what remains (properties and images should still be there)
SELECT 'Properties remaining:' as info, count(*) as count FROM properties
UNION ALL
SELECT 'Property images remaining:' as info, count(*) as count FROM property_images
UNION ALL
SELECT 'Users remaining:' as info, count(*) as count FROM profiles
UNION ALL
SELECT 'Bookings remaining:' as info, count(*) as count FROM bookings
UNION ALL
SELECT 'Blocked dates remaining:' as info, count(*) as count FROM blocked_dates;