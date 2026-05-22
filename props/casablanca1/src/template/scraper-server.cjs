const http = require('http');
const { spawn } = require('child_process');

const server = http.createServer((req, res) => {
  const url = require('url').parse(req.url, true).query.url || '';
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html');
  
  const python = spawn('python3', ['-c', `
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
import re, time

opts = Options()
opts.add_argument('--headless')
opts.add_argument('--no-sandbox')
d = webdriver.Chrome(options=opts)

data = {'title': 'Property', 'location': 'Location', 'price': '350', 'hero': 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200', 'reviews': '0'}

try:
    d.get('${url}')
    time.sleep(5)
    
    # Title
    try:
        data['title'] = d.find_element(By.CSS_SELECTOR, 'h1').text[:60]
    except: pass
    
    # Location
    try:
        data['location'] = re.sub(r'^Entire home in ', '', d.find_element(By.CSS_SELECTOR, 'h2').text)
    except: pass
    
    # Hero image
    try:
        imgs = d.find_elements(By.CSS_SELECTOR, 'img')
        for img in imgs:
            src = img.get_attribute('src') or ''
            if 'muscache.com' in src and 'original' in src:
                data['hero'] = src + '?im_w=1200'
                break
    except: pass
    
except Exception as e:
    print('Error:', e)
finally:
    d.quit()

print('TITLE=' + data['title'])
print('LOCATION=' + data['location'])
print('HERO=' + data['hero'])
print('REVIEWS=' + data['reviews'])
  `]);

  let output = '';
  python.stdout.on('data', (d) => { output += d; });
  python.stderr.on('data', (d) => { console.log('Py:', d.toString()); });
  
  python.on('close', (code) => {
    const data = {};
    output.split('\n').forEach(line => {
      const [k, v] = line.split('=');
      if (k && v) data[k] = v;
    });
    
    const html = '<!DOCTYPE html>' +
'<html><head>' +
'<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">' +
'<style>' +
'*{margin:0;padding:0;box-sizing:border-box}' +
'body{font-family:Inter,sans-serif;background:#0a0a0a;min-height:100vh;position:relative}' +
'.p-bg{position:absolute;inset:0;background:url(' + (data.HERO || '') + ') center/cover no-repeat}' +
'.p-bg:after{content:"";position:absolute;inset:0;background:rgba(0,0,0,0.15)}' +
'.p-nav{position:absolute;top:0;left:0;right:0;padding:12px 16px;display:flex;justify-content:space-between;background:linear-gradient(to bottom,rgba(0,0,0,0.4),transparent)}' +
'.p-nav-brand{font-size:0.75rem;font-weight:500;color:#fff}' +
'.p-nav-cta{padding:4px 10px;background:rgba(255,255,255,0.25);border-radius:4px;color:#fff;font-size:0.65rem}' +
'.p-bottom{position:absolute;bottom:52px;left:0;right:0;padding:16px 14px;background:rgba(0,0,0,0.3);backdrop-filter:blur(4px)}' +
'.p-title{font-size:1rem;text-transform:uppercase;color:#fff;margin-bottom:4px}' +
'.p-location{font-size:0.65rem;color:rgba(255,255,255,0.65);margin-bottom:8px}' +
'.p-price{font-size:1.1rem;font-weight:600;color:#fff;margin-bottom:8px}' +
'.p-detail{font-size:0.6rem;color:#fff;background:rgba(255,255,255,0.15);padding:3px 8px;border-radius:4px}' +
'.p-banner{position:absolute;bottom:0;left:0;right:0;padding:16px 14px;background:#000;display:flex;justify-content:space-between;align-items:center}' +
'.p-book-btn{padding:8px 20px;background:#ff5a5f;color:#fff;border-radius:6px;border:none;font-weight:600;cursor:pointer}' +
'</style></head>' +
'<body><div class="p-bg"></div>' +
'<nav class="p-nav"><span class="p-nav-brand">YourBrand.Pro</span><span class="p-nav-cta">Sign up</span></nav>' +
'<div class="p-bottom">' +
'  <h1 class="p-title">' + (data.TITLE || 'Property') + '</h1>' +
'  <p class="p-location">' + (data.LOCATION || 'Location') + '</p>' +
'  <div class="p-price">$' + (data.PRICE || '350') + ' <span>/ night</span></div>' +
'  <div style="display:flex;gap:8px"><span class="p-detail">2 Guests</span><span class="p-detail">1 Bedroom</span><span class="p-detail">1 Bath</span></div>' +
'</div>' +
'<div class="p-banner"><span>' + (data.REVIEWS || '0') + ' reviews</span><button class="p-book-btn">Book Now</button></div>' +
'</body></html>';
    
    res.end(html);
  });
});

server.listen(6001, () => console.log('Scraper on 6001'));
