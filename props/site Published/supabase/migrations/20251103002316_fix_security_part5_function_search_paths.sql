/*
  # Fix Security Issues - Part 5: Function Search Paths

  Fix mutable search_path on all functions by setting to 'public, pg_temp'
*/

-- ============================================================================
-- FIX check_booking_overlap FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS check_booking_overlap() CASCADE;

CREATE OR REPLACE FUNCTION check_booking_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM bookings
    WHERE property_id = NEW.property_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND status IN ('approved', 'pending')
      AND (
        (NEW.start_date, NEW.end_date) OVERLAPS (start_date, end_date)
      )
  ) THEN
    RAISE EXCEPTION 'Booking dates overlap with existing booking';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blocked_dates
    WHERE property_id = NEW.property_id
      AND (
        (NEW.start_date, NEW.end_date) OVERLAPS (start_date, end_date)
      )
  ) THEN
    RAISE EXCEPTION 'Booking dates overlap with blocked dates';
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS check_booking_overlap_trigger ON bookings;
CREATE TRIGGER check_booking_overlap_trigger
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION check_booking_overlap();

-- ============================================================================
-- FIX ensure_single_main_photo FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS ensure_single_main_photo() CASCADE;

CREATE OR REPLACE FUNCTION ensure_single_main_photo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_main = true THEN
    UPDATE property_images
    SET is_main = false
    WHERE property_id = NEW.property_id
      AND id != NEW.id
      AND is_main = true;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS ensure_single_main_photo_trigger ON property_images;
CREATE TRIGGER ensure_single_main_photo_trigger
  BEFORE INSERT OR UPDATE ON property_images
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_main_photo();

-- ============================================================================
-- FIX prevent_booking_overlap FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS prevent_booking_overlap() CASCADE;

CREATE OR REPLACE FUNCTION prevent_booking_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE property_id = NEW.property_id
      AND id != NEW.id
      AND status = 'approved'
      AND daterange(start_date, end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'Booking dates overlap with an existing approved booking';
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS prevent_booking_overlap_trigger ON bookings;
CREATE TRIGGER prevent_booking_overlap_trigger
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION prevent_booking_overlap();

-- ============================================================================
-- FIX update_reviews_updated_at FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS update_reviews_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION update_reviews_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS update_reviews_updated_at_trigger ON reviews;
CREATE TRIGGER update_reviews_updated_at_trigger
  BEFORE UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_reviews_updated_at();