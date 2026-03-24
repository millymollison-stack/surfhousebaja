#!/usr/bin/env python3
"""
Airbnb Preview API Server
Run: python api_server.py
Then open http://localhost:5000/test.html to test
"""

from flask import Flask, request, jsonify, render_template_string
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import re
import time
import os
from pathlib import Path

app = Flask(__name__)

# Template for the preview
TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{TITLE}} - {{LOCATION}}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', sans-serif; background: transparent; min-height: 100vh; display: flex; justify-content: center; align-items: center; margin: 0; padding: 0; }
        .p-bg { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('{{HERO_IMAGE}}') center/cover no-repeat; z-index: 0; }
        .p-bg::after { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.15); }
        .p-nav { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; z-index: 20; background: linear-gradient(to bottom, rgba(0,0,0,0.4), transparent); }
        .p-nav-logo { display: flex; align-items: center; gap: 6px; }
        .p-nav-icon { font-size: 1rem; color: white; }
        .p-nav-brand { font-size: 0.75rem; font-weight: 500; color: white; letter-spacing: 0.02em; }
        .p-nav-links { display: flex; align-items: center; gap: 8px; }
        .p-nav-link { font-size: 0.65rem; color: rgba(255, 255, 255, 0.9); text-decoration: none; font-weight: 400; }
        .p-nav-cta { padding: 4px 10px; background: rgba(255, 255, 255, 0.25); backdrop-filter: blur(8px); border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.2); }
        .p-bottom { position: absolute; bottom: 52px; left: 0; right: 0; padding: 16px 14px; background: rgba(0, 0, 0, 0.3); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); z-index: 10; }
        .p-title { font-family: 'Inter', sans-serif; font-size: 1rem; font-weight: 400; letter-spacing: 0.02em; text-transform: uppercase; color: white; margin-bottom: 4px; line-height: 1.2; }
        .p-location { font-size: 0.65rem; color: rgba(255, 255, 255, 0.65); margin-bottom: 8px; }
        .p-price { font-size: 1.1rem; font-weight: 600; color: white; margin-bottom: 8px; }
        .p-price span { font-size: 0.65rem; font-weight: 400; color: rgba(255, 255, 255, 0.7); }
        .p-description { font-size: 0.65rem; color: rgba(255, 255, 255, 0.85); line-height: 1.4; margin-bottom: 8px; }
        .p-details { display: flex; gap: 8px; flex-wrap: nowrap; overflow-x: auto; justify-content: flex-start; }
        .p-detail { display: flex; align-items: center; gap: 4px; font-size: 0.6rem; color: rgba(255, 255, 255, 0.9); background: rgba(255, 255, 255, 0.15); padding: 3px 8px; border-radius: 4px; }
        .p-detail svg { width: 10px; height: 10px; }
        .p-banner { position: absolute; bottom: 0; left: 0; right: 0; padding: 16px 14px; background: #000000; z-index: 10; display: flex; align-items: center; justify-content: space-between; }
        .p-banner-left { display: flex; align-items: center; gap: 8px; }
        .p-banner-stars { display: flex; gap: 2px; }
        .p-banner-stars svg { width: 12px; height: 12px; fill: #fbbf24; }
        .p-banner-text { font-size: 0.6rem; color: rgba(255, 255, 255, 0.8); }
        .p-book-btn { padding: 8px 20px; background: #ff5a5f; color: white; font-size: 0.75rem; font-weight: 600; text-decoration: none; border-radius: 6px; border: none; cursor: pointer; }
    </style>
</head>
<body>
    <div class="p-bg"></div>
    <nav class="p-nav">
        <div class="p-nav-logo"><span class="p-nav-icon">◈</span><span class="p-nav-brand">{{BRAND_NAME}}</span></div>
        <div class="p-nav-links"><a href="#" class="p-nav-link p-nav-cta">Sign up</a></div>
    </nav>
    <div class="p-bottom">
        <h1 class="p-title">{{TITLE}}</h1>
        <p class="p-location">{{LOCATION}}</p>
        <div class="p-price">${{PRICE}} <span>/ night</span></div>
        <p class="p-description">{{DESCRIPTION}}</p>
        <div class="p-details">{{DETAILS}}</div>
    </div>
    <div class="p-banner">
        <div class="p-banner-left">
            <div class="p-banner-stars">{{STARS}}</div>
            <span class="p-banner-text">{{REVIEW_COUNT}} review{{REVIEW_PLURAL}}</span>
        </div>
        <button class="p-book-btn">Book Now</button>
    </div>
</body>
</html>"""

STAR_SVG = """<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>"""

def scrape_airbnb(url):
    """Scrape property data from Airbnb listing."""
    chrome_options = Options()
    chrome_options.add_argument('--headless')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--disable-gpu')
    chrome_options.add_argument('--window-size=1920,1080')
    
    driver = webdriver.Chrome(options=chrome_options)
    data = {}
    
    try:
        driver.get(url)
        time.sleep(3)
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.TAG_NAME, "h1"))
        )
        
        # Title
        try:
            data['title'] = driver.find_element(By.CSS_SELECTOR, "h1").text.strip()[:50]
        except:
            data['title'] = 'Property'
        
        # Location
        try:
            loc = driver.find_element(By.CSS_SELECTOR, "h2")
            data['location'] = re.sub(r'^Entire home in ', '', loc.text.strip())
        except:
            data['location'] = 'Location'
        
        # Price
        try:
            price_elem = driver.find_element(By.CSS_SELECTOR, "[class*='price'] span, [class*='Price'] span")
            price_match = re.search(r'\$?([\d,]+)', price_elem.text)
            data['price'] = price_match.group(1).replace(',', '') if price_match else '350'
        except:
            data['price'] = '350'
        
        # Reviews
        try:
            review_link = driver.find_element(By.CSS_SELECTOR, "a[href*='reviews'], [class*='reviews']")
            review_match = re.search(r'([\d,]+)\s*review', review_link.text, re.IGNORECASE)
            data['review_count'] = review_match.group(1).replace(',', '') if review_match else '0'
        except:
            data['review_count'] = '0'
        
        data['review_plural'] = '' if data['review_count'] == '1' else 's'
        
        # Description
        try:
            desc = driver.find_element(By.CSS_SELECTOR, "[class*='description'] p, [class*='summary'] p")
            data['description'] = desc.text.strip()[:200]
        except:
            data['description'] = 'Beautiful property in great location.'
        
        # Details
        try:
            details_list = driver.find_elements(By.CSS_SELECTOR, "ul li")[:4]
            details_html = []
            for d in details_list:
                text = d.text.strip()
                if text:
                    details_html.append(f'<div class="p-detail">{text}</div>')
            data['details'] = ''.join(details_html) if details_html else '<div class="p-detail">2 Guests</div><div class="p-detail">1 Bed</div>'
        except:
            data['details'] = '<div class="p-detail">2 Guests</div><div class="p-detail">1 Bed</div>'
        
        # Hero image
        try:
            imgs = driver.find_elements(By.CSS_SELECTOR, 'img')
            for img in imgs:
                src = img.get_attribute('src') or ''
                if 'muscache.com' in src and 'original' in src:
                    data['hero_image'] = src.split('?')[0] + '?im_w=1200'
                    break
            else:
                data['hero_image'] = 'hero.jpg'
        except:
            data['hero_image'] = 'hero.jpg'
        
    except Exception as e:
        print(f"Error scraping: {e}")
        data = {
            'title': 'Property',
            'location': 'Location',
            'price': '350',
            'description': 'Beautiful property.',
            'details': '<div class="p-detail">2 Guests</div><div class="p-detail">1 Bed</div>',
            'review_count': '0',
            'review_plural': 's',
            'hero_image': 'hero.jpg'
        }
    finally:
        driver.quit()
    
    return data

@app.route('/scrape', methods=['POST'])
def scrape():
    """API endpoint to scrape an Airbnb listing."""
    data = request.get_json()
    url = data.get('url', '')
    
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    
    if 'airbnb.com/rooms/' not in url:
        return jsonify({'error': 'Invalid Airbnb room URL'}), 400
    
    try:
        property_data = scrape_airbnb(url)
        
        # Generate HTML
        html = TEMPLATE
        html = html.replace('{{TITLE}}', property_data.get('title', 'Property'))
        html = html.replace('{{LOCATION}}', property_data.get('location', 'Location'))
        html = html.replace('{{PRICE}}', property_data.get('price', '350'))
        html = html.replace('{{DESCRIPTION}}', property_data.get('description', 'Description'))
        html = html.replace('{{DETAILS}}', property_data.get('details', ''))
        html = html.replace('{{HERO_IMAGE}}', property_data.get('hero_image', 'hero.jpg'))
        html = html.replace('{{BRAND_NAME}}', 'YourLogoHere.Pro')
        html = html.replace('{{REVIEW_COUNT}}', property_data.get('review_count', '0'))
        html = html.replace('{{REVIEW_PLURAL}}', property_data.get('review_plural', 's'))
        html = html.replace('{{STARS}}', STAR_SVG * 5)
        
        return jsonify({'html': html, 'data': property_data})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/test')
def test():
    """Test page to try the preview"""
    return render_template_string("""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Airbnb Preview Test</title>
        <style>
            body { font-family: sans-serif; padding: 40px; }
            input { width: 400px; padding: 10px; font-size: 16px; }
            button { padding: 10px 20px; font-size: 16px; cursor: pointer; }
            #result { margin-top: 20px; }
            iframe { width: 100%; height: 80vh; border: 1px solid #ccc; }
            .loading { color: #666; }
        </style>
    </head>
    <body>
        <h1>Airbnb Preview Test</h1>
        <p>Paste an Airbnb room URL:</p>
        <input type="text" id="url" placeholder="https://www.airbnb.com/rooms/123456789" value="https://www.airbnb.com/rooms/770977353146978466">
        <button onclick="preview()">Preview</button>
        <div id="result"></div>
        
        <script>
        async function preview() {
            const url = document.getElementById('url').value;
            const result = document.getElementById('result');
            result.innerHTML = '<p class="loading">Loading...</p>';
            
            try {
                const response = await fetch('/scrape', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({url})
                });
                
                const data = await response.json();
                
                if (data.error) {
                    result.innerHTML = '<p style="color: red;">Error: ' + data.error + '</p>';
                } else {
                    result.innerHTML = '<h2>Preview:</h2><iframe srcdoc="' + data.html.replace(/"/g, '&quot;').replace(/\n/g, '') + '"></iframe>';
                    console.log('Data:', data.data);
                }
            } catch(e) {
                result.innerHTML = '<p style="color: red;">Error: ' + e + '</p>';
            }
        }
        </script>
    </body>
    </html>
    """)

if __name__ == '__main__':
    print("Starting Airbnb Preview API...")
    print("Test at: http://localhost:5000/test")
    app.run(host='0.0.0.0', port=5000, debug=True)
