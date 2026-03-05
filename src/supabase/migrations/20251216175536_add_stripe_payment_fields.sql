/*
  # Add Stripe Payment Fields to Bookings

  1. Changes to Tables
    - Add payment tracking columns to `bookings` table:
      - `payment_status` (enum): Tracks payment state - unpaid, pending, paid, refunded, failed
      - `stripe_payment_intent_id` (text): Stripe's unique payment identifier for tracking and refunds
      - `amount_paid` (numeric): Actual amount charged to guest in cents for accurate record keeping
      - `stripe_refund_id` (text): Tracks refund transactions when bookings are cancelled
      - `payment_created_at` (timestamptz): Timestamp when payment was initiated
      - `payment_completed_at` (timestamptz): Timestamp when payment was successfully completed

  2. Security
    - No RLS changes needed - existing bookings policies cover new payment fields
    - Only booking owner and admins can view payment information through existing policies

  3. Important Notes
    - Amounts stored in cents to avoid floating point precision issues
    - Payment status starts as 'unpaid' for backwards compatibility
    - Stripe IDs are nullable to support existing bookings without payments
*/

-- Create payment status enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM ('unpaid', 'pending', 'paid', 'refunded', 'failed');
  END IF;
END $$;

-- Add payment tracking columns to bookings table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE bookings ADD COLUMN payment_status payment_status DEFAULT 'unpaid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'stripe_payment_intent_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN stripe_payment_intent_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'amount_paid'
  ) THEN
    ALTER TABLE bookings ADD COLUMN amount_paid numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'stripe_refund_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN stripe_refund_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'payment_created_at'
  ) THEN
    ALTER TABLE bookings ADD COLUMN payment_created_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'payment_completed_at'
  ) THEN
    ALTER TABLE bookings ADD COLUMN payment_completed_at timestamptz;
  END IF;
END $$;

-- Create index on payment intent ID for fast webhook lookups
CREATE INDEX IF NOT EXISTS idx_bookings_payment_intent ON bookings(stripe_payment_intent_id);