#!/usr/bin/env python3
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from http.server import HTTPServer, BaseHTTPRequestHandler
import time
import urllib.parse

PORT = 6003

HTML = '''<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Inter,sans-serif;background:#0a0a0a;min-height:100vh;position:relative}
.p-bg{position:absolute;inset:0;background:url({HERO}) center/cover no-repeat}
.p-bg:after{content:"";position:absolute;inset:0;background:rgba(0,0,0,0.15)}
.p-nav{position:absolute;top:0;left:0;right:0;padding:12px 16px;display:flex;justify-content:space-between;background:linear-gradient(to bottom,rgba(0,0,0,0.4),transparent)}
.p-nav-brand{font-size:0.75rem;font-weight:500;color:#fff}
.p-nav-cta{padding:4px 10px;background:rgba(255,255,255,0.25);border-radius:4px;color:#fff;font-size:0.65rem}
.p-bottom{position:absolute;bottom:52px;left:0;right:0;padding:16px 14px;background:rgba(0,0,0,0.3);backdrop-filter:blur(4px)}
.p-title{font-size:1rem;text-transform:uppercase;color:#fff;margin-bottom:4px}
.p-location{font-size:0.65rem;color:rgba(255,255,255,0.65);margin-bottom:8px}
.p-price{font-size:1.1rem;font-weight:600;color:#fff;margin-bottom:8px}
.p-detail{font-size:0.6rem;color:#fff;background:rgba(255,255,255,0.15);padding:3px 8px;border-radius:4px}
.p-banner{position:absolute;bottom:0;left:0;right:0;padding:16px 14px;background:#000;display:flex;justify-content:space-between;align-items:center}
.p-book-btn{padding:8px 20px;background:#ff5a5f;color:#fff;border-radius:6px;border:none;font-weight:600;cursor:pointer}
</style></head>
<body><div class="p-bg"></div>
<nav class="p-nav"><span class="p-nav-brand">YourBrand.Pro</span><span class="p-nav-cta">Sign up</span></nav>
<div class="p-bottom">
  <h1 class="p-title">{TITLE}</h1>
  <p class="p-location">{LOCATION}</p>
  <div class="p-price">$350 <span>/ night</span></div>
  <div style="display:flex;gap:8px"><span class="p-detail">2 Guests</span><span class="p-detail">1 Bedroom</span><span class="p-detail">1 Bath</span></div>
</div>
<div class="p-banner"><span>128 reviews</span><button class="p-book-btn">Book Now</button></div>
</body></html>'''

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if '/scrape' in self.path:
            parsed = urllib.parse.urlparse(self.path)
            query = urllib.parse.parse_qs(parsed.query)
            url = query.get('url', [''])[0]
            
            # Scrape with Selenium
            opts = Options()
            opts.add_argument('--headless')
            opts.add_argument('--no-sandbox')
            d = webdriver.Chrome(options=opts)
            
            data = {
                'title': 'Property',
                'location': 'Location', 
                'hero': 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200'
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
                    
                # Hero
                try:
                    imgs = d.find_elements(By.CSS_SELECTOR, 'img')
                    for img in imgs:
                        src = img.get_attribute('src') or ''
                        if 'muscache.com' in src:
                            data['hero'] = src + '?im_w=1200'
                            break
                except:
                    pass
                    
            except Exception as e:
                print('Scraper error:', e)
            finally:
                d.quit()
            
            html = HTML.format(**data)
            
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(html.encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

print(f'Server on port {PORT}')
HTTPServer(('', PORT), Handler).serve_forever()
