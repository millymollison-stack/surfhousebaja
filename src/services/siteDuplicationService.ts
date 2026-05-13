/**
 * SiteDuplicationService — creates a new customer site after Stripe payment
 *
 * Flow:
 * 1. Stripe payment succeeds (in OnboardingPopup)
 * 2. onComplete fires with all onboarding data
 * 3. This service:
 *    a. Creates new Supabase records (property, profile, bookings)
 *    b. Creates a slug from the site name
 *    c. SFTPs to Hostinger and copies template dist/ → /props/{slug}/
 *    d. Updates Supabase with the new site URL
 *    e. Sends confirmation email via Resend
 *
 * Hostinger SFTP: sftp.u805930916@82.29.86.252 (port 22)
 * Supabase property row + credentials stored per customer
 */

import { supabase } from '../lib/supabase';

export interface NewSiteData {
  email: string;
  bookingsEmail: string;
  websiteName: string;
  websiteDesc: string;
  planChoice: 'starter' | 'pro' | 'agency';
  hostingChoice: 'our' | 'own';
  extras: { seo: boolean; ads: boolean; analytics: boolean; social: boolean };
  scrapedData: {
    title: string;
    location: string;
    description: string;
    hero_image: string;
    images: string[];
    guests: number | null;
    bedrooms: number | null;
    beds: number | null;
    baths: number | null;
    rating: number | null;
    reviews: number | null;
    host_name: string | null;
    price: string;
  } | null;
  designChoice: string;
  bankChoice: string;
}

// ─────────────────────────────────────────────
// STEP 1 — Create slug from website name
// ─────────────────────────────────────────────
function createSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30) || 'site';
}

// ─────────────────────────────────────────────
// STEP 2 — Create Supabase records for new site
// ─────────────────────────────────────────────
export async function createNewSiteRecords(data: NewSiteData): Promise<{
  propertyId: string;
  siteUrl: string;
  slug: string;
}> {
  const slug = createSlug(data.websiteName);

  // 2a. Create property record
  const { data: propertyRecord, error: propertyError } = await supabase
    .from('properties')
    .insert({
      name: data.scrapedData?.title || data.websiteName,
      slug,
      description: data.scrapedData?.description || data.websiteDesc,
      location: data.scrapedData?.location || '',
      max_guests: data.scrapedData?.guests || 8,
      bedrooms: data.scrapedData?.bedrooms || 2,
      beds: data.scrapedData?.beds || 3,
      baths: data.scrapedData?.baths || 1,
      price_per_night: data.scrapedData?.price ? parseFloat(data.scrapedData.price.replace(/[^0-9.]/g, '')) : 150,
      hero_image: data.scrapedData?.hero_image || '',
      images: data.scrapedData?.images || [],
      status: 'draft', // not live until site is built
      owner_id: propertyId,
      site_url: `https://propbook.pro/props/${slug}`,
      server_ip: '82.29.86.252',
      folder_path: `/props/${slug}`,
    })
    .select('id')
    .single();

  if (propertyError) throw new Error(`Property insert failed: ${propertyError.message}`);
  const propertyId = propertyRecord.id;

  // 2b. Create profile/user record — including services (extras)
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: propertyId, // profile id matches property id for linking
      email: data.email,
      full_name: data.websiteName,
      booking_email: data.bookingsEmail || data.email,
      user_type: 'admin',
      stripe_plan: data.planChoice,
      // Wire extras (services) from onboarding
      services_ai_seo: data.extras?.seo ?? false,
      services_marketing: data.extras?.ads ?? false,
      services_advertising: data.extras?.ads ?? false,
      services_analytics: data.extras?.analytics ?? false,
      services_influencers: false,
      services_social: data.extras?.social ?? false,
      created_at: new Date().toISOString(),
    });

  if (profileError) console.warn('Profile insert error:', profileError.message);

  // 2c. Create bookings table for this property (future use — empty for now)
  // Bookings table already exists — just link to property
  // (no action needed here — bookings are created at runtime when guests book)

  // 2d. Save onboarding data with property link
  await supabase
    .from('onboarding_data')
    .upsert({
      user_id: propertyId,
      property_name: data.websiteName,
      property_desc: data.websiteDesc,
      design_choice: data.designChoice,
      hosting_choice: data.hostingChoice,
      plan_choice: data.planChoice,
      email: data.email,
      bookings_email: data.bookingsEmail,
      property_id: propertyId,
      slug,
      created_at: new Date().toISOString(),
    });

  const siteUrl = `https://www.propbook.pro/props/${slug}`;

  return { propertyId, siteUrl, slug };
}

// ─────────────────────────────────────────────
// STEP 3 — Mark site as active
// No file copy needed — site is rendered dynamically from Supabase
// ─────────────────────────────────────────────
export async function buildSiteOnHostinger(slug: string, propertyId: string): Promise<void> {
  // Mark as active — Supabase data now powers the site at /props/{slug}
  await supabase
    .from('properties')
    .update({
      site_url: `https://propbook.pro/props/${slug}`,
      server_ip: '82.29.86.252',
      folder_path: `/props/${slug}`,
      status: 'active',
    })
    .eq('id', propertyId);

  console.log(`Site activated: https://propbook.pro/props/${slug}`);
}

// ─────────────────────────────────────────────
// STEP 4 — Send confirmation email via Resend
// ─────────────────────────────────────────────
export async function sendNewSiteEmail(data: NewSiteData, siteUrl: string): Promise<void> {
  try {
    const { error: fnError } = await supabase.functions.invoke('send-booking-email', {
      body: {
        type: 'new_site_created',
        user: { email: data.email, full_name: data.websiteName },
        property: { title: data.scrapedData?.title || data.websiteName },
        booking: null,
        adminEmail: data.bookingsEmail || data.email,
        adminName: data.websiteName,
        siteUrl,
        message: `Your property site is being built and will be live at: ${siteUrl}`,
      },
    });
    if (fnError) console.warn('Confirmation email failed:', fnError);
  } catch (err) {
    console.warn('Confirmation email error:', err);
  }
}

// ─────────────────────────────────────────────
// STEP 5 — Main orchestration function
// Call this from OnboardingPopup's onComplete
// ─────────────────────────────────────────────
export async function duplicateSiteAfterPayment(data: NewSiteData): Promise<{ siteUrl: string; propertyId: string }> {
  try {
    // 1. Create Supabase records
    const { propertyId, siteUrl, slug } = await createNewSiteRecords(data);

    // 2. Trigger site build on Hostinger
    await buildSiteOnHostinger(slug, propertyId);

    // 3. Send confirmation email
    await sendNewSiteEmail(data, siteUrl);

    console.log(`Site duplication complete: ${siteUrl}`);
    return { siteUrl, propertyId };
  } catch (err) {
    console.error('Site duplication failed:', err);
    throw err;
  }
}