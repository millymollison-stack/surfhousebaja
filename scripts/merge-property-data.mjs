/**
 * merge-property-data.mjs
 *
 * Merges original (reference) property data with scraped Airbnb data.
 * Scraped data takes priority over original where it exists.
 *
 * Usage:
 *   import { mergePropertyData } from './merge-property-data.mjs';
 *   const merged = mergePropertyData(originalProperty, scrapedData);
 */

export function mergePropertyData(original, scraped) {
  if (!original) original = {};
  if (!scraped) scraped = {};

  const result = { ...original };

  // Fields where scraped data takes priority
  const scrapedPriorityFields = [
    'title',
    'property_title',
    'description',
    'property_intro',
    'images',
    'amenities',
    'bedrooms',
    'bathrooms',
    'baths',
    'beds',
    'max_guests',
    'hero_image',
    'property_details',
    'activities',
    'local_area',
    'getting_there',
    'neighborhood_overview',
    'rating',
    'reviews',
    'review_count',
  ];

  for (const field of scrapedPriorityFields) {
    if (scraped[field] !== undefined && scraped[field] !== null && scraped[field] !== '') {
      result[field] = scraped[field];
    }
  }

  // Fields that always keep original value (base pricing/location)
  const originalPriorityFields = [
    'price_per_night',
    'price',
    'address',
    'latitude',
    'longitude',
    'name',
    'brand_color',
    'font_accent',
  ];

  for (const field of originalPriorityFields) {
    // Only use original if result doesn't already have it (i.e., scraped didn't override)
    if (result[field] === undefined || result[field] === null || result[field] === '') {
      if (original[field] !== undefined && original[field] !== null && original[field] !== '') {
        result[field] = original[field];
      }
    }
  }

  return result;
}