# Code Structure Analysis - Surf House Baja

## Current Architecture

### Tech Stack
- **Frontend**: React + Vite + TypeScript + TailwindCSS
- **Backend**: Supabase (PostgreSQL)
- **Payments**: Stripe
- **Hosting**: Netlify
- **Email**: Hostinger API

### Data Flow
The app fetches ALL data from Supabase database:
1. **Home.tsx** loads property from `properties` table
2. Images from `property_images` table
3. Bookings from `bookings` table
4. Reviews from `reviews` table

### Current Components (12)
| Component | Purpose |
|-----------|---------|
| BookingCalendar | Date selection & availability |
| ImageGallery | Property photo display |
| PaymentForm | Stripe payment |
| PropertyDetails | Property info display |
| AdminDashboard | Admin controls |
| ReviewsList | Guest reviews |
| ReviewForm | Submit reviews |
| LocationMap | Property location |
| UserMenu | User navigation |
| UserBookings | Booking management |
| AdminProfile | Admin settings |
| Layout | Page wrapper |

### Current Pages (5)
- **Home.tsx** - Main property page
- **Login.tsx** - User login
- **Signup.tsx** - User registration
- **AdminDashboard.tsx** - Admin panel
- **EmailConfirmation.tsx** - Email verify

### Database Tables (Supabase)
- `properties` - Property details (title, price, beds, baths, etc.)
- `property_images` - Photos with URLs
- `bookings` - Reservations
- `reviews` - Guest reviews
- `blocked_dates` - Unavailable dates
- `profiles` - User profiles

### What's Already Dynamic
✅ Property data loads from Supabase
✅ Images stored in Supabase Storage
✅ User authentication works
✅ Booking system exists
✅ Payment integration (Stripe) exists

## What Needs to Change for Template

### 1. Multi-tenant Support Needed
Currently hardcoded to fetch ONE property (`.limit(1).single()`)
- Need to support MULTIPLE properties per account
- Need property_id in all queries

### 2. Admin Panel Needs Work
- Currently shows data for single property
- Need: Create/edit multiple properties
- Need: View all bookings for their properties

### 3. Configuration Needed
- Stripe keys should be per-property or per-account
- Email templates need to be customizable

### 4. User Flow
- Property owners need to SIGN UP
- Property owners need to ADD their property
- Property owners need to CONFIGURE settings

## Recommendation

The site is already 70% ready for template conversion. Main work is:
1. Add multi-tenant support (property_id filtering)
2. Build onboarding flow (sign up → add property)
3. Make Stripe keys configurable per account
4. Create property creation wizard
