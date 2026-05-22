#!/usr/bin/env python3
"""
Airbnb Import Script
Usage: python airbnb_import.py <airbnb-url> [--brand "YourLogoHere.Pro"]
"""

import re
import sys
import os
from pathlib import Path

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    import time
except ImportError:
    print("Error: selenium not installed. Run: pip install selenium")
    sys.exit(1)

# Template placeholders
PLACEHOLDERS = {
    '{{TITLE}}': 'title',
    '{{LOCATION}}': 'location', 
    '{{PRICE}}': 'price',
    '{{DESCRIPTION}}': 'description',
    '{{DETAILS}}': 'details',
    '{{HERO_IMAGE}}': 'hero_image',
    '{{BRAND_NAME}}': 'brand_name',
    '{{REVIEW_COUNT}}': 'review_count',
    '{{REVIEW_PLURAL}}': 'review_plural',
}

def scrape_airbnb(url, driver):
    """Scrape property data from Airbnb listing."""
    print(f"Loading: {url}")
    driver.get(url)
    
    # Wait for page to load
    time.sleep(3)
    WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((By.TAG_NAME, "h1"))
    )
    
    # Extract data
    data = {}
    
    try:
        # Title (handle @username or property name)
        title = driver.find_element(By.CSS_SELECTOR, "h1").text.strip()
        data['title'] = title
    except:
        data['title'] = 'Property Name'
    
    try:
        # Location
        location_elem = driver.find_element(By.CSS_SELECTOR, "h2")
        location_text = location_elem.text.strip()
        # Clean up location (remove "Entire home in" prefix)
        location_text = re.sub(r'^Entire home in ', '', location_text)
        data['location'] = location_text
    except:
        data['location'] = 'Location'
    
    try:
        # Property details (guests, beds, baths)
        details_list = driver.find_elements(By.CSS_SELECTOR, "ul li")
        details_text = []
        for detail in details_list[:4]:  # Get first 4 details
            text = detail.text.strip()
            if text:
                details_text.append(text)
        data['details_raw'] = details_text
    except:
        data['details_raw'] = []
    
    try:
        # Description
        desc_elem = driver.find_element(By.CSS_SELECTOR, "[class*='description'] p, [class*='summary'] p, div[data-section-id='DESCRIPTION_DEFAULT'] p")
        data['description'] = desc_elem.text.strip()[:200]  # Limit length
    except:
        # Try alternate method
        try:
            desc = driver.find_element(By.XPATH, "//div[contains(@class,'text') and not(@role)]//p")
            data['description'] = desc.text.strip()[:200]
        except:
            data['description'] = 'Beautiful property in great location.'
    
    try:
        # Price (need to select dates first, so grab displayed price)
        price_elem = driver.find_element(By.CSS_SELECTOR, "[class*='price'] span, [class*='Price'] span")
        price_text = price_elem.text
        # Extract just the number
        price_match = re.search(r'\$?([\d,]+)', price_text)
        if price_match:
            data['price'] = price_match.group(1).replace(',', '')
        else:
            data['price'] = '350'  # Fallback price
    except:
        data['price'] = '350'  # Fallback price if not found
    
    try:
        # Reviews
        review_link = driver.find_element(By.CSS_SELECTOR, "a[href*='reviews'], [class*='reviews']")
        review_text = review_link.text.strip()
        review_match = re.search(r'([\d,]+)\s*review', review_text, re.IGNORECASE)
        if review_match:
            data['review_count'] = review_match.group(1).replace(',', '')
        else:
            data['review_count'] = '0'
    except:
        data['review_count'] = '0'
    
    # Plural handling
    data['review_plural'] = '' if data['review_count'] == '1' else 's'
    
    # Hero image
    try:
        img = driver.find_element(By.CSS_SELECTOR, "[class*='carousel'] img, [class*='hero'] img, #hero-image")
        data['hero_image'] = img.get_attribute('src')
    except:
        data['hero_image'] = 'hero-bg.jpg'
    
    return data

def format_details(details_raw):
    """Format property details as HTML badge elements."""
    svg_icons = {
        'guest': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
        'bed': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 4v16h20V4H2zM2 8h20M12 12v8"/></svg>',
        'bath': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l9 6-9 6V6z"/></svg>',
        'wifi': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    }
    
    html = '<div class="p-detail">{icon}{text}</div>'
    details_html = []
    
    for detail in details_raw:
        detail_lower = detail.lower()
        if 'guest' in detail_lower:
            icon = svg_icons.get('guest', '')
        elif 'bedroom' in detail_lower or 'bed' in detail_lower:
            icon = svg_icons.get('bed', '')
        elif 'bath' in detail_lower:
            icon = svg_icons.get('bath', '')
        elif 'wifi' in detail_lower or 'wi-fi' in detail_lower:
            icon = svg_icons.get('wifi', '')
        else:
            icon = ''
        
        details_html.append(html.format(icon=icon, text=detail))
    
    return '\n            '.join(details_html)

def generate_html(template_path, output_path, data, brand_name="YourLogoHere.Pro"):
    """Generate HTML from template with scraped data."""
    # Read template
    with open(template_path, 'r') as f:
        html = f.read()
    
    # Format details
    details_html = format_details(data.get('details_raw', []))
    
    # Replace placeholders
    replacements = {
        '{{TITLE}}': data.get('title', 'Property'),
        '{{LOCATION}}': data.get('location', 'Location'),
        '{{PRICE}}': data.get('price', '0'),
        '{{DESCRIPTION}}': data.get('description', 'Description'),
        '{{DETAILS}}': details_html,
        '{{HERO_IMAGE}}': data.get('hero_image', 'hero-bg.jpg'),
        '{{BRAND_NAME}}': brand_name,
        '{{REVIEW_COUNT}}': data.get('review_count', '0'),
        '{{REVIEW_PLURAL}}': data.get('review_plural', 's'),
    }
    
    for placeholder, value in replacements.items():
        html = html.replace(placeholder, value)
    
    # Write output
    with open(output_path, 'w') as f:
        f.write(html)
    
    print(f"✓ Generated: {output_path}")
    return True

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("Example: python airbnb_import.py https://www.airbnb.com/rooms/123456789")
        sys.exit(1)
    
    url = sys.argv[1]
    brand_name = "YourLogoHere.Pro"
    
    # Parse --brand option
    for arg in sys.argv[2:]:
        if arg.startswith('--brand='):
            brand_name = arg.split('=')[1].strip('"')
    
    # Setup driver
    chrome_options = Options()
    chrome_options.add_argument('--headless')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--disable-gpu')
    
    driver = webdriver.Chrome(options=chrome_options)
    
    try:
        # Scrape data
        data = scrape_airbnb(url, driver)
        
        print("\n--- Scraped Data ---")
        print(f"Title: {data.get('title')}")
        print(f"Location: {data.get('location')}")
        print(f"Price: ${data.get('price')}/night")
        print(f"Reviews: {data.get('review_count')}")
        print(f"Details: {data.get('details_raw')}")
        
        # Get script directory
        script_dir = Path(__file__).parent
        template_path = script_dir / 'template.html'
        
        # Determine output path (same directory as script)
        output_path = script_dir / 'index.html'
        
        # Generate HTML
        generate_html(template_path, output_path, data, brand_name)
        
        print("\n✓ Done! Open index.html to preview.")
        
    finally:
        driver.quit()

if __name__ == '__main__':
    main()
