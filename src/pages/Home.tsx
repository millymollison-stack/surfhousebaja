import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, supabaseAdmin } from '../lib/supabase';
import { ImageGallery } from '../components/ImageGallery';
import { PropertyDetails } from '../components/PropertyDetails';
import { PropertyAmenities } from '../components/PropertyAmenities';
import { BookingCalendar } from '../components/BookingCalendar';
import ReviewsList from '../components/ReviewsList';
import ReviewForm from '../components/ReviewForm';
import { OnboardingPopup } from '../components/OnboardingPopup';
import '../components/OnboardingPopup.css';
import { duplicateSiteAfterPayment } from '../services/p';
import { useAuth } from '../store/auth';
import type { Property, PropertyImage, Booking, BlockedDate } from '../types';

const SURF_HOUSE_BAJA_ID = 'efa8d280-afee-4971-9145-d591740f484d';

interface HomeProps {
  isEditing?: boolean;
  onHasChanges?: (hasChanges: boolean) => void;
  registerSaveAll?: (fn: () => Promise<void>) => void;
  onSiteNameChange?: (name: string) => void;
  onOpenSidebar?: () => void;
  onCanEditChange?: (canEdit: boolean) => void;
  onOnboardingComplete?: () => void;
}

export function Home({ isEditing: externalIsEditing, onHasChanges, registerSaveAll, onSiteNameChange, onOpenSidebar, onCanEditChange, onOnboardingComplete }: HomeProps) {
  const [property, setProperty] = useState<Property | null>(null);
  const [images, setImages] = useState<PropertyImage[]>([]);
  const [backgroundImages, setBackgroundImages] = useState<PropertyImage[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [scrapedImages, setScrapedImages] = useState<PropertyImage[]>([]);
  const [scrapedProperty, setScrapedProperty] = useState<Partial<Property> | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [defaultProperty, setDefaultProperty] = useState<Property | null>(null);
  const [defaultImages, setDefaultImages] = useState<PropertyImage[]>([]);
  const imageGallerySaveRef = useRef<(() => Promise<void>) | null>(null);
  const { user } = useAuth();

  // Computed after property loads: true only for saas_admins OR the actual property owner
  const canEdit = !!(user && property && (user.role === 'saas_admin' || property.owner_id === user.id));

  // Notify App/Layout when canEdit changes (after property loads)
  useEffect(() => {
    if (property && user) {
      onCanEditChange?.(canEdit);
    }
  }, [property, user, canEdit]);
  const navigate = useNavigate();
  const calendarRef = useRef<HTMLDivElement>(null);

  console.log('=== HOME COMPONENT RENDERED ===');

  // Sync with external edit mode from App
  useEffect(() => {
    if (externalIsEditing !== undefined) {
      setIsEditing(externalIsEditing);
    }
  }, [externalIsEditing]);

  useEffect(() => {
    async function loadProperty() {
      try {
        let targetPropertyId = SURF_HOUSE_BAJA_ID;

        // ── Priority 1: If user is logged in and has a published property, load that ──
        // This takes precedence over the demo property so returning users see their own site
        if (user?.id) {
          const { data: userProps } = await supabase
            .from('properties')
            .select('id')
            .eq('owner_id', user.id)
            .limit(1);
          if (userProps && userProps.length > 0) {
            targetPropertyId = userProps[0].id;
            console.log('[Home] User has property in DB:', targetPropertyId, '— loading that instead of demo');
          }
        }

        const { data: propData, error: propError } = await supabase
          .from('properties')
          .select('*')
          .eq('id', targetPropertyId)
          .single();

        if (propError) throw propError;
        setProperty(propData);
        setDefaultProperty(propData);

        const { data: imgData, error: imgError } = await supabase
          .from('property_images')
          .select('*')
          .eq('property_id', targetPropertyId)
          .order('position');

        if (imgError) throw imgError;
        setImages(imgData || []);
        setDefaultImages(imgData || []);

        // Background images (first 2 with is_background flag)
        let bgImages: PropertyImage[] = [];
        try {
          bgImages = (imgData || []).filter((img: PropertyImage) => (img as any).is_background).slice(0, 2);
        } catch (e) { bgImages = []; }
        setBackgroundImages(bgImages);

        const { data: bkgData, error: bkgError } = await supabase
          .from('bookings')
          .select('*')
          .eq('property_id', targetPropertyId)
          .in('status', ['approved', 'pending']);
        if (bkgError) throw bkgError;

        const { data: blkData, error: blkError } = await supabase
          .from('blocked_dates')
          .select('*')
          .eq('property_id', targetPropertyId);
        if (blkError) throw blkError;

        setBookings(bkgData || []);
        setBlockedDates(blkData || []);
      } catch (err) {
        setError('Failed to load property details');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadProperty();
  }, [user]);

  // ── Restore scraped data from sessionStorage after Stripe redirect ─────────
  // This survives the Home component remount that happens when Stripe redirects
  // back to the app with ?paid=true&session_id=...
  // Only applies when user has NO property in DB yet (i.e. still in onboarding).
  // Once they have a published property, the DB is authoritative and this is skipped.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        // Check if user already has a published property — if so, skip sessionStorage restore
        const { data: existingProps } = await supabase
          .from('properties')
          .select('id')
          .eq('owner_id', user.id)
          .limit(1);
        if (existingProps && existingProps.length > 0) {
          console.log('[Home] User already has property in DB — sessionStorage scraped data skipped');
          return;
        }

        const uid = user.id;
        const savedProp = sessionStorage.getItem(`home_${uid}_scraped_property`);
        const savedImgs = sessionStorage.getItem(`home_${uid}_scraped_images`);
        if (savedProp) {
          const prop = JSON.parse(savedProp);
          if (prop.title || prop.property_title) {
            console.log('[Home] Restoring scrapedProperty from sessionStorage:', prop.title || prop.property_title);
            setScrapedProperty(prop);
          }
        }
        if (savedImgs) {
          const imgs = JSON.parse(savedImgs);
          if (Array.isArray(imgs) && imgs.length > 0) {
            console.log('[Home] Restoring scrapedImages from sessionStorage:', imgs.length, 'images');
            setScrapedImages(imgs);
          }
        }
      } catch (e) {
        console.warn('[Home] Could not restore scraped data from sessionStorage:', e);
      }
    })();
  }, [user]);


  // ── Persist scraped data to user-scoped sessionStorage ────────────────────────
  // Keys are scoped to user.id so different users on the same browser don't share data
  useEffect(() => {
    if (!user?.id) return;
    if (scrapedProperty) {
      sessionStorage.setItem(`home_${user.id}_scraped_property`, JSON.stringify(scrapedProperty));
    } else {
      sessionStorage.removeItem(`home_${user.id}_scraped_property`);
    }
  }, [scrapedProperty, user?.id]);


  useEffect(() => {
    if (!user?.id) return;
    if (scrapedImages && scrapedImages.length > 0) {
      sessionStorage.setItem(`home_${user.id}_scraped_images`, JSON.stringify(scrapedImages));
    } else {
      sessionStorage.removeItem(`home_${user.id}_scraped_images`);
    }
  }, [scrapedImages, user?.id]);

  const handlePropertyUpdate = async (updates: Partial<Property>, onUpdated?: (updated: Property) => void) => {
    const callId = Math.random().toString(36).slice(2,8);
    console.log('[DEBUG] handlePropertyUpdate called [#', callId, '] with:', JSON.stringify(updates));
    console.log('[DEBUG] property.id:', property?.id);
    console.log('[DEBUG] supabaseAdmin instance:', !!supabaseAdmin, supabaseAdmin);
    if (!property) { console.log('[DEBUG] property is null, returning'); return; }
    try {
      console.log('[DEBUG] About to call supabaseAdmin.from(properties).update [#', callId, ']');
      // Use scrapedProperty.id if available (user's own property), otherwise fall back to property.id (demo)
      const targetPropertyId = scrapedProperty?.id || property.id;
      console.log('[DEBUG] Updating property ID:', targetPropertyId);
      const { error: updateError } = await supabaseAdmin
        .from('properties')
        .update(updates)
        .eq('id', targetPropertyId);
      console.log('[DEBUG] update result [#', callId, '] error:', updateError);
      if (updateError) throw updateError;
      const updated = { ...property, ...updates };
      setProperty(updated);
      onUpdated?.(updated);
      console.log('[DEBUG] handlePropertyUpdate completed [#', callId, ']');
    } catch (err) {
      console.error('Failed to update property:', err);
      throw err;
    }
  };

  useEffect(() => {
    if (registerSaveAll) {
      registerSaveAll(async () => {
        console.log('[DEBUG] registerSaveAll callback firing, imageGallerySaveRef type:', typeof imageGallerySaveRef.current);
        if (typeof imageGallerySaveRef.current === 'function') {
          console.log('[DEBUG] calling imageGallerySaveRef.current()');
          await imageGallerySaveRef.current();
          console.log('[DEBUG] imageGallerySave completed');
        } else {
          console.log('[DEBUG] imageGallerySaveRef.current is NOT a function, skipping');
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log('[DEBUG] registerSaveAll callback done');
      });
    }
  }, [registerSaveAll]);

  const handleImageUpload = async (file: File) => {
    const targetPropertyId = scrapedProperty?.id || property?.id;
    if (!targetPropertyId) return;
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${targetPropertyId}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('property-images')
        .upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from('property-images')
        .getPublicUrl(fileName);
      const { data: image, error: insertError } = await supabase
        .from('property_images')
        .insert({ property_id: targetPropertyId, url: publicUrl, position: images.length + 1, is_featured: images.length < 3 })
        .select()
        .single();
      if (insertError) throw insertError;
      setImages([...images, image]);
    } catch (err) {
      console.error('Failed to upload image:', err);
      throw err;
    }
  };

  const handleImageDelete = async (imageId: string) => {
    try {
      const imageToDelete = images.find(img => img.id === imageId);
      if (!imageToDelete) return;
      const urlParts = imageToDelete.url.split('/');
      const filePath = urlParts[urlParts.length - 2] + '/' + urlParts[urlParts.length - 1];
      const { error: storageError } = await supabase.storage
        .from('property-images')
        .remove([filePath]);
      if (storageError) throw storageError;
      const { error: dbError } = await supabase
        .from('property_images')
        .delete()
        .eq('id', imageId);
      if (dbError) throw dbError;
      setImages(images.filter(img => img.id !== imageId));
    } catch (err) {
      console.error('Failed to delete image:', err);
      throw err;
    }
  };

  const handleImageUpdate = async (imageId: string, updates: Partial<PropertyImage>) => {
    try {
      const { error: updateError } = await supabaseAdmin
        .from('property_images')
        .update(updates)
        .eq('id', imageId);
      if (updateError) throw updateError;
      setImages(images.map(img => img.id === imageId ? { ...img, ...updates } : img));
    } catch (err) {
      console.error('Failed to update image:', err);
      throw err;
    }
  };

  // Called when Airbnb import completes — saves to onboarding_data table + 'onboarding' bucket

  const handleImportedImages = async (imported: {
    hero_image: string;
    images: string[];
    title: string;
    location: string;
    price: string;
    description: string;
    guests?: number;
    bedrooms?: number;
    beds?: number;
    baths?: number;
    rating?: number;
    reviews?: number;
    host_name?: string;
  }) => {
    console.log('[Home] handleImportedImages RECEIVED:', imported.title, 'images count:', imported.images?.length);

    try {
      // Use original Airbnb URLs immediately — don't wait for Supabase upload.
      // Upload runs in background; if it succeeds we swap in the Supabase URLs.
      const imageList = imported.images || [];

      // Build initial PropertyImage[] from original scraped URLs right away
      const initialImages: PropertyImage[] = imageList.map((url: string, idx: number) => ({
        id: `scraped-${Date.now()}-${idx}`,
        property_id: 'scrape',
        url,
        position: idx + 1,
        is_featured: idx === 0,
        is_main: idx === 0,
        is_background: false,
        created_at: new Date().toISOString(),
      }));
      setScrapedImages(initialImages);

      // Now upload to Supabase storage in the background (non-blocking)
      (async () => {
        const imageUrls: string[] = [];
        for (let i = 0; i < imageList.length; i++) {
          const imgUrl = imageList[i];
          try {
            const response = await fetch(imgUrl);
            const buffer = await response.arrayBuffer();
            const filename = `onboarding/${Date.now()}-${i}.jpg`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('onboarding')
              .upload(filename, buffer, { contentType: 'image/jpeg' });
            if (uploadError) {
              imageUrls.push(imgUrl); // bucket missing — keep original
            } else {
              const { data: { publicUrl } } = supabase.storage
                .from('onboarding')
                .getPublicUrl(filename);
              imageUrls.push(publicUrl);
            }
          } catch {
            imageUrls.push(imgUrl);
          }
        }

        // Fallback: if no images uploaded, use original URLs
        if (imageUrls.length === 0 && imageList.length > 0) {
          imageUrls.push(...imageList);
        }

        // Swap in Supabase (or fallback) URLs
        if (imageUrls.length > 0) {
          setScrapedImages(prev => prev.map((img, idx) => ({
            ...img,
            url: imageUrls[idx] || img.url,
          })));
        }
      })();

      // Hero subtitle gets first 200 chars (same as popup preview), rest goes to description box
      const heroText = (imported.description || '').slice(0, 200);
      const descText = (imported.description || '').slice(200);
      console.log('[Home] setScrapedProperty:', { description: descText, property_intro: heroText, title: imported.title });
      setScrapedProperty({
        // NOTE: do NOT set id to property?.id — that points to the old demo property.
        // A real id will be assigned when the site is published.
        title: imported.title || property?.title || '',
        description: descText,
        property_title: imported.title || property?.property_title || '',
        property_intro: heroText,
        location: imported.location || property?.location || '',
        price_per_night: imported.price || property?.price_per_night || null,
        max_guests: imported.guests || property?.max_guests || null,
      });

      // Upsert onboarding_data in background (fire-and-forget)
      const primaryImage = (imported.images || [])[0] || imported.hero_image || '';
      supabase
        .from('onboarding_data')
        .upsert({
          user_id: user.id,
          property_name: imported.title,
          description: imported.description,
          location: imported.location,
          price: imported.price,
          scraped_hero_image: primaryImage,
          scraped_images: imported.images || [],
          scraped_guests: imported.guests ? String(imported.guests) : null,
          scraped_rating: imported.rating ? String(imported.rating) : null,
          scraped_reviews: imported.reviews ? String(imported.reviews) : null,
          scraped_title: imported.title,
          scraped_location: imported.location,
          scraped_description: imported.description,
          host_name: imported.host_name || null,
          bedrooms: imported.bedrooms ? String(imported.bedrooms) : null,
          beds: imported.beds ? String(imported.beds) : null,
          baths: imported.baths ? String(imported.baths) : null,
        }, { onConflict: 'user_id' })
        .select()
        .then(({ data: onboardingRecord, error: insertError }) => {
          if (insertError) {
            console.log('[Home] onboarding_data upsert error:', insertError.message);
          } else {
            console.log('[Home] Saved to onboarding_data, id:', onboardingRecord?.id);
          }
        });


    } catch (err) {
      console.error('[Home] handleImportedImages error:', err);
    }
  };

  const handlePopupClose = () => {
    // Reset scraped data so popup mounts fresh next time
    setScrapedProperty(null);
    setScrapedImages([]);
    // Clear user-scoped sessionStorage keys so next user on same browser gets fresh state
    const uid = user?.id || 'anon';
    sessionStorage.removeItem(`home_${uid}_scraped_property`);
    sessionStorage.removeItem(`home_${uid}_scraped_images`);
    sessionStorage.removeItem(`popup_${uid}_scraped_data`);
    sessionStorage.removeItem(`popup_${uid}_website_name`);
    sessionStorage.removeItem(`popup_${uid}_website_desc`);
    sessionStorage.removeItem(`popup_${uid}_user_website_name`);
    sessionStorage.removeItem(`popup_${uid}_plan`);
    sessionStorage.removeItem(`popup_${uid}_hosting`);
    sessionStorage.removeItem(`popup_${uid}_design`);
    sessionStorage.removeItem(`popup_${uid}_extras_seo`);
    sessionStorage.removeItem(`popup_${uid}_extras_ads`);
    sessionStorage.removeItem(`popup_${uid}_extras_analytics`);
    sessionStorage.removeItem(`popup_${uid}_extras_social`);
    // Also clear legacy unscoped keys
    sessionStorage.removeItem('home_scraped_property');
    sessionStorage.removeItem('home_scraped_images');
    sessionStorage.removeItem('popup_scraped_data');
    sessionStorage.removeItem('popup_website_name');
    sessionStorage.removeItem('popup_website_desc');
    sessionStorage.removeItem('popup_user_website_name');
    sessionStorage.removeItem('popup_plan');
    sessionStorage.removeItem('popup_hosting');
    sessionStorage.removeItem('popup_design');
    sessionStorage.removeItem('popup_extras_seo');
    sessionStorage.removeItem('popup_extras_ads');
    sessionStorage.removeItem('popup_extras_analytics');
    sessionStorage.removeItem('popup_extras_social');
    setResetKey(k => k + 1);
  };

  // Called when onboarding completes (user finishes PUBLISH step)
  // Notifies App to enable edit mode immediately so the Edit button appears
  const handleOnboardingComplete = () => {
    console.log('[Home] handleOnboardingComplete fired');
    onOnboardingComplete?.();
  };

  const handleBookingSubmit = async (bookingData: {
    start_date: string;
    end_date: string;
    guest_count: number;
    total_price: number;
    special_requests?: string;
  }) => {
    if (!user) return;
    const targetPropertyId = scrapedProperty?.id || property?.id;
    if (!targetPropertyId) return;
    const { error } = await supabase
      .from('bookings')
      .insert({ property_id: targetPropertyId, user_id: user.id, ...bookingData });
    if (error) throw error;
    const { data: updatedBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('property_id', targetPropertyId)
      .in('status', ['approved', 'pending']);
    if (bookingsError) throw bookingsError;
    setBookings(updatedBookings || []);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner-ring" />
      </div>
    );
  }

  const displayProperty = scrapedProperty || property;
  if (error || !displayProperty) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-[1.65rem] text-gray-900 hero-title">
            {error || 'Property not found'}
          </h2>
          <p className="mt-2 text-gray-600">Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <ImageGallery
        images={scrapedImages.length > 0 ? scrapedImages : images}
        property={scrapedProperty || property}
        isEditing={isEditing}
        isAdmin={canEdit}
        onImageUpload={canEdit ? handleImageUpload : undefined}
        onImageDelete={canEdit ? handleImageDelete : undefined}
        onImageUpdate={canEdit ? handleImageUpdate : undefined}
        onPropertyUpdate={canEdit ? handlePropertyUpdate : undefined}
        registerSaveHandler={(fn) => { imageGallerySaveRef.current = fn; return true; }}
      />

      <div className="section-mt-neg bg-black section-padding">
        <PropertyDetails
          property={scrapedProperty || property}
          isEditing={isEditing}
          onEditingChange={setIsEditing}
          onSave={canEdit ? handlePropertyUpdate : undefined}
          onBeforeSave={imageGallerySaveRef.current ?? undefined}
          onHasChanges={onHasChanges}
        />

        <div className="amenities-bg">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: backgroundImages[0] ? `url('${backgroundImages[0].url}')` : undefined,
              opacity: backgroundImages[0] ? 0.6 : 0
            }}
          ></div>
          <div className="relative">
            <PropertyAmenities
              property={scrapedProperty || property}
              isEditing={isEditing}
              onHasChanges={onHasChanges}
              onUpdate={handlePropertyUpdate}
            />
            <div id="calendar-section" className="amenities-content pb-5">
              <BookingCalendar
                bookings={bookings}
                blockedDates={blockedDates}
                propertyId={property.id}
                property={property}
                pricePerNight={property.price_per_night}
                maxGuests={property.max_guests}
                isEditing={isEditing}
                onBookingSubmit={handleBookingSubmit}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="reviews-section relative reviews-bg">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: backgroundImages[1] ? `url('${backgroundImages[1].url}')` : undefined,
            opacity: backgroundImages[1] ? 0.6 : 0,
            width: '100vw',
            marginLeft: 'calc(-50vw + 50%)'
          }}
        ></div>
        <div className="content-container relative">
          <div>
            <h1 className="reviews-section-heading">What our guests say</h1>
          </div>
          <ReviewsList showStars={isEditing} isEditing={isEditing} />
          {!isEditing && (
            <div className="review-btn-wrap">
              <button
                onClick={() => setShowReviewModal(true)}
                className="review-btn"
              >
                Leave a review
              </button>
            </div>
          )}
        </div>
      </div>

      {showReviewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 style={{ color: '#000', fontFamily: 'var(--font-accent, "Playfair Display"), serif', fontWeight: 400, textTransform: 'uppercase', fontSize: 'clamp(1.2rem, 2vw, 1.5rem)', margin: 0 }}>Leave a Review</h2>
            </div>
            <div className="p-6">
              <ReviewForm onSuccess={() => setShowReviewModal(false)} />
            </div>
          </div>
        </div>
      )}

      <OnboardingPopup
        key={resetKey}
        onImported={handleImportedImages}
        onClose={handlePopupClose}
        defaultProperty={defaultProperty}
        defaultImages={defaultImages}
        scrapedProperty={scrapedProperty}
        scrapedImages={scrapedImages}
        onSiteNameChange={onSiteNameChange}
        onComplete={handleOnboardingComplete}
        onOpenSidebar={onOpenSidebar}
      />
    </div>
  );
}
