import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ImageGallery } from '../components/ImageGallery';
import { PropertyDetails } from '../components/PropertyDetails';
import { PropertyAmenities } from '../components/PropertyAmenities';
import { BookingCalendar } from '../components/BookingCalendar';
import ReviewsList from '../components/ReviewsList';
import ReviewForm from '../components/ReviewForm';
import { OnboardingPopup } from '../components/OnboardingPopup';
import { useAuth } from '../store/auth';
import type { Property, PropertyImage, Booking, BlockedDate } from '../types';

const SURF_HOUSE_BAJA_ID = 'f3d3e867-e0c6-4cc5-a05d-b5e368f8c766';

export function Home({ isEditing: externalIsEditing, onHasChanges, registerSaveAll }: { isEditing?: boolean; onHasChanges?: (hasChanges: boolean) => void; registerSaveAll?: (fn: () => Promise<void>) => void }) {
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
  const [resetKey, setResetKey] = useState(0);
  const [imageGallerySave, setImageGallerySave] = useState<(() => Promise<void>) | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [defaultProperty, setDefaultProperty] = useState<Property | null>(null);
  const [defaultImages, setDefaultImages] = useState<PropertyImage[]>([]);
  const { user } = useAuth();
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
        // Always load from surfhousebaja database on first load
        const { data: propData, error: propError } = await supabase
          .from('properties')
          .select('*')
          .eq('id', SURF_HOUSE_BAJA_ID)
          .single();

        if (propError) throw propError;
        setProperty(propData);
        setDefaultProperty(propData);

        const { data: imgData, error: imgError } = await supabase
          .from('property_images')
          .select('*')
          .eq('property_id', SURF_HOUSE_BAJA_ID)
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
          .eq('property_id', SURF_HOUSE_BAJA_ID)
          .in('status', ['approved', 'pending']);
        if (bkgError) throw bkgError;

        const { data: blkData, error: blkError } = await supabase
          .from('blocked_dates')
          .select('*')
          .eq('property_id', SURF_HOUSE_BAJA_ID);
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
  }, []);

  const handlePropertyUpdate = async (updates: Partial<Property>) => {
    if (!property) return;
    try {
      const { error: updateError } = await supabase
        .from('properties')
        .update(updates)
        .eq('id', property.id);
      if (updateError) throw updateError;
      setProperty({ ...property, ...updates });
    } catch (err) {
      console.error('Failed to update property:', err);
      throw err;
    }
  };

  useEffect(() => {
    if (registerSaveAll) {
      registerSaveAll(async () => {
        console.log('Save all triggered');
      });
    }
  }, [registerSaveAll]);

  const handleImageUpload = async (file: File) => {
    if (!property) return;
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${property.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('property-images')
        .upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from('property-images')
        .getPublicUrl(fileName);
      const { data: image, error: insertError } = await supabase
        .from('property_images')
        .insert({ property_id: property.id, url: publicUrl, position: images.length + 1, is_featured: images.length < 3 })
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
      const { error: updateError } = await supabase
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
    console.log('[Home] Received imported data:', imported.title);

    try {
      // Upload images to 'onboarding' bucket in Supabase Storage
      const imageUrls: string[] = [];
      for (let i = 0; i < imported.images.length; i++) {
        const imgUrl = imported.images[i];
        try {
          const response = await fetch(imgUrl);
          const buffer = await response.arrayBuffer();
          const filename = `onboarding/${Date.now()}-${i}.jpg`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('onboarding')
            .upload(filename, buffer, { contentType: 'image/jpeg' });
          if (uploadError) {
            console.log('[Home] Upload error for image', i, uploadError.message);
            imageUrls.push(imgUrl); // fallback to original URL
          } else {
            const { data: { publicUrl } } = supabase.storage
              .from('onboarding')
              .getPublicUrl(filename);
            imageUrls.push(publicUrl);
          }
        } catch (e) {
          console.log('[Home] Image fetch/upload failed, using original URL');
          imageUrls.push(imgUrl);
        }
      }

      // Use hero_image from images array if no separate hero_image
      const primaryImage = imageUrls[0] || imported.hero_image || '';

      // Save to onboarding_data table (temp onboarding session data)
      const { data: onboardingRecord, error: insertError } = await supabase
        .from('onboarding_data')
        .insert({
          property_name: imported.title,
          description: imported.description,
          location: imported.location,
          price: imported.price,
          hero_image: primaryImage,
          images: imageUrls,
          host_name: imported.host_name || null,
          guests: imported.guests ? String(imported.guests) : null,
          bedrooms: imported.bedrooms ? String(imported.bedrooms) : null,
          beds: imported.beds ? String(imported.beds) : null,
          baths: imported.baths ? String(imported.baths) : null,
          rating: imported.rating ? String(imported.rating) : null,
          reviews: imported.reviews ? String(imported.reviews) : null,
        })
        .select()
        .single();

      if (insertError) {
        console.log('[Home] onboarding_data insert error:', insertError.message);
      } else {
        console.log('[Home] Saved to onboarding_data, id:', onboardingRecord.id);
      }

      // Skip first image (placeholder from Airbnb), use second image onward
      const allUrls = (imageUrls.length > 0 ? imageUrls : imported.images || []);
      const realUrls = allUrls.slice(1); // drop first (placeholder)
      const newImages: PropertyImage[] = realUrls.map((url: string, idx: number) => ({
        id: `scraped-${Date.now()}-${idx}`,
        property_id: property?.id || '',
        url,
        position: idx + 1,
        is_featured: idx === 0,
        is_main: idx === 0,
        is_background: false,
        created_at: new Date().toISOString(),
      }));
      setScrapedImages(newImages);
      // Hero subtitle gets first 200 chars (same as popup preview), rest goes to description box
      const heroText = (imported.description || '').slice(0, 200);
      const descText = (imported.description || '').slice(200);
      console.log('[Home] setScrapedProperty:', { description: descText, property_intro: heroText, title: imported.title });
      setScrapedProperty({
        id: property?.id || '',
        title: imported.title || property?.title || '',
        description: descText,
        property_title: imported.title || property?.property_title || '',
        property_intro: heroText,
        location: imported.location || property?.location || '',
        price_per_night: imported.price || property?.price_per_night || null,
        max_guests: imported.guests || property?.max_guests || null,
      });

      const handlePopupClose = () => {
    // Reset scraped data so popup mounts fresh next time
    setScrapedProperty(null);
    setScrapedImages([]);
    setResetKey(k => k + 1);
  };

  // Pass data to OnboardingPopup via onImported callback
      if (onImported) {
        onImported({
          ...imported,
          hero_image: primaryImage,
          images: imageUrls,
        });
      }
    } catch (err) {
      console.error('[Home] handleImportedImages error:', err);
    }
  };

  const handleBookingSubmit = async (bookingData: {
    start_date: string;
    end_date: string;
    guest_count: number;
    total_price: number;
    special_requests?: string;
  }) => {
    if (!user || !property) return;
    const { error } = await supabase
      .from('bookings')
      .insert({ property_id: property.id, user_id: user.id, ...bookingData });
    if (error) throw error;
    const { data: updatedBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('property_id', property.id)
      .in('status', ['approved', 'pending']);
    if (bookingsError) throw bookingsError;
    setBookings(updatedBookings || []);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#C47756]" />
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
        isAdmin={user?.role === 'admin'}
        onImageUpload={user?.role === 'admin' ? handleImageUpload : undefined}
        onImageDelete={user?.role === 'admin' ? handleImageDelete : undefined}
        onImageUpdate={user?.role === 'admin' ? handleImageUpdate : undefined}
        onPropertyUpdate={user?.role === 'admin' ? handlePropertyUpdate : undefined}
        registerSaveHandler={setImageGallerySave}
      />

      <div className="section-mt-neg bg-black section-padding">
        <PropertyDetails
          property={scrapedProperty || property}
          isEditing={isEditing}
          onEditingChange={setIsEditing}
          onSave={user?.role === 'admin' ? handlePropertyUpdate : undefined}
          onBeforeSave={imageGallerySave}
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

      <div className="reviews-section content-container relative reviews-bg">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: backgroundImages[1] ? `url('${backgroundImages[1].url}')` : undefined,
            opacity: backgroundImages[1] ? 0.6 : 0
          }}
        ></div>
        <div className="relative">
          <div className="pl-2.5 pt-2">
            <h1 className="hero-title text-black text-center pt-3" style={{ color: '#000000', paddingTop: '20px', paddingBottom: '20px' }}>What our guests say</h1>
          </div>
          <ReviewsList showStars={isEditing} isEditing={isEditing} />
          {!isEditing && (
            <div className="flex justify-center mt-6">
              <button
                onClick={() => setShowReviewModal(true)}
                className="px-5 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
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
            <div className="sticky top-0 bg-white border-b border-gray-200 px-8 py-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900 hero-title">Leave a Review</h2>
              <button onClick={() => setShowReviewModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-8">
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
      />
    </div>
  );
}
