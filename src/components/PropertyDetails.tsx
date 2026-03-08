import React, { useState } from 'react';
import { Bed, Bath, Users, Wifi, Car, Coffee, Tv, Check, X, MapPin, ChevronDown, ChevronUp, Edit2, Waves, Scale, Fish, Truck } from 'lucide-react';
import type { Property } from '../types';
import { useAuth } from '../store/auth';
import { LocationMap } from './LocationMap';

interface PropertyDetailsProps {
  property: Property;
  isEditing: boolean;
  onEditingChange: (isEditing: boolean) => void;
  onSave?: (updates: Partial<Property>) => Promise<void>;
  onBeforeSave?: (() => Promise<void>) | null;
}

interface CollapsibleSectionProps {
  title: string;
  content: string | null;
  isEditing: boolean;
  onEdit?: (content: string) => void;
  isAdmin: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

function CollapsibleSection({ title, content, isEditing, onEdit, isAdmin, isOpen, onToggle }: CollapsibleSectionProps) {
  const [editedContent, setEditedContent] = useState(content || '');
  const [isEditingSection, setIsEditingSection] = useState(false);

  const handleSave = () => {
    onEdit?.(editedContent);
    setIsEditingSection(false);
  };

  return (
    <div className="bg-white/20 backdrop-blur-sm border border-white/15 rounded overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between bg-white/10 hover:bg-white/20 transition-colors"
      >
        <h1 className="text-lg font-medium text-white hero-title">{title}</h1>
        {isOpen ? <ChevronUp className="h-5 w-5 text-white" /> : <ChevronDown className="h-5 w-5 text-white" />}
      </button>
      
      {isOpen && (
        <div className="p-4">
          {isAdmin && !isEditingSection ? (
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setIsEditingSection(true)}
                className="flex items-center space-x-2 text-sm text-[#C47756] hover:text-[#B5684A]"
              >
                <Edit2 className="h-4 w-4" />
                <span>Edit Section</span>
              </button>
            </div>
          ) : null}

          {isEditingSection ? (
            <div className="space-y-4">
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-[#C47756] focus:ring-[#C47756]"
                rows={6}
                placeholder={`Enter ${title.toLowerCase()} information...`}
              />
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setIsEditingSection(false)}
                  className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-3 py-1 text-sm bg-[#C47756] text-white rounded hover:bg-[#B5684A]"
                >
                  Save Changes
                </button>
              </div>
            </div>
          ) : (
            <div className="prose max-w-none w-full">
              {content ? (
                <p className="whitespace-pre-line text-gray-600">{content}</p>
              ) : (
                <p className="text-gray-400 italic">No information available</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PropertyDetails({ property, isEditing, onEditingChange, onSave, onBeforeSave }: PropertyDetailsProps) {
  const [formData, setFormData] = useState(property);
  const [loading, setLoading] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: parseFloat(value)
    }));
  };

  const handleAmenityToggle = (amenity: string) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter(a => a !== amenity)
        : [...prev.amenities, amenity]
    }));
  };

  const handleSave = async () => {
    if (!onSave) return;
    setLoading(true);
    try {
      // Save ImageGallery text first if handler is registered
      if (onBeforeSave) {
        await onBeforeSave();
      }
      // Then save the property details
      await onSave(formData);
      onEditingChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSectionEdit = (section: keyof Property) => async (content: string) => {
    if (!onSave) return;
    try {
      await onSave({ [section]: content });
      setFormData(prev => ({ ...prev, [section]: content }));
    } catch (error) {
      console.error(`Failed to update ${section}:`, error);
    }
  };

  const renderEditableText = (
    name: keyof Property,
    value: string | number,
    type: 'text' | 'textarea' | 'number' = 'text',
    className = ''
  ) => {
    if (!isEditing) {
      return <span className={className}>{value}</span>;
    }

    if (type === 'textarea') {
      return (
        <textarea
          name={name}
          value={value}
          onChange={handleInputChange}
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-[#C47756] focus:ring-[#C47756]"
          rows={4}
        />
      );
    }

    return (
      <input
        type={type}
        name={name}
        value={value}
        onChange={type === 'number' ? handleNumberChange : handleInputChange}
        className={`rounded-md border-gray-300 shadow-sm focus:border-[#C47756] focus:ring-[#C47756] ${className}`}
      />
    );
  };

  return (
    <>
      <div className="space-y-8">
        <div className="flex justify-between items-start">
          <div className="space-y-2 flex-1 w-full">
            <h1 className="text-3xl text-gray-900">
              {isEditing ? renderEditableText('title', formData.title) : property.title}
            </h1>
            <div className="mt-2 w-full">
              {isEditing ? (
                renderEditableText('description', formData.description, 'textarea')
              ) : (
                <p className="text-lg text-gray-600">{property.description}</p>
              )}
            </div>
          </div>
          {isAdmin && onSave && (
            <div className="flex items-center space-x-2 ml-4">
              {isEditing ? (
                <>
                  <button
                    onClick={() => onEditingChange(false)}
                    className="p-2 text-gray-600 hover:text-gray-900"
                    disabled={loading}
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <button
                    onClick={handleSave}
                    className="p-2 text-green-600 hover:text-green-700"
                    disabled={loading}
                  >
                    <Check className="h-5 w-5" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onEditingChange(true)}
                  className="text-sm text-[#C47756] hover:text-[#B5684A]"
                >
                  Edit Details
                </button>
              )}
            </div>
          )}
        </div>

        <div className="bg-[#C47756] rounded-lg p-4 flex items-center justify-center cursor-pointer hover:bg-[#B5684A] transition-colors max-w-[280px] mx-auto">
          <h1 className="hero-title flex items-center" onClick={() => setIsMapOpen(true)}><MapPin className="h-5 w-5 mr-2" />View on Map</h1>
        </div>

        <div className="bg-white/20 backdrop-blur-sm border border-white/15 rounded p-6">
          <h2 className="text-[1.65rem] text-white mb-6 hero-title">Amenities</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {[
              { name: 'WiFi', icon: Wifi },
              { name: 'Parking', icon: Car },
              { name: 'Coffee Maker', icon: Coffee },
              { name: 'TV', icon: Tv },
              { name: 'Surfboards', icon: Waves },
              { name: 'Yoga', icon: Scale },
              { name: 'Fishing', icon: Fish },
              { name: '4x4', icon: Truck }
            ].map(({ name, icon: Icon }) => (
              <div
                key={name}
                className={`flex items-center space-x-2 ${
                  isEditing ? 'cursor-pointer hover:bg-gray-100 p-2 rounded' : ''
                }`}
                onClick={isEditing ? () => handleAmenityToggle(name) : undefined}
              >
                <Icon className={`h-5 w-5 ${
                  formData.amenities.includes(name) ? 'text-[#C47756]' : 'text-[#C47756]'
                }`} />
                <span className={
                  formData.amenities.includes(name) ? 'text-[#C47756]' : 'text-[#C47756]'
                }>
                  {name}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <CollapsibleSection
            title="Property Details"
            content={property.property_details}
            isEditing={isEditing}
            onEdit={handleSectionEdit('property_details')}
            isAdmin={isAdmin}
            isOpen={openSection === 'property_details'}
            onToggle={() => setOpenSection(openSection === 'property_details' ? null : 'property_details')}
          />
          <CollapsibleSection
            title="Activities"
            content={property.activities}
            isEditing={isEditing}
            onEdit={handleSectionEdit('activities')}
            isAdmin={isAdmin}
            isOpen={openSection === 'activities'}
            onToggle={() => setOpenSection(openSection === 'activities' ? null : 'activities')}
          />
          <CollapsibleSection
            title="Local Area"
            content={property.local_area}
            isEditing={isEditing}
            onEdit={handleSectionEdit('local_area')}
            isAdmin={isAdmin}
            isOpen={openSection === 'local_area'}
            onToggle={() => setOpenSection(openSection === 'local_area' ? null : 'local_area')}
          />
          <CollapsibleSection
            title="Getting There"
            content={property.getting_there}
            isEditing={isEditing}
            onEdit={handleSectionEdit('getting_there')}
            isAdmin={isAdmin}
            isOpen={openSection === 'getting_there'}
            onToggle={() => setOpenSection(openSection === 'getting_there' ? null : 'getting_there')}
          />
        </div>

        <div className="rounded-lg bg-[#FDF2F8] p-6">
          <div className="flex items-baseline">
            <span className="text-[2rem] md:text-[3.3rem] text-[#C47756] headline">
              {isEditing ? (
                <>$
                  {renderEditableText('price_per_night', formData.price_per_night, 'number', 'w-32 text-[2rem] md:text-[3.3rem] headline')}
                </>
              ) : (
                `$${property.price_per_night}`
              )}
            </span>
            <span className="ml-2 text-gray-600">per night</span>
          </div>
        </div>
      </div>

      <LocationMap
        property={property}
        onSave={onSave!}
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
      />
    </>
  );
}