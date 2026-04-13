#!/usr/bin/env python3
"""
AirBnB Scraper - Fixed version
"""
import sys
import re
import time
import random
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# Get URL from command line
url = sys.argv[1] if len(sys.argv) > 1 else ''

# ===== URL Normalization =====
# Handle ANY input format: www.airbnb.com/rooms/ID, airbnb.com/rooms/ID, rooms/ID, h/handle, or just ID
def normalize_url(input_url):
    if not input_url:
        return 'https://www.airbnb.com'
    
    # Remove protocol prefixes user might add
    input_url = input_url.strip()
    original = input_url
    
    # Extract just the listing ID or handle
    # Match patterns: airbnb.com/rooms/123, /rooms/123, rooms/123, 123
    room_match = re.search(r'(?:airbnb\.com/)?rooms/([0-9]+)', input_url)
    if room_match:
        room_id = room_match.group(1)
        return f'https://www.airbnb.com/rooms/{room_id}'
    
    # Match /h/handle or h/handle
    handle_match = re.search(r'(?:airbnb\.com/)?h/([a-zA-Z0-9_-]+)', input_url)
    if handle_match:
        handle = handle_match.group(1)
        return f'https://www.airbnb.com/h/{handle}'
    
    # If it's just a number, treat as room ID
    if input_url.isdigit():
        return f'https://www.airbnb.com/rooms/{input_url}'
    
    # If already has airbnb.com, ensure https://www.
    if 'airbnb.com' in input_url:
        if not input_url.startswith('https://'):
            input_url = 'https://' + input_url
        if 'www.airbnb.com' not in input_url:
            input_url = input_url.replace('airbnb.com', 'www.airbnb.com')
        return input_url
    
    # Last resort - assume it's a handle
    return f'https://www.airbnb.com/h/{input_url}'

url = normalize_url(url)
print(f'Normalized URL: {url}', file=sys.stderr)

# ===== Initialize Chrome =====
opts = Options()
opts.add_argument('--headless')
opts.add_argument('--no-sandbox')
opts.add_argument('--disable-dev-shm-usage')
opts.add_argument('--disable-blink-features=AutomationControlled')
opts.add_argument('--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

# Initialize with wait
d = webdriver.Chrome(options=opts)
wait = WebDriverWait(d, 15)

# ===== Initialize data (NO PLACEHOLDERS!) =====
data = {}

# Scraping with multiple selector attempts
def safe_text(elements, index=0):
    """Safely get text from element"""
    try:
        if index < len(elements):
            return elements[index].text.strip()
    except:
        pass
    return None

def safe_attr(elements, attr, index=0):
    """Safely get attribute from element"""
    try:
        if index < len(elements):
            return elements[index].get_attribute(attr)
    except:
        pass
    return None

try:
    print(f'Loading: {url}', file=sys.stderr)
    d.get(url)
    
    # Wait for page to load
    time.sleep(random.uniform(3, 6))
    
    # Also wait for any dynamic content
    try:
        wait.until(EC.presence_of_element_located((By.TAG_NAME, 'h1')))
    except:
        time.sleep(3)
    
    # ===== TITLE =====
    title_selectors = [
        'h1',
        '[data-testid="title"]', 
        'h2[class*="title"]',
        '.hitpo h1',
        '#room .h1'
    ]
    for sel in title_selectors:
        try:
            el = d.find_element(By.CSS_SELECTOR, sel)
            txt = el.text.strip()[:80]
            if txt and 'Translation' not in txt:
                data['title'] = txt
                print(f'Title found: {txt}', file=sys.stderr)
                break
        except:
            continue
    
    # Fallback: page title
    if 'title' not in data:
        try:
            title = d.title.split(' - ')[0].strip()[:80]
            if title:
                data['title'] = title
        except:
            pass

    # ===== LOCATION =====
    loc_selectors = [
        '[data-testid="book-it-default-header"]',
        '[class*="location"] address',
        '.hitpo address',
        'h2[class*="address"]'
    ]
    for sel in loc_selectors:
        try:
            el = d.find_element(By.CSS_SELECTOR, sel)
            txt = el.text.strip()[:100]
            if txt:
                data['location'] = txt
                break
        except:
            continue

    # ===== PRICE =====
    price_selectors = [
        '[data-testid="price-item-total"]',
        '[class*="price"] span',
        '.hitpo [class*="price"]'
    ]
    for sel in price_selectors:
        try:
            el = d.find_element(By.CSS_SELECTOR, sel)
            txt = el.text
            match = re.search(r'\$(\d+)', txt)
            if match:
                data['price'] = match.group(1)
                break
        except:
            continue

    # ===== DETAILS (Guests, Beds, Baths) =====
    detail_selectors = [
        '[class*="detail"]',
        '.hitpo [class*="meta"]'
    ]
    details_text = ''
    for sel in detail_selectors:
        try:
            els = d.find_elements(By.CSS_SELECTOR, sel)
            for el in els[:5]:
                txt = el.text.strip()
                if txt and ('guest' in txt.lower() or 'bed' in txt.lower() or 'bath' in txt.lower()):
                    details_text += txt + ' '
        except:
            pass
    if details_text.strip():
        data['details'] = details_text.strip()

    # ===== HERO IMAGE =====
    img_selectors = [
        '[data-testid="room-detail-carousel"] img',
        '.hitpo img',
        '[class*="hero"] img'
    ]
    for sel in img_selectors:
        try:
            imgs = d.find_elements(By.CSS_SELECTOR, sel)
            for img in imgs:
                src = img.get_attribute('src') or img.get_attribute('data-src') or ''
                if src and ('muscache.com' in src or 'airbnb.com' in src) and 'avatar' not in src.lower():
                    # Use im_w=1200 for full size
                    if '?' in src:
                        data['hero'] = src + '&im_w=1200'
                    else:
                        data['hero'] = src + '?im_w=1200'
                    print(f'Hero found: {src[:50]}...', file=sys.stderr)
                    break
        except:
            continue

    # If no hero, try ANY airbnb image
    if 'hero' not in data:
        try:
            all_imgs = d.find_elements(By.TAG_NAME, 'img')
            for img in all_imgs[:20]:
                src = img.get_attribute('src') or ''
                if src and ('muscache.com' in src or 'airbnb.com' in src) and 'avatar' not in src.lower():
                    if '?' in src:
                        data['hero'] = src + '&im_w=1200'
                    else:
                        data['hero'] = src + '?im_w=1200'
                    break
        except:
            pass

    # ===== GALLERY IMAGES =====
    images = []
    try:
        gallery = d.find_elements(By.CSS_SELECTOR, '[data-testid="room-detail-carousel"] img, .hitpo .gallery img')
        for img in gallery[:10]:
            src = img.get_attribute('src') or img.get_attribute('data-src') or ''
            if src and ('muscache.com' in src or 'airbnb.com' in src) and 'avatar' not in src.lower():
                if '?' in src:
                    images.append(src + '&im_w=720')
                else:
                    images.append(src + '?im_w=720')
    except:
        pass
    if images:
        data['images'] = images

    # ===== DESCRIPTION =====
    desc_selectors = [
        '[class*="description"]',
        '[class*="about"]',
        '.hitpo div[class*="text"]'
    ]
    for sel in desc_selectors:
        try:
            el = d.find_element(By.CSS_SELECTOR, sel)
            txt = el.text.strip()[:300]
            if txt:
                data['description'] = txt
                break
        except:
            continue

    print(f'Scraped data: {data}', file=sys.stderr)

except Exception as e:
    print(f'Error: {str(e)}', file=sys.stderr)

finally:
    d.quit()

# Output in API format (key=value per line)
for key, value in data.items():
    if isinstance(value, list):
        print(f'{key}={" ".join(value)}')
    elif value:
        print(f'{key}={value}')