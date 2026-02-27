import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ImageGallery } from '../components/ImageGallery';
import { PropertyDetails } from '../components/PropertyDetails';
import { BookingCalendar } from '../components/BookingCalendar';
import ReviewsList from '../components/ReviewsList';
import ReviewForm from '../components/ReviewForm';
import { useAuth } from '../store/auth';
import type { Property, PropertyImage, Booking, BlockedDate } from '../types';

export function Home() {
  const [property, setProperty] = useState<Property | null>(null);
  const [images, setImages] = useState<PropertyImage[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [imageGallerySave, setImageGallerySave] = useState<(() => Promise<void>) | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Add console log to see if Home component is rendering
  console.log('=== HOME COMPONENT RENDERED ===');

  useEffect(() => {
    async function loadProperty() {
      try {
        const { data: properties, error: propertyError } = await supabase
          .from('properties')
          .select('*')
          .limit(1)
          .single();

        if (propertyError) throw propertyError;

        const { data: propertyImages, error: imagesError } = await supabase
          .from('property_images')
          .select('*')
          .eq('property_id', properties.id)
          .order('position');

        if (imagesError) throw imagesError;

        const { data: propertyBookings, error: bookingsError } = await supabase
          .from('bookings')
          .select('*')
          .eq('property_id', properties.id)
          .in('status', ['approved', 'pending']); // Still load all for display, but calendar will filter

        if (bookingsError) throw bookingsError;

        const { data: propertyBlockedDates, error: blockedError } = await supabase
          .from('blocked_dates')
          .select('*')
          .eq('property_id', properties.id);

        if (blockedError) throw blockedError;

        setProperty(properties);
        setImages(propertyImages || []);
        setBookings(propertyBookings || []);
        setBlockedDates(propertyBlockedDates || []);
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
        .insert({
          property_id: property.id,
          url: publicUrl,
          position: images.length + 1,
          is_featured: images.length < 3 // Make first 3 images featured by default
        })
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

      setImages(images.map(img => 
        img.id === imageId ? { ...img, ...updates } : img
      ));
    } catch (err) {
      console.error('Failed to update image:', err);
      throw err;
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
      .insert({
        property_id: property.id,
        user_id: user.id,
        ...bookingData
      });

    if (error) throw error;

    // Reload bookings to show the new pending booking
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

  if (error || !property) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-[1.65rem] text-gray-900">
            {error || 'Property not found'}
          </h2>
          <p className="mt-2 text-gray-600">Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 pt-4 pb-4 sm:pb-8 md:pb-12">
      <ImageGallery
        images={images}
        property={property}
        isEditing={isEditing}
        onImageUpload={user?.role === 'admin' ? handleImageUpload : undefined}
        onImageDelete={user?.role === 'admin' ? handleImageDelete : undefined}
        onImageUpdate={user?.role === 'admin' ? handleImageUpdate : undefined}
        onPropertyUpdate={user?.role === 'admin' ? handlePropertyUpdate : undefined}
        registerSaveHandler={setImageGallerySave}
      />
      
      <div className="mt-4 sm:mt-8 md:mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8 lg:gap-12">
        <div className="md:col-span-2">
          <PropertyDetails
            property={property}
            isEditing={isEditing}
            onEditingChange={setIsEditing}
            onSave={user?.role === 'admin' ? handlePropertyUpdate : undefined}
            onBeforeSave={imageGallerySave}
          />
        </div>
        <div className="w-full">
          <BookingCalendar
            bookings={bookings}
            blockedDates={blockedDates}
            propertyId={property.id}
            property={property}
            pricePerNight={property.price_per_night}
            maxGuests={property.max_guests}
            onBookingSubmit={handleBookingSubmit}
          />
        </div>
      </div>

      <div className="mt-12 md:mt-16 lg:mt-20">
        <div className="text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Guest Reviews</h2>
          <p className="text-gray-600 text-lg">See what our guests have to say about their stay</p>
        </div>

        <ReviewsList />

        <div className="text-center mt-8">
          <button
            onClick={() => setShowReviewModal(true)}
            className="text-blue-600 hover:text-blue-700 font-medium hover:underline text-lg"
          >
            Leave a review
          </button>
        </div>
      </div>

      {/* Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-8 py-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Leave a Review</h2>
              <button
                onClick={() => setShowReviewModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
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
    </div>
  );
}