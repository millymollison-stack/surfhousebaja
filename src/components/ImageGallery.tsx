import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Edit2, Upload, Trash2, Star, Image, X, Check } from 'lucide-react';
import type { PropertyImage, Property } from '../types';
import { useAuth } from '../store/auth';

interface ImageGalleryProps {
  images: PropertyImage[];
  property: Property;
  isEditing: boolean;
  onImageUpload?: (file: File) => Promise<void>;
  onImageDelete?: (imageId: string) => Promise<void>;
  onImageUpdate?: (imageId: string, updates: Partial<PropertyImage>) => Promise<void>;
  onPropertyUpdate?: (updates: { property_title?: string; property_intro?: string }) => Promise<void>;
  registerSaveHandler?: (handler: () => Promise<void>) => void;
}

export function ImageGallery({
  images,
  property,
  isEditing,
  onImageUpload,
  onImageDelete,
  onImageUpdate,
  onPropertyUpdate,
  registerSaveHandler
}: ImageGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [propertyTitle, setPropertyTitle] = useState(property?.property_title || '@surfhousebaja');
  const [propertyIntro, setPropertyIntro] = useState(property?.property_intro || '');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    setPropertyTitle(property?.property_title || '@surfhousebaja');
    setPropertyIntro(property?.property_intro || '');
  }, [property?.property_title, property?.property_intro]);

  useEffect(() => {
    if (registerSaveHandler) {
      registerSaveHandler(handlePropertyTextSave);
    }
  }, [registerSaveHandler, propertyTitle, propertyIntro]);

  const sortedImages = [...images].sort((a, b) => {
    if (a.is_main) return -1;
    if (b.is_main) return 1;
    if (a.is_featured && !b.is_featured) return -1;
    if (!a.is_featured && b.is_featured) return 1;
    return a.position - b.position;
  });

  const handlePropertyTextSave = async () => {
    if (!onPropertyUpdate) return;
    try {
      await onPropertyUpdate({
        property_title: propertyTitle,
        property_intro: propertyIntro
      });
    } catch (error) {
      console.error('Failed to update property text:', error);
    }
  };

  const nextImage = () => {
    setCurrentIndex((prev) => (prev + 1) % sortedImages.length);
  };

  const previousImage = () => {
    setCurrentIndex((prev) => (prev - 1 + sortedImages.length) % sortedImages.length);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onImageUpload) return;
    
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    const invalidFiles = files.filter(
      file => !validTypes.includes(file.type) || file.size > maxSize
    );

    if (invalidFiles.length > 0) {
      alert('Some files were not valid. Please ensure all files are images (JPEG, PNG, or WebP) and less than 5MB.');
      return;
    }

    setLoading(true);
    try {
      for (const file of files) {
        await onImageUpload(file);
      }
    } catch (error) {
      console.error('Failed to upload images:', error);
      alert('Failed to upload some images. Please try again.');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleImageDelete = async (imageId: string) => {
    if (!onImageDelete) return;

    if (!confirm('Are you sure you want to delete this image?')) return;

    setLoading(true);
    try {
      await onImageDelete(imageId);
      if (currentIndex >= sortedImages.length - 1) {
        setCurrentIndex(Math.max(0, sortedImages.length - 2));
      }
    } catch (error) {
      console.error('Failed to delete image:', error);
      alert('Failed to delete image. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleFeatured = async (image: PropertyImage) => {
    if (!onImageUpdate) return;

    try {
      await onImageUpdate(image.id, { is_featured: !image.is_featured });
    } catch (error) {
      console.error('Failed to update image:', error);
      alert('Failed to update image. Please try again.');
    }
  };

  const setMainPhoto = async (image: PropertyImage) => {
    if (!onImageUpdate) return;

    try {
      if (image.is_main) {
        // If clicking on current main photo, unset it
        await onImageUpdate(image.id, { is_main: false });
      } else {
        // First, remove main photo status from all images
        for (const img of images) {
          if (img.is_main) {
            await onImageUpdate(img.id, { is_main: false });
          }
        }
        // Then set the new main photo
        await onImageUpdate(image.id, { is_main: true });
        setCurrentIndex(0); // Show the main photo
      }
    } catch (error) {
      console.error('Failed to set main photo:', error);
      alert('Failed to set main photo. Please try again.');
    }
  };

  if (sortedImages.length === 0) {
    return (
      <div className="h-[600px] bg-gray-100 flex items-center justify-center rounded-lg">
        <p className="text-gray-500">No images available</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Main large image */}
      <div className="relative h-[500px] md:h-[600px] overflow-hidden" style={{ boxShadow: '0 25px 80px rgba(0, 0, 0, 0.5)' }}>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 30%, rgba(0, 0, 0, 0.2) 60%, rgba(0, 0, 0, 0.7) 100%)' }}></div>
        <div className="absolute inset-0">
          <img
            src={sortedImages[currentIndex].url}
            alt={`Property view ${currentIndex + 1}`}
            className="h-full w-full object-cover"
          />
        </div>
        
        {/* Title and subtitle overlay with blurred glass */}
        <div className="absolute bottom-0 left-0 right-0 p-6 z-20" style={{ width: '100%', zIndex: 1, padding: 'clamp(24px, 5vw, 50px) clamp(16px, 3vw, 32px)', background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(2px)', borderRadius: '0px' }}>
          {isEditing && isAdmin ? (
            <>
              <input
                type="text"
                value={propertyTitle}
                onChange={(e) => setPropertyTitle(e.target.value)}
                onBlur={handlePropertyTextSave}
                className="text-3xl md:text-4xl font-black text-white bg-transparent border-b-2 border-white/70 w-full focus:outline-none focus:border-white placeholder-white/50 px-2 py-1"
                placeholder="Enter property title..."
              />
              <textarea
                value={propertyIntro}
                onChange={(e) => setPropertyIntro(e.target.value)}
                onBlur={handlePropertyTextSave}
                className="w-full text-white bg-transparent border-2 border-white/30 rounded focus:outline-none focus:border-white resize-none font-medium p-2 mt-4"
                rows={3}
                placeholder="Enter property introduction..."
              />
            </>
          ) : (
            <>
              <h1 style={{ fontFamily: "'Inter', sans-serif", fontSize: 'clamp(1.1rem, 2.8vw, 1.6rem)', fontWeight: 400, textTransform: 'uppercase', marginBottom: '10px', color: 'rgba(255, 255, 255, 0.9)' }}>Welcome to Surf House Baja</h1>
              <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 'clamp(0.86rem, 1.92vw, 1.06rem)', color: 'white', fontWeight: 300, textTransform: 'lowercase' }}>A beautiful 4-bedroom beach house sitting directly in front of the, iconic surf break "Shipwrecks". Away from any crowds, located just 4 hours south of the US border.</h2>
            </>
          )}
        </div>

        {/* Navigation arrows */}
        {sortedImages.length > 1 && !isEditing && (
          <div className="absolute inset-0 flex items-center justify-between p-4 pointer-events-none z-10">
            <button
              onClick={previousImage}
              className="px-3 py-2 bg-white/20 backdrop-blur-sm border border-white/15 rounded text-white/90 hover:bg-white/30 hover:text-white transition-all pointer-events-auto"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={nextImage}
              className="px-3 py-2 bg-white/20 backdrop-blur-sm border border-white/15 rounded text-white/90 hover:bg-white/30 hover:text-white transition-all pointer-events-auto"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>
        )}

        {/* Admin controls */}
        {isAdmin && isEditing && (
          <div className="absolute top-4 right-4 flex space-x-2 z-30">
            <label className="rounded-full bg-white/80 p-2 text-gray-800 hover:bg-white cursor-pointer">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
                disabled={loading}
              />
              <Upload className="h-5 w-5" />
            </label>
            {sortedImages.length > 0 && (
              <button
                onClick={() => handleImageDelete(sortedImages[currentIndex].id)}
                className="rounded-full bg-red-600/80 p-2 text-white hover:bg-red-600"
                disabled={loading}
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Thumbnail grid */}
      {sortedImages.length > 1 && (
        <div className="grid grid-cols-2 gap-4">
          {sortedImages.slice(1, 3).map((image, index) => (
            <div key={image.id} className="relative group">
              <button
                onClick={() => setCurrentIndex(index + 1)}
                className="relative h-48 w-full overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C47756]"
              >
                <img
                  src={image.url}
                  alt={`Property view ${index + 2}`}
                  className="h-full w-full object-cover"
                />
              </button>
              {isAdmin && isEditing && (
                <div className="absolute top-2 right-2 flex space-x-2">
                  <button
                    onClick={() => toggleFeatured(image)}
                    className={`p-2 rounded-full ${
                      image.is_featured
                        ? 'bg-yellow-400 text-white'
                        : 'bg-white/80 text-gray-800'
                    } hover:bg-yellow-500 hover:text-white transition-colors`}
                  >
                    <Star className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Image management grid for admins */}
      {isAdmin && isEditing && (
        <div className="mt-8">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Manage Images</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {sortedImages.map((image) => (
              <div key={image.id} className="relative group">
                <img
                  src={image.url}
                  alt="Property"
                  className="w-full h-32 object-cover rounded-lg"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center space-x-2">
                  <button
                    onClick={() => setMainPhoto(image)}
                    className={`p-2 rounded-full ${
                      image.is_main
                        ? 'bg-blue-500 text-white'
                        : 'bg-white/80 text-gray-800'
                    } hover:bg-blue-500 hover:text-white transition-colors`}
                    title={image.is_main ? 'Remove as main photo' : 'Set as main photo'}
                  >
                    <Image className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => toggleFeatured(image)}
                    className={`p-2 rounded-full ${
                      image.is_featured
                        ? 'bg-yellow-500 text-white'
                        : 'bg-white/80 text-gray-800'
                    } hover:bg-yellow-500 hover:text-white transition-colors`}
                    title={image.is_featured ? 'Remove from featured' : 'Add to featured'}
                  >
                    <Star className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleImageDelete(image.id)}
                    className="p-2 rounded-full bg-red-600/80 text-white hover:bg-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="absolute top-2 right-2 flex flex-col items-end space-y-1">
                  {image.is_main && (
                    <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
                      Main Photo
                    </span>
                  )}
                  {image.is_featured && (
                    <span className="bg-yellow-400 text-white text-xs px-2 py-1 rounded-full">
                      Featured
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}