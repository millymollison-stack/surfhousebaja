#!/usr/bin/env python3
import sys
import re
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
import time

url = sys.argv[1] if len(sys.argv) > 1 else 'https://airbnb.com'

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
    'reviews': '0'
}

try:
    d.get(url)
    time.sleep(5)
    
    # Title
    try:
        data['title'] = d.find_element(By.CSS_SELECTOR, 'h1').text[:60]
    except:
        pass
    
    # Location
    try:
        h2s = d.find_elements(By.CSS_SELECTOR, 'h2')
        if h2s:
            data['location'] = h2s[0].text
    except:
        pass
    
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
