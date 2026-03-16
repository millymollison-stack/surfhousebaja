export type UserRole = 'admin' | 'user';
export type BookingStatus = 'pending' | 'approved' | 'denied' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'refunded' | 'failed';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone_number: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  title: string;
  description: string;
  price_per_night: number;
  bedrooms: number;
  bathrooms: number;
  max_guests: number;
  amenities: string[];
  property_details: string | null;
  activities: string | null;
  local_area: string | null;
  getting_there: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  location_type: 'address' | 'coordinates' | null;
  property_title: string | null;
  property_intro: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyImage {
  id: string;
  property_id: string;
  url: string;
  position: number;
  is_featured: boolean;
  is_main: boolean;
  is_background: boolean;
  created_at: string;
}

export interface Booking {
  id: string;
  property_id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  total_price: number;
  status: BookingStatus;
  guest_count: number;
  special_requests: string | null;
  created_at: string;
  updated_at: string;
  denial_reason: string | null;
  payment_status: PaymentStatus;
  stripe_payment_intent_id: string | null;
  amount_paid: number | null;
  stripe_refund_id: string | null;
  payment_created_at: string | null;
  payment_completed_at: string | null;
}

export interface BlockedDate {
  id: string;
  property_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  guest_name: string;
  guest_email: string;
  rating: number;
  review_text: string;
  stay_date: string;
  is_verified: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}