# Airbnb Import Template System

## Created: March 23, 2026

### Files Created
- `src/template/Airbnb Import Template/template.html` - Reusable HTML template with placeholders
- `src/template/Airbnb Import Template/airbnb_import.py` - Python scraping script
- `src/template/Airbnb Import Template/index.html` - Generated output with scraped data
- `src/template/Airbnb Import Template/data.txt` - Stored image URLs and listing data

### Template Placeholders
- `{{TITLE}}` - Property title
- `{{LOCATION}}` - Location/address
- `{{PRICE}}` - Nightly price (falls back to $350)
- `{{DESCRIPTION}}` - Property description
- `{{DETAILS}}` - HTML badges for guests/beds/baths/amenities
- `{{HERO_IMAGE}}` - Background image URL/filename
- `{{BRAND_NAME}}` - Brand name (default: YourLogoHere.Pro)
- `{{REVIEW_COUNT}}` - Number of reviews
- `{{REVIEW_PLURAL}}` - "s" if plural, empty if singular

### Styling (from Example 5)
- Blurred container: `rgba(0,0,0,0.3)` + `blur(4px)`
- Bottom banner: 100% opaque black (#000000)
- Stars + reviews in banner left
- "Book Now" button (Airbnb red #ff5a5f) on right

### Usage
```bash
cd "src/template/Airbnb Import Template"
python airbnb_import.py "https://www.airbnb.com/rooms/XXXXX" --brand="YourLogoHere.Pro"
```

### Tested Listings
1. @surfhousebaja - https://www.airbnb.com/rooms/1569039869816457609
2. *Bubble Room - https://www.airbnb.com/rooms/770977353146978466
