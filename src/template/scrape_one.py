#!/usr/bin/env python3
import sys
import re
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
import time

import re
url = sys.argv[1] if len(sys.argv) > 1 else 'https://airbnb.com'

# Normalize URL - extract just the listing ID from any Airbnb format
# Handle: airbnb.com/h/ID, airbnb.com/rooms/ID, airbnb.com/rooms/ID?params...
# Match /rooms/ID (numeric) or /h/handle (alphanumeric)
# Normalize URL to /rooms/ format with www.airbnb.com
import urllib.parse
# Clean URL params first
parsed = url.split('?')[0]
room_match = re.search(r'airbnb\.com/rooms/([0-9]+)', parsed)
if room_match:
    room_id = room_match.group(1)
    url = 'https://www.airbnb.com/rooms/' + room_id
else:
    handle_match = re.search(r'airbnb\.com/h/([a-zA-Z0-9_-]+)', parsed)
    if handle_match:
        handle = handle_match.group(1)
        url = 'https://www.airbnb.com/h/' + handle

print(f'URL: {url}', file=sys.stderr)

opts = Options()
opts.add_argument('--headless')
opts.add_argument('--no-sandbox')
d = webdriver.Chrome(options=opts)

data = {
    'title': 'Property',
    'location': 'Location',
    'hero': 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200',
    'guests': '2 Guests',
    'bedrooms': '1 Bedroom',
    'baths': '1 Bath',
    'price': '350',
    'reviews': '0',
    'description': ''
}

try:
    d.get(url)
    time.sleep(5)
    
    # Title - try h1 first, then fall back to page title
    try:
        h1 = d.find_element(By.CSS_SELECTOR, 'h1').text[:60]
        if h1 and 'Translation' not in h1:
            data['title'] = h1
    except:
        pass
    
    # Fall back to page title if no h1 found
    if not data.get('title') or data['title'] == 'Property':
        try:
            title = d.title.split(' - ')[0].strip()[:60]
            if title:
                data['title'] = title
        except:
            pass
    
    # Location - try h2 first, then try meta or breadcrumb
    try:
        h2s = d.find_elements(By.CSS_SELECTOR, 'h2')
        for h2 in h2s:
            text = h2.text
            if text and 'Entire' in text or 'Private' in text or 'Shared' in text:
                data['location'] = text
                break
    except:
        pass
    
    # Try to get location from breadcrumb or meta
    if not data.get('location') or data['location'] == 'Location':
        try:
            breadcrumb = d.find_elements(By.CSS_SELECTOR, '[class*="breadcrumb"] span')
            for span in breadcrumb:
                text = span.text
                if 'Entire' in text or 'Private' in text:
                    data['location'] = text
                    break
        except:
            pass
    
    # IMPORTANT: Always use ?im_w=1200 for hero images to get full-size images from muscache
# Without this parameter, images may not render properly in the template

# Hero image
    try:
        imgs = d.find_elements(By.CSS_SELECTOR, 'img')
        for img in imgs:
            src = img.get_attribute('src') or ''
            if 'muscache.com' in src:
                if '?' in src:
                    data['hero'] = src.split('?')[0] + '?im_w=1200'
                else:
                    data['hero'] = src + '?im_w=1200'
                break
    except:
        pass
    
    # Property details (guests, bedrooms, etc)
    try:
        body = d.find_element(By.CSS_SELECTOR, 'body')
        text = body.text.lower()
        matches = re.findall(r'(\d+)\s*(guests?|bedrooms?|beds?|baths?)', text)
        for num, unit in matches[:4]:
            if 'guest' in unit:
                data['guests'] = f'{num} Guest{"s" if int(num) != 1 else ""}'
            elif 'bedroom' in unit:
                data['bedrooms'] = f'{num} Bedroom{"s" if int(num) != 1 else ""}'
            elif 'bath' in unit:
                data['baths'] = f'{num} Bath{"s" if int(num) != 1 else ""}'
    except:
        pass
    
    # Try to get reviews count
    try:
        review_spans = d.find_elements(By.CSS_SELECTOR, 'span')
        for span in review_spans:
            text = span.text
            if re.match(r'^\d+\s+reviews?$', text):
                data['reviews'] = text
                break
    except:
        pass
    
# Get description from page text - try multiple patterns
    try:
        body = d.find_element(By.CSS_SELECTOR, 'body')
        text = body.text
        lines = text.split('\n')
        for line in lines:
            # Try various patterns that indicate description text
            if 50 < len(line) < 400 and ('Welcome to' in line or 'located' in line.lower() or 'nestled' in line.lower() or 'beautiful' in line.lower()):
                data['description'] = line.strip()[:300]
                break
    except:
        pass
    
except Exception as e:
    print(f'Error: {e}')
finally:
    d.quit()

print(f"title={data['title']}")
print(f"location={data['location']}")
print(f"hero={data['hero']}")
print(f"guests={data['guests']}")
print(f"bedrooms={data['bedrooms']}")
print(f"baths={data['baths']}")
print(f"price={data['price']}")
print(f"reviews={data['reviews']}")
print(f"description={data['description']}")
