import React, { useState } from 'react';
import { Wifi, Car, Coffee, Tv, Waves, Scale, Fish, Truck, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import type { Property } from '../types';
import { useAuth } from '../store/auth';
import { LocationMap } from './LocationMap';

interface PropertyAmenitiesProps {
  property: Property;
  isEditing: boolean;
  onHasChanges?: (hasChanges: boolean) => void;
}

interface CollapsibleSectionProps {
  title: string;
  content: string | null;
  isEditing: boolean;
  isAdmin: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onHasChanges?: (hasChanges: boolean) => void;
}

function CollapsibleSection({ title, content, isEditing, isAdmin, isOpen, onToggle, onHasChanges }: CollapsibleSectionProps) {
  const [editedContent, setEditedContent] = useState(content || '');

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
          {isEditing ? (
            <div className="space-y-4">
              <textarea
                value={editedContent}
                onChange={(e) => {
                  setEditedContent(e.target.value);
                  onHasChanges?.(true);
                }}
                className="w-full px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-[#C47756]"
                rows={6}
                placeholder={`Enter ${title.toLowerCase()} information...`}
                style={{ 
                  fontFamily: 'inherit', 
                  fontSize: 'inherit',
                  backdropFilter: 'blur(10px)',
                  background: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: '0.5rem',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                }}
              />
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

export function PropertyAmenities({ property, isEditing, onHasChanges }: PropertyAmenitiesProps) {
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
            onHasChanges={onHasChanges}
          />
          <CollapsibleSection
            title="Activities"
            content={property.activities}
            isEditing={isEditing}
            isAdmin={isAdmin}
            isOpen={openSection === 'activities'}
            onToggle={() => setOpenSection(openSection === 'activities' ? null : 'activities')}
            onHasChanges={onHasChanges}
          />
          <CollapsibleSection
            title="Local Area"
            content={property.local_area}
            isEditing={isEditing}
            isAdmin={isAdmin}
            isOpen={openSection === 'local_area'}
            onToggle={() => setOpenSection(openSection === 'local_area' ? null : 'local_area')}
            onHasChanges={onHasChanges}
          />
          <CollapsibleSection
            title="Getting There"
            content={property.getting_there}
            isEditing={isEditing}
            isAdmin={isAdmin}
            isOpen={openSection === 'getting_there'}
            onToggle={() => setOpenSection(openSection === 'getting_there' ? null : 'getting_there')}
            onHasChanges={onHasChanges}
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
