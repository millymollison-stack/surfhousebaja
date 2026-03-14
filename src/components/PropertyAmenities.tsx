import React, { useState } from 'react';
import { Wifi, Car, Coffee, Tv, Waves, Scale, Fish, Truck, ChevronDown, ChevronUp, Edit2, MapPin } from 'lucide-react';
import type { Property } from '../types';
import { useAuth } from '../store/auth';
import { LocationMap } from './LocationMap';

interface PropertyAmenitiesProps {
  property: Property;
  isEditing: boolean;
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
    <div className="dropdown-section">
      <button
        onClick={onToggle}
        className="dropdown-header"
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
                <p className="whitespace-pre-line text-white-73">{content}</p>
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

export function PropertyAmenities({ property, isEditing }: PropertyAmenitiesProps) {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const amenities = [
    { name: 'WiFi', icon: Wifi },
    { name: 'Parking', icon: Car },
    { name: 'Coffee Maker', icon: Coffee },
    { name: 'TV', icon: Tv },
    { name: 'Surfboards', icon: Waves },
    { name: 'Yoga', icon: Scale },
    { name: 'Fishing', icon: Fish },
    { name: '4x4', icon: Truck }
  ];

  return (
    <>
      {/* Content container - background handled by parent */}
      <div className="mt-5 relative amenities-content space-y-8 pb-8">
        {/* Amenities */}
        <div className="glass-card">
          <h2 className="text-[1.65rem] text-white mb-6 hero-title">Amenities</h2>
          <div className="grid-2-cols">
            {amenities.map(({ name, icon: Icon }) => (
              <div
                key={name}
                className="flex items-center space-x-2"
              >
                <Icon className="h-5 w-5 text-white" />
                <span className="text-white">
                  {name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Dropdown sections */}
        <div className="space-y-4">
          <CollapsibleSection
            title="Property Details"
            content={property.property_details}
            isEditing={isEditing}
            isAdmin={isAdmin}
            isOpen={openSection === 'property_details'}
            onToggle={() => setOpenSection(openSection === 'property_details' ? null : 'property_details')}
          />
          <CollapsibleSection
            title="Activities"
            content={property.activities}
            isEditing={isEditing}
            isAdmin={isAdmin}
            isOpen={openSection === 'activities'}
            onToggle={() => setOpenSection(openSection === 'activities' ? null : 'activities')}
          />
          <CollapsibleSection
            title="Local Area"
            content={property.local_area}
            isEditing={isEditing}
            isAdmin={isAdmin}
            isOpen={openSection === 'local_area'}
            onToggle={() => setOpenSection(openSection === 'local_area' ? null : 'local_area')}
          />
          <CollapsibleSection
            title="Getting There"
            content={property.getting_there}
              isEditing={isEditing}
              isAdmin={isAdmin}
              isOpen={openSection === 'getting_there'}
              onToggle={() => setOpenSection(openSection === 'getting_there' ? null : 'getting_there')}
            />
        </div>
      </div>

      <LocationMap
        property={property}
        onSave={() => {}}
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
      />
    </>
  );
}
