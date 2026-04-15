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
  onHasChanges?: (hasChanges: boolean) => void;
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
                className="flex items-center space-x-2 text-sm text-[var(--brand)] hover:text-[var(--brand-hover)]"
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
                className="w-full px-4 py-3 bg-white/20 backdrop-blur-sm border border-white/15 rounded-lg focus:border-[var(--brand)] focus:ring-[#C47756]"
                rows={6}
                placeholder={`Enter ${title.toLowerCase()} information...`}
                style={{ fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit' }}
              />
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setIsEditingSection(false)}
                  className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900"
                >
                  Done
                </button>
                <button
                  onClick={handleSave}
                  className="px-3 py-1 text-sm bg-[var(--brand)] text-white rounded hover:bg-[var(--brand-hover)]"
                >
                  Save Changes
                </button>
              </div>
            </div>
          ) : (
            <div className="prose max-w-none w-full">
              {content ? (
                <p className="whitespace-pre-line hero-subtitle">{content}</p>
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

export function PropertyDetails({ property, isEditing, onEditingChange, onSave, onBeforeSave, onHasChanges }: PropertyDetailsProps) {
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
    onHasChanges?.(true);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: parseFloat(value)
    }));
    onHasChanges?.(true);
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
      onHasChanges?.(false);
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

  // Consistent edit input style - apply to all editable fields
  const editInputClass = "w-full px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]";

  const renderEditableText = (
    name: keyof Property,
    value: string | number,
    type: 'text' | 'textarea' | 'number' = 'text',
    className = '',
    hideIcons = false
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
          className={editInputClass}
          style={{ 
            fontFamily: 'inherit', 
            fontSize: 'inherit', 
            color: '#ffffff',
            background: 'rgba(255, 255, 255, 0.3)',
            borderRadius: '0.5rem',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            marginTop: '30px',
          }}
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
        className={editInputClass}
        style={{ 
          fontFamily: 'inherit', 
          fontSize: 'inherit', 
          color: 'inherit',
          backdropFilter: 'blur(10px)',
          background: 'rgba(255, 255, 255, 0.2)',
          borderRadius: '0.5rem',
          border: '1px solid rgba(255, 255, 255, 0.15)',
        }}
      />
    );
  };

  return (
    <>
      {/* Copy block - outside background container */}
      <div className="flex justify-between items-start px-4">
        <div className="space-y-2 flex-1 w-full">
          <div className="mt-2 w-full">
            {isEditing ? (
              renderEditableText('description', formData.description, 'textarea')
            ) : (
              <p className="whitespace-pre-line hero-subtitle py-8">{property.description || formData.description}</p>
            )}
          </div>
        </div>
      </div>

      {!isEditing && (
        <div className="fixed bottom-0 left-0 right-0 bg-black p-4 flex items-center justify-between z-50">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium text-sm">★★★★★</span>
            <span className="text-white/70 text-xs">4.97</span>
            <span className="text-white/70 text-xs">(128 reviews)</span>
          </div>
          <button 
            onClick={() => document.getElementById('calendar-section')?.scrollIntoView({ behavior: 'smooth' })}
            className="px-6 py-2.5 bg-[var(--brand)] text-white rounded-md text-sm font-medium hover:bg-[var(--brand-hover)] transition-colors"
          >
            Book Now
          </button>
        </div>
      )}

      <LocationMap
        property={property}
        onSave={onSave!}
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
      />
    </>
  );
}